# Claude Workspace - Setup Guide

Complete guide to setting up and running your custom Claude computer use application.

## Prerequisites

Before you begin, ensure you have the following installed:

### Required Software

1. **macOS 11 or later**
   - This application is designed for macOS

2. **Docker Desktop for Mac**
   - Download from: https://www.docker.com/products/docker-desktop
   - Minimum requirements:
     - 8GB RAM allocated to Docker
     - 20GB free disk space
     - Docker Desktop running before launching the app

3. **Node.js 18 or later**
   ```bash
   # Check your Node.js version
   node --version
   
   # If you need to install/update Node.js:
   # Using Homebrew
   brew install node@18
   ```

4. **Anthropic API Key**
   - Get one at: https://console.anthropic.com/
   - You'll need this to use Claude

### Optional (for development)

- Git (for cloning and version control)
- VS Code or your preferred code editor

## Installation

### Step 1: Navigate to the Project

```bash
cd /Users/matheusrech/Downloads/claude-workspace
```

### Step 2: Install Dependencies

```bash
npm install
```

This will install all required packages including:
- Electron for the desktop app
- React for the UI
- Anthropic SDK for Claude API
- Docker SDK for container management
- And more...

### Step 3: Configure Environment

```bash
# Copy the example environment file
cp .env.example .env

# Edit the .env file with your settings
nano .env
```

Add your Anthropic API key:
```
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

### Step 4: Configure Skills Path

The app expects your Claude skills to be at:
```
/Users/matheusrech/Library/Application Support/Claude/skills
```

If your skills are elsewhere, update the `SKILLS_PATH` in `.env`:
```
SKILLS_PATH=/your/custom/skills/path
```

### Step 5: Build Docker Image

```bash
# Make sure Docker Desktop is running
open /Applications/Docker.app

# Build the container image (this may take 5-10 minutes)
cd docker
docker build -t claude-workspace:latest .
cd ..
```

## Running the Application

### Development Mode

For development with hot reload:

```bash
npm run dev
```

This will:
1. Start the Electron main process with TypeScript watching
2. Start the Vite dev server for the React UI
3. Open the application window
4. Enable Chrome DevTools

### Production Mode

To run the built application:

```bash
# Build everything
npm run build

# Start the app
npm start
```

### Building for Distribution

To create a Mac application bundle:

```bash
# Build and package
npm run package:mac

# The app will be in the 'release' folder
open release
```

You can then drag "Claude Workspace.app" to your Applications folder.

## First Launch

### 1. Start Docker Desktop

Before launching Claude Workspace, ensure Docker Desktop is running:
- Open Docker Desktop from Applications
- Wait for it to show "Docker Desktop is running"

### 2. Launch Claude Workspace

- Double-click the Claude Workspace app
- Or run `npm start` if in development

### 3. Configure API Key

On first launch:
1. Click the Settings icon in the sidebar
2. Enter your Anthropic API key
3. Set your preferred export location (default: /Users/matheusrech/Downloads)
4. Click "Save Settings"

### 4. Start Your First Session

1. Click "Start Claude Workspace" on the welcome screen
2. Wait for the Docker container to start (20-30 seconds on first run)
3. Once ready, you'll see the chat interface
4. Start chatting with Claude!

## Usage

### Chat Interface

- **Sending Messages**: Type in the input box and press Enter
- **Multi-line Input**: Press Shift+Enter for new lines
- **Computer Use**: Claude has full access to the Ubuntu container
- **MCP Servers**: All your configured servers are automatically available
- **Skills**: All your custom skills are pre-loaded

### File Management

1. Click the Files icon in the sidebar
2. Navigate through the container filesystem
3. Select files you want to keep
4. Click "Export to Mac" to save them to your Downloads folder

### Ending a Session

1. Click "End Session" in the header
2. Choose whether to save files
3. The container will be destroyed and cleaned up

## Troubleshooting

### Docker Issues

**Problem**: "Failed to start session"

**Solutions**:
```bash
# Check Docker is running
docker ps

# Restart Docker Desktop
killall Docker
open /Applications/Docker.app

