import React, { useState, useEffect } from 'react';
import {
  FolderOpen,
  File,
  Download,
  Upload,
  RefreshCw,
  Trash2,
} from 'lucide-react';

interface FileItem {
  name: string;
  size: string;
  isDirectory: boolean;
  permissions: string;
}

interface FileManagerProps {
  sessionId: string;
}

export function FileManager({ sessionId }: FileManagerProps) {
  const [currentPath, setCurrentPath] = useState('/mnt/user-data/outputs');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadFiles();
  }, [currentPath]);

  async function loadFiles() {
    setIsLoading(true);
    try {
      const result = await window.electron.invoke('files:list', currentPath);
      setFiles(result);
    } catch (error) {
      console.error('Failed to load files:', error);
    } finally {
      setIsLoading(false);
    }
  }

  function toggleFileSelection(filename: string) {
    setSelectedFiles((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(filename)) {
        newSet.delete(filename);
      } else {
        newSet.add(filename);
      }
      return newSet;
    });
  }

  async function handleExportFiles() {
    if (selectedFiles.size === 0) {
      alert('Please select files to export');
      return;
    }

    try {
      const filePaths = Array.from(selectedFiles).map((file) =>
        currentPath === '/' ? file : `${currentPath}/${file}`
      );

      const result = await window.electron.invoke('files:export', filePaths);

      if (result.success) {
        alert(`Files exported to ${result.destination}`);
        setSelectedFiles(new Set());
      }
    } catch (error) {
      console.error('Failed to export files:', error);
      alert('Failed to export files');
    }
  }

  function formatSize(size: string): string {
    // Size is already formatted by ls -lah
    return size;
  }

  function navigateUp() {
    if (currentPath === '/') return;
    const parts = currentPath.split('/');
    parts.pop();
    setCurrentPath(parts.join('/') || '/');
  }

  function navigateTo(directory: string) {
    setCurrentPath(
      currentPath === '/' ? `/${directory}` : `${currentPath}/${directory}`
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Toolbar */}
      <div className="bg-gray-800 border-b border-gray-700 p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FolderOpen size={20} className="text-gray-400" />
            <span className="text-white font-mono text-sm">{currentPath}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadFiles}
              disabled={isLoading}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors text-gray-400 hover:text-white disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw
                size={20}
                className={isLoading ? 'animate-spin' : ''}
              />
            </button>
          </div>
        </div>

        {/* Quick Navigation */}
        <div className="flex gap-2">
          <button
            onClick={() => setCurrentPath('/home/claude')}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm text-gray-300 transition-colors"
          >
            Home
          </button>
          <button
            onClick={() => setCurrentPath('/mnt/user-data/outputs')}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm text-gray-300 transition-colors"
          >
            Outputs
          </button>
          <button
            onClick={() => setCurrentPath('/mnt/user-data/uploads')}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm text-gray-300 transition-colors"
          >
            Uploads
          </button>
        </div>
      </div>

      {/* File List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-400">Loading...</div>
          </div>
        ) : files.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <FolderOpen size={48} className="text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400">No files in this directory</p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-gray-800">
            {currentPath !== '/' && (
              <div
                onClick={navigateUp}
                className="flex items-center gap-4 p-4 hover:bg-gray-800 cursor-pointer transition-colors"
              >
                <FolderOpen size={20} className="text-blue-400" />
                <div className="flex-1">
                  <div className="text-white font-mono">..</div>
                </div>
              </div>
            )}

            {files.map((file) => (
              <div
                key={file.name}
                onClick={() => {
                  if (file.isDirectory) {
                    navigateTo(file.name);
                  } else {
                    toggleFileSelection(file.name);
                  }
                }}
                className={`flex items-center gap-4 p-4 hover:bg-gray-800 cursor-pointer transition-colors ${
                  selectedFiles.has(file.name) ? 'bg-blue-900/20' : ''
                }`}
              >
                {file.isDirectory ? (
                  <FolderOpen size={20} className="text-blue-400" />
                ) : (
                  <File size={20} className="text-gray-400" />
                )}
                <div className="flex-1">
                  <div className="text-white font-mono">{file.name}</div>
                  <div className="text-gray-500 text-xs font-mono mt-1">
                    {file.permissions} · {formatSize(file.size)}
                  </div>
                </div>
                {!file.isDirectory && selectedFiles.has(file.name) && (
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      {selectedFiles.size > 0 && (
        <div className="bg-gray-800 border-t border-gray-700 p-4">
          <div className="flex items-center justify-between">
            <div className="text-gray-400 text-sm">
              {selectedFiles.size} file(s) selected
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedFiles(new Set())}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-gray-300 transition-colors"
              >
                Clear
              </button>
              <button
                onClick={handleExportFiles}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white transition-colors flex items-center gap-2"
              >
                <Download size={16} />
                Export to Mac
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
