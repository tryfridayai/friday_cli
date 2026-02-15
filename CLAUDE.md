# Claude Code Instructions

This file contains project-specific instructions for Claude Code when working on this codebase.

## Project Overview

**Friday AI** - An autonomous AI agent for the terminal. Includes:
- `packages/cli` - Command-line interface (`@tryfridayai/cli`)
- `packages/runtime` - Agent runtime with MCP servers (`friday-runtime`)

## Changelog Requirements

**IMPORTANT: Always update CHANGELOG.md after every change.**

After making any code changes, update `/CHANGELOG.md` with:
1. **Date** - Use format `YYYY-MM-DD` (e.g., `2025-02-15`)
2. **Category** - One of: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`
3. **Description** - Brief description of the change

### Example Entry

```markdown
### 2025-02-15

#### Added
- New feature description here

#### Fixed
- Bug fix description here

#### Security
- Security fix description here
```

### Categories

- **Added** - New features
- **Changed** - Changes in existing functionality
- **Deprecated** - Soon-to-be removed features
- **Removed** - Removed features
- **Fixed** - Bug fixes
- **Security** - Vulnerability fixes

## Project Structure

```
runtime_friday/
├── packages/
│   ├── cli/                    # CLI package
│   │   ├── bin/                # Entry points
│   │   ├── src/
│   │   │   ├── commands/       # Command implementations
│   │   │   │   └── chat/       # Chat command modules
│   │   │   ├── secureKeyStore.js  # Secure API key storage
│   │   │   └── cli.js          # Main CLI entry
│   │   └── package.json
│   └── runtime/                # Runtime package
│       ├── src/
│       │   ├── runtime/        # Agent runtime
│       │   ├── mcp/            # MCP credentials
│       │   ├── providers/      # AI provider adapters
│       │   └── sandbox/        # Process sandboxing
│       ├── mcp-servers/        # MCP server implementations
│       └── friday-server.js    # Main server entry
├── CHANGELOG.md                # Change log (UPDATE AFTER EVERY CHANGE)
└── CLAUDE.md                   # This file
```

## Security Guidelines

1. **Never expose API keys to the agent** - All environment variables passed to the SDK or spawned processes must be filtered using `filterSensitiveEnv()`
2. **Store secrets in keychain** - Use `secureKeyStore.js` for API key storage, never plain text files
3. **Validate command inputs** - Check for dangerous patterns before executing shell commands

## Common Tasks

### Adding a new API key type
1. Update `SENSITIVE_ENV_PATTERNS` in:
   - `packages/runtime/src/runtime/AgentRuntime.js`
   - `packages/runtime/mcp-servers/terminal-server.js`
   - `packages/runtime/src/sandbox/ProcessRegistry.js`
   - `packages/runtime/src/runtime/SubAgentRunner.js`
2. Update `API_KEYS` in `packages/cli/src/secureKeyStore.js`
3. Update CHANGELOG.md

### Testing changes
```bash
# In packages/cli
npm install
npm test

# Run the CLI
node bin/friday.js chat
```
