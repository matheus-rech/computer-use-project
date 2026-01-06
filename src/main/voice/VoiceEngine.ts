import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import { LiveSession, createLiveSession } from './LiveSession';
import { VideoCapture, VideoCaptureConfig, VideoFrame } from './VideoCapture';
import {
  LiveProvider,
  LiveSessionConfig,
  LiveSessionState,
  LiveAudioData,
  LiveTranscript,
  AudioVisualizerData,
  SAMPLE_RATE_OUTPUT,
} from './types';

export interface VoiceEngineConfig {
  // WebSocket-first providers
  liveProvider?: LiveProvider;

  // API Keys
  geminiApiKey?: string;
  openaiApiKey?: string;
  elevenlabsApiKey?: string;

  // Voice settings
  voice?: string;
  systemPrompt?: string;
  language?: string;

  // Features
  enableVisualization?: boolean;

  // Video settings
  videoConfig?: Partial<VideoCaptureConfig>;
}

export interface VoiceEngineState {
  mode: 'live' | 'legacy' | 'disconnected';
  provider?: LiveProvider;
  connected: boolean;
  listening: boolean;
  speaking: boolean;
  interrupted: boolean;
  currentTranscript: string;
  visualizer?: AudioVisualizerData;
  videoCapturing: boolean;
}

/**
 * VoiceEngine v2 - WebSocket-First Voice Orchestrator
 *
 * Provides a unified interface for voice interactions with automatic
 * provider selection and fallback support.
 *
 * Priority order:
 * 1. Gemini Live (native audio, lowest latency)
 * 2. OpenAI Realtime (GPT-4o native audio)
 * 3. Legacy STT/TTS pipeline (fallback)
 */
export class VoiceEngine extends EventEmitter {
  private liveSession: LiveSession | null = null;
  private audioPlayer: ChildProcess | null = null;
  private audioQueue: Buffer[] = [];
  private isPlaying = false;
  private videoCapture: VideoCapture | null = null;

  private state: VoiceEngineState = {
    mode: 'disconnected',
    connected: false,
    listening: false,
    speaking: false,
    interrupted: false,
    currentTranscript: '',
    videoCapturing: false,
  };

  constructor(private config: VoiceEngineConfig) {
    super();
  }

  /**
   * Start the voice engine with the best available provider
   */
  async start(): Promise<void> {
    // Determine which provider to use based on available API keys
    const provider = this.selectProvider();

    if (provider) {
      await this.startLiveSession(provider);
    } else {
      throw new Error('No voice provider configured. Add Gemini or OpenAI API key.');
    }
  }

  /**
   * Stop the voice engine and cleanup
   */
  async stop(): Promise<void> {
    // Stop video capture first
    this.stopVideoCapture();

    if (this.liveSession) {
      await this.liveSession.disconnect();
      this.liveSession = null;
    }

    this.stopAudioPlayback();
    this.updateState({
      mode: 'disconnected',
      connected: false,
      listening: false,
      speaking: false,
      videoCapturing: false,
    });
  }

  /**
   * Start listening for voice input
   */
  async startListening(): Promise<void> {
    if (this.liveSession) {
      await this.liveSession.startListening();
      this.updateState({ listening: true });
    }
  }

  /**
   * Stop listening for voice input
   */
  stopListening(): void {
    if (this.liveSession) {
      this.liveSession.stopListening();
      this.updateState({ listening: false });
    }
  }

  /**
   * Send audio data to the voice engine
   */
  sendAudio(pcmData: Float32Array): void {
    if (this.liveSession && this.state.listening) {
      this.liveSession.sendAudio(pcmData);
    }
  }

  /**
   * Send text message (for hybrid text/voice interactions)
   */
  async sendText(text: string): Promise<void> {
    if (this.liveSession) {
      await this.liveSession.sendText(text);
    }
  }

  /**
   * Interrupt current AI response
   */
  interrupt(): void {
    if (this.liveSession) {
      this.liveSession.interrupt();
    }
    this.stopAudioPlayback();
    this.updateState({ speaking: false, interrupted: true });

    setTimeout(() => {
      this.updateState({ interrupted: false });
    }, 100);
  }

