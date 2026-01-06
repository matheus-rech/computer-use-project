import Docker from 'dockerode';
import path from 'path';
import fs from 'fs/promises';
import { spawn } from 'child_process';
import {
  BaseIsolationManager,
  IsolationProfile,
  ExecuteResult,
  ExecuteOptions,
  FileInfo,
  IsolationStatus,
  IsolationBackend,
} from './IsolationManager';

// ============================================================================
// Docker-based Isolation Manager
// ============================================================================

export class DockerIsolationManager extends BaseIsolationManager {
  readonly backend: IsolationBackend = 'docker';

  private docker: Docker;
  private containerId: string | null = null;
  private containerName: string | null = null;

  private readonly basePath: string;
  private readonly imageName = 'claude-workspace:latest';

  constructor() {
    super();
    this.docker = new Docker();
    this.basePath = path.join(
      process.env.HOME || '/Users/matheusrech',
      '.claude-workspace'
    );
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  async start(sessionId: string, profile: IsolationProfile): Promise<void> {
    if (this.running) {
      throw new Error('Container already running');
    }

    this.emitLifecycleEvent('starting');
    this.sessionId = sessionId;
    this.profile = profile;

    try {
      // Ensure image exists
      await this.ensureImage();

      // Create session directory
      const sessionPath = path.join(this.basePath, 'sessions', sessionId);
      await fs.mkdir(sessionPath, { recursive: true });

      // Skills path
      const skillsPath = path.join(
        process.env.HOME || '/Users/matheusrech',
        'Library',
        'Application Support',
        'Claude',
        'skills'
      );

      // Build environment variables
      const env = [
        `SESSION_ID=${sessionId}`,
        `ISOLATION_PROFILE=${profile.name}`,
      ];

      // Network mode based on profile
      let networkMode = 'bridge';
      if (!profile.network.enabled) {
        networkMode = 'none';
      }

      // Create container using dockerode API (safe, no shell)
      const container = await this.docker.createContainer({
        Image: this.imageName,
        name: `claude-workspace-${sessionId}`,
        Env: env,
        HostConfig: {
          Binds: [
            `${skillsPath}:/mnt/skills:ro`,
            `${sessionPath}:/mnt/user-data:rw`,
          ],
          Memory: profile.resources.memoryGB * 1024 * 1024 * 1024,
          NanoCpus: profile.resources.cpuCores * 1000000000,
          NetworkMode: networkMode,
          SecurityOpt: ['no-new-privileges'],
          AutoRemove: false,
          CapDrop: ['ALL'],
          CapAdd: ['CHOWN', 'DAC_OVERRIDE', 'FOWNER', 'SETGID', 'SETUID'],
        },
        Tty: true,
        OpenStdin: true,
        Labels: {
          'com.claude.workspace': 'true',
          'com.claude.session': sessionId,
          'com.claude.profile': profile.name,
        },
      });

      await container.start();

      this.containerId = container.id;
      this.containerName = `claude-workspace-${sessionId}`;
      this.running = true;

      this.emitLifecycleEvent('started');
      console.log(`[Docker] Container started: ${this.containerId}`);
    } catch (error) {
      this.emitLifecycleEvent('error', { error });
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.running || !this.containerId) {
      return;
    }

    this.emitLifecycleEvent('stopping');

    try {
      const container = this.docker.getContainer(this.containerId);
      await container.stop({ t: 10 });
      await container.remove({ force: true });

      console.log(`[Docker] Container stopped: ${this.containerId}`);
    } catch (error) {
      console.error('[Docker] Stop error:', error);
    } finally {
      this.cleanup();
    }
  }

  async forceStop(): Promise<void> {
    if (!this.containerId) {
      return;
    }

    try {
      const container = this.docker.getContainer(this.containerId);
      await container.kill();
      await container.remove({ force: true });
    } catch (error) {
      console.error('[Docker] Force stop error:', error);
    } finally {
      this.cleanup();
    }
  }

  private cleanup(): void {
    this.running = false;
    this.containerId = null;
    this.containerName = null;
    this.sessionId = null;
    this.profile = null;
    this.emitLifecycleEvent('stopped');
  }

  // ==========================================================================
  // Command Execution
  // ==========================================================================

  async execute(command: string, options?: ExecuteOptions): Promise<ExecuteResult> {
    if (!this.running || !this.containerId) {
      throw new Error('Container not running');
    }

    const container = this.docker.getContainer(this.containerId);

    // Use dockerode exec API - command is passed to bash inside container
    // This is safe as dockerode handles escaping
    const execOptions: Docker.ExecCreateOptions = {
      Cmd: ['bash', '-c', command],
      AttachStdout: true,
      AttachStderr: true,
      WorkingDir: options?.cwd,
      Env: options?.env ? Object.entries(options.env).map(([k, v]) => `${k}=${v}`) : undefined,
    };

    const exec = await container.exec(execOptions);
    const stream = await exec.start({ Detach: false, Tty: false });

    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';

      const timeout = options?.timeout ?? 30000;
      const timer = setTimeout(() => {
        reject(new Error(`Command timeout after ${timeout}ms`));
      }, timeout);

      stream.on('data', (chunk: Buffer) => {
        // Docker multiplexes stdout/stderr
        if (chunk.length > 8) {
          const type = chunk.readUInt8(0);
          const data = chunk.slice(8).toString();

          if (type === 1) {
            stdout += data;
          } else if (type === 2) {
            stderr += data;
          }
        }
      });

      stream.on('end', async () => {
        clearTimeout(timer);
        const inspect = await exec.inspect();
        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: inspect.ExitCode ?? 0,
        });
      });

