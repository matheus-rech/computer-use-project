import React, { useState } from 'react';
import { Mic, MicOff, Volume2 } from 'lucide-react';

interface VoiceInterfaceProps {
  sessionId: string;
}

export function VoiceInterface({ sessionId }: VoiceInterfaceProps) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');

  function handleToggleListening() {
    setIsListening(!isListening);
    // TODO: Implement voice recording and transcription
  }

  return (
    <div className="flex flex-col items-center justify-center h-full bg-gray-900 p-8">
      <div className="max-w-2xl w-full text-center">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-white mb-2">Voice Mode</h2>
          <p className="text-gray-400">
            Talk to Claude naturally with voice input and output
          </p>
        </div>

        {/* Voice Visualizer */}
        <div className="mb-8 flex items-center justify-center">
          <button
            onClick={handleToggleListening}
            className={`w-32 h-32 rounded-full flex items-center justify-center transition-all duration-300 ${
              isListening
                ? 'bg-red-600 hover:bg-red-700 animate-pulse'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isListening ? (
              <MicOff size={48} className="text-white" />
            ) : (
              <Mic size={48} className="text-white" />
            )}
          </button>
        </div>

        <div className="text-white mb-4">
          {isListening ? 'Listening...' : 'Click to start speaking'}
        </div>

        {/* Transcript Display */}
        {transcript && (
          <div className="bg-gray-800 rounded-xl p-6 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Volume2 size={20} className="text-gray-400" />
              <span className="text-gray-400 text-sm font-semibold">
                Transcript
              </span>
            </div>
            <p className="text-white text-left">{transcript}</p>
          </div>
        )}

        {/* Coming Soon Notice */}
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-6 mt-8">
          <div className="text-yellow-500 font-semibold mb-2">
            Coming Soon
          </div>
          <p className="text-gray-300 text-sm">
            Voice mode is currently under development. This will enable natural
            voice conversations with Claude, including real-time transcription
            and voice synthesis.
          </p>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-4 text-left">
          <div className="bg-gray-800/50 p-4 rounded-lg">
            <div className="text-blue-400 text-sm font-semibold mb-2">
              Voice Input
            </div>
            <p className="text-gray-400 text-sm">
              Speak naturally to Claude using your microphone
            </p>
          </div>
          <div className="bg-gray-800/50 p-4 rounded-lg">
            <div className="text-green-400 text-sm font-semibold mb-2">
              Voice Output
            </div>
            <p className="text-gray-400 text-sm">
              Hear Claude's responses in natural speech
            </p>
          </div>
          <div className="bg-gray-800/50 p-4 rounded-lg">
            <div className="text-purple-400 text-sm font-semibold mb-2">
              Real-time Processing
            </div>
            <p className="text-gray-400 text-sm">
              Low-latency conversation with instant transcription
            </p>
          </div>
          <div className="bg-gray-800/50 p-4 rounded-lg">
            <div className="text-orange-400 text-sm font-semibold mb-2">
              Context Aware
            </div>
            <p className="text-gray-400 text-sm">
              Maintains conversation context across turns
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
