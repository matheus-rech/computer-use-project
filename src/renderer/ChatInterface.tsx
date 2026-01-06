import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2 } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ChatInterfaceProps {
  sessionId: string;
}

export function ChatInterface({ sessionId }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Focus input on mount
    inputRef.current?.focus();
  }, []);

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  async function handleSend() {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await window.electron.invoke('claude:message', input.trim());

      // Extract text from response
      let assistantContent = '';
      if (response.content) {
        for (const block of response.content) {
          if (block.type === 'text') {
            assistantContent += block.text;
          }
        }
      }

      const assistantMessage: Message = {
        role: 'assistant',
        content: assistantContent || 'No response received.',
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Failed to send message:', error);

      const errorMessage: Message = {
        role: 'assistant',
        content: `Error: ${error.message}`,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-lg">
              <h2 className="text-2xl font-bold text-white mb-4">
                Welcome to Claude Workspace
              </h2>
              <p className="text-gray-400 mb-6">
                You're now connected to Claude with full computer use capabilities,
                all your MCP servers, and custom skills.
              </p>
              <div className="grid grid-cols-2 gap-3 text-left">
                <div className="bg-gray-800/50 p-4 rounded-lg">
                  <div className="text-blue-400 text-sm font-semibold mb-1">
                    Try asking:
                  </div>
                  <div className="text-gray-300 text-sm">
                    "Analyze this medical paper and extract key findings"
                  </div>
                </div>
                <div className="bg-gray-800/50 p-4 rounded-lg">
                  <div className="text-green-400 text-sm font-semibold mb-1">
                    Or request:
                  </div>
                  <div className="text-gray-300 text-sm">
                    "Create a systematic review extraction workflow"
                  </div>
                </div>
                <div className="bg-gray-800/50 p-4 rounded-lg">
                  <div className="text-purple-400 text-sm font-semibold mb-1">
                    Run code:
                  </div>
                  <div className="text-gray-300 text-sm">
                    "Build a survival analysis with scikit-survival"
                  </div>
                </div>
                <div className="bg-gray-800/50 p-4 rounded-lg">
                  <div className="text-orange-400 text-sm font-semibold mb-1">
                    Access data:
                  </div>
                  <div className="text-gray-300 text-sm">
                    "Search PubMed for recent cerebellar stroke studies"
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-3xl px-6 py-4 rounded-2xl ${
                message.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-100'
              }`}
            >
              <div className="whitespace-pre-wrap break-words">
                {message.content}
              </div>
              <div
                className={`text-xs mt-2 ${
                  message.role === 'user' ? 'text-blue-100' : 'text-gray-500'
                }`}
              >
                {message.timestamp.toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="max-w-3xl px-6 py-4 rounded-2xl bg-gray-800">
              <div className="flex items-center gap-2 text-gray-400">
                <Loader2 size={16} className="animate-spin" />
                <span>Claude is thinking...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-800 bg-gray-850 p-4">
        <div className="max-w-4xl mx-auto flex gap-4">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message Claude..."
            disabled={isLoading}
            className="flex-1 bg-gray-800 text-white placeholder-gray-500 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none min-h-[60px] max-h-[200px] disabled:opacity-50"
            rows={1}
            style={{
              height: 'auto',
              maxHeight: '200px',
            }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'auto';
              target.style.height = target.scrollHeight + 'px';
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-xl px-6 transition-colors flex items-center gap-2"
          >
            {isLoading ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              <>
                <Send size={20} />
                <span className="font-semibold">Send</span>
              </>
            )}
          </button>
        </div>
        <div className="max-w-4xl mx-auto mt-2 text-xs text-gray-500 text-center">
          Press Enter to send, Shift+Enter for new line
        </div>
      </div>
    </div>
  );
}
