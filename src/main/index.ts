import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import Store from 'electron-store';
import { nanoid } from 'nanoid';

// Unified architecture imports
import {
  createIsolationManager,
  detectBestBackend,
  isVMAvailable,
  IIsolationManager,
  IsolationProfile,
  ISOLATION_PROFILES,
} from './isolation';
import { AgentOrchestrator } from './agents';
import { FileTransferManager } from './fileTransfer';
import { GoogleDriveManager } from './googleDrive';
import { VoiceEngine } from './voice';
import type { Session, SessionStatus } from '../shared/types';

// ============================================================================
// Application State
// ============================================================================

const store = new Store();

let mainWindow: BrowserWindow | null = null;
let isolationManager: IIsolationManager | null = null;
let agentOrchestrator: AgentOrchestrator | null = null;
let fileTransferManager: FileTransferManager | null = null;
let googleDriveManager: GoogleDriveManager | null = null;
let voiceEngine: VoiceEngine | null = null;
let currentSession: Session | null = null;

// ============================================================================
// Single Instance Lock
// ============================================================================

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(createWindow);
}

// ============================================================================
// Window Creation
// ============================================================================

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'Claude Workspace',
    backgroundColor: '#1a1a1a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
  });

  // Load the UI
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Initialize file transfer manager
  fileTransferManager = new FileTransferManager();

  // Initialize Google Drive if credentials exist
  const driveClientId = store.get('googleDriveClientId') as string | undefined;
  const driveClientSecret = store.get('googleDriveClientSecret') as string | undefined;
  if (driveClientId && driveClientSecret) {
    googleDriveManager = new GoogleDriveManager({
      credentials: { clientId: driveClientId, clientSecret: driveClientSecret },
    });
    googleDriveManager.initialize().catch((err: Error) => {
      console.error('Failed to initialize Google Drive:', err);
    });
  }
}

// ============================================================================
// Session Management
// ============================================================================

ipcMain.handle('session:start', async (_event: Electron.IpcMainInvokeEvent, options: {
  profile?: string;
  backend?: 'docker' | 'vm';
  userPreferences?: Record<string, unknown>;
}) => {
  try {
    // Generate session ID
    const sessionId = nanoid();

    // Determine backend (auto-detect or use specified)
    const backend = options.backend || detectBestBackend();

    // Get isolation profile
    const profileName = options.profile || 'balanced';
    const profile: IsolationProfile = ISOLATION_PROFILES[profileName] || ISOLATION_PROFILES.balanced;

    // Create isolation manager for the chosen backend
    isolationManager = await createIsolationManager(backend);

    // Start the isolation environment
    await isolationManager.start(sessionId, profile);

    // Get API keys
    const apiKeys: Record<string, string> = {
      claude: store.get('anthropicApiKey') as string || '',
      gemini: store.get('geminiApiKey') as string || '',
      openai: store.get('openaiApiKey') as string || '',
      elevenlabs: store.get('elevenlabsApiKey') as string || '',
    };

    if (!apiKeys.claude) {
      throw new Error('Anthropic API key not configured');
    }

    // Create session object
    currentSession = {
      id: sessionId,
      createdAt: new Date(),
      profile: {
        name: profile.name,
        network: profile.network.enabled ? 'full' : 'none',
        clipboard: profile.clipboard,
        gpu: profile.gpu,
        resources: profile.resources,
      },
      status: 'running' as SessionStatus,
      ...(backend === 'docker' ? { containerId: sessionId } : { vmId: sessionId }),
    };

    // Initialize AgentOrchestrator
    const mcpConfigPath = path.join(app.getAppPath(), 'config', 'mcp-servers.json');
    const dataDir = path.join(app.getPath('userData'), 'workspace-data');

    agentOrchestrator = new AgentOrchestrator({
      isolationManager,
      session: currentSession,
      apiKeys,
      dataDir,
      mcpConfigPath,
    });

    // Setup event listeners
    setupOrchestratorEvents();

    console.log(`[Session] Started ${backend} session: ${sessionId}`);

    return {
      sessionId,
      backend,
      profile: profileName,
      status: 'ready',
      vmAvailable: isVMAvailable(),
    };
  } catch (error) {
    console.error('Failed to start session:', error);
    throw error;
  }
});

