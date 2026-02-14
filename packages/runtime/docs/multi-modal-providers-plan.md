# Multi-Modal Provider System — Implementation Plan

**Status:** Planning
**Created:** February 14, 2026
**Last Updated:** February 14, 2026

## Overview

Extend Friday AI's agent runtime with multi-modal capabilities (image generation, video generation, TTS, STT) across multiple AI providers (OpenAI, Google, ElevenLabs), exposed as tools the Claude agent can invoke during conversations.

## Design Principles

1. **Agent-driven** — Claude decides when to use these tools based on conversation context
2. **Provider-agnostic** — Each capability has a primary provider with fallbacks; user can set preferences
3. **Seamless context transfer** — Generated assets (images, audio, video) are referenced in conversation context so the agent can build on previous outputs
4. **MCP-native** — Exposed as a custom MCP server (`friday-media`) so the SDK discovers tools automatically
5. **Credential-unified** — API keys stored via the existing `McpCredentials` system

## Latest Models (as of February 2026)

### OpenAI
| Capability | Model | Model ID | Notes |
|------------|-------|----------|-------|
| Chat | GPT-5.2 | `gpt-5.2` | Flagship; replaces GPT-5.1 |
| Chat (coding) | GPT-5.2 Codex | `gpt-5.2-codex` | Coding-optimized variant |
| Chat (deep reasoning) | GPT-5.2 Pro | `gpt-5.2-pro` | More compute, harder problems |
| Image gen | GPT Image 1.5 | `gpt-image-1.5` | Latest; 4x faster, better instruction following |
| Image gen (small) | GPT Image 1 Mini | `gpt-image-1-mini` | Cost-effective |
| Video gen | Sora 2 | `sora-2` | v1/videos API; temporal coherence |
| Video gen (quality) | Sora 2 Pro | `sora-2-pro` | Higher fidelity |
| TTS | GPT Audio | `gpt-audio-mini` | Cost-efficient speech |
| Realtime audio | GPT Realtime | `gpt-realtime-mini` | Speech-to-speech |

### Google
| Capability | Model | Model ID | Notes |
|------------|-------|----------|-------|
| Chat | Gemini 3 Pro | `gemini-3-pro` | Preview; reasoning-first, 1M context |
| Chat (fast) | Gemini 3 Flash | `gemini-3-flash` | Preview; fast + strong reasoning |
| Chat (budget) | Gemini 2.5 Flash-Lite | `gemini-2.5-flash-lite` | GA; low-cost |
| Image gen | Imagen 4 Ultra | `imagen-4-ultra` | GA; highest fidelity |
| Image gen | Imagen 4 Standard | `imagen-4` | GA; balanced |
| Image gen (fast) | Imagen 4 Fast | `imagen-4-fast` | GA; quick generation |
| Video gen | Veo 3.1 | `veo-3.1` | Paid preview; native audio, 4K |
| Video gen (fast) | Veo 3.1 Fast | `veo-3.1-fast` | Paid preview; lower latency |
| Video gen | Veo 3 | `veo-3` | GA; lower pricing |
| TTS | Google Cloud TTS | `google-tts` | 220+ voices, 40+ languages |
| STT | Google Cloud STT | `google-stt` | V2 API, streaming support |

### ElevenLabs
| Capability | Model | Model ID | Notes |
|------------|-------|----------|-------|
| TTS (expressive) | Eleven v3 | `eleven_v3` | Newest; sighs, whispers, laughs |
| TTS (low-latency) | Flash v2.5 | `eleven_flash_v2_5` | ~75ms latency, real-time |
| TTS (balanced) | Turbo v2.5 | `eleven_turbo_v2_5` | ~250ms, good quality |
| TTS (multilingual) | Multilingual v2 | `eleven_multilingual_v2` | 32 languages |
| TTS (conversational) | v3 Conversational | `eleven_v3_conversational` | Optimized for agent dialogue |
| Dialogue | Text to Dialogue | — | Multi-speaker with transitions |
| Voice cloning | Instant Voice Clone | — | Clone from audio sample |

## Architecture

### File Structure

```
backend_new/
├── providers/
│   ├── ProviderRegistry.js       # Central registry, config, credential access
│   ├── openai.js                 # OpenAI provider implementation
│   ├── google.js                 # Google/Gemini provider implementation
│   └── elevenlabs.js             # ElevenLabs provider implementation
│
├── mcp-servers/
│   └── media-server.js           # MCP server exposing all media tools
│
└── .mcp.json                     # Add friday-media server entry
```

### Provider Registry

```javascript
// ProviderRegistry.js — manages provider instances, API keys, preferences

class ProviderRegistry {
  constructor(credentialStore) { ... }

  // Get the preferred provider for a capability
  getProvider(capability, preferredProvider = null) { ... }

  // User preference storage: { imageGen: 'openai', tts: 'elevenlabs', ... }
  setPreference(capability, providerId) { ... }
  getPreference(capability) { ... }

  // API key management (delegates to McpCredentials)
  setApiKey(providerId, apiKey) { ... }
  getApiKey(providerId) { ... }

  // List available providers for a capability
  listProviders(capability) { ... }
}
```

