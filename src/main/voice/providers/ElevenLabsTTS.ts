import { TTS, TTSConfig } from '../TTS';
import { TTSRequest } from '../types';
import axios from 'axios';

const DEFAULT_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL'; // Sarah - conversational voice

export class ElevenLabsTTS extends TTS {
  readonly provider = 'elevenlabs' as const;
  private abort: AbortController | null = null;

  constructor(private config: TTSConfig) {
    super();
  }

  async synthesize(request: TTSRequest): Promise<Buffer> {
    const voiceId = request.voice || this.config.voice || DEFAULT_VOICE_ID;

    this.emit('speaking', { text: request.text });

    const res = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        text: request.text,
        model_id: 'eleven_turbo_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      },
      {
        headers: {
          'xi-api-key': this.config.apiKey,
          'Content-Type': 'application/json',
        },
        responseType: 'arraybuffer',
      }
    );

    this.emit('done');
    return Buffer.from(res.data);
  }

  async streamSynthesize(
    request: TTSRequest,
    onChunk: (chunk: Buffer) => void
  ): Promise<void> {
    const voiceId = request.voice || this.config.voice || DEFAULT_VOICE_ID;
    this.abort = new AbortController();

    this.emit('speaking', { text: request.text });

    const res = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
      {
        text: request.text,
        model_id: 'eleven_turbo_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      },
      {
        headers: {
          'xi-api-key': this.config.apiKey,
          'Content-Type': 'application/json',
        },
        responseType: 'stream',
        signal: this.abort.signal,
      }
    );

    return new Promise((resolve, reject) => {
      res.data.on('data', (chunk: Buffer) => onChunk(chunk));
      res.data.on('end', () => {
        this.emit('done');
        resolve();
      });
      res.data.on('error', (err: Error) => reject(err));
    });
  }

  stop(): void {
    this.abort?.abort();
    this.abort = null;
  }
}
