# Friday CLI

Autonomous AI agent for your terminal. Chat, generate images, create videos, produce voice — all from the command line.

## Install

```bash
npm install -g @tryfridayai/cli
```

Requires Node.js 18+.

## Quick Start

```bash
# Start chatting
friday chat

# Add API keys (stored in system keychain)
friday chat
/keys
```

You need at least one API key to get started:

| Key | Enables |
|-----|---------|
| `ANTHROPIC_API_KEY` | Chat (Claude) |
| `OPENAI_API_KEY` | Chat, Images, Video, Voice |
| `GOOGLE_API_KEY` | Chat, Images, Video, Voice |
| `ELEVENLABS_API_KEY` | Voice |

## Features

### Chat

Conversational AI powered by Claude, GPT, and Gemini. Sessions auto-resume — close and reopen without losing context.

```
> explain this codebase
> build a landing page for my app
> find and fix the bug in auth.js
```

### Image Generation

Generate images with DALL-E, GPT Image, and Google Imagen.

```
> generate an image of a mountain sunset
> create a logo for my startup
```

### Video Generation

Create videos with OpenAI Sora and Google Veo.

```
> generate a 10-second video of ocean waves
```

### Voice

Text-to-speech with OpenAI TTS, Google Cloud TTS, and ElevenLabs.

```
> read this paragraph aloud
> generate speech in a warm friendly tone
```

## Commands

Type these in the chat:

| Command | Description |
|---------|-------------|
| `/help` | Show all commands |
| `/keys` | Add or manage API keys |
| `/model` | Enable/disable models, see pricing |
| `/plugins` | Install plugins (GitHub, Figma, email, etc.) |
| `/config` | View and edit settings |
| `/clear` | Clear chat history |
| `/quit` | Exit |

## Models

### Chat Models
- Claude 4 Sonnet / Opus (Anthropic)
- GPT-5.2 / GPT-4o (OpenAI)
- Gemini 3 Pro / Flash (Google)

### Image Models
- GPT Image 1.5 (OpenAI)
- Imagen 4 Ultra / Standard / Fast (Google)

### Video Models
- Sora 2 / Sora 2 Pro (OpenAI)
- Veo 3.1 / Veo 3.1 Fast (Google)

### Voice Models
- GPT-4o Mini TTS (OpenAI)
- Google Cloud TTS (WaveNet, Neural2, Standard)
- ElevenLabs Eleven v3, Flash v2.5, Turbo v2.5

## Plugins

Extend Friday with MCP-based plugins:

```
/plugins
```

Available plugins: GitHub, Figma, Firecrawl, Resend (email), Discord, Reddit, Twitter, Gmail, Google Drive, Supabase, and more.

## Architecture

The CLI (`@tryfridayai/cli`) is a thin interface over the runtime (`friday-runtime`). The runtime handles agent orchestration, MCP servers, permissions, sessions, and provider management.

```
friday chat
  └── CLI (this package)
        └── friday-runtime
              ├── Claude Agent SDK
              ├── MCP Servers (filesystem, terminal, media, plugins)
              └── AI Providers (OpenAI, Google, ElevenLabs)
```

## Links

- Website: [tryfriday.ai](https://tryfriday.ai)
- Documentation: [docs.tryfriday.ai](https://docs.tryfriday.ai)
- GitHub: [github.com/tryfridayai/friday_cli](https://github.com/tryfridayai/friday_cli)

## License

MIT
