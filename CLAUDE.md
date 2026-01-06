# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Claude Workspace is an Electron desktop application that gives Claude computer use capabilities through a containerized Ubuntu environment. It integrates MCP servers, custom skills, and provides chat/voice interfaces for interacting with Claude.

**Key Features:**
- Chat and voice interfaces for Claude interaction
- Docker-containerized Ubuntu environment for computer use
- 20+ MCP servers for extended capabilities
- Video capture for screen/window sharing
- Fresh sessions on each restart

## Build and Development Commands

```bash
# Install dependencies
npm install

# Development (runs main + renderer concurrently)
npm run dev
# Vite dev server runs at http://localhost:5173

# Development - main process only (TypeScript watch mode)
npm run dev:main

# Development - renderer only (Vite dev server with HMR)
npm run dev:renderer

# Production build
npm run build

# Package for macOS (creates DMG/ZIP in release/)
npm run package:mac

# Run tests (Vitest)
npm test

# Start built application
npm start

# Rebuild Docker image after Dockerfile changes
docker build -t claude-workspace:latest docker/
```

## CI/CD Pipeline

### GitHub Actions Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | Push/PR to main | TypeScript checks, build verification, tests |
| `release.yml` | Tags `v*` | Build and publish macOS DMG/ZIP to GitHub Releases |

### Creating a Release

```bash
# Tag a version
git tag v1.0.0
git push origin v1.0.0
# Release workflow auto-creates GitHub Release with downloadable app
```

### Automated Security

- **Dependabot** runs weekly, creates PRs for vulnerable dependencies
- PRs are tested by CI before merge
- Check status: https://github.com/matheus-rech/computer-use-project/security/dependabot

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npx vitest

# Run with coverage
npx vitest --coverage
```

**Test Files:**
- `src/main/voice/VAD.test.ts` - Voice Activity Detection (3 tests)
- `src/main/voice/AudioCapture.test.ts` - Audio recording (2 tests)

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  Electron App                                                        │
│  ┌──────────────────────┐    ┌──────────────────────────────────┐  │
│  │  Main Process        │    │  Renderer Process (React)        │  │
│  │  src/main/           │◄──►│  src/renderer/                   │  │
│  │  - index.ts (IPC)    │IPC │  - App.tsx                       │  │
│  │  - docker.ts         │    │  - ChatInterface.tsx             │  │
│  │  - mcp.ts            │    │  - FileManager.tsx               │  │
│  │  - fileTransfer.ts   │    │  - VoiceInterface.tsx            │  │
│  │  - voice/            │    │                                  │  │
│  └──────────┬───────────┘    └──────────────────────────────────┘  │
└─────────────┼───────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Docker Container (Ubuntu 24.04)                                     │
│  - Computer use tools (bash, str_replace_editor)                     │
│  - Python 3.12 + scientific packages                                 │
│  - Skills mounted at /mnt/skills (read-only)                         │
│  - User data at /mnt/user-data (read-write)                          │
└─────────────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Anthropic API + MCP Servers                                         │
│  - claude-sonnet-4-20250514 model                                    │
│  - 20+ configured MCP servers (config/mcp-servers.json)              │
└─────────────────────────────────────────────────────────────────────┘
```

## Key Components

### Main Process (`src/main/`)

| File | Responsibility |
|------|----------------|
| `index.ts` | IPC handlers, window management, app lifecycle |
| `docker.ts` | DockerManager class - container lifecycle, command execution |
| `mcp.ts` | MCPOrchestrator class - MCP server registration, Anthropic API calls |
| `fileTransfer.ts` | File operations between container and host |
| `preload.ts` | Secure IPC bridge (contextIsolation enabled) |

### Voice System (`src/main/voice/`)

| File | Responsibility |
|------|----------------|
| `VoiceEngine.ts` | WebSocket-first voice orchestrator |
| `AudioCapture.ts` | Microphone capture via node-audiorecorder |
| `VAD.ts` | Voice Activity Detection |
| `VideoCapture.ts` | Screen/window capture for AI vision |
| `LiveSession.ts` | Base class for voice providers |
| `providers/GeminiLiveSession.ts` | Google Gemini Live (primary, lowest latency) |
| `providers/OpenAIRealtimeSession.ts` | OpenAI Realtime WebSocket |
| `providers/ElevenLabsTTS.ts` | Text-to-speech provider |
| `providers/WhisperSTT.ts` | Speech-to-text fallback |

### Renderer Process (`src/renderer/`)

React 18 + Tailwind CSS UI components. All IPC calls go through `window.electron.invoke()`.

### Configuration (`config/`)

| File | Purpose |
|------|---------|
| `mcp-servers.json` | MCP server definitions (url, enabled, authenticated) |
| `skills.json` | Skills configuration for container mounting |
| `docker-compose.yml` | Container resource limits and configuration |

## IPC Channels

| Channel | Purpose |
|---------|---------|
| `session:start` | Start Docker container, initialize MCP servers |
| `session:stop` | Stop container, optional file export |
| `session:status` | Get current session state |
| `claude:message` | Send message to Claude via Anthropic API |
| `files:list` | List files in container directory |
| `files:export` | Copy files from container to Mac |
| `settings:get/set` | Electron-store based settings (API key, preferences) |
| `voice:start/stop` | Voice session control |
| `video:capture` | Screen/window capture for vision |

## Container Environment

- **Image**: `claude-workspace:latest` (built from `docker/Dockerfile`)
- **User**: `claude` (non-root)
- **Resources**: 8GB RAM, 4 CPUs (configurable in docker-compose.yml)
- **Mounts**:
  - Skills: `~/.../Claude/skills` → `/mnt/skills:ro`
  - Session data: `~/.claude-workspace/sessions/{id}` → `/mnt/user-data:rw`

## TypeScript Configuration

| Config | Target | Output |
|--------|--------|--------|
| `tsconfig.main.json` | ES2020/CommonJS | `dist/main/` |
| `tsconfig.json` | ESNext (Vite) | `dist/renderer/` |
| `tsconfig.node.json` | ESNext | Vite config only |

- Path alias: `@/*` → `./src/renderer/*`
- Strict mode enabled

## Adding Features

### New IPC Handler
1. Add handler in `src/main/index.ts` using `ipcMain.handle(channel, handler)`
2. Expose in `src/main/preload.ts`
3. Call from renderer via `window.electron.invoke(channel, args)`

### New MCP Server
Add to `config/mcp-servers.json`:
```json
{
  "server-key": {
    "url": "https://...",
    "name": "Display Name",
    "enabled": true,
    "description": "What it does"
  }
}
```

### New Voice Provider
1. Create provider in `src/main/voice/providers/`
2. Extend `LiveSession` base class
3. Implement required methods: `connect()`, `disconnect()`, `sendAudio()`, `sendText()`
4. Register in `VoiceEngine.ts`

### Modifying Container
Edit `docker/Dockerfile`, then rebuild:
```bash
docker build -t claude-workspace:latest docker/
```

## Debugging

- Dev mode auto-opens Chrome DevTools
- Container logs: `docker logs claude-workspace-{sessionId}`
- App logs: `~/Library/Logs/Claude\ Workspace/main.log`
- Check container status: `docker ps`
- Run tests: `npm test`

## Repository

- **GitHub**: https://github.com/matheus-rech/computer-use-project
- **CI Status**: Check Actions tab for build status
- **Security**: Check Security tab for Dependabot alerts
