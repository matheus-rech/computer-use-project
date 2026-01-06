import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { GoogleDriveManager, DriveUploadResult, DriveConfig } from './googleDrive';

export interface FileExportOptions {
  destination: string;
  uploadToDrive?: boolean;
  driveFolderId?: string;
}

export interface FileTransferConfig {
  googleDrive?: DriveConfig;
}

export class FileTransferManager {
  private sessionsPath: string;
  private driveManager: GoogleDriveManager | null = null;
  private config: FileTransferConfig;

  constructor(config?: FileTransferConfig) {
    this.config = config || {};
    this.sessionsPath = path.join(
      process.env.HOME || '/Users/matheusrech',
      '.claude-workspace',
      'sessions'
    );
  }

  // ==========================================================================
  // Google Drive Integration
  // ==========================================================================

  async initializeGoogleDrive(driveConfig?: DriveConfig): Promise<void> {
    const config = driveConfig || this.config.googleDrive;
    if (!config) {
      throw new Error('Google Drive credentials not configured');
    }

    this.driveManager = new GoogleDriveManager(config);
    await this.driveManager.initialize();
  }

  getGoogleDriveAuthUrl(): string {
    if (!this.driveManager) {
      throw new Error('Google Drive not initialized');
    }
    return this.driveManager.getAuthUrl();
  }

  async authenticateGoogleDrive(code: string): Promise<void> {
    if (!this.driveManager) {
      throw new Error('Google Drive not initialized');
    }
    await this.driveManager.authenticateWithCode(code);
  }

  isGoogleDriveConnected(): boolean {
    return this.driveManager?.isConnected() ?? false;
  }

  async disconnectGoogleDrive(): Promise<void> {
    if (this.driveManager) {
      await this.driveManager.revokeAuth();
    }
  }

  async exportFiles(
    sessionId: string,
    files: string[],
    destination: string
  ): Promise<void> {
    try {
      const sessionPath = path.join(this.sessionsPath, sessionId);

      // Ensure destination exists
      await fs.mkdir(destination, { recursive: true });

      // Copy each file
      for (const file of files) {
        const sourcePath = path.join(sessionPath, file);
        const destPath = path.join(destination, path.basename(file));

        // Check if source exists
        try {
          await fs.access(sourcePath);
        } catch {
          console.warn(`File not found: ${sourcePath}`);
          continue;
        }

        // Copy file
        await fs.copyFile(sourcePath, destPath);
        console.log(`Copied: ${file} -> ${destPath}`);
      }

      console.log(`Exported ${files.length} files to ${destination}`);
    } catch (error) {
      console.error('Failed to export files:', error);
      throw error;
    }
  }

  async uploadToDrive(
    files: string[],
    folderId?: string
  ): Promise<DriveUploadResult[]> {
    if (!this.driveManager || !this.driveManager.isConnected()) {
      throw new Error('Google Drive not connected. Call initializeGoogleDrive() first.');
    }

    const results: DriveUploadResult[] = [];

    for (const file of files) {
      try {
        const result = await this.driveManager.uploadFile(file, { folderId });
        results.push(result);
        console.log(`[FileTransfer] Uploaded to Drive: ${file} -> ${result.webViewLink}`);
      } catch (error) {
        console.error(`[FileTransfer] Failed to upload ${file}:`, error);
      }
    }

    return results;
  }

  async uploadSessionToDrive(
    sessionId: string,
    folderId?: string
  ): Promise<DriveUploadResult[]> {
    if (!this.driveManager || !this.driveManager.isConnected()) {
      throw new Error('Google Drive not connected');
    }

    // Create a folder for this session
    const sessionFolder = await this.driveManager.createFolder(
      `claude-session-${sessionId}`,
      folderId
    );

    // Get all session files
    const sessionFiles = await this.listSessionFiles(sessionId);
    const sessionPath = path.join(this.sessionsPath, sessionId);

    // Upload each file
    const fullPaths = sessionFiles.map((f) => path.join(sessionPath, f));
    return this.uploadToDrive(fullPaths, sessionFolder.folderId);
  }

  async createDriveFolder(name: string, parentId?: string): Promise<{ folderId: string; webViewLink: string }> {
    if (!this.driveManager || !this.driveManager.isConnected()) {
      throw new Error('Google Drive not connected');
    }
    return this.driveManager.createFolder(name, parentId);
  }

  async listDriveFiles(folderId?: string): Promise<any[]> {
    if (!this.driveManager || !this.driveManager.isConnected()) {
      throw new Error('Google Drive not connected');
    }
    return this.driveManager.listFiles(folderId);
  }

  async listSessionFiles(sessionId: string): Promise<string[]> {
    try {
      const sessionPath = path.join(this.sessionsPath, sessionId);
      const outputPath = path.join(sessionPath, 'outputs');

      // Check if outputs directory exists
      try {
        await fs.access(outputPath);
      } catch {
        return [];
      }

      // List all files in outputs
      const files = await this.listFilesRecursive(outputPath);
      return files.map((file) => path.relative(sessionPath, file));
    } catch (error) {
      console.error('Failed to list session files:', error);
      return [];
    }
  }

  private async listFilesRecursive(dir: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        const subFiles = await this.listFilesRecursive(fullPath);
        files.push(...subFiles);
      } else {
        files.push(fullPath);
      }
    }

    return files;
  }

  async getFileInfo(sessionId: string, file: string): Promise<any> {
    try {
      const sessionPath = path.join(this.sessionsPath, sessionId);
      const filePath = path.join(sessionPath, file);

      const stats = await fs.stat(filePath);

      return {
        name: path.basename(file),
        path: file,
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        isDirectory: stats.isDirectory(),
      };
    } catch (error) {
      console.error('Failed to get file info:', error);
      throw error;
    }
  }

  async readFile(sessionId: string, file: string): Promise<Buffer> {
    try {
      const sessionPath = path.join(this.sessionsPath, sessionId);
      const filePath = path.join(sessionPath, file);

      return await fs.readFile(filePath);
    } catch (error) {
      console.error('Failed to read file:', error);
      throw error;
    }
  }

  async cleanupSession(sessionId: string): Promise<void> {
    try {
      const sessionPath = path.join(this.sessionsPath, sessionId);
      await fs.rm(sessionPath, { recursive: true, force: true });
      console.log(`Cleaned up session: ${sessionId}`);
    } catch (error) {
      console.error('Failed to cleanup session:', error);
      throw error;
    }
  }

  async getSessionSize(sessionId: string): Promise<number> {
    try {
      const sessionPath = path.join(this.sessionsPath, sessionId);
      return await this.getDirectorySize(sessionPath);
    } catch (error) {
      console.error('Failed to get session size:', error);
      return 0;
    }
  }

  private async getDirectorySize(dir: string): Promise<number> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      let size = 0;

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          size += await this.getDirectorySize(fullPath);
        } else {
          const stats = await fs.stat(fullPath);
          size += stats.size;
        }
      }

      return size;
    } catch {
      return 0;
    }
  }

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  dispose(): void {
    if (this.driveManager) {
      this.driveManager.dispose();
      this.driveManager = null;
    }
  }
}
