// node-audiorecorder ships no types, and the parts of it the capture path uses are small enough to state here.
declare module 'node-audiorecorder' {
  import { EventEmitter } from 'events';

  interface AudioRecorderOptions {
    program?: string;
    device?: string | null;
    bits?: number;
    channels?: number;
    encoding?: string;
    format?: string;
    rate?: number;
    sampleRate?: number;
    type?: string;
    silence?: number;
    thresholdStart?: number;
    thresholdStop?: number;
    keepSilence?: boolean;
  }

  class AudioRecorder extends EventEmitter {
    constructor(options?: AudioRecorderOptions, logger?: unknown);
    start(): this;
    stop(): this;
    pause(): this;
    resume(): this;
    stream(): NodeJS.ReadableStream | null;
  }

  export = AudioRecorder;
}
