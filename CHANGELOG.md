# Changelog

All notable changes to Claude Workspace will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-01-05

### Initial Release

#### Added
- **Core Application**
  - Electron-based Mac desktop application
  - React + TypeScript + Tailwind CSS UI
  - Docker container management system
  - Session lifecycle management
  - Non-persistent session model

- **Chat Interface**
  - Real-time text conversation with Claude
  - Multi-line input support
  - Message history within session
  - Send with Enter, multi-line with Shift+Enter

- **File Manager**
  - Browse container filesystem
  - Multi-file selection
  - Export files to Mac
  - Quick navigation shortcuts
  - File size and permissions display

- **Settings Management**
  - API key configuration
  - Default export location setting
  - Voice mode toggle (for future use)
  - MCP server status display
  - Skills overview

- **MCP Integration**
  - 25 MCP servers pre-configured
  - Automatic server initialization
  - Connection status monitoring
  - Enable/disable per server
  - Authenticated server support (Hugging Face)

- **Skills System**
  - 60+ custom skills pre-loaded
  - Read-only skills mounting
  - Automatic skill discovery
  - Three skill categories: user, public, examples

- **Container Environment**
  - Ubuntu 24.04 base
  - Python 3.12 with scientific packages
  - R 4.x environment
  - Node.js 20
  - Pre-installed medical research tools
  - Pre-installed ML/AI packages

- **Security Features**
  - Container runs as non-root user
  - no-new-privileges security option
  - Bridge network isolation
  - Read-only skills mounting
  - Secure API key storage

- **Documentation**
  - README.md: Project overview
  - SETUP.md: Installation guide
  - ARCHITECTURE.md: Technical documentation
  - FEATURES.md: Complete feature list
  - SUMMARY.md: Quick reference
  - CHANGELOG.md: Version history

- **Development Tools**
  - TypeScript configuration
  - ESLint setup
  - Hot module replacement
  - Development and production builds
  - Mac application packaging

#### Configured
- **User Preferences**
  - Output path: /Users/matheusrech/Downloads
  - No em dashes in text
  - Brazilian Portuguese locale
  - Medical research focus

- **MCP Servers**
  - Zapier (2 instances)
  - Model Inference
  - DeepWiki
  - SimpleScraper
  - Hugging Face (authenticated)
  - Cloudflare Workers
  - Cloudflare Observability
  - Scorecard
  - Remote MCP Server
  - Auth0
  - Notion
  - Canva
  - Invideo
  - Netlify
  - Vercel
  - Jam
  - Stytch
  - Learning Commons Knowledge Graph
  - Java Docs
  - Figma
  - N8N
  - PubMed
  - BioRender
  - Scholar Gateway

- **User Skills** (40 skills)
  - transformers
  - statistical-analysis
  - scikit-survival
  - scikit-learn
  - shap
  - pymc-bayesian-modeling
  - pymatgen
  - pyhealth
  - pufferlib
  - plotly
  - polars
  - neurokit2
  - neuropixels-analysis
  - pathml
  - pubmed-database
  - pydicom
  - networkx
  - modal
  - matchms
  - iso-13485-certification
  - hypogenic
  - geopandas
  - fda-database
  - exploratory-data-analysis
  - denario
  - deeptools
  - astropy
  - aeon
  - content-research-writer
  - meeting-insights-analyzer
  - video-downloader
  - notion-knowledge-capture
  - notion-meeting-intelligence
  - notion-spec-to-implementation
  - creating-financial-models
  - real-time-features
  - skill-writer
  - neuroimaging-segmentation
  - gradio-app-builder
  - notion-research-documentation
  - medical-qa-extraction
  - pdf-annotation-provenance
  - cerebellar-study-extraction
  - citation-processing
  - medical-paper-extraction
  - meta-analysis-workflow
  - image-enhancer
  - file-organizer
  - template-skill
  - webapp-testing

- **Public Skills** (6 skills)
  - docx
  - pdf
  - pptx
  - xlsx
  - product-self-knowledge
  - frontend-design

- **Example Skills** (10 skills)
  - doc-coauthoring
  - web-artifacts-builder
  - skill-creator
  - theme-factory
  - mcp-builder
  - internal-comms
  - canvas-design
  - brand-guidelines
  - slack-gif-creator
  - algorithmic-art

#### Technical Details
- **Framework**: Electron 28
- **UI**: React 18, TypeScript 5, Tailwind CSS 3
- **Container**: Docker, Ubuntu 24.04
- **API**: Anthropic Claude Sonnet 4
- **Build**: Vite, electron-builder
- **Package Manager**: npm

### Known Issues
- Voice mode UI implemented but not functional (waiting for API support)
- Google Drive export not yet implemented
- Windows/Linux support not available

### Performance
- Container startup: 20-30 seconds
- First message: <2 seconds
- File operations: <1 second
- Memory usage: 200-500MB (app) + 2-8GB (container)

## [Unreleased]

### Planned Features
- **Voice Mode** (Q1 2026)
  - Real-time speech-to-text
  - Text-to-speech output
  - Natural conversation flow
  - Low-latency processing

- **Google Drive Integration** (Q1 2026)
  - Direct upload to Drive
  - Organize by session
  - Share links
  - Automatic backup

- **Enhanced Monitoring** (Q2 2026)
  - Resource usage graphs
  - Performance metrics
  - Cost tracking
  - Usage analytics

- **Session Persistence** (Q2 2026)
  - Optional save container state
  - Resume previous sessions
  - Incremental backups
  - Session templates

- **Collaborative Features** (Q3 2026)
  - Share sessions
  - Team workspaces
  - Real-time collaboration
  - Shared skills repository

### Under Consideration
- Windows support
- Linux support
- Mobile companion app
- Cloud sync
- Plugin marketplace
- Custom themes
- Workflow templates
- Automated testing
- CI/CD integration
- Multi-language support

## Version History Format

### [X.Y.Z] - YYYY-MM-DD

#### Added
- New features

#### Changed
- Changes to existing functionality

#### Deprecated
- Features that will be removed

#### Removed
- Features that were removed

#### Fixed
- Bug fixes

#### Security
- Security improvements

---

## Support

For issues, feature requests, or questions about changes:
- Review this changelog for recent updates
- Check SETUP.md for troubleshooting
- Check ARCHITECTURE.md for technical details
- Create detailed bug reports with version info
