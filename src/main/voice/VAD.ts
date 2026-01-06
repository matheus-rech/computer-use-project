import { EventEmitter } from 'events';
import { AudioChunk, VAD_THRESHOLD, MAX_SILENCE_MS } from './types';

export class VAD extends EventEmitter {
  private isSpeaking = false;
  private lastSpeechTime = 0;

  process(chunk: AudioChunk): AudioChunk {
    const energy = this.calculateEnergy(chunk.data);
    const isSpeech = energy > VAD_THRESHOLD;
    const now = chunk.timestamp;

    if (isSpeech && !this.isSpeaking) {
      this.isSpeaking = true;
      this.emit('speech-start');
    }

    if (isSpeech) {
      this.lastSpeechTime = now;
    }

    if (this.isSpeaking && !isSpeech && (now - this.lastSpeechTime > MAX_SILENCE_MS)) {
      this.isSpeaking = false;
      this.emit('speech-end');
    }

    return { ...chunk, isSpeech };
  }

  private calculateEnergy(buffer: Buffer): number {
    let sum = 0;
    for (let i = 0; i < buffer.length; i += 2) {
      const sample = buffer.readInt16LE(i);
      sum += sample * sample;
    }
    return Math.sqrt(sum / (buffer.length / 2)) / 32768;
  }

  reset(): void {
    this.isSpeaking = false;
    this.lastSpeechTime = 0;
  }
}
