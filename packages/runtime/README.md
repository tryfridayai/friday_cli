# friday-runtime

Self-contained agent runtime for Friday AI. Orchestrates Claude conversations, manages MCP servers, handles permissions, skills, and multi-modal AI providers.

This package can be published and consumed independently — no dependency on the Electron app.

## Directory Structure

```
packages/runtime/
├── index.js                      # Public API exports
├── friday-server.js              # Stdio entry point
├── server.js                     # HTTP/WebSocket server
├── .mcp.json                     # MCP server definitions & auth schemas
├── package.json
│
├── src/
│   ├── runtime/
│   │   ├── AgentRuntime.js       # Core agent orchestrator
│   │   └── RoleBasedAgentRuntime.js
│   ├── mcp/
│   │   └── McpCredentials.js     # Secure credential storage (keytar/file fallback)
│   ├── config.js                 # Config loader, template variable substitution
│   ├── skills/
│   │   ├── SkillManager.js       # Two-tier skill loading system
│   │   └── global/               # 27+ expertise markdown files
│   ├── agents/                   # Agent routing & configuration
│   ├── scheduled-agents/         # Background automation (cron-based)
│   ├── sessions/                 # Session persistence & history
│   ├── oauth/                    # OAuth flow handlers
│   └── sandbox/                  # Process sandboxing
│
├── providers/                    # Multi-modal AI providers
│   ├── ProviderRegistry.js       # Central provider management & MediaContext
│   ├── openai.js                 # OpenAI: GPT-5.2, gpt-image-1.5, Sora 2, TTS/STT
│   ├── google.js                 # Google: Gemini 3, Imagen 4, Veo 3.1, Cloud TTS/STT
│   └── elevenlabs.js             # ElevenLabs: Eleven v3, Flash v2.5, Turbo v2.5
│
├── mcp-servers/
│   ├── media-server.js           # MCP server: image/video/audio generation tools
│   ├── terminal-server.js        # MCP server: shell command execution
│   └── resend/                   # MCP server: email via Resend
│
├── config/
│   └── GlobalConfig.js           # Persistent user configuration
│
├── rules/
│   └── rules.json                # Agent behavior rules
│
└── docs/
    └── multi-modal-providers-plan.md
```

## Quick Start

```javascript
import { AgentRuntime, loadBackendConfig } from 'friday-runtime';

const config = await loadBackendConfig();
const runtime = new AgentRuntime({
  workspacePath: config.workspacePath,
  rules: config.rules,
  mcpServers: config.mcpServers,
  sessionsPath: config.sessionsPath,
});

runtime.on('message', (msg) => console.log(msg));
await runtime.handleQuery('Hello, Friday');
```

## Agent Loop

```
User Query → AgentRuntime.handleQuery()
  ├── 1. Build system prompt (with skills)
  ├── 2. Prepare MCP servers from .mcp.json
  ├── 3. Call Claude SDK query() with:
  │       ├── model, mcpServers, systemPrompt, canUseTool
  ├── 4. SDK spawns MCP servers, discovers tools via listTools()
  ├── 5. Claude decides which tools to use
  ├── 6. Permission gate checks each tool call
  ├── 7. Tool executes → result back to Claude
  └── 8. Stream response chunks to consumer
```

## MCP Servers

| Server | Purpose |
|--------|---------|
| **filesystem** | File read/write via @modelcontextprotocol/server-filesystem |
| **terminal** | Shell command execution (custom server) |
| **github** | GitHub API via @modelcontextprotocol/server-github |
| **friday-media** | Image gen, video gen, TTS, STT, multi-model queries |
| **firecrawl** | Web scraping |
| **figma** | Design file access |
| **resend** | Email sending |
| **discord/reddit/twitter** | Social platform APIs |
| **gmail/google-drive** | Google Workspace |
| **supabase** | Database operations |

## Multi-Modal Providers

The provider system enables image generation, video generation, TTS, STT, and multi-model chat:

| Capability | OpenAI | Google | ElevenLabs |
|------------|--------|--------|------------|
| **Image gen** | gpt-image-1.5 | Imagen 4 Ultra/Standard/Fast | — |
| **Video gen** | Sora 2 / Sora 2 Pro | Veo 3.1 / Veo 3.1 Fast | — |
| **TTS** | gpt-4o-mini-tts | Google Cloud TTS | Eleven v3, Flash v2.5 |
| **STT** | Whisper | Google Cloud STT | — |
| **Chat** | GPT-5.2 | Gemini 3 Pro/Flash | — |

Auto-selects best available provider based on API key availability and user preferences.

## Skills System

Two-tier expertise injection into system prompts:

- **Tier 1 — Expert Skills** (max 2): User-selected via `@mention` tags
- **Tier 2 — Internal Skills** (max 2): Agent-selected via `[REQUEST_SKILLS: ...]`

## Dependencies

| Package | Purpose |
|---------|---------|
| `@anthropic-ai/claude-agent-sdk` | Core agent SDK |
| `@anthropic-ai/sdk` | Anthropic API client |
| `@modelcontextprotocol/sdk` | MCP protocol |
| `openai` | OpenAI API (image, video, TTS, STT, chat) |
| `@google/genai` | Google Gemini, Imagen, Veo API |
| `@elevenlabs/elevenlabs-js` | ElevenLabs TTS API |
| `ws` | WebSocket support |
| `pino` | Structured logging |
| `zod` | Schema validation |

## Detailed Plans

- [Multi-Modal Providers Plan](docs/multi-modal-providers-plan.md) — Full architecture for image/video/audio capabilities