ipcMain.handle('session:stop', async (_event: Electron.IpcMainInvokeEvent, options: {
  saveFiles?: boolean;
  files?: string[];
  destination?: string;
}) => {
  try {
    if (!isolationManager || !currentSession) {
      throw new Error('No active session');
    }

    currentSession.status = 'stopping';

    // Save files if requested
    if (options.saveFiles && fileTransferManager && options.files) {
      const destination = options.destination || store.get('defaultDestination') as string;
      for (const file of options.files) {
        await isolationManager.copyFromEnvironment(file, path.join(destination, path.basename(file)));
      }
    }

    // Shutdown orchestrator
    if (agentOrchestrator) {
      await agentOrchestrator.shutdown();
      agentOrchestrator = null;
    }

    // Stop isolation environment
    await isolationManager.stop();
    isolationManager = null;

    currentSession.status = 'stopped';
    const sessionId = currentSession.id;
    currentSession = null;

    console.log(`[Session] Stopped: ${sessionId}`);

    return { status: 'stopped' };
  } catch (error) {
    console.error('Failed to stop session:', error);
    throw error;
  }
});

ipcMain.handle('session:status', async () => {
  if (!currentSession || !isolationManager) {
    return { active: false };
  }

  const status = await isolationManager.getStatus();

  return {
    active: true,
    sessionId: currentSession.id,
    backend: status.backend,
    profile: currentSession.profile.name,
    status: currentSession.status,
    resources: {
      cpu: status.cpuUsage,
      memory: status.memoryUsage,
      disk: status.diskUsage,
      uptime: status.uptime,
    },
  };
});

// ============================================================================
// Message Handling (via AgentOrchestrator)
// ============================================================================

ipcMain.handle('claude:message', async (_event: Electron.IpcMainInvokeEvent, message: string, attachments?: string[]) => {
  try {
    if (!agentOrchestrator) {
      throw new Error('No active session');
    }

    const response = await agentOrchestrator.sendMessage(message, attachments);
    return response;
  } catch (error) {
    console.error('Failed to send message:', error);
    throw error;
  }
});

ipcMain.handle('claude:cancel', async () => {
  if (agentOrchestrator) {
    await agentOrchestrator.cancelCurrentTask();
  }
  return { canceled: true };
});

// ============================================================================
// Agent Management
// ============================================================================

ipcMain.handle('agent:list', async () => {
  if (!agentOrchestrator) {
    return { agents: [] };
  }

  const agents = agentOrchestrator.getRegisteredAgents();
  const activeAgent = agentOrchestrator.getActiveAgent();

  return {
    agents,
    activeAgent,
  };
});

ipcMain.handle('agent:select', async (_event: Electron.IpcMainInvokeEvent, role: string) => {
  if (!agentOrchestrator) {
    throw new Error('No active session');
  }

  agentOrchestrator.setActiveAgent(role as any);
  return { activeAgent: role };
});

// ============================================================================
// File Operations
// ============================================================================

ipcMain.handle('files:list', async (_event: Electron.IpcMainInvokeEvent, directory: string) => {
  try {
    if (!isolationManager) {
      throw new Error('No active session');
    }

    const files = await isolationManager.listFiles(directory);
    return files;
  } catch (error) {
    console.error('Failed to list files:', error);
    throw error;
  }
});

ipcMain.handle('files:read', async (_event: Electron.IpcMainInvokeEvent, filePath: string) => {
  try {
    if (!isolationManager) {
      throw new Error('No active session');
    }

    const content = await isolationManager.readFile(filePath);
    return content.toString('utf-8');
  } catch (error) {
    console.error('Failed to read file:', error);
    throw error;
  }
});

ipcMain.handle('files:write', async (_event: Electron.IpcMainInvokeEvent, filePath: string, content: string) => {
  try {
    if (!isolationManager) {
      throw new Error('No active session');
    }

    await isolationManager.writeFile(filePath, Buffer.from(content, 'utf-8'));
    return { success: true };
  } catch (error) {
    console.error('Failed to write file:', error);
    throw error;
  }
});

