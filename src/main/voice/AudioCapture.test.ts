import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AudioCapture } from './AudioCapture';

describe('AudioCapture', () => {
  let capture: AudioCapture;

  beforeEach(() => {
    capture = new AudioCapture();
  });

  afterEach(async () => {
    await capture.stop();
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
});
