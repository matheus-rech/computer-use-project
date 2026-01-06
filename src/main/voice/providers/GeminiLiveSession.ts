import { GoogleGenAI, Session, Modality, LiveServerMessage } from '@google/genai';
import { LiveSession } from '../LiveSession';
import {
  LiveSessionConfig,
  LiveAudioData,
  LiveTranscript,
  SAMPLE_RATE_INPUT,
  SAMPLE_RATE_OUTPUT,
} from '../types';

/**
 * Gemini Live Session - Full-duplex audio with native interruption support.
 *
 * Uses Gemini 2.5 Flash with native audio capabilities for ultra-low latency
 * voice interactions. The model processes audio directly without separate
 * STT/TTS steps.
 *
 * Features:
 * - Native audio-to-audio processing (~300ms latency)
 * - Server-side voice activity detection
 * - Automatic interruption handling
 * - Multiple voice options
 */
export class GeminiLiveSession extends LiveSession {
  readonly provider = 'gemini' as const;

  private client: GoogleGenAI;
  private session: Session | null = null;
  private activeSources: Set<string> = new Set();

  constructor(config: LiveSessionConfig) {
    super(config);
    this.client = new GoogleGenAI({ apiKey: config.apiKey });
  }

  async connect(): Promise<void> {
    if (this.state.connected) return;

    const model = this.config.model || 'gemini-2.5-flash-preview-native-audio-dialog';

    try {
      this.session = await this.client.live.connect({
        model,
        callbacks: {
          onopen: () => {
            this.updateState({ connected: true });
            this.emit('connected');
          },

          onmessage: async (message: LiveServerMessage) => {
            await this.handleMessage(message);
          },

          onerror: (e: Event) => {
            this.emitError(new Error('WebSocket error'));
          },

          onclose: (e: { code: number; reason: string }) => {
            this.updateState({
              connected: false,
              listening: false,
              speaking: false,
            });
            this.emit('disconnected', e.reason);
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: this.config.voice || 'Puck', // Puck, Charon, Kore, Fenrir, Aoede
              },
            },
          },
          systemInstruction: this.config.systemPrompt
            ? { parts: [{ text: this.config.systemPrompt }] }
            : undefined,
        },
      });
    } catch (error) {
      this.emitError(error as Error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.session) return;

    this.stopListening();
    this.session.close();
    this.session = null;

    this.updateState({
      connected: false,
      listening: false,
      speaking: false,
    });
  }

  async startListening(): Promise<void> {
    if (!this.state.connected) {
      throw new Error('Not connected to Gemini Live session');
    }
    this.updateState({ listening: true });
  }

  stopListening(): void {
    this.updateState({ listening: false });
  }

  sendAudio(pcmData: Float32Array): void {
    if (!this.session || !this.state.listening) return;

    // Convert Float32 (-1 to 1) to Int16 (-32768 to 32767)
    const int16 = new Int16Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) {
      int16[i] = Math.max(-32768, Math.min(32767, pcmData[i] * 32768));
    }

    // Encode to base64
    const base64 = Buffer.from(int16.buffer).toString('base64');

    // Send to Gemini
    this.session.sendRealtimeInput({
      media: {
        data: base64,
        mimeType: `audio/pcm;rate=${SAMPLE_RATE_INPUT}`,
      },
    });
  }

  async sendText(text: string): Promise<void> {
    if (!this.session) {
      throw new Error('Not connected to Gemini Live session');
    }

    await this.session.sendClientContent({
      turns: [
        {
          role: 'user',
          parts: [{ text }],
        },
      ],
      turnComplete: true,
    });
  }

  /**
   * Send a video frame (image) to the model.
   * Gemini Live supports multimodal input - you can send images
   * alongside audio for "show and tell" interactions.
   *
   * @param imageData Base64 encoded image data
   * @param mimeType Image MIME type (image/jpeg, image/png, image/webp)
   */
  sendVideoFrame(imageData: string, mimeType: string = 'image/jpeg'): void {
    if (!this.session) return;

    this.session.sendRealtimeInput({
      media: {
        data: imageData,
        mimeType,
      },
    });
  }

  /**
   * Send an image with a text prompt (for explicit questions about an image)
   */
  async sendImageWithPrompt(imageData: string, prompt: string, mimeType: string = 'image/jpeg'): Promise<void> {
    if (!this.session) {
      throw new Error('Not connected to Gemini Live session');
    }

    await this.session.sendClientContent({
      turns: [
        {
          role: 'user',
          parts: [
            { inlineData: { data: imageData, mimeType } },
            { text: prompt },
          ],
        },
      ],
      turnComplete: true,
    });
  }

  interrupt(): void {
    // Clear all active audio sources
    this.activeSources.clear();
    this.updateState({ speaking: false, interrupted: true });
    this.emit('interrupted');

    // Reset interrupted flag after a short delay
    setTimeout(() => {
      this.updateState({ interrupted: false });
    }, 100);
  }

  private async handleMessage(message: LiveServerMessage): Promise<void> {
    // Handle audio response
    const audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData;

    if (audio && audio.data) {
      this.updateState({ speaking: true });

      const audioData: LiveAudioData = {
        data: audio.data,
        mimeType: audio.mimeType || `audio/pcm;rate=${SAMPLE_RATE_OUTPUT}`,
        sampleRate: SAMPLE_RATE_OUTPUT,
      };

      this.emitAudio(audioData);
    }

    // Handle transcription (if available)
    const text = message.serverContent?.modelTurn?.parts?.find(p => p.text)?.text;
    if (text) {
      this.emit('transcript', {
        text,
        isFinal: true,
        role: 'assistant',
      } as LiveTranscript);
    }

    // Handle interruption (server detected user started speaking)
    if (message.serverContent?.interrupted) {
      this.interrupt();
    }

    // Handle turn complete
    if (message.serverContent?.turnComplete) {
      this.updateState({ speaking: false });
      this.emit('turn-complete');
    }
  }
}
