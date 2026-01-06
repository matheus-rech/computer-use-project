import { EventEmitter } from 'events';
import {
  LiveProvider,
  LiveSessionConfig,
  LiveSessionState,
  LiveAudioData,
} from './types';

/**
 * Abstract base class for WebSocket-based live voice sessions.
 *
 * Implementations handle the full audio loop:
 * - Receiving user audio input
 * - Streaming to AI model via WebSocket
 * - Receiving and playing AI audio response
 * - Handling interruptions natively
 */
export abstract class LiveSession extends EventEmitter {
  abstract readonly provider: LiveProvider;

  protected state: LiveSessionState = {
    connected: false,
    listening: false,
    speaking: false,
    interrupted: false,
  };

  constructor(protected config: LiveSessionConfig) {
    super();
  }

  /**
   * Connect to the live session WebSocket
   */
  abstract connect(): Promise<void>;

  /**
   * Disconnect and cleanup
   */
  abstract disconnect(): Promise<void>;

  /**
   * Start listening for user audio input
   */
  abstract startListening(): Promise<void>;

  /**
   * Stop listening for user audio input
   */
  abstract stopListening(): void;

  /**
   * Send raw PCM audio data to the session
   * @param pcmData Float32Array of audio samples (-1 to 1)
   */
  abstract sendAudio(pcmData: Float32Array): void;

  /**
   * Send a text message (for text-based interactions)
   */
  abstract sendText(text: string): Promise<void>;

  /**
   * Interrupt the current AI response
   */
  abstract interrupt(): void;

  /**
   * Get the current session state
   */
  getState(): LiveSessionState {
    return { ...this.state };
  }

  /**
   * Check if the session is connected
   */
  isConnected(): boolean {
    return this.state.connected;
  }

  /**
   * Update state and emit change event
   */
  protected updateState(partial: Partial<LiveSessionState>): void {
    this.state = { ...this.state, ...partial };
    this.emit('state-change', this.getState());
  }

  /**
   * Emit audio data for playback
   */
  protected emitAudio(audio: LiveAudioData): void {
    this.emit('audio', audio);
  }

  /**
   * Emit error
   */
  protected emitError(error: Error): void {
    this.emit('error', error);
  }
}

/**
 * Factory function to create a LiveSession for the specified provider
 */
export function createLiveSession(config: LiveSessionConfig): LiveSession {
  switch (config.provider) {
    case 'gemini':
      const { GeminiLiveSession } = require('./providers/GeminiLiveSession');
      return new GeminiLiveSession(config);

    case 'openai-realtime':
      const { OpenAIRealtimeSession } = require('./providers/OpenAIRealtimeSession');
      return new OpenAIRealtimeSession(config);

    case 'elevenlabs-conversational':
      const { ElevenLabsConversationalSession } = require('./providers/ElevenLabsConversationalSession');
      return new ElevenLabsConversationalSession(config);

    default:
      throw new Error(`Unknown live provider: ${config.provider}`);
  }
}
