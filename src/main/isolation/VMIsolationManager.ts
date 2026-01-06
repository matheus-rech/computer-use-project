import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { app } from 'electron';
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
// VM-based Isolation Manager (macOS Virtualization.framework)
// ============================================================================

export class VMIsolationManager extends BaseIsolationManager {
  readonly backend: IsolationBackend = 'vm';

  private bridgeProcess: ChildProcess | null = null;
  private bridgePath: string;
  private pendingCommands = new Map<string, {
    resolve: (value: Record<string, unknown>) => void;
    reject: (error: Error) => void;
  }>();

  constructor(customBridgePath?: string) {
    super();

    // Path to compiled Swift bridge binary
    this.bridgePath = customBridgePath || (
      app?.isPackaged
        ? path.join((process as NodeJS.Process & { resourcesPath: string }).resourcesPath, 'vm-bridge', 'VMBridge')
        : path.join(__dirname, '../../vm/bridge/.build/release/VMBridge')
    );
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  async start(sessionId: string, profile: IsolationProfile): Promise<void> {
    if (this.running) {
      throw new Error('VM already running');
    }

    this.emitLifecycleEvent('starting');
    this.sessionId = sessionId;
    this.profile = profile;

    try {
      // Start the Swift bridge process
      await this.startBridge();

      // Send start command with profile
      const result = await this.sendCommand('start', {
        profile: {
          cpuCores: profile.resources.cpuCores,
          memoryGB: profile.resources.memoryGB,
          diskGB: profile.resources.diskGB || 20,
          network: profile.network,
          clipboard: profile.clipboard,
          gpu: profile.gpu,
        },
      });

      this.running = true;
      this.emitLifecycleEvent('started', { vmId: result.vmId });
      console.log(`[VM] Started with ID: ${result.vmId}`);
    } catch (error) {
      this.emitLifecycleEvent('error', { error });
      this.cleanup();
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    this.emitLifecycleEvent('stopping');

    try {
      await this.sendCommand('stop', {});
    } catch (error) {
      console.error('[VM] Stop error:', error);
    } finally {
      this.cleanup();
    }
  }

  async forceStop(): Promise<void> {
    if (this.bridgeProcess) {
      this.bridgeProcess.kill('SIGKILL');
    }
    this.cleanup();
  }

  private cleanup(): void {
    this.running = false;
    this.sessionId = null;
    this.profile = null;

    if (this.bridgeProcess) {
      this.bridgeProcess.kill();
      this.bridgeProcess = null;
    }

    // Reject all pending commands
    for (const [id, pending] of this.pendingCommands) {
      pending.reject(new Error('VM stopped'));
      this.pendingCommands.delete(id);
    }

    this.emitLifecycleEvent('stopped');
  }

  // ==========================================================================
  // Command Execution
  // ==========================================================================

  async execute(command: string, options?: ExecuteOptions): Promise<ExecuteResult> {
    if (!this.running) {
      throw new Error('VM not running');
    }

    const result = await this.sendCommand('exec', {
      command,
      timeout: options?.timeout ?? 30000,
      cwd: options?.cwd,
      env: options?.env,
    });

    return {
      stdout: (result.stdout as string) || '',
      stderr: (result.stderr as string) || '',
      exitCode: (result.exitCode as number) ?? 0,
    };
  }

  async executeStream(
    command: string,
    onOutput: (type: 'stdout' | 'stderr', data: string) => void
  ): Promise<number> {
    if (!this.running) {
      throw new Error('VM not running');
    }

    const streamId = this.generateId();

    // Set up stream listeners
    const cleanup = () => {
      this.off(`stream:${streamId}:stdout`, onStdout);
      this.off(`stream:${streamId}:stderr`, onStderr);
      this.off(`stream:${streamId}:exit`, onExit);
      this.off(`stream:${streamId}:error`, onError);
    };

    const onStdout = (data: string) => onOutput('stdout', data);
    const onStderr = (data: string) => onOutput('stderr', data);

    let exitCode = 0;
    const onExit = (code: number) => {
      exitCode = code;
    };
    const onError = (error: Error) => {
      cleanup();
      throw error;
    };

    this.on(`stream:${streamId}:stdout`, onStdout);
    this.on(`stream:${streamId}:stderr`, onStderr);
    this.on(`stream:${streamId}:exit`, onExit);
    this.on(`stream:${streamId}:error`, onError);

    try {
      await this.sendCommand('exec_stream', { command, streamId });
      return exitCode;
    } finally {
      cleanup();
    }
  }

  // ==========================================================================
  // File Operations
  // ==========================================================================

  async listFiles(vmPath: string): Promise<FileInfo[]> {
    if (!this.running) {
      throw new Error('VM not running');
    }

    const result = await this.sendCommand('list_files', { path: vmPath });
    const files = result.files as Array<{
      name: string;
      path: string;
      size: number;
      isDirectory: boolean;
      modified?: string;
    }>;

    return files.map((f) => ({
      name: f.name,
      path: f.path,
      size: f.size,
      isDirectory: f.isDirectory,
      modified: f.modified ? new Date(f.modified) : undefined,
    }));
  }

  async readFile(vmPath: string): Promise<Buffer> {
    if (!this.running) {
      throw new Error('VM not running');
    }

    const result = await this.sendCommand('read_file', { path: vmPath });
    return Buffer.from(result.content as string, 'base64');
  }

  async writeFile(vmPath: string, content: Buffer): Promise<void> {
    if (!this.running) {
      throw new Error('VM not running');
    }

    await this.sendCommand('write_file', {
      path: vmPath,
      content: content.toString('base64'),
    });
  }

  async copyToEnvironment(hostPath: string, vmPath: string): Promise<void> {
    if (!this.running) {
      throw new Error('VM not running');
    }

    await this.sendCommand('copy_to_vm', { hostPath, vmPath });
  }

  async copyFromEnvironment(vmPath: string, hostPath: string): Promise<void> {
    if (!this.running) {
      throw new Error('VM not running');
    }

    await this.sendCommand('copy_from_vm', { vmPath, hostPath });
  }

  // ==========================================================================
  // Status
  // ==========================================================================

  async getStatus(): Promise<IsolationStatus> {
    if (!this.running) {
      return {
        running: false,
        backend: 'vm',
      };
    }

    try {
      const result = await this.sendCommand('status', {});

      return {
        running: true,
        backend: 'vm',
        sessionId: this.sessionId || undefined,
        cpuUsage: result.cpuUsage as number,
        memoryUsage: result.memoryUsage as number,
        diskUsage: result.diskUsage as number,
      };
    } catch (error) {
      console.error('[VM] Status error:', error);
      return {
        running: false,
        backend: 'vm',
      };
    }
  }

  async updateProfile(profile: Partial<IsolationProfile>): Promise<void> {
    if (!this.running) {
      throw new Error('VM not running');
    }

    await this.sendCommand('update_profile', { profile });

    // Merge with existing profile
    if (this.profile) {
      this.profile = { ...this.profile, ...profile };
    }

    this.emit('profile:updated', profile);
  }

  // ==========================================================================
  // Bridge Communication
  // ==========================================================================

  private async startBridge(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Spawn bridge process with array args (safe)
      this.bridgeProcess = spawn(this.bridgePath, [], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let initialized = false;

      this.bridgeProcess.stdout?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter(Boolean);

        for (const line of lines) {
          try {
            const message = JSON.parse(line);
            this.handleBridgeMessage(message);

            if (message.type === 'ready' && !initialized) {
              initialized = true;
              resolve();
            }
          } catch {
            // Non-JSON output, log it
            console.log('[VMBridge]', line);
          }
        }
      });

      this.bridgeProcess.stderr?.on('data', (data: Buffer) => {
        console.error('[VMBridge Error]', data.toString());
      });

      this.bridgeProcess.on('error', (error) => {
        if (!initialized) {
          reject(error);
        }
        this.emit('error', error);
      });

      this.bridgeProcess.on('exit', (code) => {
        if (!initialized) {
          reject(new Error(`Bridge exited with code ${code}`));
        }
        this.cleanup();
      });

      // Timeout for initialization
      setTimeout(() => {
        if (!initialized) {
          this.bridgeProcess?.kill();
          reject(new Error('Bridge initialization timeout'));
        }
      }, 10000);
    });
  }

  private handleBridgeMessage(message: {
    type: string;
    id?: string;
    [key: string]: unknown;
  }): void {
    switch (message.type) {
      case 'response': {
        const pending = this.pendingCommands.get(message.id!);
        if (pending) {
          this.pendingCommands.delete(message.id!);
          if (message.error) {
            pending.reject(new Error(message.error as string));
          } else {
            pending.resolve(message.result as Record<string, unknown>);
          }
        }
        break;
      }

      case 'stream': {
        const streamId = message.streamId as string;
        const streamType = message.streamType as string;
        const data = message.data;
        this.emit(`stream:${streamId}:${streamType}`, data);
        break;
      }

      case 'event': {
        this.emit(message.event as string, message.data);
        break;
      }
    }
  }

  private sendCommand(
    command: string,
    params: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      if (!this.bridgeProcess?.stdin) {
        reject(new Error('Bridge not running'));
        return;
      }

      const id = this.generateId();
      const message = JSON.stringify({ id, command, params }) + '\n';

      this.pendingCommands.set(id, { resolve, reject });

      this.bridgeProcess.stdin.write(message, (error) => {
        if (error) {
          this.pendingCommands.delete(id);
          reject(error);
        }
      });

      // Command timeout
      setTimeout(() => {
        if (this.pendingCommands.has(id)) {
          this.pendingCommands.delete(id);
          reject(new Error(`Command timeout: ${command}`));
        }
      }, 60000);
    });
  }

  private generateId(): string {
    return `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}
