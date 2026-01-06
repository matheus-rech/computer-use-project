import { desktopCapturer, screen, DesktopCapturerSource } from 'electron';
import { EventEmitter } from 'events';

export interface VideoCaptureConfig {
  source: 'screen' | 'webcam' | 'window';
  windowId?: string;
  frameRate?: number;  // fps (1-30, default 2 for efficiency)
  quality?: number;    // JPEG quality 0-100 (default 70)
  maxWidth?: number;   // Max frame width (default 1280)
  maxHeight?: number;  // Max frame height (default 720)
}

export interface VideoFrame {
  data: string;        // base64 encoded JPEG
  mimeType: string;    // 'image/jpeg'
  width: number;
  height: number;
  timestamp: number;
}

/**
 * VideoCapture - Captures frames from screen, window, or webcam
 *
 * Designed for low-bandwidth AI vision:
 * - Low frame rate (1-5 fps) to minimize API costs
 * - JPEG compression for smaller payloads
 * - Automatic scaling to reasonable dimensions
 */
export class VideoCapture extends EventEmitter {
  private capturing = false;
  private intervalId: NodeJS.Timeout | null = null;

  constructor(private config: VideoCaptureConfig) {
    super();
    this.config = {
      frameRate: 2,
      quality: 70,
      maxWidth: 1280,
      maxHeight: 720,
      ...config,
    };
  }

  async start(): Promise<void> {
    if (this.capturing) return;

    if (this.config.source === 'screen' || this.config.source === 'window') {
      await this.startScreenCapture();
    } else if (this.config.source === 'webcam') {
      await this.startWebcamCapture();
    }

    this.capturing = true;
    this.emit('started');
  }

  stop(): void {
    if (!this.capturing) return;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.capturing = false;
    this.emit('stopped');
  }

  isCapturing(): boolean {
    return this.capturing;
  }

  /**
   * Capture a single frame on demand (for screenshot/paste scenarios)
   */
  async captureFrame(): Promise<VideoFrame | null> {
    if (this.config.source === 'screen' || this.config.source === 'window') {
      return this.captureScreenFrame();
    }
    return null;
  }

  // ============================================
  // Screen/Window Capture
  // ============================================

  private async startScreenCapture(): Promise<void> {
    const sources = await desktopCapturer.getSources({
      types: this.config.source === 'window' ? ['window'] : ['screen'],
      thumbnailSize: {
        width: this.config.maxWidth!,
        height: this.config.maxHeight!
      },
    });

    if (sources.length === 0) {
      throw new Error('No screen sources available');
    }

    // Select source (first screen, or specific window)
    const source = this.config.windowId
      ? sources.find((s: DesktopCapturerSource) => s.id === this.config.windowId) || sources[0]
      : sources[0];

    // Start frame capture interval
    const intervalMs = 1000 / this.config.frameRate!;
    this.intervalId = setInterval(async () => {
      const frame = await this.captureScreenFrame();
      if (frame) {
        this.emit('frame', frame);
      }
    }, intervalMs);
  }

  private async captureScreenFrame(): Promise<VideoFrame | null> {
    try {
      const sources = await desktopCapturer.getSources({
        types: this.config.source === 'window' ? ['window'] : ['screen'],
        thumbnailSize: {
          width: this.config.maxWidth!,
          height: this.config.maxHeight!
        },
      });

      if (sources.length === 0) return null;

      const source = this.config.windowId
        ? sources.find((s: DesktopCapturerSource) => s.id === this.config.windowId) || sources[0]
        : sources[0];

      // Get thumbnail as native image, convert to JPEG
      const thumbnail = source.thumbnail;
      const size = thumbnail.getSize();

      // Convert to JPEG data URL
      const jpegDataUrl = thumbnail.toDataURL({
        scaleFactor: 1.0,
      });

      // Extract base64 data (remove 'data:image/png;base64,' prefix)
      // Note: Electron returns PNG, we'll use it directly
      const base64Data = jpegDataUrl.replace(/^data:image\/\w+;base64,/, '');

      return {
        data: base64Data,
        mimeType: 'image/png',
        width: size.width,
        height: size.height,
        timestamp: Date.now(),
      };
    } catch (error) {
      this.emit('error', error);
      return null;
    }
  }

  // ============================================
  // Webcam Capture (placeholder - needs renderer)
  // ============================================

  private async startWebcamCapture(): Promise<void> {
    // Webcam capture requires renderer process with getUserMedia
    // This would be coordinated via IPC
    throw new Error('Webcam capture must be initiated from renderer process');
  }

  // ============================================
  // Utility Methods
  // ============================================

  /**
   * Get available screen/window sources
   */
  static async getSources(type: 'screen' | 'window'): Promise<Array<{
    id: string;
    name: string;
    thumbnail: string;
  }>> {
    const sources = await desktopCapturer.getSources({
      types: [type],
      thumbnailSize: { width: 320, height: 180 },
    });

    return sources.map((source: DesktopCapturerSource) => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL(),
    }));
  }
}
