#!/bin/bash

# Claude Workspace Container Entrypoint

echo "🚀 Starting Claude Workspace Environment..."

# Set up environment
export HOME=/home/claude
export USER=claude

# Display welcome message
cat << "EOF"
╔═══════════════════════════════════════════════════╗
║                                                   ║
║          Claude Workspace Environment             ║
║                                                   ║
║  Your personalized computer use environment       ║
║  with MCP servers and skills pre-configured       ║
║                                                   ║
╚═══════════════════════════════════════════════════╝
EOF

echo ""
echo "📂 Available directories:"
echo "  - /home/claude        : Your workspace"
echo "  - /mnt/user-data      : Data transfer area"
echo "  - /mnt/skills         : Your custom skills"
echo ""
echo "✅ Ready for Claude!"
echo ""

# Keep container running
exec "$@"
