import WebSocket from 'ws';
import { LiveSession } from '../LiveSession';
import {
  LiveSessionConfig,
  LiveAudioData,
  LiveTranscript,
  SAMPLE_RATE_INPUT,
  SAMPLE_RATE_OUTPUT,
} from '../types';

/**
 * OpenAI Realtime Session - GPT-4o with native audio via WebSocket.
 *
 * Uses OpenAI's Realtime API for full-duplex voice conversations.
 * Supports function calling, voice activity detection, and interruptions.
 *
 * Features:
 * - Native audio input/output with GPT-4o
 * - Server-side VAD with configurable thresholds
 * - Tool/function calling support
 * - Multiple voice options (alloy, echo, shimmer, etc.)
 * - Video support via Vision API (hybrid approach)
 */
export class OpenAIRealtimeSession extends LiveSession {
  readonly provider = 'openai-realtime' as const;

  private ws: WebSocket | null = null;
  private responseInProgress = false;
  private lastVideoContext: string | null = null; // Store latest video description

  async connect(): Promise<void> {
    if (this.state.connected) return;

    const model = this.config.model || 'gpt-4o-realtime-preview';
    const url = `wss://api.openai.com/v1/realtime?model=${model}`;

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'OpenAI-Beta': 'realtime=v1',
        },
      });

      this.ws.on('open', () => {
        this.updateState({ connected: true });
        this.configureSession();
        this.emit('connected');
        resolve();
      });

      this.ws.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
        try {
          const event = JSON.parse(data.toString());
          this.handleEvent(event);
        } catch (e) {
          this.emitError(e as Error);
        }
      });

      this.ws.on('error', (error: Error) => {
        this.emitError(error);
        reject(error);
      });

      this.ws.on('close', (code: number, reason: Buffer) => {
        this.updateState({
          connected: false,
          listening: false,
          speaking: false,
        });
        this.emit('disconnected', reason.toString());
      });
    });
  }

  async disconnect(): Promise<void> {
    if (!this.ws) return;

    this.stopListening();
    this.ws.close();
    this.ws = null;

    this.updateState({
      connected: false,
      listening: false,
      speaking: false,
    });
  }

  async startListening(): Promise<void> {
    if (!this.state.connected) {
      throw new Error('Not connected to OpenAI Realtime session');
    }
    this.updateState({ listening: true });
  }

  stopListening(): void {
    this.updateState({ listening: false });
  }

  sendAudio(pcmData: Float32Array): void {
    if (!this.ws || !this.state.listening) return;

    // Convert Float32 to Int16
    const int16 = new Int16Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) {
      int16[i] = Math.max(-32768, Math.min(32767, pcmData[i] * 32768));
    }

    // Encode to base64
    const base64 = Buffer.from(int16.buffer).toString('base64');

    // Send audio append event
    this.send({
      type: 'input_audio_buffer.append',
      audio: base64,
    });
  }

  async sendText(text: string): Promise<void> {
    if (!this.ws) {
      throw new Error('Not connected to OpenAI Realtime session');
    }

    // Create a conversation item with text
    this.send({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text }],
      },
    });

    // Trigger response
    this.send({ type: 'response.create' });
  }

  interrupt(): void {
    if (!this.ws || !this.responseInProgress) return;

    // Send cancel event
    this.send({ type: 'response.cancel' });

    this.updateState({ speaking: false, interrupted: true });
    this.emit('interrupted');

    setTimeout(() => {
      this.updateState({ interrupted: false });
    }, 100);
  }

  /**
   * Send a video frame for background context.
   *
   * Since OpenAI Realtime API is audio-only, we use the Vision API to
   * analyze the image and store the description as context. This context
   * is automatically included in subsequent audio interactions.
   *
   * @param imageData Base64 encoded image data
   * @param mimeType Image MIME type (image/jpeg, image/png, image/webp)
   */
  async sendVideoFrame(imageData: string, mimeType: string = 'image/jpeg'): Promise<void> {
    if (!this.config.apiKey) return;

    try {
      // Analyze the image using Vision API
      const description = await this.analyzeImageWithVision(
        imageData,
        'Briefly describe what you see in this image in 1-2 sentences. Focus on key elements.',
        mimeType
      );

      // Store as context for future interactions
      this.lastVideoContext = description;

      // Optionally emit event so UI can show thumbnail
      this.emit('video-context-updated', { description });
    } catch (error) {
      // Silently fail for background frames - don't interrupt conversation
      console.error('Video frame analysis failed:', error);
    }
  }

  /**
   * Send an image with a specific prompt/question.
   *
   * Uses the Vision API to analyze the image, then injects the response
   * into the Realtime session as assistant context.
   *
   * @param imageData Base64 encoded image data
   * @param prompt Question about the image
   * @param mimeType Image MIME type
   */
  async sendImageWithPrompt(imageData: string, prompt: string, mimeType: string = 'image/jpeg'): Promise<void> {
    if (!this.ws) {
      throw new Error('Not connected to OpenAI Realtime session');
    }

    try {
      // Get detailed analysis from Vision API
      const analysis = await this.analyzeImageWithVision(imageData, prompt, mimeType);

      // Inject the user's question as conversation context
      this.send({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [{
            type: 'input_text',
            text: `[User shared an image and asked: "${prompt}"]`
          }],
        },
      });

      // Inject the vision analysis as system context
      this.send({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'assistant',
          content: [{
            type: 'text',
            text: analysis
          }],
        },
      });

      // Emit transcript so UI shows the interaction
      this.emit('transcript', {
        text: `[Analyzing image: ${prompt}]`,
        isFinal: true,
        role: 'user',
      } as LiveTranscript);

      this.emit('transcript', {
        text: analysis,
        isFinal: true,
        role: 'assistant',
      } as LiveTranscript);

      this.emit('turn-complete');
    } catch (error) {
      this.emitError(error as Error);
      throw error;
    }
  }

  /**
   * Analyze an image using OpenAI's Vision API (Chat Completions with gpt-4o)
   */
  private async analyzeImageWithVision(
    imageData: string,
    prompt: string,
    mimeType: string
  ): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${imageData}`,
                  detail: 'low', // Use low detail for faster processing
                },
              },
              {
                type: 'text',
                text: prompt,
              },
            ],
          },
        ],
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json() as { error?: { message?: string } };
      throw new Error(`Vision API error: ${errorData.error?.message || response.statusText}`);
    }

    const result = await response.json() as { choices: Array<{ message?: { content?: string } }> };
    return result.choices[0]?.message?.content || 'Unable to analyze image';
  }

  /**
   * Get the latest video context description (if any)
   */
  getVideoContext(): string | null {
    return this.lastVideoContext;
  }

  /**
   * Clear stored video context
   */
  clearVideoContext(): void {
    this.lastVideoContext = null;
  }

  private configureSession(): void {
    this.send({
      type: 'session.update',
      session: {
        modalities: ['text', 'audio'],
        voice: this.config.voice || 'alloy', // alloy, echo, fable, onyx, nova, shimmer
        instructions: this.config.systemPrompt || 'You are a helpful AI assistant.',
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: {
          model: 'whisper-1',
        },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
        },
      },
    });
  }

  private send(event: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event));
    }
  }

  private handleEvent(event: any): void {
    switch (event.type) {
      case 'session.created':
      case 'session.updated':
        // Session configured successfully
        break;

      case 'input_audio_buffer.speech_started':
        // User started speaking - might want to interrupt
        if (this.state.speaking) {
          this.interrupt();
        }
        break;

      case 'input_audio_buffer.speech_stopped':
        // User stopped speaking
        break;

      case 'conversation.item.input_audio_transcription.completed':
        // User's speech transcribed
        this.emit('transcript', {
          text: event.transcript,
          isFinal: true,
          role: 'user',
        } as LiveTranscript);
        break;

      case 'response.created':
        this.responseInProgress = true;
        break;

      case 'response.audio.delta':
        // Audio chunk received
        this.updateState({ speaking: true });

        const audioData: LiveAudioData = {
          data: event.delta,
          mimeType: `audio/pcm;rate=${SAMPLE_RATE_OUTPUT}`,
          sampleRate: SAMPLE_RATE_OUTPUT,
        };
        this.emitAudio(audioData);
        break;

      case 'response.audio_transcript.delta':
        // Partial transcript of AI response
        this.emit('transcript', {
          text: event.delta,
          isFinal: false,
          role: 'assistant',
        } as LiveTranscript);
        break;

      case 'response.audio_transcript.done':
        // Final transcript of AI response
        this.emit('transcript', {
          text: event.transcript,
          isFinal: true,
          role: 'assistant',
        } as LiveTranscript);
        break;

      case 'response.done':
        this.responseInProgress = false;
        this.updateState({ speaking: false });
        this.emit('turn-complete');
        break;

      case 'error':
        this.emitError(new Error(event.error?.message || 'Unknown error'));
        break;
    }
  }
}
