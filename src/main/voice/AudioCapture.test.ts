import type { EventEmitter } from 'events';
import type { PassThrough } from 'stream';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AudioCapture } from './AudioCapture';

interface FakeRecorder extends EventEmitter {
  stopCalls: number;
  output: PassThrough;
}

const recorderState = vi.hoisted(() => ({ started: [] as FakeRecorder[] }));

// Recording spawns sox or arecord, which no CI runner has, so the recorder stands in for the binary and the test stays about the capture state machine.
vi.mock('node-audiorecorder', async () => {
  const { EventEmitter: NodeEventEmitter } = await import('events');
  const { PassThrough: NodePassThrough } = await import('stream');

  class FakeAudioRecorder extends NodeEventEmitter {
    stopCalls = 0;
    output = new NodePassThrough();

    constructor() {
      super();
      recorderState.started.push(this as unknown as FakeRecorder);
    }

    start(): this {
      return this;
    }

    stop(): this {
      this.stopCalls += 1;
      return this;
    }

    stream(): PassThrough {
      return this.output;
    }
  }

  return { default: FakeAudioRecorder };
});

describe('AudioCapture', () => {
  let capture: AudioCapture;

  beforeEach(() => {
    recorderState.started = [];
    capture = new AudioCapture();
  });

  it('should create with isRecording false', () => {
    expect(capture.isRecording).toBe(false);
  });

  it('should toggle recording state', async () => {
    await capture.start();
    expect(capture.isRecording).toBe(true);
    await capture.stop();
    expect(capture.isRecording).toBe(false);
  });

  it('should stop the recorder process it started', async () => {
    await capture.start();
    await capture.stop();

    expect(recorderState.started.length).toBe(1);
    expect(recorderState.started[0]?.stopCalls).toBe(1);
  });

  it('should emit a recorder failure instead of letting it go unhandled', async () => {
    const failures: Error[] = [];
    capture.on('error', (error: Error) => failures.push(error));

    await capture.start();
    const spawnFailure = new Error('spawn sox ENOENT');
    recorderState.started[0]?.emit('error', spawnFailure);

    expect(failures).toEqual([spawnFailure]);
    expect(capture.isRecording).toBe(false);
  });

  it('should emit each audio chunk the recorder streams', async () => {
    const chunks: Buffer[] = [];
    capture.on('data', (audio: { data: Buffer }) => chunks.push(audio.data));

    await capture.start();
    const recorded = Buffer.from([1, 2, 3, 4]);
    recorderState.started[0]?.output.write(recorded);
    await new Promise((resolve) => setImmediate(resolve));

    expect(chunks).toEqual([recorded]);
  });
});
