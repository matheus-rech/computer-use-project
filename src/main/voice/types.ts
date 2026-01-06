// Audio processing constants
export const SAMPLE_RATE_INPUT = 16000;  // Standard for speech recognition
export const SAMPLE_RATE_OUTPUT = 24000; // Higher quality for playback
export const SAMPLE_RATE = SAMPLE_RATE_INPUT; // Alias for legacy compatibility
export const CHANNELS = 1;
export const VAD_THRESHOLD = 0.5;
export const MAX_SILENCE_MS = 1500;

// Legacy types for fallback STT/TTS
export interface AudioChunk {
  data: Buffer;
  timestamp: number;
  isSpeech: boolean;
}

export interface TranscriptResult {
  text: string;
  isFinal: boolean;
  confidence: number;
}

export interface TTSRequest {
  text: string;
  voice?: string;
  speed?: number;
}

export type STTProvider = 'whisper' | 'deepgram';
export type TTSProvider = 'elevenlabs' | 'openai';

// ============================================
// NEW: WebSocket-First Live Session Types
// ============================================

export type LiveProvider = 'gemini' | 'openai-realtime' | 'elevenlabs-conversational';

export interface LiveSessionConfig {
  provider: LiveProvider;
  apiKey: string;
  model?: string;
  voice?: string;
  systemPrompt?: string;
  language?: string;
}

export interface LiveSessionState {
  connected: boolean;
  listening: boolean;
  speaking: boolean;
  interrupted: boolean;
  turnId?: string;
}

export interface LiveAudioData {
  data: string;  // Base64 encoded PCM
  mimeType: string;
  sampleRate: number;
}

export interface LiveTranscript {
  text: string;
  isFinal: boolean;
  role: 'user' | 'assistant';
}

export interface LiveSessionEvents {
  'state-change': (state: LiveSessionState) => void;
  'audio': (audio: LiveAudioData) => void;
  'transcript': (transcript: LiveTranscript) => void;
  'interrupted': () => void;
  'error': (error: Error) => void;
  'turn-complete': () => void;
}

// Audio visualization data
export interface AudioVisualizerData {
  inputLevel: number;   // 0-1 normalized input amplitude
  outputLevel: number;  // 0-1 normalized output amplitude
  frequencies: Uint8Array;
}
