import React, { useState, useEffect } from 'react';
import { ChatInterface } from './ChatInterface';
import { VoiceInterface } from './VoiceInterface';
import { FileManager } from './FileManager';
import { SessionControl } from './SessionControl';
import { Settings } from './Settings';
import { MessageSquare, Mic, FolderOpen, Settings as SettingsIcon } from 'lucide-react';

type View = 'chat' | 'voice' | 'files' | 'settings';

export function App() {
  const [currentView, setCurrentView] = useState<View>('chat');
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    // Check session status on mount
    checkSessionStatus();
  }, []);

  async function checkSessionStatus() {
    try {
      const status = await window.electron.invoke('session:status');
      setSessionActive(status.active);
      setSessionId(status.sessionId || null);
    } catch (error) {
      console.error('Failed to check session status:', error);
    }
  }

  async function handleStartSession() {
    setIsStarting(true);
    try {
      const result = await window.electron.invoke('session:start', {
        userPreferences: {
          outputPath: '/Users/matheusrech/Downloads',
          noEmDash: true,
        },
      });

      setSessionActive(true);
      setSessionId(result.sessionId);
    } catch (error) {
      console.error('Failed to start session:', error);
      alert('Failed to start session. Please check Docker is running and try again.');
    } finally {
      setIsStarting(false);
    }
  }

  async function handleStopSession(saveFiles: boolean = false) {
    try {
      await window.electron.invoke('session:stop', {
        saveFiles,
        destination: '/Users/matheusrech/Downloads',
      });

      setSessionActive(false);
      setSessionId(null);
    } catch (error) {
      console.error('Failed to stop session:', error);
      alert('Failed to stop session.');
    }
  }

  if (!sessionActive) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-8">
        <div className="max-w-2xl w-full">
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-12 shadow-2xl border border-gray-700">
            <div className="text-center mb-8">
              <h1 className="text-5xl font-bold text-white mb-4">
                Claude Workspace
              </h1>
              <p className="text-xl text-gray-300">
                Your personalized computer use environment
              </p>
            </div>

            <div className="space-y-6 mb-8">
              <div className="flex items-start gap-4 p-4 bg-gray-700/30 rounded-lg">
                <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                <div>
                  <h3 className="text-white font-semibold mb-1">
                    Integrated MCP Servers
                  </h3>
                  <p className="text-gray-400 text-sm">
                    All your MCP servers pre-configured and ready
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4 p-4 bg-gray-700/30 rounded-lg">
                <div className="w-2 h-2 bg-green-500 rounded-full mt-2"></div>
                <div>
                  <h3 className="text-white font-semibold mb-1">
                    Custom Skills
                  </h3>
                  <p className="text-gray-400 text-sm">
                    60+ specialized skills for medical research, ML, and more
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4 p-4 bg-gray-700/30 rounded-lg">
                <div className="w-2 h-2 bg-purple-500 rounded-full mt-2"></div>
                <div>
                  <h3 className="text-white font-semibold mb-1">
                    Fresh Environment
                  </h3>
                  <p className="text-gray-400 text-sm">
                    Clean slate every session with easy file export
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={handleStartSession}
              disabled={isStarting}
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-4 px-8 rounded-xl transition-all duration-200 transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
            >
              {isStarting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg
                    className="animate-spin h-5 w-5"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Starting Environment...
                </span>
              ) : (
                'Start Claude Workspace'
              )}
            </button>

            <p className="text-center text-gray-400 text-sm mt-6">
              Requires Docker Desktop to be running
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-900">
      {/* Sidebar */}
      <div className="w-20 bg-gray-800 border-r border-gray-700 flex flex-col items-center py-6 gap-6">
        <div className="text-2xl font-bold text-white mb-8">C</div>

        <button
          onClick={() => setCurrentView('chat')}
          className={`p-3 rounded-lg transition-colors ${
            currentView === 'chat'
              ? 'bg-blue-600 text-white'
              : 'text-gray-400 hover:text-white hover:bg-gray-700'
          }`}
          title="Chat"
        >
          <MessageSquare size={24} />
        </button>

        <button
          onClick={() => setCurrentView('voice')}
          className={`p-3 rounded-lg transition-colors ${
            currentView === 'voice'
              ? 'bg-blue-600 text-white'
              : 'text-gray-400 hover:text-white hover:bg-gray-700'
          }`}
          title="Voice"
        >
          <Mic size={24} />
        </button>

        <button
          onClick={() => setCurrentView('files')}
          className={`p-3 rounded-lg transition-colors ${
            currentView === 'files'
              ? 'bg-blue-600 text-white'
              : 'text-gray-400 hover:text-white hover:bg-gray-700'
          }`}
          title="Files"
        >
          <FolderOpen size={24} />
        </button>

        <div className="flex-1" />

        <button
          onClick={() => setCurrentView('settings')}
          className={`p-3 rounded-lg transition-colors ${
            currentView === 'settings'
              ? 'bg-blue-600 text-white'
              : 'text-gray-400 hover:text-white hover:bg-gray-700'
          }`}
          title="Settings"
        >
          <SettingsIcon size={24} />
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="h-16 bg-gray-800 border-b border-gray-700 flex items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-white font-semibold">Active Session</span>
            </div>
            <span className="text-gray-400 text-sm">
              {sessionId?.substring(0, 8)}
            </span>
          </div>

          <SessionControl
            sessionId={sessionId || ''}
            onStopSession={handleStopSession}
          />
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden">
          {currentView === 'chat' && <ChatInterface sessionId={sessionId || ''} />}
          {currentView === 'voice' && <VoiceInterface sessionId={sessionId || ''} />}
          {currentView === 'files' && <FileManager sessionId={sessionId || ''} />}
          {currentView === 'settings' && <Settings />}
        </div>
      </div>
    </div>
  );
}
