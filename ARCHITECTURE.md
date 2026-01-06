# Claude Workspace - Architecture Documentation

Comprehensive technical documentation for the Claude Workspace application.

## Overview

Claude Workspace is an Electron-based desktop application that provides Claude with computer use capabilities through a containerized Ubuntu environment. It integrates your MCP servers, custom skills, and provides a seamless interface for interacting with Claude.

## Architecture Layers

### 1. Application Layer (Electron)

**Technology**: Electron 28, Node.js 20

**Components**:
- **Main Process** (`src/main/index.ts`): Application lifecycle, window management, IPC handlers
- **Renderer Process** (`src/renderer/`): React-based UI
- **Preload Script** (`src/main/preload.ts`): Secure IPC bridge

**Responsibilities**:
- Window creation and management
- System tray integration
- IPC communication between processes
- Settings persistence (via electron-store)
- File system access to Mac

### 2. Container Management Layer

**Technology**: Docker, dockerode

**Components**:
- **DockerManager** (`src/main/docker.ts`): Container lifecycle management
- **Docker Image**: Ubuntu 24.04 with Python, R, Node.js
- **Docker Compose**: Container configuration and resource limits

**Responsibilities**:
- Building and maintaining the Ubuntu image
- Starting/stopping containers per session
- Executing commands in containers
- Volume mounting for skills and data transfer
- Resource allocation and limits

### 3. MCP Integration Layer

**Technology**: Anthropic SDK, WebSocket, SSE

**Components**:
- **MCPOrchestrator** (`src/main/mcp.ts`): MCP server management
- **MCP Configuration** (`config/mcp-servers.json`): Server definitions

**Responsibilities**:
- Connecting to remote MCP servers
- Managing server lifecycles
- Routing MCP requests through Anthropic API
- Handling authentication for authenticated servers

### 4. File Transfer Layer

**Technology**: Node.js fs, tar-stream

**Components**:
- **FileTransferManager** (`src/main/fileTransfer.ts`): File operations
- **Transfer Directory**: `~/.claude-workspace/sessions/`

**Responsibilities**:
- Copying files from container to Mac
- Managing session-specific file storage
- Cleaning up after sessions
- Future: Google Drive integration

### 5. UI Layer

**Technology**: React 18, TypeScript, Tailwind CSS

**Components**:
- **App** (`src/renderer/App.tsx`): Main application shell
- **ChatInterface**: Text-based interaction
- **VoiceInterface**: Voice interaction (coming soon)
- **FileManager**: File browsing and export
- **SessionControl**: Session lifecycle control
- **Settings**: Configuration management

## Data Flow

### Starting a Session

```
User Click "Start"
    ↓
Main Process (IPC)
    ↓
DockerManager.startContainer()
    ↓
1. Generate session ID
2. Create transfer directory
3. Build/pull Docker image
4. Mount volumes:
   - Skills (read-only)
   - Transfer directory (read-write)
5. Set environment variables
6. Start container
    ↓
MCPOrchestrator.initialize()
    ↓
1. Load MCP server configs
2. Filter enabled servers
3. Register servers
    ↓
Return session info to UI
    ↓
UI updates to active state
```

### Sending a Message

```
User types message
    ↓
ChatInterface.handleSend()
    ↓
IPC: claude:message
    ↓
Main Process
    ↓
MCPOrchestrator.sendMessage()
    ↓
Anthropic API
    ├── Model: claude-sonnet-4-20250514
    ├── Tools: computer, bash, editor
    ├── MCP Servers: All enabled servers
    └── Max tokens: 8096
    ↓
Claude processes request
    ├── Can execute bash commands
    ├── Can read/write files
    ├── Can use MCP tools
    └── Can access skills
    ↓
Response with content blocks
    ├── Text blocks
    ├── Tool use blocks
    └── Tool result blocks
    ↓
Extract text content
    ↓
Return to ChatInterface
    ↓
Display in UI
```

### Exporting Files

```
User selects files
    ↓
Click "Export to Mac"
    ↓
IPC: files:export
    ↓
FileTransferManager.exportFiles()
    ↓
1. Show directory picker
2. Get selected files from session
3. Copy files from:
   ~/.claude-workspace/sessions/{sessionId}/
4. To: User-selected directory
    ↓
Return success
    ↓
UI shows confirmation
```

