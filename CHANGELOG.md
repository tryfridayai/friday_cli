# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### 2026-02-16

#### Fixed
- **Desktop: Image/media preview rendering** — Registered custom `friday-media://` Electron protocol to serve local files. The `file://` protocol is blocked by Chromium when the renderer loads from `http://localhost` in dev mode. Images, audio, and video now render correctly in the preview panel.
- **Desktop: Media preview detection** — Preview panel now detects media file paths (images, audio, video) from assistant text responses, not just tool_result messages. Fixes generated images not appearing in the preview panel.
- **Desktop: Friday-media shows "Requires setup" when keys already configured** — The Apps pane now cross-references keytar API keys (from the API Keys tab) with MCP servers that depend on them. Friday-media shows "Connected" when OpenAI/Google/ElevenLabs keys are already set, instead of redundantly asking for the same keys.
- **Desktop: Thinking state after permission approval** — After approving a permission request, the thinking spinner now shows while the agent continues processing, instead of appearing idle.
- **Desktop: Alternating thinking text** — Thinking indicator now cycles through phrases ("Thinking...", "Getting everything together...", "Processing your request...", etc.) with a spinning loader animation, instead of showing static "Thinking" text.
- **Desktop: 8-10 keychain prompts on startup** — Replaced 8 individual `keytar.getPassword()` calls (4 in BackendManager + 4 in get-api-key-status) with a single `keytar.findCredentials()` batch read at startup. Subsequent key status queries use the in-memory cache. Keychain prompts now only appear once at startup and once per key save/delete.

### 2026-02-15

#### Added
- **Desktop client (`packages/desktop`)** — Electron desktop app for Friday AI, powered by the same `packages/runtime` as the CLI. Features: React + Vite + Tailwind UI, Zustand state management, Framer Motion animations, streaming chat with markdown rendering, permission prompts, thinking/tool-use indicators, API key management via keytar (OS keychain), MCP app store with credential/OAuth flows, scheduled agents panel, media preview (image/audio/video), session history, theme system (dark/light/midnight), and macOS-native title bar. Demonstrates that `friday-runtime` can power any client interface.
- **Redesigned welcome screen** — Gemini CLI-inspired startup with ASCII art of the Friday logo (two vertical bars + block-letter FRIDAY), modern capability indicators (filled/empty circles for Chat, Images, Voice, Video), and streamlined hint line. Removed plugin focus, emoji icons, and box frame.
- **Bottom-pinned input bar** (`inputLine.js`) — User input is now pinned to the bottom of the terminal with a separator line, preventing output from overwriting or mixing with the input prompt. Uses ANSI scroll regions to confine agent output above the separator while the prompt stays fixed at the bottom row.
- **Command history** — Up/Down arrow keys cycle through the last 50 commands in a ring buffer. Full cursor editing (Left/Right, Home/End, Ctrl+A/E/U/K/W, Delete) supported.
- **`how-to-use-friday-cli.md`** — Comprehensive CLI documentation for Mintlify, covering all commands, models, plugins, use cases, and SEO-optimized sections for each model and plugin name.
- **`/model` command** — Interactive per-model enable/disable UI. Browse models by category (Chat, Image, Video, Voice, STT), see pricing and status, toggle individual models on/off. Replaces the old read-only `/models` list.

#### Changed
- **Token display shows chat tokens only** — Removed estimated cost from the post-response line. Now shows `chat: N tokens` instead of `$X.XX · N tokens`, since cost was only for the chat model and did not account for image/video/voice usage.

#### Fixed
- **Multi-line paste only sent first line** — Pasted text (which arrives as one `data` event with embedded newlines) is now joined into a single message instead of discarding all but the first line.
- **Permission prompts stacked with no navigation** — Multiple simultaneous `permission_request` messages are now queued and shown one at a time. Only one `selectOption` is active at any moment, preventing overlapping arrow-key input.
- **Denying a permission threw API errors** (`tool_use ids must be unique`) — Caused by concurrent `selectOption` prompts consuming each other's keystrokes. Fixed by the permission queue ensuring sequential handling.
- **`/model` pricing incomplete** — `formatModelPrice()` now shows high-res and 4K tiers for video models (e.g., `$0.40/sec ($0.60 4K)`), quality price ranges for image models (e.g., `$0.009-$0.133/image`), WaveNet/Neural2 tiers for Google TTS, and notes for chat model pricing.
- **Disabled model tracking** in `ProviderRegistry` — `toggleModel()`, `isModelDisabled()`, `getDisabledModels()` methods with persistence in `provider-preferences.json`
- **Model catalog API** — `getModelsForCapability()` returns enriched model list with pricing, default status, key availability, and disabled state
- **`formatModelPrice()` helper** — Human-readable pricing display for all model types (per token, per image, per second, per character, per minute)