      stream.on('error', (error: Error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  async executeStream(
    command: string,
    onOutput: (type: 'stdout' | 'stderr', data: string) => void
  ): Promise<number> {
    if (!this.running || !this.containerId) {
      throw new Error('Container not running');
    }

    const container = this.docker.getContainer(this.containerId);

    const exec = await container.exec({
      Cmd: ['bash', '-c', command],
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await exec.start({ Detach: false, Tty: false });

    return new Promise((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => {
        if (chunk.length > 8) {
          const type = chunk.readUInt8(0);
          const data = chunk.slice(8).toString();

          if (type === 1) {
            onOutput('stdout', data);
          } else if (type === 2) {
            onOutput('stderr', data);
          }
        }
      });

      stream.on('end', async () => {
        const inspect = await exec.inspect();
        resolve(inspect.ExitCode ?? 0);
      });

      stream.on('error', reject);
    });
  }

  // ==========================================================================
  // File Operations
  // ==========================================================================

  async listFiles(dirPath: string): Promise<FileInfo[]> {
    const result = await this.execute(`ls -la "${dirPath}" 2>/dev/null || echo ""`);
    const lines = result.stdout.split('\n').filter((l) => l.trim());

    const files: FileInfo[] = [];

    for (const line of lines.slice(1)) {
      // Skip "total" line
      const parts = line.split(/\s+/);
      if (parts.length < 9) continue;

      const name = parts.slice(8).join(' ');
      if (name === '.' || name === '..') continue;

      files.push({
        name,
        path: path.join(dirPath, name),
        size: parseInt(parts[4], 10) || 0,
        isDirectory: parts[0].startsWith('d'),
      });
    }

    return files;
  }

  async readFile(filePath: string): Promise<Buffer> {
    if (!this.containerId) {
      throw new Error('Container not running');
    }

    const container = this.docker.getContainer(this.containerId);
    const stream = await container.getArchive({ path: filePath });

    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    // Extract from tar using tar-stream
    const tar = require('tar-stream');
    const extract = tar.extract();

    return new Promise((resolve, reject) => {
      const fileChunks: Buffer[] = [];

      extract.on('entry', (_header: unknown, entryStream: NodeJS.ReadableStream, next: () => void) => {
        entryStream.on('data', (chunk: Buffer) => fileChunks.push(chunk));
        entryStream.on('end', next);
      });

      extract.on('finish', () => {
        resolve(Buffer.concat(fileChunks));
      });

      extract.on('error', reject);

      const { Readable } = require('stream');
      Readable.from(Buffer.concat(chunks)).pipe(extract);
    });
  }

  async writeFile(filePath: string, content: Buffer): Promise<void> {
    // Write via base64 encoding through container exec
    const b64 = content.toString('base64');
    const dir = path.dirname(filePath);

    // Use container exec - safe as it goes through dockerode API
    await this.execute(`mkdir -p "${dir}" && echo "${b64}" | base64 -d > "${filePath}"`);
  }

  async copyToEnvironment(hostPath: string, envPath: string): Promise<void> {
    if (!this.containerId) {
      throw new Error('Container not running');
    }

    const container = this.docker.getContainer(this.containerId);
    const tar = require('tar-stream');
    const pack = tar.pack();

    const content = await fs.readFile(hostPath);
    pack.entry({ name: path.basename(envPath) }, content);
    pack.finalize();

    await container.putArchive(pack, { path: path.dirname(envPath) });
  }

  async copyFromEnvironment(envPath: string, hostPath: string): Promise<void> {
    const content = await this.readFile(envPath);
    await fs.mkdir(path.dirname(hostPath), { recursive: true });
    await fs.writeFile(hostPath, content);
  }

  // ==========================================================================
  // Status
  // ==========================================================================

  async getStatus(): Promise<IsolationStatus> {
    if (!this.running || !this.containerId) {
      return {
        running: false,
        backend: 'docker',
      };
    }

    try {
      const container = this.docker.getContainer(this.containerId);
      const info = await container.inspect();
      const stats = await container.stats({ stream: false });

      // Calculate CPU usage
      const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
      const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
      const cpuUsage = systemDelta > 0 ? (cpuDelta / systemDelta) * 100 : 0;

      // Calculate memory usage
      const memoryUsage = stats.memory_stats.usage
        ? (stats.memory_stats.usage / stats.memory_stats.limit) * 100
        : 0;

      return {
        running: info.State.Running,
        backend: 'docker',
        sessionId: this.sessionId || undefined,
        cpuUsage,
        memoryUsage,
        uptime: info.State.Running
          ? Date.now() - new Date(info.State.StartedAt).getTime()
          : undefined,
      };
    } catch (error) {
      console.error('[Docker] Status error:', error);
      return {
        running: false,
        backend: 'docker',
      };
    }
  }

  async updateProfile(profile: Partial<IsolationProfile>): Promise<void> {
    if (!this.containerId) {
      throw new Error('Container not running');
    }

    // Docker doesn't support all runtime updates
    console.warn('[Docker] Profile updates require container restart for full effect');

    const container = this.docker.getContainer(this.containerId);

    // Update what we can at runtime
    if (profile.resources) {
      await container.update({
        Memory: profile.resources.memoryGB
          ? profile.resources.memoryGB * 1024 * 1024 * 1024
          : undefined,
        NanoCpus: profile.resources.cpuCores
          ? profile.resources.cpuCores * 1000000000
          : undefined,
      });
    }

    // Merge with existing profile
    if (this.profile) {
      this.profile = { ...this.profile, ...profile };
    }
  }

  // ==========================================================================
  // Image Management (uses spawn with array args - safe)
  // ==========================================================================

  private async ensureImage(): Promise<void> {
    try {
      const images = await this.docker.listImages({
        filters: { reference: [this.imageName] },
      });

      if (images.length > 0) {
        return;
      }

      console.log('[Docker] Building image...');

      const dockerfilePath = path.join(__dirname, '../../../../docker');

      // Using spawn with array arguments (safe - no shell injection)
      await new Promise<void>((resolve, reject) => {
        const build = spawn('docker', ['build', '-t', this.imageName, dockerfilePath], {
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        build.stdout?.on('data', (data: Buffer) => console.log(data.toString()));
        build.stderr?.on('data', (data: Buffer) => console.error(data.toString()));

        build.on('close', (code) => {
          if (code === 0) {
            console.log('[Docker] Image built successfully');
            resolve();
          } else {
            reject(new Error(`Docker build failed with code ${code}`));
          }
        });

        build.on('error', reject);
      });
    } catch (error) {
      console.error('[Docker] Image error:', error);
      throw error;
    }
  }
}