  // ============================================
  // Video Methods
  // ============================================

  /**
   * Start continuous video capture and streaming to the voice session.
   * Frames are automatically sent to the active live session.
   *
   * @param source 'screen' | 'webcam' | 'window'
   * @param windowId Optional window ID for window capture
   */
  async startVideoCapture(
    source: 'screen' | 'webcam' | 'window' = 'screen',
    windowId?: string
  ): Promise<void> {
    if (!this.state.connected) {
      throw new Error('Voice session must be connected before starting video');
    }

    // Stop existing capture if any
    this.stopVideoCapture();

    // Create video capture with config
    this.videoCapture = new VideoCapture({
      source,
      windowId,
      frameRate: this.config.videoConfig?.frameRate ?? 1, // Default 1fps for AI efficiency
      quality: this.config.videoConfig?.quality ?? 70,
      maxWidth: this.config.videoConfig?.maxWidth ?? 1280,
      maxHeight: this.config.videoConfig?.maxHeight ?? 720,
    });

    // Wire up frame events to live session
    this.videoCapture.on('frame', (frame: VideoFrame) => {
      this.handleVideoFrame(frame);
    });

    this.videoCapture.on('error', (error: Error) => {
      this.emit('video-error', error);
    });

    await this.videoCapture.start();
    this.updateState({ videoCapturing: true });
    this.emit('video-started');
  }

  /**
   * Stop continuous video capture
   */
  stopVideoCapture(): void {
    if (this.videoCapture) {
      this.videoCapture.stop();
      this.videoCapture.removeAllListeners();
      this.videoCapture = null;
    }
    this.updateState({ videoCapturing: false });
    this.emit('video-stopped');
  }

  /**
   * Capture and send a single video frame (screenshot)
   */
  async sendVideoFrame(): Promise<void> {
    if (!this.liveSession) {
      throw new Error('No active voice session');
    }

    // Create temporary capture for single frame
    const capture = new VideoCapture({
      source: 'screen',
      maxWidth: this.config.videoConfig?.maxWidth ?? 1280,
      maxHeight: this.config.videoConfig?.maxHeight ?? 720,
    });

    const frame = await capture.captureFrame();
    if (frame) {
      await this.handleVideoFrame(frame);
    }
  }

  /**
   * Send an image with a specific question about it
   *
   * @param imageData Base64 encoded image or file path
   * @param prompt Question about the image
   * @param mimeType Image MIME type
   */
  async sendImageWithPrompt(
    imageData: string,
    prompt: string,
    mimeType: string = 'image/jpeg'
  ): Promise<void> {
    if (!this.liveSession) {
      throw new Error('No active voice session');
    }

    // Check if session supports sendImageWithPrompt
    if ('sendImageWithPrompt' in this.liveSession) {
      await (this.liveSession as any).sendImageWithPrompt(imageData, prompt, mimeType);
    } else {
      throw new Error(`Provider ${this.state.provider} does not support image prompts`);
    }
  }

  /**
   * Get available video sources (screens and windows)
   */
  static async getVideoSources(): Promise<{
    screens: Array<{ id: string; name: string; thumbnail: string }>;
    windows: Array<{ id: string; name: string; thumbnail: string }>;
  }> {
    const [screens, windows] = await Promise.all([
      VideoCapture.getSources('screen'),
      VideoCapture.getSources('window'),
    ]);
    return { screens, windows };
  }

  /**
   * Check if current provider supports native video
   */
  supportsNativeVideo(): boolean {
    return this.state.provider === 'gemini';
  }

  /**
   * Get current engine state
   */
  getState(): VoiceEngineState {
    return { ...this.state };
  }

  /**
   * Check if engine is active
   */
  isActive(): boolean {
    return this.state.connected;
  }

  // ============================================
  // Private Methods
  // ============================================

  private selectProvider(): LiveProvider | null {
    // Use explicitly configured provider if available
    if (this.config.liveProvider) {
      return this.config.liveProvider;
    }

    // Auto-select based on available API keys (prefer Gemini for native audio)
    if (this.config.geminiApiKey) {
      return 'gemini';
    }

    if (this.config.openaiApiKey) {
      return 'openai-realtime';
    }

    return null;
  }