#### Fixed
- **Corrected all model pricing in `models.json`** from official provider pricing pages (OpenAI, Google, ElevenLabs) as of 2026-02-15. Major corrections: Sora 2 $0.02→$0.10/sec, Veo 3.1 $0.035→$0.40/sec, GPT-5.2 $2.50→$1.75 input, gpt-4o-mini-tts changed to per-minute pricing, ElevenLabs switched to credit-based pricing, Google Imagen simplified to flat per-image rates

#### Changed
- **Provider resolution respects disabled models** — `resolveProvider()` skips providers where all models for a capability are disabled; `resolveModel()` skips disabled models and picks the next enabled one
- **Preferences file re-read on every access** — Removed cache guard in `_loadPreferences()` so MCP server picks up CLI changes without restart
- **`/models` renamed to `/model`** — Old name still works as an alias, along with `/m`

### 2025-02-15

#### Added
- `README.md` - Comprehensive project documentation with installation, usage, and features
- `CHANGELOG.md` - Version history tracking with date, category, and description format
- `CLAUDE.md` - AI assistant instructions for maintaining the project
- **Plugin awareness in system prompt** - Agent now knows about `/plugins`, `/keys` commands and available plugins. Will guide users to install plugins instead of searching the web.
- **Media generation awareness in system prompt** - Agent now knows about built-in `generate_image`, `generate_video`, `text_to_speech` tools and will use them directly instead of searching the web for APIs.

#### Fixed
- **Fixed askSecret function leaking input to readline buffer** - Secret input now properly clears readline buffer before and after collection to prevent API keys from being sent to agent
- **Fixed API key visibility during paste** - Raw mode is now set before prompt is displayed and input handler is attached first, preventing any key echoing during paste operations
- **Fixed askSecret capturing terminal escape sequences** - Escape sequences (arrow keys, etc.) are now properly filtered instead of being appended to secret input. This was corrupting plugin credentials stored in `~/.friday/plugins.json` with `\u001b` characters.
- **Improved restart instructions** - Restart hints now show clear steps: "1. Press Ctrl+C to exit, 2. Run `friday chat` to restart" with note that chat history auto-resumes

#### Changed
- **Upgraded OpenAI SDK** from `^5.0.0` to `^6.22.0` — adds `client.videos` API needed for video generation (Sora)
- **Fixed video generation download** — Used `client.videos.downloadContent()` instead of non-existent `status.url`. Videos were never written to disk previously.
- **Fixed video duration parameter** — API only accepts 4, 8, or 12 seconds. Was accepting 5-25, causing `400 invalid_value` errors. Now snaps to nearest valid value.

#### Security
- **Fixed API key exposure in agent context** - API keys are now filtered out of environment variables before being passed to the Claude SDK. The agent can no longer access sensitive keys like `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.
- **Fixed API key exposure in terminal commands** - Commands executed by the agent no longer have access to API keys. Running `env` or `echo $OPENAI_API_KEY` will not expose secrets.
- **Added secure keychain storage for API keys** - The `/keys` command now stores API keys in the system keychain (macOS Keychain, Windows Credential Manager, Linux libsecret) instead of plain text `.env` files.
- **Added API key input blocking** - Any input that matches API key patterns (OpenAI, Anthropic, Google) is now automatically blocked from being sent to the agent. This prevents accidental leakage from readline buffer issues.
- **Added slash command input isolation** - Input received during slash command processing (like `/keys`) is now ignored to prevent leaked buffer content from being sent as queries.

#### Added
- `packages/cli/src/secureKeyStore.js` - New secure key storage module using `keytar` for OS-level encryption
- `filterSensitiveEnv()` function in AgentRuntime.js, terminal-server.js, ProcessRegistry.js, and SubAgentRunner.js to sanitize environment variables

#### Changed
- `packages/cli/src/commands/chat/slashCommands.js` - `/keys` command now uses secure keychain storage with fallback to .env
- `packages/cli/src/commands/chat.js` - Loads API keys from secure storage on startup
- **Made friday-media a core server** - Media generation (images, videos, voice) now works automatically when API keys are set, no plugin installation required
- **Added OpenAI as video generation provider** - Video generation now supports both OpenAI (Sora) and Google (Veo)
- **Consolidated media plugins into AI Media** - Single plugin for all media capabilities with clearer naming
- `packages/runtime/src/runtime/AgentRuntime.js` - Environment passed to SDK is now sanitized
- `packages/runtime/mcp-servers/terminal-server.js` - Spawned processes use sanitized environment
- `packages/runtime/src/sandbox/ProcessRegistry.js` - All spawned processes use sanitized environment
- `packages/runtime/src/runtime/SubAgentRunner.js` - Subagents use sanitized environment

#### Dependencies
- Added `keytar@^7.9.0` to `packages/cli/package.json`

---

## [0.2.1] - 2025-02-15

### Added
- Initial npm release of `@tryfridayai/cli`
