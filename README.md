# Claude Workspace - Custom Computer Use Application

A personalized desktop application that provides Claude with computer use capabilities, integrated with your MCP servers, skills, and workflows.

## Features

- **One-Click Launch**: Start Claude's virtual computer environment with a single click
- **MCP Integration**: All your existing MCP servers (Hugging Face, Java docs, Chrome control, Filesystem, Context7) pre-configured
- **Skills Integration**: Your custom skills (transformers, scikit-learn, medical research tools, etc.) automatically available
- **Dual Interface**: Chat and voice communication options
- **File Transfer**: Easy export of work to Google Drive or your main Mac filesystem
- **Non-Persistent Sessions**: Fresh environment each time with optional data export
- **Mac-Native**: Built as a standalone Mac application

## Architecture

```
┌─────────────────────────────────────────┐
│         Mac Application (Electron)      │
│  ┌─────────────────────────────────┐   │
│  │   UI Layer (React + Tailwind)   │   │
│  │  - Chat Interface               │   │
│  │  - Voice Interface              │   │
│  │  - File Manager                 │   │
│  └─────────────────────────────────┘   │
│  ┌─────────────────────────────────┐   │
│  │   Session Manager               │   │
│  │  - Docker Container Control     │   │
│  │  - MCP Server Orchestration     │   │
│  │  - File Transfer Handler        │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
                    │
                    ↓
┌─────────────────────────────────────────┐
│     Docker Container (Ubuntu)           │
│  ┌─────────────────────────────────┐   │
│  │   Claude Computer Use Tools     │   │
│  │  - bash_tool                    │   │
│  │  - str_replace                  │   │
│  │  - view                         │   │
│  │  - create_file                  │   │
│  └─────────────────────────────────┘   │
│  ┌─────────────────────────────────┐   │
│  │   Your Skills & Tools           │   │
│  │  - /mnt/skills/user/*           │   │
│  │  - Python/R environments        │   │
│  │  - Medical research tools       │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
                    │
                    ↓
┌─────────────────────────────────────────┐
│         Anthropic API                   │
│  - Claude 4 Sonnet                      │
│  - Computer Use API                     │
│  - Voice API (optional)                 │
└─────────────────────────────────────────┘
```

## Installation

### Prerequisites
- macOS 11 or later
- Docker Desktop for Mac
- Node.js 18+
- Anthropic API key

### Quick Start
```bash
# Install dependencies
npm install

# Configure your API key
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY

# Build the application
npm run build

# Run in development mode
npm run dev

# Or build as Mac app
npm run package
```

## Configuration

### MCP Servers (`config/mcp-servers.json`)
All your existing MCP servers are pre-configured:
- Hugging Face (with authentication)
- Java Documentation
- Chrome Control
- Filesystem Access
- Context7
- Remote MCP Server

### Skills Integration (`config/skills.json`)
Your custom skills automatically mounted:
- Medical research tools (pyhealth, neurokit2, pathml)
- ML/AI tools (transformers, scikit-learn, shap)
- Scientific computing (astropy, pymatgen)
- Document processing (docx, pdf, pptx, xlsx)

### User Preferences
Your preferences are automatically applied:
- Save outputs to /Users/matheusrech/Downloads
- No em dashes in text

## Usage

### Starting a Session
1. Double-click the Claude Workspace app
2. The Docker container starts automatically
3. Choose chat or voice mode
4. Start working with Claude

### File Management
- **Export to Drive**: Click "Export to Drive" button in the file manager
- **Copy to Mac**: Select files and click "Copy to Mac" to save to ~/Downloads
- **View Container Files**: Browse /home/claude and /mnt/user-data/outputs

### Ending a Session
1. Click "End Session"
2. Select files to keep (optional)
3. Container is destroyed
4. Next launch starts fresh

## Project Structure

```
claude-workspace/
├── src/
│   ├── main/                 # Electron main process
│   │   ├── index.ts         # Main entry point
│   │   ├── docker.ts        # Docker management
│   │   ├── mcp.ts           # MCP server orchestration
│   │   └── fileTransfer.ts  # File operations
│   ├── renderer/            # React UI
│   │   ├── App.tsx
│   │   ├── ChatInterface.tsx
│   │   ├── VoiceInterface.tsx
│   │   ├── FileManager.tsx
│   │   └── SessionControl.tsx
│   └── shared/              # Shared types/utils
├── config/
│   ├── mcp-servers.json     # MCP configuration
│   ├── skills.json          # Skills configuration
│   └── docker-compose.yml   # Container definition
├── docker/
│   ├── Dockerfile           # Container image
│   └── entrypoint.sh       # Container startup script
└── package.json
```

## Development

### Running Tests
```bash
npm test
```

### Building for Distribution
```bash
npm run package:mac
```

### Updating Skills
Edit `config/skills.json` to add/remove skills from the container environment.

### Custom MCP Servers
Add new MCP servers to `config/mcp-servers.json`.

## Troubleshooting

### Docker Issues
- Ensure Docker Desktop is running
- Check Docker has sufficient resources (8GB+ RAM recommended)

### MCP Connection Issues
- Verify API keys in MCP server configs
- Check network connectivity

### File Transfer Issues
- Ensure ~/Downloads has write permissions
- Check Google Drive API credentials if using Drive export

## Advanced Configuration

### Voice Mode
Enable voice interface by setting `ENABLE_VOICE=true` in `.env` and configuring microphone permissions.

### Custom Skills
Add your own skills to the container by placing them in `docker/skills/` and updating `config/skills.json`.

### Persistent Data (Optional)
While sessions are non-persistent by default, you can enable selective persistence by mounting volumes in `docker-compose.yml`.

## License

MIT