  private async startLiveSession(provider: LiveProvider): Promise<void> {
    const apiKey = this.getApiKeyForProvider(provider);

    if (!apiKey) {
      throw new Error(`No API key configured for ${provider}`);
    }

    const sessionConfig: LiveSessionConfig = {
      provider,
      apiKey,
      voice: this.config.voice,
      systemPrompt: this.config.systemPrompt,
      language: this.config.language,
    };

    this.liveSession = createLiveSession(sessionConfig);
    this.setupLiveSessionEvents();

    await this.liveSession.connect();

    this.updateState({
      mode: 'live',
      provider,
      connected: true,
    });
  }

  private getApiKeyForProvider(provider: LiveProvider): string | undefined {
    switch (provider) {
      case 'gemini':
        return this.config.geminiApiKey;
      case 'openai-realtime':
        return this.config.openaiApiKey;
      case 'elevenlabs-conversational':
        return this.config.elevenlabsApiKey;
      default:
        return undefined;
    }
  }

  private setupLiveSessionEvents(): void {
    if (!this.liveSession) return;

    this.liveSession.on('state-change', (sessionState: LiveSessionState) => {
      this.updateState({
        connected: sessionState.connected,
        listening: sessionState.listening,
        speaking: sessionState.speaking,
        interrupted: sessionState.interrupted,
      });
    });

    this.liveSession.on('audio', (audio: LiveAudioData) => {
      this.playAudio(audio);
    });

    this.liveSession.on('transcript', (transcript: LiveTranscript) => {
      this.updateState({ currentTranscript: transcript.text });
      this.emit('transcript', transcript);
    });

    this.liveSession.on('interrupted', () => {
      this.stopAudioPlayback();
      this.emit('interrupted');
    });

    this.liveSession.on('turn-complete', () => {
      this.updateState({ speaking: false, currentTranscript: '' });
      this.emit('turn-complete');
    });

    this.liveSession.on('error', (error: Error) => {
      this.emit('error', error);
    });
  }

  private playAudio(audio: LiveAudioData): void {
    // Decode base64 PCM to buffer
    const pcmBuffer = Buffer.from(audio.data, 'base64');
    this.audioQueue.push(pcmBuffer);

    if (!this.isPlaying) {
      this.playNextChunk();
    }
  }

  private playNextChunk(): void {
    if (this.audioQueue.length === 0) {
      this.isPlaying = false;
      return;
    }

    this.isPlaying = true;
    const chunk = this.audioQueue.shift()!;

    // Use ffplay for cross-platform audio playback
    this.audioPlayer = spawn('ffplay', [
      '-nodisp',
      '-autoexit',
      '-f', 's16le',
      '-ar', String(SAMPLE_RATE_OUTPUT),
      '-ac', '1',
      '-i', 'pipe:0',
    ], {
      stdio: ['pipe', 'ignore', 'ignore'],
    });

    this.audioPlayer.stdin?.write(chunk);
    this.audioPlayer.stdin?.end();

    this.audioPlayer.on('close', () => {
      this.audioPlayer = null;
      this.playNextChunk();
    });
  }

  private stopAudioPlayback(): void {
    this.audioQueue = [];
    if (this.audioPlayer) {
      this.audioPlayer.kill();
      this.audioPlayer = null;
    }
    this.isPlaying = false;
  }

  /**
   * Handle incoming video frame from VideoCapture
   */
  private async handleVideoFrame(frame: VideoFrame): Promise<void> {
    if (!this.liveSession) return;

    // Route to appropriate session method based on provider
    if ('sendVideoFrame' in this.liveSession) {
      // Gemini or OpenAI with video support
      try {
        await (this.liveSession as any).sendVideoFrame(frame.data, frame.mimeType);
        this.emit('video-frame-sent', {
          width: frame.width,
          height: frame.height,
          timestamp: frame.timestamp,
        });
      } catch (error) {
        // Don't throw - just emit error for background frames
        this.emit('video-error', error);
      }
    }
  }

  private updateState(partial: Partial<VoiceEngineState>): void {
    this.state = { ...this.state, ...partial };
    this.emit('state-change', this.getState());
  }
}
