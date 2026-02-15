# Friday AI

An autonomous AI agent for your terminal. Chat with AI, build apps, research topics, automate tasks — all from the command line.

[![npm version](https://img.shields.io/npm/v/@tryfridayai/cli.svg)](https://www.npmjs.com/package/@tryfridayai/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **Autonomous Agent** — Friday can read files, write code, run commands, and iterate on tasks
- **Multi-Modal AI** — Generate images, videos, and audio with OpenAI, Google, and ElevenLabs
- **MCP Servers** — Extensible tool ecosystem via Model Context Protocol
- **Secure by Design** — API keys stored in system keychain, never exposed to agent
- **Scheduled Agents** — Automate recurring tasks with cron-based scheduling

## Quick Start

```bash
# Install globally
npm install -g @tryfridayai/cli

# Start chatting
friday chat

# Add API keys (stored securely in system keychain)
# Type /keys in chat to configure
```

## Requirements

- Node.js 18+
- At least one API key: Anthropic, OpenAI, or Google AI

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
| `/models` | List available AI models |
| `/schedule` | Manage scheduled agents |
| `/new` | Start new session |
| `/quit` | Exit |

## API Keys

Friday supports multiple AI providers. Add keys via `/keys` command:

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
│   ├── cli/                 # Command-line interface (@tryfridayai/cli)
│   │   ├── bin/             # Entry points
│   │   └── src/             # CLI source code
│   └── runtime/             # Agent runtime (friday-runtime)
│       ├── src/             # Runtime source code
│       ├── mcp-servers/     # MCP server implementations
│       └── providers/       # AI provider adapters
├── CHANGELOG.md             # Version history
├── CLAUDE.md                # AI assistant instructions
└── README.md                # This file
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
git clone https://github.com/tryfridayai/friday.git
cd friday

# Install dependencies
npm install

# Run CLI in development
node packages/cli/bin/friday.js chat
```

## Contributing

Contributions are welcome! Please read our contributing guidelines and submit PRs.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Links

- **Website**: [tryfriday.ai](https://tryfriday.ai)
- **npm**: [@tryfridayai/cli](https://www.npmjs.com/package/@tryfridayai/cli)
- **GitHub**: [tryfridayai/friday](https://github.com/tryfridayai/friday)
