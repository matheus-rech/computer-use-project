import { google, drive_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import * as fs from 'fs/promises';
import * as path from 'path';
import { EventEmitter } from 'events';

// ============================================================================
// Google Drive Integration for Claude Workspace
// ============================================================================

export interface DriveCredentials {
  clientId: string;
  clientSecret: string;
  redirectUri?: string;
}

export interface DriveUploadResult {
  fileId: string;
  fileName: string;
  webViewLink: string;
  webContentLink?: string;
}

export interface DriveConfig {
  credentials: DriveCredentials;
  tokenPath?: string;
  defaultFolderId?: string;
}

// ============================================================================
// Google Drive Manager
// ============================================================================

export class GoogleDriveManager extends EventEmitter {
  private oauth2Client: OAuth2Client | null = null;
  private drive: drive_v3.Drive | null = null;
  private config: DriveConfig;
  private tokenPath: string;
  private isAuthenticated = false;

  constructor(config: DriveConfig) {
    super();
    this.config = config;
    this.tokenPath = config.tokenPath || path.join(
      process.env.HOME || '/Users/matheusrech',
      '.claude-workspace',
      'google-drive-token.json'
    );
  }

  // ==========================================================================
  // Authentication
  // ==========================================================================

  async initialize(): Promise<void> {
    const { clientId, clientSecret, redirectUri } = this.config.credentials;

    this.oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri || 'urn:ietf:wg:oauth:2.0:oob'
    );

    // Try to load existing token
    try {
      const tokenData = await fs.readFile(this.tokenPath, 'utf-8');
      const tokens = JSON.parse(tokenData);
      this.oauth2Client.setCredentials(tokens);
      this.isAuthenticated = true;

      this.drive = google.drive({ version: 'v3', auth: this.oauth2Client });
      this.emit('authenticated');
      console.log('[GoogleDrive] Loaded existing credentials');
    } catch {
      console.log('[GoogleDrive] No existing credentials, authentication required');
    }
  }

  getAuthUrl(): string {
    if (!this.oauth2Client) {
      throw new Error('OAuth client not initialized');
    }

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/drive.metadata.readonly',
      ],
    });
  }

  async authenticateWithCode(code: string): Promise<void> {
    if (!this.oauth2Client) {
      throw new Error('OAuth client not initialized');
    }

    try {
      const { tokens } = await this.oauth2Client.getToken(code);
      this.oauth2Client.setCredentials(tokens);

      // Save tokens
      await fs.mkdir(path.dirname(this.tokenPath), { recursive: true });
      await fs.writeFile(this.tokenPath, JSON.stringify(tokens, null, 2));

      this.isAuthenticated = true;
      this.drive = google.drive({ version: 'v3', auth: this.oauth2Client });

      this.emit('authenticated');
      console.log('[GoogleDrive] Authentication successful');
    } catch (error) {
      console.error('[GoogleDrive] Authentication failed:', error);
      throw error;
    }
  }

  async revokeAuth(): Promise<void> {
    if (this.oauth2Client) {
      try {
        await this.oauth2Client.revokeCredentials();
      } catch (error) {
        console.warn('[GoogleDrive] Revoke failed:', error);
      }
    }

    try {
      await fs.unlink(this.tokenPath);
    } catch {
      // Token file may not exist
    }

    this.isAuthenticated = false;
    this.drive = null;
    this.emit('disconnected');
  }

  isConnected(): boolean {
    return this.isAuthenticated && this.drive !== null;
  }

  // ==========================================================================
  // File Operations
  // ==========================================================================

  async uploadFile(
    localPath: string,
    options?: {
      folderId?: string;
      fileName?: string;
      mimeType?: string;
    }
  ): Promise<DriveUploadResult> {
    if (!this.drive) {
      throw new Error('Not authenticated with Google Drive');
    }

    const fileName = options?.fileName || path.basename(localPath);
    const fileContent = await fs.readFile(localPath);

    const requestBody: drive_v3.Schema$File = {
      name: fileName,
      parents: options?.folderId
        ? [options.folderId]
        : this.config.defaultFolderId
          ? [this.config.defaultFolderId]
          : undefined,
    };

    const media = {
      mimeType: options?.mimeType || this.getMimeType(localPath),
      body: Buffer.from(fileContent),
    };

    this.emit('upload-start', { fileName, localPath });

    try {
      const response = await this.drive.files.create({
        requestBody,
        media: {
          mimeType: media.mimeType,
          body: require('stream').Readable.from(media.body),
        },
        fields: 'id, name, webViewLink, webContentLink',
      });

      const result: DriveUploadResult = {
        fileId: response.data.id!,
        fileName: response.data.name!,
        webViewLink: response.data.webViewLink!,
        webContentLink: response.data.webContentLink || undefined,
      };

      this.emit('upload-complete', result);
      console.log(`[GoogleDrive] Uploaded: ${fileName} -> ${result.webViewLink}`);

      return result;
    } catch (error) {
      this.emit('upload-error', { fileName, error });
      console.error('[GoogleDrive] Upload failed:', error);
      throw error;
    }
  }

  async uploadMultiple(
    files: string[],
    options?: { folderId?: string }
  ): Promise<DriveUploadResult[]> {
    const results: DriveUploadResult[] = [];

    for (const file of files) {
      try {
        const result = await this.uploadFile(file, options);
        results.push(result);
      } catch (error) {
        console.error(`[GoogleDrive] Failed to upload ${file}:`, error);
      }
    }

    return results;
  }

  async createFolder(
    name: string,
    parentId?: string
  ): Promise<{ folderId: string; webViewLink: string }> {
    if (!this.drive) {
      throw new Error('Not authenticated with Google Drive');
    }

    const response = await this.drive.files.create({
      requestBody: {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: parentId ? [parentId] : undefined,
      },
      fields: 'id, webViewLink',
    });

    return {
      folderId: response.data.id!,
      webViewLink: response.data.webViewLink!,
    };
  }

  async listFiles(folderId?: string, pageSize = 20): Promise<drive_v3.Schema$File[]> {
    if (!this.drive) {
      throw new Error('Not authenticated with Google Drive');
    }

    const query = folderId
      ? `'${folderId}' in parents and trashed = false`
      : 'trashed = false';

    const response = await this.drive.files.list({
      q: query,
      pageSize,
      fields: 'files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink)',
    });

    return response.data.files || [];
  }

  async deleteFile(fileId: string): Promise<void> {
    if (!this.drive) {
      throw new Error('Not authenticated with Google Drive');
    }

    await this.drive.files.delete({ fileId });
    console.log(`[GoogleDrive] Deleted file: ${fileId}`);
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();

    const mimeTypes: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.txt': 'text/plain',
      '.csv': 'text/csv',
      '.json': 'application/json',
      '.xml': 'application/xml',
      '.html': 'text/html',
      '.md': 'text/markdown',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.zip': 'application/zip',
      '.tar': 'application/x-tar',
      '.gz': 'application/gzip',
      '.py': 'text/x-python',
      '.js': 'text/javascript',
      '.ts': 'text/typescript',
      '.r': 'text/x-r',
      '.rmd': 'text/x-r-markdown',
    };

    return mimeTypes[ext] || 'application/octet-stream';
  }

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  dispose(): void {
    this.oauth2Client = null;
    this.drive = null;
    this.isAuthenticated = false;
    this.removeAllListeners();
  }
}
