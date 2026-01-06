import { STT, STTConfig } from '../STT';
import { AudioChunk, TranscriptResult, SAMPLE_RATE } from '../types';
import OpenAI from 'openai';

export class WhisperSTT extends STT {
  readonly provider = 'whisper' as const;
  private openai: OpenAI;
  private buffer: Buffer[] = [];
  private connected = false;
  private interval: NodeJS.Timeout | null = null;

  constructor(private config: STTConfig) {
    super();
    this.openai = new OpenAI({ apiKey: config.apiKey });
  }

  async connect(): Promise<void> {
    this.connected = true;
    this.interval = setInterval(() => this.processBuffer(), 500);
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    await this.processBuffer();
    this.buffer = [];
  }

  send(chunk: AudioChunk): void {
    if (this.connected && chunk.isSpeech) {
      this.buffer.push(chunk.data);
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  private async processBuffer(): Promise<void> {
    if (this.buffer.length === 0) return;

    const audio = Buffer.concat(this.buffer);
    this.buffer = [];

    try {
      const wav = this.toWav(audio);
      const file = new File([wav], 'audio.wav', { type: 'audio/wav' });

      const transcription = await this.openai.audio.transcriptions.create({
        file,
        model: 'whisper-1',
        language: this.config.language || 'en',
      });

      if (transcription.text.trim()) {
        this.emit('transcript', {
          text: transcription.text,
          isFinal: true,
          confidence: 1.0,
        } as TranscriptResult);
      }
    } catch (e) {
      this.emit('error', e);
    }
  }

  private toWav(pcm: Buffer): Buffer {
    const header = Buffer.alloc(44);

    // RIFF header
    header.write('RIFF', 0);
    header.writeUInt32LE(pcm.length + 36, 4);
    header.write('WAVE', 8);

    // fmt subchunk
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
    header.writeUInt16LE(1, 20);  // AudioFormat (1 = PCM)
    header.writeUInt16LE(1, 22);  // NumChannels
    header.writeUInt32LE(SAMPLE_RATE, 24); // SampleRate
    header.writeUInt32LE(SAMPLE_RATE * 2, 28); // ByteRate
    header.writeUInt16LE(2, 32);  // BlockAlign
    header.writeUInt16LE(16, 34); // BitsPerSample

    // data subchunk
    header.write('data', 36);
    header.writeUInt32LE(pcm.length, 40);

    return Buffer.concat([header, pcm]);
  }
}
