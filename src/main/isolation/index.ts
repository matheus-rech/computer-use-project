// ============================================================================
// Isolation Module - Unified Docker and VM Backend Support
// ============================================================================

export {
  // Types
  type IsolationBackend,
  type IsolationProfile,
  type ExecuteResult,
  type ExecuteOptions,
  type FileInfo,
  type IsolationStatus,
  type IIsolationManager,

  // Base class
  BaseIsolationManager,

  // Predefined profiles
  ISOLATION_PROFILES,

  // Factory functions
  createIsolationManager,
  detectBestBackend,
  isVMAvailable,
} from './IsolationManager';

export { DockerIsolationManager } from './DockerIsolationManager';
export { VMIsolationManager } from './VMIsolationManager';