ipcMain.handle('files:export', async (_event: Electron.IpcMainInvokeEvent, files: string[]) => {
  try {
    if (!isolationManager) {
      throw new Error('No active session');
    }

    // Show save dialog
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select destination folder',
    });

    if (result.canceled || !result.filePaths.length) {
      return { canceled: true };
    }

    const destination = result.filePaths[0];

    // Export each file
    for (const file of files) {
      const destPath = path.join(destination, path.basename(file));
      await isolationManager.copyFromEnvironment(file, destPath);
    }

    return { success: true, destination };
  } catch (error) {
    console.error('Failed to export files:', error);
    throw error;
  }
});

ipcMain.handle('files:import', async (_event: Electron.IpcMainInvokeEvent, envPath: string) => {
  try {
    if (!isolationManager) {
      throw new Error('No active session');
    }

    // Show open dialog
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      title: 'Select files to import',
    });

    if (result.canceled || !result.filePaths.length) {
      return { canceled: true };
    }

    // Import each file
    const imported: string[] = [];
    for (const hostPath of result.filePaths) {
      const destPath = path.join(envPath, path.basename(hostPath));
      await isolationManager.copyToEnvironment(hostPath, destPath);
      imported.push(destPath);
    }

    return { success: true, imported };
  } catch (error) {
    console.error('Failed to import files:', error);
    throw error;
  }
});

// ============================================================================
// Google Drive Integration
// ============================================================================

async function initializeGoogleDrive(): Promise<void> {
  const clientId = store.get('googleDriveClientId') as string;
  const clientSecret = store.get('googleDriveClientSecret') as string;

  if (clientId && clientSecret) {
    googleDriveManager = new GoogleDriveManager({
      credentials: { clientId, clientSecret },
    });
    await googleDriveManager.initialize();
  }
}

ipcMain.handle('gdrive:auth', async (_event: Electron.IpcMainInvokeEvent) => {
  const clientId = store.get('googleDriveClientId') as string;
  const clientSecret = store.get('googleDriveClientSecret') as string;

  if (!clientId || !clientSecret) {
    throw new Error('Google Drive credentials not configured in settings');
  }

  if (!googleDriveManager) {
    googleDriveManager = new GoogleDriveManager({
      credentials: { clientId, clientSecret },
    });
    await googleDriveManager.initialize();
  }

  const authUrl = googleDriveManager.getAuthUrl();
  return { authUrl };
});

ipcMain.handle('gdrive:callback', async (_event: Electron.IpcMainInvokeEvent, code: string) => {
  if (!googleDriveManager) {
    throw new Error('Google Drive not initialized');
  }

  await googleDriveManager.authenticateWithCode(code);
  store.set('googleDriveAuthenticated', true);
  return { success: true };
});

ipcMain.handle('gdrive:list', async (_event: Electron.IpcMainInvokeEvent, folderId?: string) => {
  if (!googleDriveManager || !googleDriveManager.isConnected()) {
    throw new Error('Google Drive not connected');
  }

  return await googleDriveManager.listFiles(folderId);
});

ipcMain.handle('gdrive:upload', async (_event: Electron.IpcMainInvokeEvent, envPath: string, folderId?: string) => {
  if (!googleDriveManager || !isolationManager) {
    throw new Error('Services not available');
  }

  if (!googleDriveManager.isConnected()) {
    throw new Error('Google Drive not authenticated');
  }

  // Copy from environment to temp, then upload
  const tempPath = path.join(app.getPath('temp'), `upload-${path.basename(envPath)}`);
  await isolationManager.copyFromEnvironment(envPath, tempPath);
  const result = await googleDriveManager.uploadFile(tempPath, { folderId });

  return result;
});

// ============================================================================
// Settings
// ============================================================================

