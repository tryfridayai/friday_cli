# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
