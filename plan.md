# Friday CLI — Ship Plan

## How Users Install

```bash
npm install -g friday-cli
friday
```

First run triggers a setup wizard that asks for an Anthropic API key and configures the workspace.

## How to Publish

### Prerequisites (one-time)

1. Create an npm account at https://www.npmjs.com/signup
2. Log in from terminal: `npm login`
3. Verify the package names `friday-cli` and `friday-runtime` are available on npm. If taken, use scoped names (`@tryfridayai/cli`, `@tryfridayai/runtime`) — requires creating a free npm org.

### Publish Steps

```bash
# 1. Publish runtime first (CLI depends on it)
cd packages/runtime
npm publish

# 2. Publish CLI
cd ../cli
npm publish
```

### Updating

1. Bump version in `package.json` (both packages if runtime changed)
2. `npm publish` in each changed package

## How to Test Locally (before publishing)

```bash
# From the project root
npm install
npm install -g ./packages/cli

# Verify
friday --version
friday --help
friday
```

From any other directory:

```bash
npm install -g /absolute/path/to/runtime_friday/packages/cli
```

### For a new user testing from source

```bash
git clone https://github.com/tryfridayai/friday_cli.git
cd friday_cli
npm install
npm install -g ./packages/cli
friday
```

Requires Node.js >= 18 and an Anthropic API key.

## Architecture

```
npm install -g friday-cli
        │
        ├── friday-cli (the CLI package)
        │     bin/friday.js     → entry point, adds `friday` to PATH
        │     src/cli.js        → command router
        │     src/commands/     → chat, setup, plugins, schedule, serve, install, uninstall
        │
        └── friday-runtime (dependency, auto-installed)
              index.js          → public API
              friday-server.js  → stdio transport (spawned by CLI)
              server.js         → HTTP/WebSocket server
              src/              → AgentRuntime, skills, plugins, MCP, sessions, providers
              mcp-servers/      → terminal, media server scripts
              .mcp.json         → MCP server definitions
              rules/            → automation rules
```

The CLI spawns `friday-server.js` as a child process over stdio. The runtime handles Claude Agent SDK, MCP servers, permissions, and sessions.

## Package Details

| Package | Name | Files | Size (packed) |
|---------|------|-------|---------------|
| CLI | `friday-cli` | 15 files | ~27 KB |
| Runtime | `friday-runtime` | 93 files | ~259 KB |

---

## Changelog

### v0.2.0 (2026-02-15)

**CLI Chat UX Overhaul**
- Slash command system (`/help`, `/keys`, `/plugins`, `/models`, `/status`, `/config`, `/schedule`, etc.)
- Branded welcome screen with capability status (images, voice, video)
- Smart affordances — intent detection with missing-key hints
- Backward-compatible `:` commands with migration hint to `/`
- Interactive plugin install/uninstall from within chat
- API key management (`/keys`) with secret masking
- Model catalog display grouped by capability
- Prompt changed from `> ` to `f > ` with purple branding

**npm Installable Package**
- CLI publishable as `friday-cli` via `npm install -g friday-cli`
- Runtime publishable as `friday-runtime` (auto-installed as dependency)
- Postinstall welcome message with getting-started instructions
- Dynamic version reading from package.json
- `.mcp.json` and `@modelcontextprotocol/server-filesystem` added to runtime package

**Web Client**
- Single-file browser client (`web-client/index.html`) for testing runtime over WebSocket
- Handles streaming, tool use indicators, permission requests, cost display

**Runtime Improvements**
- Cost tracking with real token usage from Claude Agent SDK
- Arrow-key permission prompts (Allow / Allow for session / Deny)
- In-process media tools via internal MCP server
- Plugin system with catalog (14 plugins) and credential management
- Scheduled agents with cron support
- Sub-agent runner for parallel task execution
- Permission profiles (developer / safe / locked)
- Session persistence and resume

### v0.1.0

- Initial release
- AgentRuntime with Claude Agent SDK integration
- MCP server support (filesystem, terminal)
- Stdio and HTTP/WebSocket transports
- Basic CLI with chat command
