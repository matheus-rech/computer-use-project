import React, { useState } from 'react';
import { Power, Save } from 'lucide-react';

interface SessionControlProps {
  sessionId: string;
  onStopSession: (saveFiles: boolean) => void;
}

export function SessionControl({ sessionId, onStopSession }: SessionControlProps) {
  const [showConfirm, setShowConfirm] = useState(false);

  function handleStop(saveFiles: boolean) {
    onStopSession(saveFiles);
    setShowConfirm(false);
  }

  if (showConfirm) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-gray-300 text-sm mr-2">Save files before stopping?</span>
        <button
          onClick={() => handleStop(true)}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-white text-sm transition-colors flex items-center gap-2"
        >
          <Save size={16} />
          Save & Stop
        </button>
        <button
          onClick={() => handleStop(false)}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-white text-sm transition-colors"
        >
          Stop Without Saving
        </button>
        <button
          onClick={() => setShowConfirm(false)}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-gray-300 text-sm transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setShowConfirm(true)}
      className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-white transition-colors flex items-center gap-2"
    >
      <Power size={16} />
      End Session
    </button>
  );
}