### Stopping a Session

```
User clicks "End Session"
    ↓
Confirmation dialog
    ├── Save files? → Export files first
    └── Don't save? → Skip export
    ↓
IPC: session:stop
    ↓
Main Process
    ↓
DockerManager.stopContainer()
    ↓
1. Stop container (10s timeout)
2. Remove container
3. Delete from registry
    ↓
MCPOrchestrator.cleanup()
    ↓
1. Close WebSocket connections
2. Clear server registry
    ↓
FileTransferManager.cleanupSession()
    ↓
Delete session directory
    ↓
Return to UI
    ↓
Show welcome screen
```

## Container Environment

### Directory Structure

```
/home/claude/                    # Working directory
    workspace/                   # User workspace
    .config/                     # Configuration files
    .npm-global/                 # Global npm packages

/mnt/
    user-data/                   # Data transfer area
        uploads/                 # Files from Mac
        outputs/                 # Files to export
    skills/                      # Skills (read-only)
        user/                    # Your custom skills
        public/                  # Anthropic public skills
        examples/                # Example skills
    transcripts/                 # Session transcripts
```

### Installed Software

**System**:
- Ubuntu 24.04
- curl, wget, git, vim, nano
- build-essential, SSL libraries

**Python**:
- Python 3.12
- pip (latest)
- Common scientific packages:
  - numpy, pandas, scipy
  - scikit-learn, transformers
  - torch, tensorflow
  - jupyter, ipython
- Medical/research packages:
  - biopython, pydicom, nibabel
  - neurokit2, mne, nilearn
  - statsmodels, lifelines
- Document processing:
  - python-pptx, pymupdf, reportlab
  - python-docx, openpyxl

**R**:
- R 4.x
- Base packages

**Node.js**:
- Node.js 20
- npm (latest)
- Global packages directory configured

### Resource Limits

**Default Configuration**:
- Memory: 8GB
- CPUs: 4 cores
- Storage: Unlimited (host filesystem)
- Network: Bridge mode

**Adjustable** via `config/docker-compose.yml`:
```yaml
deploy:
  resources:
    limits:
      cpus: '8'      # Increase for more performance
      memory: 16G    # Increase for large datasets
```

## Security Model

### Isolation

1. **Container Isolation**:
   - Containers run as user `claude` (not root)
   - no-new-privileges security option
   - Bridge network (isolated from host)

2. **File System**:
   - Skills mounted read-only
   - Only specific directories accessible
   - Transfer area sandboxed per session

3. **API Keys**:
   - Stored in Electron's secure storage
   - Never exposed to renderer process
   - Passed to container via environment

### Data Persistence

**Non-Persistent**:
- Container filesystem
- Installed packages
- Working directory contents
- Command history

**Persistent** (until session cleanup):
- Files in `/mnt/user-data/`
- Session transfer directory

**Always Persistent**:
- Application settings
- API keys
- Skills configuration

## MCP Server Integration

### Configuration

Each MCP server is defined in `config/mcp-servers.json`:

```json
{
  "server-key": {
    "url": "https://server.com/mcp",
    "name": "Display Name",
    "enabled": true,
    "authenticated": false,
    "description": "What this server does"
  }
}
```

### Connection Flow

1. **Initialization**:
   - Load config on session start
   - Filter for enabled servers
   - Register with MCPOrchestrator

2. **API Integration**:
   - Servers passed to Anthropic API
   - Claude can discover available tools
   - Tools invoked automatically

3. **Request Routing**:
   ```
   Claude → Anthropic API → MCP Server
              ↓
          Response
              ↓
           Claude
   ```

### Supported Server Types

- **SSE Endpoints**: Long-lived event streams
- **REST APIs**: Standard HTTP endpoints
- **Authenticated**: With API keys or tokens

## Skills System

### Skill Types

1. **User Skills** (`/mnt/skills/user/`):
   - Your custom skills
   - 40+ specialized tools
   - Medical research focused

2. **Public Skills** (`/mnt/skills/public/`):
   - Anthropic-provided skills
   - Document creation (docx, pptx, xlsx, pdf)
   - General-purpose tools

3. **Example Skills** (`/mnt/skills/examples/`):
   - Reference implementations
   - Learning resources
   - Templates

### Skill Structure

