import { EventEmitter } from 'events';
import { TTSProvider, TTSRequest } from './types';

export interface TTSConfig {
  apiKey: string;
  voice?: string;
  speed?: number;
}

export abstract class TTS extends EventEmitter {
  abstract readonly provider: TTSProvider;
  abstract synthesize(request: TTSRequest): Promise<Buffer>;
  abstract streamSynthesize(request: TTSRequest, onChunk: (chunk: Buffer) => void): Promise<void>;
  abstract stop(): void;
}

export function createTTS(provider: TTSProvider, config: TTSConfig): TTS {
  if (provider === 'elevenlabs') {
    const { ElevenLabsTTS } = require('./providers/ElevenLabsTTS');
    return new ElevenLabsTTS(config);
  }
  if (provider === 'openai') {
    const { OpenAITTS } = require('./providers/OpenAITTS');
    return new OpenAITTS(config);
  }
  throw new Error(`Unknown TTS provider: ${provider}`);
}
