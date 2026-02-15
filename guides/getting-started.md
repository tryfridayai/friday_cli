# Getting Started with Friday

Friday is an autonomous AI agent runtime built on the Claude Agent SDK. It provides a CLI for local use and an HTTP/WebSocket server for remote clients.

## Quick Start (CLI)

```bash
# Install globally
npm install -g friday-cli

# First run — setup wizard
friday

# Chat with Friday
friday chat

# Install plugins
friday install github
friday install slack
friday plugins
```

## Quick Start (Self-Hosted Server)

```bash
# Clone and install
git clone https://github.com/tryfridayai/friday_cli.git
cd friday_cli
cd packages/runtime && npm install

# Set your API key
export ANTHROPIC_API_KEY=sk-ant-...

# Start the server
npm run serve
# → Listening on http://localhost:8787
```

Or with Docker:

```bash
docker compose up -e ANTHROPIC_API_KEY=sk-ant-...
```

## Configuration

Friday stores config in `~/.friday/`:

| File | Purpose |
|------|---------|
| `config.json` | Workspace path, model, setup state |
| `plugins.json` | Installed plugins and credentials |
| `permissions.json` | Permission profile and overrides |
| `provider-preferences.json` | Preferred providers per capability |

## Architecture

```
friday-cli (CLI)
  └── friday-runtime (core engine)
        ├── AgentRuntime      — Claude Agent SDK wrapper
        ├── PluginManager     — Install/manage integrations
        ├── PermissionManager — Tool approval gates
        ├── SessionStore      — Conversation persistence
        ├── CostTracker       — Token and cost tracking
        ├── TriggerRouter     — Event-driven agent triggers
        └── ProviderRegistry  — Multi-modal AI providers
```

## Using as a Library

```javascript
import { AgentRuntime, loadBackendConfig } from 'friday-runtime';

const config = await loadBackendConfig();
const runtime = new AgentRuntime({
  workspacePath: config.workspacePath,
  rules: config.rules,
  mcpServers: config.mcpServers,
  sessionsPath: config.sessionsPath,
});

runtime.on('message', (msg) => {
  if (msg.type === 'chunk') process.stdout.write(msg.text);
  if (msg.type === 'complete') console.log('\nDone.');
});

await runtime.handleQuery('Create a REST API in Express');
```

## WebSocket API

Connect to `ws://localhost:8787` and send JSON messages:

```json
// Send a query
{ "type": "query", "message": "Hello Friday", "session_id": "optional-id" }

// Receive streamed chunks
{ "type": "chunk", "text": "Here's..." }

// Receive completion
{ "type": "complete", "result": "...", "session_id": "...", "cost": { "estimated": 0.004 } }
```

## Permission Profiles

| Profile | Behavior |
|---------|----------|
| `developer` | Auto-approves file ops in workspace, asks for terminal |
| `safe` | Read-only auto-approved, asks for everything else |
| `locked` | Asks permission for every action |
| `headless` | For CI/containers — configurable per-tool |

## Plugin System

Plugins are MCP server integrations installed on demand:

```bash
friday install github     # Needs GITHUB_PERSONAL_ACCESS_TOKEN
friday install slack      # Needs SLACK_BOT_TOKEN, SLACK_TEAM_ID
friday install vercel     # No credentials needed
friday uninstall github
```

Only installed plugins load at runtime — keeping startup fast.