# Check Docker resources
# Docker Desktop > Settings > Resources
# Ensure at least 8GB RAM and 4 CPUs allocated
```

### Build Issues

**Problem**: "Cannot find module 'dockerode'"

**Solution**:
```bash
# Clear node_modules and reinstall
rm -rf node_modules
npm install
```

**Problem**: "Docker image build failed"

**Solution**:
```bash
# Build manually with verbose output
cd docker
docker build -t claude-workspace:latest . --progress=plain

# Check for specific errors in output
```

### Container Issues

**Problem**: Container starts but can't connect

**Solution**:
```bash
# Check running containers
docker ps -a

# View container logs
docker logs claude-workspace-[SESSION_ID]

# Manually clean up stuck containers
docker rm -f $(docker ps -aq --filter "label=com.claude.workspace=true")
```

### API Issues

**Problem**: "Invalid API key" or "Authentication failed"

**Solutions**:
1. Verify your API key at https://console.anthropic.com/
2. Check there are no extra spaces in your API key
3. Ensure your API key has the correct permissions
4. Try regenerating your API key

### Skills Not Loading

**Problem**: Skills don't appear to be working

**Solutions**:
```bash
# Verify skills directory exists
ls -la "/Users/matheusrech/Library/Application Support/Claude/skills"

# Check skills are in config
cat config/skills.json

# Restart the app after adding new skills
```

## Advanced Configuration

### Custom MCP Servers

To add or modify MCP servers:

1. Edit `config/mcp-servers.json`
2. Add your server configuration:
```json
{
  "my-server": {
    "url": "https://my-server.com/mcp",
    "name": "My Custom Server",
    "enabled": true,
    "description": "My custom MCP server"
  }
}
```
3. Restart the application

### Custom Skills

To add new skills:

1. Create your skill in: `/Users/matheusrech/Library/Application Support/Claude/skills/user/my-skill/`
2. Add a `SKILL.md` file with documentation
3. Edit `config/skills.json`:
```json
{
  "name": "my-skill",
  "path": "/mnt/skills/user/my-skill",
  "description": "My custom skill",
  "enabled": true
}
```
4. Restart the application

### Docker Resources

To modify Docker resource limits:

Edit `config/docker-compose.yml`:
```yaml
deploy:
  resources:
    limits:
      cpus: '8'      # Increase CPU cores
      memory: 16G    # Increase memory
```

## Performance Tips

1. **Allocate More Resources to Docker**
   - Docker Desktop > Settings > Resources
   - Increase RAM to 12-16GB if available
   - Increase CPUs to 6-8 if available

2. **Keep Docker Images Updated**
   ```bash
   docker pull ubuntu:24.04
   docker build -t claude-workspace:latest ./docker
   ```

3. **Clean Up Old Containers**
   ```bash
   # Remove old session data
   rm -rf ~/.claude-workspace/sessions/*
   
   # Remove unused Docker resources
   docker system prune -a
   ```

4. **Monitor Resource Usage**
   ```bash
   # Check container resource usage
   docker stats
   ```

## Security Notes

- Your API key is stored locally in Electron's secure storage
- Containers are isolated from your main system
- Each session creates a fresh environment
- No data persists between sessions unless explicitly exported
- All network traffic goes through Docker's network isolation

## Getting Help

If you encounter issues:

1. Check the logs:
   ```bash
   # Application logs
   tail -f ~/Library/Logs/Claude\ Workspace/main.log
   
   # Docker logs
   docker logs [container-id]
   ```

2. Check GitHub issues (if applicable)

3. Contact support with:
   - macOS version
   - Docker version
   - Node.js version
   - Error messages from logs
   - Steps to reproduce the issue

## Updates

To update the application:

```bash
# Pull latest changes (if using git)
git pull

# Rebuild
npm install
npm run build
npm run package:mac
```

## Uninstallation

To completely remove Claude Workspace:

```bash
# Stop all containers
docker rm -f $(docker ps -aq --filter "label=com.claude.workspace=true")

# Remove Docker image
docker rmi claude-workspace:latest

# Remove session data
rm -rf ~/.claude-workspace

# Remove application
rm -rf "/Applications/Claude Workspace.app"

# Remove source code
rm -rf /Users/matheusrech/Downloads/claude-workspace
```

## Next Steps

Now that you're set up:

1. Try asking Claude to analyze a medical paper
2. Use the file manager to export your work
3. Experiment with different MCP servers
4. Customize your skills configuration
5. Build your research workflows

Happy coding with Claude! 🚀
