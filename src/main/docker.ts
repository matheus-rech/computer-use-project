import Docker from 'dockerode';
import path from 'path';
import fs from 'fs/promises';
import { spawn } from 'child_process';

export interface ContainerOptions {
  sessionId: string;
  apiKey: string;
  skills: any;
  userPreferences: any;
}

export class DockerManager {
  private docker: Docker;
  private containers: Map<string, string> = new Map(); // sessionId -> containerId

  constructor() {
    this.docker = new Docker();
  }

  async startContainer(options: ContainerOptions): Promise<string> {
    const { sessionId, apiKey, skills, userPreferences } = options;

    try {
      // Prepare environment variables
      const env = [
        `ANTHROPIC_API_KEY=${apiKey}`,
        `SESSION_ID=${sessionId}`,
        `USER_PREFERENCES=${JSON.stringify(userPreferences)}`,
      ];

      // Create transfer directory for this session
      const transferPath = path.join(
        process.env.HOME || '/Users/matheusrech',
        '.claude-workspace',
        'sessions',
        sessionId
      );
      await fs.mkdir(transferPath, { recursive: true });

      // Get skills path
      const skillsPath = path.join(
        process.env.HOME || '/Users/matheusrech',
        'Library',
        'Application Support',
        'Claude',
        'skills'
      );

      // Build the image if not exists
      await this.ensureImage();

      // Create and start container
      const container = await this.docker.createContainer({
        Image: 'claude-workspace:latest',
        name: `claude-workspace-${sessionId}`,
        Env: env,
        HostConfig: {
          Binds: [
            `${skillsPath}:/mnt/skills:ro`,
            `${transferPath}:/mnt/user-data:rw`,
          ],
          Memory: 8 * 1024 * 1024 * 1024, // 8GB
          NanoCpus: 4 * 1000000000, // 4 CPUs
          AutoRemove: true,
        },
        Tty: true,
        OpenStdin: true,
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Labels: {
          'com.claude.workspace': 'true',
          'com.claude.session': sessionId,
        },
      });

      await container.start();

      const containerId = container.id;
      this.containers.set(sessionId, containerId);

      console.log(`Container started: ${containerId} for session ${sessionId}`);

      return containerId;
    } catch (error) {
      console.error('Failed to start container:', error);
      throw error;
    }
  }

  async stopContainer(sessionId: string): Promise<void> {
    const containerId = this.containers.get(sessionId);
    if (!containerId) {
      throw new Error(`No container found for session ${sessionId}`);
    }

    try {
      const container = this.docker.getContainer(containerId);
      await container.stop({ t: 10 });
      await container.remove({ force: true });

      this.containers.delete(sessionId);

      // Cleanup transfer directory
      const transferPath = path.join(
        process.env.HOME || '/Users/matheusrech',
        '.claude-workspace',
        'sessions',
        sessionId
      );
      await fs.rm(transferPath, { recursive: true, force: true });

      console.log(`Container stopped and removed: ${containerId}`);
    } catch (error) {
      console.error('Failed to stop container:', error);
      throw error;
    }
  }

  async getContainerStatus(sessionId: string): Promise<any> {
    const containerId = this.containers.get(sessionId);
    if (!containerId) {
      return { running: false };
    }

    try {
      const container = this.docker.getContainer(containerId);
      const info = await container.inspect();

      return {
        running: info.State.Running,
        status: info.State.Status,
        created: info.Created,
        memory: info.HostConfig.Memory,
        cpus: (info.HostConfig.NanoCpus ?? 0) / 1000000000,
      };
    } catch (error) {
      console.error('Failed to get container status:', error);
      return { running: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async executeCommand(
    sessionId: string,
    command: string,
    args: string[] = []
  ): Promise<string> {
    const containerId = this.containers.get(sessionId);
    if (!containerId) {
      throw new Error(`No container found for session ${sessionId}`);
    }

    try {
      const container = this.docker.getContainer(containerId);

      const exec = await container.exec({
        Cmd: [command, ...args],
        AttachStdout: true,
        AttachStderr: true,
      });

      const stream = await exec.start({ Detach: false, Tty: false });

      return new Promise((resolve, reject) => {
        let output = '';
        let error = '';

        stream.on('data', (chunk: Buffer) => {
          // Docker multiplexes stdout and stderr
          // First 8 bytes are header
          if (chunk.length > 8) {
            const type = chunk.readUInt8(0);
            const data = chunk.slice(8).toString();

            if (type === 1) {
              // stdout
              output += data;
            } else if (type === 2) {
              // stderr
              error += data;
            }
          }
        });

        stream.on('end', () => {
          if (error) {
            reject(new Error(error));
          } else {
            resolve(output);
          }
        });

        stream.on('error', reject);
      });
    } catch (error) {
      console.error('Failed to execute command:', error);
      throw error;
    }
  }

  async listFiles(sessionId: string, directory: string): Promise<any[]> {
    const output = await this.executeCommand(sessionId, 'ls', [
      '-lah',
      directory,
    ]);

    // Parse ls output
    const lines = output.split('\n').slice(1); // Skip total line
    const files = [];

    for (const line of lines) {
      if (!line.trim()) continue;

      const parts = line.split(/\s+/);
      if (parts.length < 9) continue;

      const permissions = parts[0];
      const size = parts[4];
      const name = parts.slice(8).join(' ');

      if (name === '.' || name === '..') continue;

      files.push({
        name,
        size,
        isDirectory: permissions.startsWith('d'),
        permissions,
      });
    }

    return files;
  }

  async copyFileFromContainer(
    sessionId: string,
    sourcePath: string,
    destPath: string
  ): Promise<void> {
    const containerId = this.containers.get(sessionId);
    if (!containerId) {
      throw new Error(`No container found for session ${sessionId}`);
    }

    try {
      const container = this.docker.getContainer(containerId);

      // Get file as tar stream
      const stream = await container.getArchive({ path: sourcePath });

      // Extract tar to destination
      return new Promise((resolve, reject) => {
        const writeStream = require('fs').createWriteStream(destPath);
        const extract = require('tar-stream').extract();

        extract.on('entry', (header: any, entryStream: any, next: any) => {
          entryStream.pipe(writeStream);
          entryStream.on('end', next);
        });

        extract.on('finish', resolve);
        extract.on('error', reject);

        stream.pipe(extract);
      });
    } catch (error) {
      console.error('Failed to copy file:', error);
      throw error;
    }
  }

  private async ensureImage(): Promise<void> {
    try {
      // Check if image exists
      const images = await this.docker.listImages({
        filters: { reference: ['claude-workspace:latest'] },
      });

      if (images.length > 0) {
        console.log('Image already exists');
        return;
      }

      console.log('Building Docker image...');

      const dockerfilePath = path.join(__dirname, '../../../docker');

      // Build image using docker CLI (more reliable than docker API)
      await new Promise<void>((resolve, reject) => {
        const build = spawn('docker', [
          'build',
          '-t',
          'claude-workspace:latest',
          dockerfilePath,
        ]);

        build.stdout.on('data', (data) => {
          console.log(data.toString());
        });

        build.stderr.on('data', (data) => {
          console.error(data.toString());
        });

        build.on('close', (code) => {
          if (code === 0) {
            console.log('Docker image built successfully');
            resolve();
          } else {
            reject(new Error(`Docker build failed with code ${code}`));
          }
        });
      });
    } catch (error) {
      console.error('Failed to ensure image:', error);
      throw error;
    }
  }
}
