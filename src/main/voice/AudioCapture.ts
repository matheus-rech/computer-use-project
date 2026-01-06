import { EventEmitter } from 'events';
import { SAMPLE_RATE, CHANNELS } from './types';

export class AudioCapture extends EventEmitter {
  private recording = false;
  private stream: NodeJS.ReadableStream | null = null;

  get isRecording(): boolean {
    return this.recording;
  }

  async start(): Promise<void> {
    if (this.recording) return;

    const AudioRecorder = require('node-audiorecorder');
    const recorder = new AudioRecorder({
      program: process.platform === 'darwin' ? 'sox' : 'arecord',
      sampleRate: SAMPLE_RATE,
      channels: CHANNELS,
      silence: 0,
    });

    this.stream = recorder.start().stream();
    this.recording = true;

    if (this.stream) {
      this.stream.on('data', (data: Buffer) => {
        this.emit('data', { data, timestamp: Date.now(), isSpeech: false });
      });
    }
  }

  async stop(): Promise<void> {
    if (!this.recording) return;
    this.recording = false;
    this.stream?.removeAllListeners();
    this.stream = null;
  }
}