### MCP Server: `friday-media`

A single MCP server exposes all media tools to the Claude SDK:

```javascript
// media-server.js — MCP server with tools for image/video/audio

tools = [
  {
    name: "generate_image",
    description: "Generate an image from a text prompt",
    inputSchema: {
      prompt: string,           // Required: image description
      provider: enum?,          // Optional: 'openai' | 'google' (auto-selects if omitted)
      model: string?,           // Optional: specific model ID override
      size: enum?,              // '1024x1024', '1536x1024', '1024x1536'
      style: enum?,             // 'natural', 'vivid' (OpenAI) / 'photographic', 'digital-art' (Google)
      quality: enum?,           // 'standard', 'hd', 'ultra'
      n: number?               // Number of images (1-4)
    }
  },
  {
    name: "generate_video",
    description: "Generate a video from a text prompt or image",
    inputSchema: {
      prompt: string,           // Required: video description
      provider: enum?,          // 'openai' | 'google'
      model: string?,           // Specific model override
      duration: number?,        // Duration in seconds (5-60)
      resolution: enum?,        // '720p', '1080p', '4k'
      aspect_ratio: enum?,      // '16:9', '9:16', '1:1'
      image_url: string?        // Optional: image-to-video input
    }
  },
  {
    name: "text_to_speech",
    description: "Convert text to natural-sounding speech audio",
    inputSchema: {
      text: string,             // Required: text to speak
      provider: enum?,          // 'openai' | 'elevenlabs' | 'google'
      voice: string?,           // Voice ID or name
      model: string?,           // Specific model override
      speed: number?,           // Playback speed (0.25-4.0)
      output_format: enum?      // 'mp3', 'wav', 'ogg', 'pcm'
    }
  },
  {
    name: "speech_to_text",
    description: "Transcribe audio to text",
    inputSchema: {
      audio_path: string,       // Required: path to audio file
      provider: enum?,          // 'openai' | 'google'
      language: string?,        // ISO 639-1 language code
      timestamps: boolean?      // Include word-level timestamps
    }
  },
  {
    name: "query_model",
    description: "Query an external AI model (OpenAI GPT-5.2, Google Gemini 3)",
    inputSchema: {
      prompt: string,           // Required: the query
      provider: enum,           // Required: 'openai' | 'google'
      model: string?,           // Specific model (defaults to best available)
      system_prompt: string?,   // Optional system context
      temperature: number?,     // 0.0-2.0
      max_tokens: number?,      // Max response tokens
      image_url: string?        // Optional image for vision queries
    }
  },
  {
    name: "list_voices",
    description: "List available TTS voices for a provider",
    inputSchema: {
      provider: enum?           // 'openai' | 'elevenlabs' | 'google'
    }
  },
  {
    name: "clone_voice",
    description: "Create a voice clone from audio samples (ElevenLabs)",
    inputSchema: {
      name: string,             // Name for the cloned voice
      audio_paths: string[],    // Paths to audio samples
      description: string?      // Voice description
    }
  }
]
```

### Context Transfer (Seamless)

Generated assets are tracked in a session-scoped context object so the agent can reference and build on previous outputs:

```javascript
// Context Transfer System
class MediaContext {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.assets = [];  // Ordered history of generated assets
  }

  addAsset(asset) {
    // {
    //   id: 'img_abc123',
    //   type: 'image' | 'video' | 'audio',
    //   provider: 'openai',
    //   model: 'gpt-image-1.5',
    //   prompt: 'A sunset over mountains',
    //   path: '/workspace/generated/img_abc123.png',
    //   url: 'https://...', // if remote
    //   metadata: { width: 1024, height: 1024, duration: null },
    //   createdAt: Date
    // }
    this.assets.push(asset);
  }

  // Inject into system prompt so agent knows what it has generated
  getContextSummary() {
    return this.assets.map(a =>
      `[${a.type}:${a.id}] "${a.prompt}" → ${a.path} (${a.provider}/${a.model})`
    ).join('\n');
  }

  // Get asset by ID for referencing in follow-up requests
  getAsset(id) { ... }

  // Get the most recent asset of a given type
  getLatest(type) { ... }
}
```

**How context flows:**
1. User asks "generate an image of a sunset"
2. Agent calls `generate_image` tool → image saved to `{workspace}/generated/img_001.png`
3. `MediaContext.addAsset(...)` stores the reference
4. On next query, context summary injected into system prompt
5. User says "now make it a video" → agent can reference `img_001` and call `generate_video` with the image as input
6. User says "add narration" → agent calls `text_to_speech` and knows the video context

### Output Directory

Generated files stored at `{workspace}/generated/`:

```
{workspace}/generated/
├── images/
│   ├── img_abc123.png
│   └── img_def456.png
├── videos/
│   ├── vid_ghi789.mp4
│   └── vid_jkl012.mp4
└── audio/
    ├── tts_mno345.mp3
    └── stt_pqr678.txt     # Transcription output
```

### .mcp.json Entry