ipcMain.handle('settings:get', async () => {
  return {
    apiKey: store.get('anthropicApiKey', ''),
    geminiApiKey: store.get('geminiApiKey', ''),
    openaiApiKey: store.get('openaiApiKey', ''),
    elevenlabsApiKey: store.get('elevenlabsApiKey', ''),
    voiceEnabled: store.get('voiceEnabled', false),
    defaultDestination: store.get('defaultDestination', app.getPath('downloads')),
    preferredBackend: store.get('preferredBackend', 'docker'),
    defaultProfile: store.get('defaultProfile', 'balanced'),
    vmAvailable: isVMAvailable(),
  };
});

ipcMain.handle('settings:set', async (_event: Electron.IpcMainInvokeEvent, settings: Record<string, unknown>) => {
  for (const [key, value] of Object.entries(settings)) {
    store.set(key, value);
  }
  return { success: true };
});

// ============================================================================
// System Info
// ============================================================================

ipcMain.handle('system:info', async () => {
  return {
    platform: process.platform,
    arch: process.arch,
    vmAvailable: isVMAvailable(),
    backends: {
      docker: true, // Always available (requires Docker Desktop)
      vm: isVMAvailable(),
    },
    profiles: Object.keys(ISOLATION_PROFILES),
  };
});

// ============================================================================
// Voice Control
// ============================================================================

ipcMain.handle('voice:start', async () => {
  try {
    // Check if voice is enabled and we have required API keys
    const voiceEnabled = store.get('voiceEnabled', false);
    if (!voiceEnabled) {
      throw new Error('Voice mode is not enabled in settings');
    }

    const geminiApiKey = store.get('geminiApiKey') as string | undefined;
    const openaiApiKey = store.get('openaiApiKey') as string | undefined;
    const elevenlabsApiKey = store.get('elevenlabsApiKey') as string | undefined;

    if (!geminiApiKey && !openaiApiKey) {
      throw new Error('Voice requires Gemini or OpenAI API key');
    }

    // Create voice engine if not exists
    if (!voiceEngine) {
      voiceEngine = new VoiceEngine({
        geminiApiKey,
        openaiApiKey,
        elevenlabsApiKey,
        systemPrompt: 'You are a helpful AI assistant with voice capabilities.',
      });

      // Forward voice events to renderer
      voiceEngine.on('state-change', (state) => {
        mainWindow?.webContents.send('voice:state-change', state);
      });

      voiceEngine.on('transcript', (transcript) => {
        mainWindow?.webContents.send('voice:transcript', transcript);
      });

      voiceEngine.on('turn-complete', () => {
        mainWindow?.webContents.send('voice:turn-complete');
      });

      voiceEngine.on('error', (error) => {
        mainWindow?.webContents.send('voice:error', { message: error.message });
      });
    }

    await voiceEngine.start();

    return {
      success: true,
      state: voiceEngine.getState(),
    };
  } catch (error) {
    console.error('Failed to start voice:', error);
    throw error;
  }
});

ipcMain.handle('voice:stop', async () => {
  try {
    if (voiceEngine) {
      await voiceEngine.stop();
    }
    return { success: true };
  } catch (error) {
    console.error('Failed to stop voice:', error);
    throw error;
  }
});

ipcMain.handle('voice:listen-start', async () => {
  if (!voiceEngine) {
    throw new Error('Voice engine not started');
  }
  await voiceEngine.startListening();
  return { success: true };
});

ipcMain.handle('voice:listen-stop', async () => {
  if (!voiceEngine) {
    throw new Error('Voice engine not started');
  }
  voiceEngine.stopListening();
  return { success: true };
});

ipcMain.handle('voice:send-text', async (_event: Electron.IpcMainInvokeEvent, text: string) => {
  if (!voiceEngine) {
    throw new Error('Voice engine not started');
  }
  await voiceEngine.sendText(text);
  return { success: true };
});

ipcMain.handle('voice:interrupt', async () => {
  if (voiceEngine) {
    voiceEngine.interrupt();
  }
  return { success: true };
});

ipcMain.handle('voice:status', async () => {
  if (!voiceEngine) {
    return { active: false };
  }
  return {
    active: voiceEngine.isActive(),
    state: voiceEngine.getState(),
  };
});

