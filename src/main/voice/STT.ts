import { EventEmitter } from 'events';
import { STTProvider, TranscriptResult, AudioChunk } from './types';

export interface STTConfig {
  apiKey: string;
  language?: string;
}

export abstract class STT extends EventEmitter {
  abstract readonly provider: STTProvider;
  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract send(chunk: AudioChunk): void;
  abstract isConnected(): boolean;
}

export function createSTT(provider: STTProvider, config: STTConfig): STT {
  if (provider === 'whisper') {
    const { WhisperSTT } = require('./providers/WhisperSTT');
    return new WhisperSTT(config);
  }
  if (provider === 'deepgram') {
    const { DeepgramSTT } = require('./providers/DeepgramSTT');
    return new DeepgramSTT(config);
  }
  throw new Error(`Unknown STT provider: ${provider}`);
}