```
skill-name/
    SKILL.md              # Main documentation
    examples/             # Usage examples
    utils/                # Helper utilities
    config.json           # Skill configuration
```

### Skill Loading

1. **Mount Time**:
   - Skills directory mounted read-only
   - Available at container start
   - Path: `/mnt/skills/`

2. **Runtime Access**:
   - Claude reads SKILL.md files
   - Executes code from examples
   - Uses utilities as needed

## Communication Protocols

### IPC Channels

**Session Management**:
- `session:start` → Start new session
- `session:stop` → End current session
- `session:status` → Get session info

**Claude Interaction**:
- `claude:message` → Send message to Claude

**File Operations**:
- `files:list` → List directory contents
- `files:export` → Export files to Mac

**Settings**:
- `settings:get` → Load settings
- `settings:set` → Save settings

### Message Format

**Request**:
```typescript
{
  channel: string;
  args: any[];
}
```

**Response**:
```typescript
{
  success: boolean;
  data?: any;
  error?: string;
}
```

## Performance Considerations

### Optimization Strategies

1. **Image Caching**:
   - Docker image built once
   - Reused across sessions
   - Only rebuild when Dockerfile changes

2. **Resource Management**:
   - Containers auto-remove on stop
   - Session directories cleaned up
   - Docker system prune recommended monthly

3. **API Efficiency**:
   - Single API call per message
   - All MCP servers included
   - Response streaming for large outputs

### Monitoring

```bash
# Check container resources
docker stats

# View container logs
docker logs claude-workspace-{sessionId}

# Check Docker disk usage
docker system df

# Application logs
tail -f ~/Library/Logs/Claude\ Workspace/main.log
```

## Development Workflow

### Hot Reload Setup

1. **Main Process**:
   ```bash
   npm run dev:main
   # TypeScript compiler watches for changes
   # Restart app to see changes
   ```

2. **Renderer Process**:
   ```bash
   npm run dev:renderer
   # Vite dev server with HMR
   # Changes reflect immediately
   ```

3. **Full Development**:
   ```bash
   npm run dev
   # Runs both concurrently
   ```

### Adding Features

1. **New IPC Handler**:
   - Add handler in `src/main/index.ts`
   - Define types in `src/shared/types.ts`
   - Call from renderer via `window.electron.invoke()`

2. **New UI Component**:
   - Create in `src/renderer/components/`
   - Import in `App.tsx` or parent component
   - Use Tailwind for styling

3. **New MCP Server**:
   - Add to `config/mcp-servers.json`
   - Set enabled: true
   - Restart application

4. **New Skill**:
   - Add to skills directory
   - Update `config/skills.json`
   - Restart application

## Troubleshooting

### Common Issues

**Container Won't Start**:
- Check Docker is running
- Verify image exists: `docker images | grep claude-workspace`
- Check logs: `docker logs [container]`

**MCP Servers Not Working**:
- Verify network connectivity
- Check server URLs in config
- Test connection: `curl [server-url]`

**Skills Not Loading**:
- Verify skills path in .env
- Check directory permissions
- Ensure SKILL.md exists

**High Memory Usage**:
- Reduce Docker memory limit
- Close unused applications
- Clear Docker resources

## Future Enhancements

### Planned Features

1. **Voice Mode**:
   - Real-time speech-to-text
   - Text-to-speech output
   - Natural conversation flow

2. **Google Drive Integration**:
   - Direct upload to Drive
   - Organize by session
   - Share links

3. **Session Persistence** (Optional):
   - Save container state
   - Resume previous sessions
   - Incremental backups

4. **Collaborative Features**:
   - Share sessions
   - Team workspaces
   - Real-time collaboration

5. **Enhanced Monitoring**:
   - Resource usage graphs
   - Performance metrics
   - Cost tracking

## Contributing

### Code Style

- TypeScript for all code
- Functional React components
- Tailwind for styling
- ESLint configuration provided

### Testing

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage
```

### Building

```bash
# Development build
npm run build

# Production build with optimization
npm run build:prod

# Package for distribution
npm run package:mac
```

## License

MIT License - See LICENSE file for details

## Support

For issues, questions, or contributions:
- Check SETUP.md for common problems
- Review architecture documentation
- Check logs for error details
- Create detailed bug reports with:
  - macOS version
  - Docker version
  - Node.js version
  - Error logs
  - Steps to reproduce