```json
{
  "friday-media": {
    "command": "node",
    "args": ["mcp-servers/media-server.js"],
    "env": {
      "OPENAI_API_KEY": "${OPENAI_API_KEY}",
      "GOOGLE_API_KEY": "${GOOGLE_API_KEY}",
      "ELEVENLABS_API_KEY": "${ELEVENLABS_API_KEY}",
      "WORKSPACE_PATH": "${WORKSPACE_PATH}",
      "MEDIA_OUTPUT_DIR": "${WORKSPACE_PATH}/generated"
    },
    "metadata": {
      "name": "Friday Media",
      "description": "Image generation, video generation, TTS, STT, and multi-model queries",
      "icon": "sparkles"
    },
    "auth": {
      "type": "multi-key",
      "keys": [
        { "id": "OPENAI_API_KEY", "label": "OpenAI API Key", "required": true },
        { "id": "GOOGLE_API_KEY", "label": "Google AI API Key", "required": false },
        { "id": "ELEVENLABS_API_KEY", "label": "ElevenLabs API Key", "required": false }
      ]
    }
  }
}
```

### Provider Preference Storage

User preferences stored in `~/.friday-ai/provider-preferences.json`:

```json
{
  "imageGen": { "provider": "openai", "model": "gpt-image-1.5" },
  "videoGen": { "provider": "google", "model": "veo-3.1" },
  "tts": { "provider": "elevenlabs", "model": "eleven_v3" },
  "stt": { "provider": "openai", "model": "whisper-1" },
  "chat": { "provider": "openai", "model": "gpt-5.2" }
}
```

When no preference is set, auto-selection priority:

| Capability | Priority 1 | Priority 2 | Priority 3 |
|------------|-----------|-----------|-----------|
| Image gen | OpenAI gpt-image-1.5 | Google Imagen 4 | — |
| Video gen | Google Veo 3.1 | OpenAI Sora 2 | — |
| TTS | ElevenLabs Eleven v3 | OpenAI gpt-audio-mini | Google Cloud TTS |
| STT | OpenAI Whisper | Google Cloud STT | — |
| Chat/query | OpenAI GPT-5.2 | Google Gemini 3 Pro | — |

## Implementation Phases

### Phase 1: Foundation (Current Sprint)
- [x] Document current architecture (backend README)
- [x] Create implementation plan (this document)
- [ ] Implement `ProviderRegistry.js` — credential management, preference storage
- [ ] Implement `openai.js` — OpenAI SDK wrapper for all capabilities
- [ ] Implement `google.js` — Google AI SDK wrapper for all capabilities
- [ ] Implement `elevenlabs.js` — ElevenLabs SDK wrapper for TTS
- [ ] Create `media-server.js` — MCP server exposing all tools
- [ ] Add `friday-media` entry to `.mcp.json`
- [ ] Wire up `MediaContext` for seamless context transfer

### Phase 2: Frontend Integration
- [ ] Add API key inputs for OpenAI, Google, ElevenLabs to Settings > API Keys pane
- [ ] Add provider preference dropdowns to Settings
- [ ] Add media asset preview in chat (inline images, audio player, video player)
- [ ] Add "Generated Assets" panel to workspace sidebar

### Phase 3: Advanced Features
- [ ] Voice cloning (ElevenLabs Instant Voice Clone)
- [ ] Image-to-video pipeline (generate image → animate)
- [ ] Multi-speaker dialogue (ElevenLabs Text to Dialogue API)
- [ ] Real-time voice mode (OpenAI Realtime API)
- [ ] Batch generation (multiple images/variations at once)
- [ ] Cost tracking & usage dashboard per provider

## Dependencies to Add

```json
{
  "openai": "^5.x",
  "@google/genai": "^1.x",
  "elevenlabs": "^1.x"
}
```

## Security Considerations

- API keys stored via `McpCredentials` (OS keychain / encrypted file), never in plaintext config
- Generated content saved locally in workspace, never uploaded to Friday servers
- Provider API calls made directly from user's machine (desktop app, no proxy)
- Rate limiting handled per-provider with exponential backoff
- File size limits enforced (images: 20MB, video: 500MB, audio: 100MB)

## Sources

- [OpenAI Models](https://platform.openai.com/docs/models)
- [GPT-5.2](https://platform.openai.com/docs/models/gpt-5.2)
- [GPT Image 1.5](https://platform.openai.com/docs/models/gpt-image-1.5)
- [OpenAI Image Generation Guide](https://platform.openai.com/docs/guides/image-generation)
- [OpenAI Changelog](https://platform.openai.com/docs/changelog)
- [Google Gemini Models](https://ai.google.dev/gemini-api/docs/models)
- [Google Imagen](https://ai.google.dev/gemini-api/docs/imagen)
- [Veo 3.1 Announcement](https://developers.googleblog.com/introducing-veo-3-1-and-new-creative-capabilities-in-the-gemini-api/)
- [ElevenLabs Models](https://elevenlabs.io/docs/overview/models)
- [Eleven v3 Announcement](https://elevenlabs.io/blog/eleven-v3)
- [ElevenLabs TTS Docs](https://elevenlabs.io/docs/overview/capabilities/text-to-speech)
