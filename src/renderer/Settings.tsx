import React, { useState, useEffect } from 'react';
import { Save, Key, Folder, Mic, Cpu, Sparkles } from 'lucide-react';

export function Settings() {
  const [apiKey, setApiKey] = useState('');
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [elevenlabsApiKey, setElevenlabsApiKey] = useState('');
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [defaultDestination, setDefaultDestination] = useState('');
  const [preferredBackend, setPreferredBackend] = useState<'docker' | 'vm'>('docker');
  const [vmAvailable, setVmAvailable] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const settings = await window.electron.invoke('settings:get');
      setApiKey(settings.apiKey || '');
      setOpenaiApiKey(settings.openaiApiKey || '');
      setGeminiApiKey(settings.geminiApiKey || '');
      setElevenlabsApiKey(settings.elevenlabsApiKey || '');
      setVoiceEnabled(settings.voiceEnabled || false);
      setDefaultDestination(settings.defaultDestination || '/Users/matheusrech/Downloads');
      setPreferredBackend(settings.preferredBackend || 'docker');
      setVmAvailable(settings.vmAvailable || false);
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

  async function handleSave() {
    setIsSaving(true);
    setSaveStatus('idle');

    try {
      await window.electron.invoke('settings:set', {
        anthropicApiKey: apiKey,
        openaiApiKey,
        geminiApiKey,
        elevenlabsApiKey,
        voiceEnabled,
        defaultDestination,
        preferredBackend,
      });

      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (error) {
      console.error('Failed to save settings:', error);
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col h-full bg-gray-900 overflow-y-auto">
      <div className="max-w-3xl mx-auto w-full p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Settings</h1>
          <p className="text-gray-400">
            Configure your Claude Workspace preferences
          </p>
        </div>

        <div className="space-y-6">
          {/* API Key */}
          <div className="bg-gray-800 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <Key size={20} className="text-blue-400" />
              <h2 className="text-xl font-semibold text-white">
                Anthropic API Key
              </h2>
            </div>
            <p className="text-gray-400 text-sm mb-4">
              Your API key is required to use Claude. Get one at{' '}
              <a
                href="https://console.anthropic.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300"
              >
                console.anthropic.com
              </a>
            </p>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-ant-..."
              className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Additional API Keys */}
          <div className="bg-gray-800 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <Sparkles size={20} className="text-amber-400" />
              <h2 className="text-xl font-semibold text-white">
                Additional API Keys (Optional)
              </h2>
            </div>
            <p className="text-gray-400 text-sm mb-4">
              Configure additional providers for voice and multi-model support
            </p>

            <div className="space-y-4">
              {/* OpenAI */}
              <div>
                <label className="block text-gray-300 text-sm mb-2">OpenAI API Key</label>
                <input
                  type="password"
                  value={openaiApiKey}
                  onChange={(e) => setOpenaiApiKey(e.target.value)}
                  placeholder="sk-proj-..."
                  className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                />
              </div>

              {/* Gemini */}
              <div>
                <label className="block text-gray-300 text-sm mb-2">Google Gemini API Key</label>
                <input
                  type="password"
                  value={geminiApiKey}
                  onChange={(e) => setGeminiApiKey(e.target.value)}
                  placeholder="AIza..."
                  className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                />
              </div>

              {/* ElevenLabs */}
              <div>
                <label className="block text-gray-300 text-sm mb-2">ElevenLabs API Key (Voice)</label>
                <input
                  type="password"
                  value={elevenlabsApiKey}
                  onChange={(e) => setElevenlabsApiKey(e.target.value)}
                  placeholder="sk_..."
                  className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Isolation Backend */}
          <div className="bg-gray-800 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <Cpu size={20} className="text-cyan-400" />
              <h2 className="text-xl font-semibold text-white">
                Isolation Backend
              </h2>
            </div>
            <p className="text-gray-400 text-sm mb-4">
              Choose how Claude's workspace environment is isolated
            </p>

            <div className="space-y-3">
              <label className="flex items-center gap-3 p-3 bg-gray-700 rounded-lg cursor-pointer hover:bg-gray-650 transition-colors">
                <input
                  type="radio"
                  name="backend"
                  value="docker"
                  checked={preferredBackend === 'docker'}
                  onChange={() => setPreferredBackend('docker')}
                  className="w-4 h-4 text-cyan-500 bg-gray-600 border-gray-500 focus:ring-cyan-500"
                />
                <div>
                  <span className="text-white font-medium">Docker Container</span>
                  <p className="text-gray-400 text-xs">Lightweight, requires Docker Desktop</p>
                </div>
              </label>

              <label className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                vmAvailable
                  ? 'bg-gray-700 cursor-pointer hover:bg-gray-650'
                  : 'bg-gray-800 cursor-not-allowed opacity-50'
              }`}>
                <input
                  type="radio"
                  name="backend"
                  value="vm"
                  checked={preferredBackend === 'vm'}
                  onChange={() => vmAvailable && setPreferredBackend('vm')}
                  disabled={!vmAvailable}
                  className="w-4 h-4 text-cyan-500 bg-gray-600 border-gray-500 focus:ring-cyan-500"
                />
                <div>
                  <span className="text-white font-medium">macOS VM</span>
                  <p className="text-gray-400 text-xs">
                    {vmAvailable
                      ? 'Full isolation via Virtualization.framework'
                      : 'Requires macOS 13+ with Apple Silicon'}
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Default Destination */}
          <div className="bg-gray-800 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <Folder size={20} className="text-green-400" />
              <h2 className="text-xl font-semibold text-white">
                Default Export Location
              </h2>
            </div>
            <p className="text-gray-400 text-sm mb-4">
              Where files should be saved when exporting from the container
            </p>
            <input
              type="text"
              value={defaultDestination}
              onChange={(e) => setDefaultDestination(e.target.value)}
              placeholder="/Users/matheusrech/Downloads"
              className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500 font-mono text-sm"
            />
          </div>

          {/* Voice Mode */}
          <div className="bg-gray-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Mic size={20} className="text-purple-400" />
                <h2 className="text-xl font-semibold text-white">Voice Mode</h2>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={voiceEnabled}
                  onChange={(e) => setVoiceEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-500 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
              </label>
            </div>
            <p className="text-gray-400 text-sm">
              Enable voice input and output for natural conversations with Claude
              (coming soon)
            </p>
          </div>

          {/* MCP Servers Status */}
          <div className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-white mb-4">
              MCP Servers
            </h2>
            <div className="space-y-2">
              <div className="flex items-center justify-between py-2 border-b border-gray-700">
                <span className="text-gray-300">Total Configured</span>
                <span className="text-white font-semibold">25 servers</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-gray-700">
                <span className="text-gray-300">Enabled</span>
                <span className="text-green-400 font-semibold">23 servers</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-gray-300">Authenticated</span>
                <span className="text-blue-400 font-semibold">1 server</span>
              </div>
            </div>
          </div>

          {/* Skills Status */}
          <div className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-white mb-4">
              Custom Skills
            </h2>
            <div className="space-y-2">
              <div className="flex items-center justify-between py-2 border-b border-gray-700">
                <span className="text-gray-300">User Skills</span>
                <span className="text-white font-semibold">40 skills</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-gray-700">
                <span className="text-gray-300">Public Skills</span>
                <span className="text-white font-semibold">6 skills</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-gray-300">Example Skills</span>
                <span className="text-white font-semibold">10 skills</span>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex items-center justify-between">
            <div className="text-sm">
              {saveStatus === 'success' && (
                <span className="text-green-400">Settings saved successfully!</span>
              )}
              {saveStatus === 'error' && (
                <span className="text-red-400">Failed to save settings</span>
              )}
            </div>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-8 rounded-xl transition-colors flex items-center gap-2"
            >
              <Save size={20} />
              {isSaving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