// ============================================================================
// Video Control (extends Voice Engine)
// ============================================================================

ipcMain.handle('video:start', async (_event: Electron.IpcMainInvokeEvent, options: {
  source?: 'screen' | 'webcam' | 'window';
  windowId?: string;
}) => {
  try {
    if (!voiceEngine) {
      throw new Error('Voice engine must be started before video');
    }

    await voiceEngine.startVideoCapture(options.source || 'screen', options.windowId);

    // Forward video events to renderer
    voiceEngine.on('video-frame-sent', (info) => {
      mainWindow?.webContents.send('video:frame-sent', info);
    });

    voiceEngine.on('video-error', (error) => {
      mainWindow?.webContents.send('video:error', { message: (error as Error).message });
    });

    return {
      success: true,
      source: options.source || 'screen',
      supportsNativeVideo: voiceEngine.supportsNativeVideo(),
    };
  } catch (error) {
    console.error('Failed to start video:', error);
    throw error;
  }
});

ipcMain.handle('video:stop', async () => {
  try {
    if (voiceEngine) {
      voiceEngine.stopVideoCapture();
    }
    return { success: true };
  } catch (error) {
    console.error('Failed to stop video:', error);
    throw error;
  }
});

ipcMain.handle('video:screenshot', async () => {
  try {
    if (!voiceEngine) {
      throw new Error('Voice engine not started');
    }

    await voiceEngine.sendVideoFrame();
    return { success: true };
  } catch (error) {
    console.error('Failed to send screenshot:', error);
    throw error;
  }
});

ipcMain.handle('video:send-image', async (_event: Electron.IpcMainInvokeEvent, options: {
  imageData: string;  // Base64 encoded
  prompt: string;
  mimeType?: string;
}) => {
  try {
    if (!voiceEngine) {
      throw new Error('Voice engine not started');
    }

    await voiceEngine.sendImageWithPrompt(
      options.imageData,
      options.prompt,
      options.mimeType || 'image/jpeg'
    );

    return { success: true };
  } catch (error) {
    console.error('Failed to send image:', error);
    throw error;
  }
});

ipcMain.handle('video:sources', async () => {
  try {
    const sources = await VoiceEngine.getVideoSources();
    return sources;
  } catch (error) {
    console.error('Failed to get video sources:', error);
    throw error;
  }
});

ipcMain.handle('video:status', async () => {
  if (!voiceEngine) {
    return { active: false, capturing: false };
  }

  const state = voiceEngine.getState();
  return {
    active: state.connected,
    capturing: state.videoCapturing,
    supportsNativeVideo: voiceEngine.supportsNativeVideo(),
  };
});

// ============================================================================
// Orchestrator Events
// ============================================================================

function setupOrchestratorEvents() {
  if (!agentOrchestrator) return;

  const memoryManager = agentOrchestrator.getMemoryManager();

  // Forward memory events to renderer
  memoryManager.on('deadline-added', (deadline) => {
    mainWindow?.webContents.send('memory:deadline-added', deadline);
  });

  memoryManager.on('journal-entry-added', (entry) => {
    mainWindow?.webContents.send('memory:journal-entry', entry);
  });

  // Forward MCP events
  const mcpManager = agentOrchestrator.getMCPManager();
  if (mcpManager) {
    mcpManager.on('server-status-change', (event) => {
      mainWindow?.webContents.send('mcp:status-change', event);
    });
  }
}

// ============================================================================
// App Lifecycle
// ============================================================================

app.on('window-all-closed', async () => {
  // Cleanup voice engine
  if (voiceEngine) {
    try {
      await voiceEngine.stop();
      voiceEngine = null;
    } catch (error) {
      console.error('Error stopping voice engine:', error);
    }
  }

  // Cleanup any active session
  if (isolationManager) {
    try {
      if (agentOrchestrator) {
        await agentOrchestrator.shutdown();
      }
      await isolationManager.stop();
    } catch (error) {
      console.error('Error cleaning up:', error);
    }
  }

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});
