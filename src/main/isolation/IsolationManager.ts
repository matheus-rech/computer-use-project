import { EventEmitter } from 'events';

// ============================================================================
// Isolation Abstraction Layer
// ============================================================================
// Provides a unified interface for both Docker and VM-based isolation

export type IsolationBackend = 'docker' | 'vm';

export interface IsolationProfile {
  name: string;
  resources: {
    cpuCores: number;
    memoryGB: number;
    diskGB?: number;
  };
  network: {
    enabled: boolean;
    allowedHosts?: string[];
    blockedHosts?: string[];
  };
  filesystem: {
    readOnlyPaths?: string[];
    blockedPaths?: string[];
    allowedPaths?: string[];
  };
  clipboard?: boolean;
  gpu?: boolean;
}

export interface ExecuteResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface FileInfo {
  name: string;
  path: string;
  size: number;
  isDirectory: boolean;
  modified?: Date;
}

export interface IsolationStatus {
  running: boolean;
  backend: IsolationBackend;
  sessionId?: string;
  cpuUsage?: number;
  memoryUsage?: number;
  diskUsage?: number;
  uptime?: number;
}

// ============================================================================
// Isolation Manager Interface
// ============================================================================

export interface IIsolationManager {
  readonly backend: IsolationBackend;

  // Lifecycle
  start(sessionId: string, profile: IsolationProfile): Promise<void>;
  stop(): Promise<void>;
  forceStop(): Promise<void>;

  // Command execution
  execute(command: string, options?: ExecuteOptions): Promise<ExecuteResult>;
  executeStream(
    command: string,
    onOutput: (type: 'stdout' | 'stderr', data: string) => void
  ): Promise<number>;

  // File operations
  listFiles(path: string): Promise<FileInfo[]>;
  readFile(path: string): Promise<Buffer>;
  writeFile(path: string, content: Buffer): Promise<void>;
  copyToEnvironment(hostPath: string, envPath: string): Promise<void>;
  copyFromEnvironment(envPath: string, hostPath: string): Promise<void>;

  // Status
  getStatus(): Promise<IsolationStatus>;
  isRunning(): boolean;

  // Profile management
  updateProfile(profile: Partial<IsolationProfile>): Promise<void>;
}

export interface ExecuteOptions {
  timeout?: number;
  cwd?: string;
  env?: Record<string, string>;
}

// ============================================================================
// Predefined Profiles
// ============================================================================

export const ISOLATION_PROFILES: Record<string, IsolationProfile> = {
  open: {
    name: 'Open',
    resources: { cpuCores: 4, memoryGB: 8, diskGB: 20 },
    network: { enabled: true },
    filesystem: {},
    clipboard: true,
    gpu: true,
  },

  balanced: {
    name: 'Balanced',
    resources: { cpuCores: 4, memoryGB: 8, diskGB: 20 },
    network: { enabled: true },
    filesystem: {
      blockedPaths: ['/etc/passwd', '/etc/shadow', '/var/log'],
    },
    clipboard: true,
    gpu: false,
  },

  restricted: {
    name: 'Restricted',
    resources: { cpuCores: 2, memoryGB: 4, diskGB: 10 },
    network: {
      enabled: true,
      allowedHosts: ['localhost', '127.0.0.1'],
    },
    filesystem: {
      allowedPaths: ['/home/claude', '/tmp', '/mnt/user-data'],
      blockedPaths: ['/etc', '/var', '/usr/bin'],
    },
    clipboard: false,
    gpu: false,
  },

  isolated: {
    name: 'Isolated',
    resources: { cpuCores: 2, memoryGB: 4, diskGB: 10 },
    network: { enabled: false },
    filesystem: {
      allowedPaths: ['/home/claude', '/mnt/user-data'],
      blockedPaths: ['/etc', '/var', '/usr', '/bin', '/sbin'],
    },
    clipboard: false,
    gpu: false,
  },
};

// ============================================================================
// Base Isolation Manager
// ============================================================================

export abstract class BaseIsolationManager extends EventEmitter implements IIsolationManager {
  abstract readonly backend: IsolationBackend;

  protected sessionId: string | null = null;
  protected profile: IsolationProfile | null = null;
  protected running = false;

  abstract start(sessionId: string, profile: IsolationProfile): Promise<void>;
  abstract stop(): Promise<void>;
  abstract forceStop(): Promise<void>;
  abstract execute(command: string, options?: ExecuteOptions): Promise<ExecuteResult>;
  abstract executeStream(
    command: string,
    onOutput: (type: 'stdout' | 'stderr', data: string) => void
  ): Promise<number>;
  abstract listFiles(path: string): Promise<FileInfo[]>;
  abstract readFile(path: string): Promise<Buffer>;
  abstract writeFile(path: string, content: Buffer): Promise<void>;
  abstract copyToEnvironment(hostPath: string, envPath: string): Promise<void>;
  abstract copyFromEnvironment(envPath: string, hostPath: string): Promise<void>;
  abstract getStatus(): Promise<IsolationStatus>;
  abstract updateProfile(profile: Partial<IsolationProfile>): Promise<void>;

  isRunning(): boolean {
    return this.running;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  getProfile(): IsolationProfile | null {
    return this.profile;
  }

  protected emitLifecycleEvent(event: 'starting' | 'started' | 'stopping' | 'stopped' | 'error', data?: Record<string, unknown>): void {
    this.emit(event, { sessionId: this.sessionId, backend: this.backend, ...data });
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export async function createIsolationManager(
  backend: IsolationBackend,
  options?: { vmBridgePath?: string }
): Promise<IIsolationManager> {
  switch (backend) {
    case 'docker': {
      const { DockerIsolationManager } = await import('./DockerIsolationManager');
      return new DockerIsolationManager();
    }
    case 'vm': {
      const { VMIsolationManager } = await import('./VMIsolationManager');
      return new VMIsolationManager(options?.vmBridgePath);
    }
    default:
      throw new Error(`Unknown isolation backend: ${backend}`);
  }
}

// ============================================================================
// Auto-detect Best Backend
// ============================================================================

export function detectBestBackend(): IsolationBackend {
  // Check if running on macOS 13+
  const platform = process.platform;
  const release = parseInt(require('os').release().split('.')[0], 10);

  // macOS 13 (Ventura) = Darwin 22
  if (platform === 'darwin' && release >= 22) {
    // VM is available but Docker is more reliable for now
    // Return 'docker' as default, users can opt into 'vm'
    return 'docker';
  }

  // For all other platforms, use Docker
  return 'docker';
}

export function isVMAvailable(): boolean {
  const platform = process.platform;
  const release = parseInt(require('os').release().split('.')[0], 10);
  return platform === 'darwin' && release >= 22;
}
