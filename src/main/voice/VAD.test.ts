import { describe, it, expect, vi } from 'vitest';
import { VAD } from './VAD';

describe('VAD', () => {
  it('should detect speech from high-amplitude audio', () => {
    const vad = new VAD();
    const speechBuffer = Buffer.alloc(1600);
    for (let i = 0; i < speechBuffer.length; i += 2) {
      speechBuffer.writeInt16LE(20000, i);
    }
    const result = vad.process({ data: speechBuffer, timestamp: 0, isSpeech: false });
    expect(result.isSpeech).toBe(true);
  });

  it('should detect silence from low-amplitude audio', () => {
    const vad = new VAD();
    const silenceBuffer = Buffer.alloc(1600);
    silenceBuffer.fill(0);
    const result = vad.process({ data: silenceBuffer, timestamp: 0, isSpeech: false });
    expect(result.isSpeech).toBe(false);
  });

  it('should emit speech-start event', () => {
    const vad = new VAD();
    const onStart = vi.fn();
    vad.on('speech-start', onStart);
    const speechBuffer = Buffer.alloc(1600);
    for (let i = 0; i < speechBuffer.length; i += 2) {
      speechBuffer.writeInt16LE(20000, i);
    }
    vad.process({ data: speechBuffer, timestamp: 0, isSpeech: false });
    expect(onStart).toHaveBeenCalled();
  });
});
