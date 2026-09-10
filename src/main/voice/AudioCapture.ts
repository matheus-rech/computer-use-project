import { EventEmitter } from 'events';
import AudioRecorder from 'node-audiorecorder';
import { SAMPLE_RATE, CHANNELS } from './types';

export class AudioCapture extends EventEmitter {
  private recording = false;
  private recorder: AudioRecorder | null = null;
  private stream: NodeJS.ReadableStream | null = null;

  get isRecording(): boolean {
    return this.recording;
  }

  async start(): Promise<void> {
    if (this.recording) return;

    const recorder = new AudioRecorder({
      program: process.platform === 'darwin' ? 'sox' : 'arecord',
      sampleRate: SAMPLE_RATE,
      channels: CHANNELS,
      silence: 0,
    });

    // Recording runs in a separate binary that may not be installed at all, and the recorder re-emits that spawn failure; left unlistened it takes the whole process down.
    recorder.on('error', (error: Error) => {
      void this.stop();
      this.emit('error', error);
    });

    this.recorder = recorder;
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
    this.recorder?.stop();
    this.recorder = null;
  }
}
