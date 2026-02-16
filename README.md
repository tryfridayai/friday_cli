# Friday AI

An autonomous AI agent that works natively across all your devices. Multi-modal, connects to 30+ AI models, and can create applications, generate media, access your tools, and schedule tasks — from the terminal or the desktop.

[![npm version](https://img.shields.io/npm/v/@tryfridayai/cli.svg)](https://www.npmjs.com/package/@tryfridayai/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Architecture

Friday is built as three layers — a portable runtime that any client can use:

| Package | Description |
|---------|-------------|
| **`packages/runtime`** | **friday-runtime** — The core agent. Model routing, MCP servers, tool execution, permission sandboxing, streaming. Connects to 30+ models (OpenAI, Google, Anthropic, ElevenLabs). |
| **`packages/cli`** | **@tryfridayai/cli** — Terminal interface. Chat, generate media, run commands, manage plugins, schedule agents. Published on npm. |
| **`packages/desktop`** | **Friday AI: Studio** — Electron desktop app. Media creation studio with image/video/voice generation, gallery, live preview. |

## Features

- **Autonomous Agent** — Friday can read files, write code, run commands, and iterate on tasks
- **Multi-Modal AI** — Generate images (DALL-E, Imagen), videos (Sora, Veo), and audio (OpenAI TTS, ElevenLabs, Google WaveNet)
- **MCP Servers** — Extensible tool ecosystem via Model Context Protocol
- **Secure by Design** — API keys stored in system keychain, never exposed to agent
- **Scheduled Agents** — Automate recurring tasks with cron-based scheduling
- **Two Clients, One Runtime** — CLI and Desktop Studio both run on the same friday-runtime

## Quick Start

### CLI

```bash
# Install globally
npm install -g @tryfridayai/cli

# Start chatting
friday chat

# Add API keys (stored securely in system keychain)
# Type /keys in chat to configure
```

### Desktop (Friday AI: Studio)

```bash
# Clone the repo
git clone https://github.com/tryfridayai/friday_cli.git
cd friday_cli

# Install dependencies
npm install

# Run the desktop app in development
npm run dev:electron
```

The desktop app starts both the Vite dev server (React UI) and the Electron shell. It automatically spawns friday-runtime as a backend process.

## Requirements

- Node.js 18+
- At least one API key: Anthropic, OpenAI, or Google AI
- For desktop: macOS (native title bar), Linux, or Windows

## Commands

### Chat Mode
```bash
friday chat              # Start interactive chat
friday chat --verbose    # Show debug output
```

### Slash Commands (in chat)
| Command | Description |
|---------|-------------|
| `/help` | Show all commands |
| `/keys` | Add/update API keys (secure keychain storage) |
| `/status` | Session info, costs, capabilities |
| `/plugins` | Install/uninstall/list plugins |
| `/model` | Browse and toggle AI models |
| `/schedule` | Manage scheduled agents |
| `/new` | Start new session |
| `/quit` | Exit |

## API Keys

Friday supports multiple AI providers. Add keys via `/keys` (CLI) or Settings > API Keys (Desktop):

| Provider | Key | Capabilities |
|----------|-----|--------------|
| **Anthropic** | `ANTHROPIC_API_KEY` | Chat (Claude) |
| **OpenAI** | `OPENAI_API_KEY` | Chat, Images, Voice, Video |
| **Google AI** | `GOOGLE_API_KEY` | Chat, Images, Voice, Video |
| **ElevenLabs** | `ELEVENLABS_API_KEY` | Premium Voice |

Keys are stored securely in your system keychain (macOS Keychain, Windows Credential Manager, or Linux libsecret).

## Project Structure

```
friday/
├── packages/
│   ├── cli/                    # CLI package (@tryfridayai/cli)
│   │   ├── bin/                # Entry points (friday.js)
│   │   └── src/                # CLI source — commands, keystore, input
│   ├── runtime/                # Agent runtime (friday-runtime)
│   │   ├── src/                # Runtime, providers, sandbox, MCP credentials
│   │   ├── mcp-servers/        # MCP server implementations
│   │   └── friday-server.js    # Standalone server entry point
│   └── desktop/                # Electron desktop app (Friday AI: Studio)
│       ├── electron/           # Main process, preload, IPC handlers
│       ├── src/                # React UI — components, store, themes
│       │   ├── components/     # Chat, home, preview, settings, agents
│       │   ├── store/          # Zustand state management
│       │   └── lib/            # Themes, utilities
│       └── package.json
├── CHANGELOG.md                # Version history
├── CLAUDE.md                   # AI assistant instructions
└── README.md                   # This file
```

## MCP Servers

Friday uses the Model Context Protocol (MCP) for tool integration:

| Server | Purpose |
|--------|---------|
| `filesystem` | File read/write operations |
| `terminal` | Shell command execution |
| `github` | GitHub API integration |
| `friday-media` | Image/video/audio generation |
| `firecrawl` | Web scraping |
| `figma` | Design file access |
| `resend` | Email sending |
| `supabase` | Database operations |

## Security

Friday is designed with security as a priority:

- **Keychain Storage** — API keys stored in OS-level secure storage
- **Environment Filtering** — Sensitive keys never exposed to agent context
- **Command Sandboxing** — Dangerous commands blocked by pattern matching
- **Permission System** — User approval required for sensitive operations

## Development

```bash
# Clone the repo
git clone https://github.com/tryfridayai/friday_cli.git
cd friday_cli

# Install dependencies
npm install

# Run CLI in development
node packages/cli/bin/friday.js chat

# Run desktop app in development
npm run dev:electron
```

## Contributing

Contributions are welcome! Please read our contributing guidelines and submit PRs.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Links

- **Website**: [tryfriday.ai](https://tryfriday.ai)
- **npm**: [@tryfridayai/cli](https://www.npmjs.com/package/@tryfridayai/cli)
- **GitHub**: [tryfridayai/friday_cli](https://github.com/tryfridayai/friday_cli)
