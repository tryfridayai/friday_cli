# Friday Agent — Architecture v0.2

**Status:** Proposal
**Author:** Amogh Mundhekar
**Date:** February 14, 2026
**Branch:** `agent_v0.2`

---

## Table of Contents

1. [What Friday Is](#1-what-friday-is)
2. [Honest Assessment of v0.1](#2-honest-assessment-of-v01)
3. [Core Principles for v0.2](#3-core-principles-for-v02)
4. [Use Cases](#4-use-cases)
5. [CLI Tools vs MCP: Decision Framework](#5-cli-tools-vs-mcp-decision-framework)
6. [Target Architecture](#6-target-architecture)
7. [Plugin System](#7-plugin-system)
8. [Permission System](#8-permission-system)
9. [CLI Design](#9-cli-design)
10. [Runtime API for Services](#10-runtime-api-for-services)
11. [Scheduled Agents & Triggers](#11-scheduled-agents--triggers)
12. [Multi-Modal Providers](#12-multi-modal-providers)
13. [Subagent System](#13-subagent-system)
14. [Documentation Plan](#14-documentation-plan)
15. [Implementation Plan](#15-implementation-plan)
16. [Migration from v0.1](#16-migration-from-v01)

---

## 1. What Friday Is

Friday is an **autonomous agent runtime** — not a chatbot, not a CLI tool, not an app. It's the engine that powers AI agents across every surface.

**The runtime** is the core product. Everything else is an interface to it:

| Interface | How it uses the runtime |
|-----------|------------------------|
| **CLI** (`friday chat`) | Interactive terminal agent for developers and non-developers |
| **Desktop app** (Electron) | Imports runtime as a library, renders in a native window |
| **iOS app** | Connects to runtime's HTTP/WebSocket API |
| **Web app** | Connects to runtime's HTTP/WebSocket API |
| **Containers** | Runs runtime in headless server mode |
| **Third-party apps** | Import `@friday/runtime` as an npm package, call `runtime.query()` |

**What makes Friday different from Claude Code or Codex:**

1. **Batteries-included** — Ships with pre-configured agents, skills, and integrations. Not a blank canvas.
2. **Multi-model** — Orchestrates across Claude, GPT, Gemini, ElevenLabs. Users pick per-task.
3. **Platform, not a tool** — Same agents, skills, sessions sync across CLI, desktop, mobile, containers.
4. **Event-driven** — Agents run on webhooks, schedules, file changes — not just when a human types.
5. **MCP orchestration** — Easiest way to connect AI to your tools. One command to add GitHub, Slack, etc.

---

## 2. Honest Assessment of v0.1

### What works
- Core agent loop (Claude SDK, session management, permission gating, skill injection)
- Session persistence (JSONL event log, metadata index)
- Skill system (two-tier, markdown-based, project detection)
- Scheduled agents (cron-based, catch-up on missed runs)
- Credential storage (keytar with file fallback)
- CLI spawns runtime and chat works end-to-end

### What's broken

#### 2.1 Terrible first-run experience
User runs `friday chat`, sees 15 MCP servers fail with "Connection closed." The agent works but the output screams "broken." Non-coders would close the terminal immediately.

#### 2.2 Everything bundled, nothing optional
`openai`, `@google/genai`, `@elevenlabs/elevenlabs-js` are hard dependencies. 15 MCP servers configured by default in `.mcp.json`. A user who just wants to chat with Claude pays for 50MB+ of SDKs they'll never use.

#### 2.3 Media tools as MCP server is wrong
Current flow: Agent → SDK → stdio → MCP child process → provider SDK → API call. That's 3 layers of IPC for what should be a function call. The Claude Agent SDK supports direct tool registration via `createSdkMcpServer()` — we already use this for scheduled agent tools. Media tools should use the same pattern.

#### 2.4 CLI is developer-facing, not user-facing
Debug logs everywhere:
```
[Backend] Loading .env from: /Users/...
[dotenv@17.3.1] injecting env (0) from ../.env
[MCP-CREDS] keytar unavailable, falling back to file storage
[INIT] Agent runtime ready
[AgentScheduler] Initializing scheduler...
[MCP] Server status: [{"name":"filesystem","status":"failed"...
```
Compare to Claude Code which shows clean, minimal output with a simple prompt.

#### 2.5 No onboarding flow
No `friday setup`. No guided API key entry. User has to manually create `.env` files and know where to put them.

#### 2.6 No persistent permissions
Every session starts from scratch. When an app invokes the runtime, it can't say "this app already has terminal access." Users re-approve the same tools every session.

#### 2.7 AgentRuntime.js is a monolith
800+ lines mixing: permission logic, Electron wrappers, skill injection, MCP management, session handling, cron validation, screen sharing state, tool description generation. Hard to extend for subagents or new paradigms.

#### 2.8 Hardcoded model names
`gpt-5.2`, `Imagen 4`, etc. baked into provider code. Stale the moment a new model drops. No update mechanism.

#### 2.9 No plugin system
Want to add GitHub? It's either compiled in `.mcp.json` or nothing. No way to `friday install github` and have it configure itself.

#### 2.10 No subagent support
Can't spawn child agents for parallel work. The entire runtime is single-threaded, single-query.

---

## 3. Core Principles for v0.2

1. **Minimal core, extensible through plugins.** The runtime ships with the essentials (Claude SDK, filesystem, terminal). Everything else is installable.

2. **Zero-config start, progressive disclosure.** `friday chat` should work with just an Anthropic API key. Capabilities are discovered as the user needs them.

3. **User-friendly first, developer-friendly second.** The CLI targets non-coders. No debug output by default. Clear prompts. Guided setup.

4. **One-time setup, persistent state.** Permissions, credentials, preferences persist across sessions and across interfaces (CLI, desktop, mobile all read from `~/.friday/`).

5. **Lazy everything.** Provider SDKs loaded on first use. MCP servers started on first tool call. Skills loaded on demand. Boot time stays fast regardless of installed plugins.

6. **Documentation-driven development.** Every feature gets documentation before or during implementation. Public docs are a first-class deliverable, not an afterthought.

---

## 4. Use Cases

### 4.1 Interactive Use Cases (Human types → Agent responds)

These work across CLI, desktop, iOS, and web.

#### Content Creation Pipeline
> "Write a blog post about remote work trends, generate a header image, convert the intro to audio for a podcast teaser."

Agent chains: Claude writes → `generate_image` → `text_to_speech`. Output: markdown file, PNG image, MP3 audio — all in the workspace.

#### Multi-Model Research
> "Ask GPT-5 to analyze this dataset for anomalies, ask Gemini to suggest visualizations, then synthesize both perspectives."

Agent calls `query_model` with different providers, compares outputs, writes a synthesis. Uses the best model for each subtask.

#### Rapid Prototyping
> "Build me a landing page for a coffee shop. Generate hero image, product photos, and a short promo video."

Agent writes HTML/CSS/JS → generates images via `generate_image` → generates video via `generate_video` → saves everything in workspace.

#### Accessibility Conversion
> "Transcribe this meeting recording, summarize key points, translate to Spanish, and generate audio in Spanish."

`speech_to_text` → Claude summarizes → Claude translates → `text_to_speech` with Spanish voice.

#### Code Review with Multiple Perspectives
> "Review this PR. Get security analysis from Claude, performance analysis from GPT-5, and give me a unified recommendation."

Agent reads the diff → queries multiple models → synthesizes into a single review.

#### Voice-First Interaction
> "Clone my voice from this sample, then read this product announcement in my voice."

`clone_voice` from audio file → `text_to_speech` with cloned voice ID.

#### Data Storytelling
> "Analyze this CSV, create chart images for the top 3 insights, add audio narration for each."

Claude analyzes → generates chart images → generates narration audio per insight.

### 4.2 Scheduled Agent Use Cases (Cron-triggered, autonomous)

These run without human interaction, pushing notifications when they need approval or want to report results.

#### Morning Standup Summary
**Trigger:** Every weekday at 8:30am
**Agent does:** Pull GitHub PRs merged yesterday, Slack highlights, calendar for today → compile into a morning brief → post to Slack or send as push notification.
**Permissions:** GitHub (read), Slack (read + write), Calendar (read) — all auto-approved.

#### Competitor Monitor
**Trigger:** Daily at 6am
**Agent does:** Scrape competitor websites for pricing/feature changes (via Firecrawl), compare to last snapshot, write a diff report.
**Permissions:** Web (read), filesystem (write) — auto-approved.

#### Weekly Analytics Digest
**Trigger:** Every Monday at 9am
**Agent does:** Query Supabase for key metrics, generate charts as images, compile into a report with audio summary, email via Resend.
**Permissions:** Supabase (read), image gen (auto-approve), TTS (auto-approve), email (ask first).

#### Social Content Calendar
**Trigger:** Every Tuesday and Thursday at 10am
**Agent does:** Research trending topics, write social posts, generate accompanying images, schedule to LinkedIn/Twitter.
**Permissions:** Web (read), image gen (auto-approve), social posting (ask first — sends push notification to iOS).

#### Dependency Audit
**Trigger:** Weekly on Sunday
**Agent does:** Run `npm audit` on all projects in workspace, check for new CVEs, write a report, create GitHub issues for critical findings.
**Permissions:** Terminal (read-only auto-approve), GitHub (write — ask first).

#### Daily Site Health Check
**Trigger:** Every hour
**Agent does:** Fetch production URL, check response time, validate key pages, alert if anything is down.
**Permissions:** Web (read) — auto-approved. Slack notification — auto-approved.

### 4.3 Event-Triggered Use Cases (Webhook/external event → Agent runs)

These are the key differentiator from Claude Code. The agent reacts to real-world events.

#### PR Review Bot
**Trigger:** GitHub webhook on `pull_request.opened`
**Agent does:** Read the diff, review for bugs/security/style, post review comments on the PR.
**Permissions:** GitHub (read + write) — auto-approved per trigger policy.

#### Deploy Monitor
**Trigger:** Vercel webhook on deployment complete
**Agent does:** Run smoke tests against the new deployment, check for regressions, notify team on Slack.
**Permissions:** Web (read), terminal (read-only), Slack (write) — auto-approved.

#### CSV Data Processor
**Trigger:** File watch on `/uploads/*.csv`
**Agent does:** Detect new CSV, analyze structure, clean data, generate summary report with charts, move to `/processed/`.
**Permissions:** Filesystem (read + write in workspace) — auto-approved.

#### Meeting Recording Processor
**Trigger:** File watch on `/recordings/*.mp3`
**Agent does:** Transcribe → summarize → extract action items → create tasks in project management tool → send summary to attendees.
**Permissions:** STT (auto-approve), email (ask first).

#### Customer Support Escalation
**Trigger:** Webhook from helpdesk when ticket marked "urgent"
**Agent does:** Read ticket context, research similar past tickets, draft resolution email, generate audio confirmation.
**Permissions:** Helpdesk (read), email (ask first), TTS (auto-approve).

#### Multi-Agent Data Pipeline
**Trigger:** Chained — Agent A completes → Agent B fires
**Pipeline:**
1. **Scraper agent** (triggered by cron) → collects data → saves to workspace
2. **Analyst agent** (triggered by scraper completion) → processes data → generates report
3. **Publisher agent** (triggered by analyst completion) → formats for distribution → posts/emails

### 4.4 Developer Platform Use Cases (Third-party apps using the runtime)

These are for developers building products on top of `@friday/runtime`.

#### Custom SaaS Agent
A developer builds a customer support product:
```javascript
import { Runtime } from '@friday/runtime';

const runtime = new Runtime({
  plugins: ['zendesk', 'slack'],
  permissions: {
    'zendesk.*': 'auto-approve',
    'slack.send_message': 'auto-approve',
  },
});

// When a new ticket arrives:
await runtime.query(`
  Ticket #${ticket.id}: "${ticket.subject}"
  Customer: ${ticket.customer}
  Priority: ${ticket.priority}

  Research past tickets, draft a response, and post to Slack for review.
`);
```

#### Embedded AI in Existing App
A team adds AI capabilities to their internal tool:
```javascript
import { Runtime } from '@friday/runtime';

const runtime = new Runtime({
  plugins: ['supabase', 'resend'],
  agents: [{
    name: 'report-generator',
    instructions: 'You generate weekly business reports from our Supabase database.',
    skills: ['data-analysis-expertise', 'data-visualization-principles'],
  }],
});

runtime.on('message', (msg) => ws.send(JSON.stringify(msg)));
await runtime.query('Generate the Q1 revenue report');
```

#### CI/CD Integration
Run Friday as a step in a CI pipeline:
```yaml
# .github/workflows/pr-review.yml
- name: Friday Code Review
  run: |
    npx @friday/cli serve --headless --auto-approve=safe &
    curl -X POST http://localhost:8787/api/query \
      -d '{"message": "Review this PR for security issues"}'
```

#### IoT / Hardware Integration
An IoT device triggers Friday via webhook:
```
Motion sensor triggers → Webhook to Friday server → Agent checks camera feed
→ Generates incident report → Sends push notification to iOS app
```

---

## 5. CLI Tools vs MCP: Decision Framework

### The question
The Claude Agent SDK supports both MCP servers (child processes communicating via stdio) and direct tools (in-process functions via `createSdkMcpServer()`). Which should we use for what?

### Decision matrix

| Capability | Delivery | Why |
|------------|----------|-----|
| **Filesystem** (read, write, glob, search) | Direct tool | Core capability. Every session uses it. Process overhead is unjustified. |
| **Terminal** (shell execution) | Direct tool | Core capability. Currently an MCP server spawning a child process to... spawn another child process. Unnecessary. |
| **Web** (fetch, search) | Direct tool | Core capability. Simple HTTP calls don't need process isolation. |
| **Media** (image gen, TTS, etc.) | Direct tool | API calls to external services. No reason for a child process. |
| **GitHub** | MCP (plugin) | Third-party maintained package. Benefits from isolation. Has its own release cycle. |
| **Slack** | MCP (plugin) | Same reasoning as GitHub. |
| **Figma, Gmail, Drive, etc.** | MCP (plugin) | Same reasoning. Community-maintained MCP servers. |
| **Custom user tools** | MCP (plugin) | User-written. Must be isolated from runtime process. |

### For runtime called by services (iOS, web, containers)
- Direct tools are always better: no process spawning, simpler error handling, faster response
- The service declares which plugins (MCP servers) it needs
- Only those plugins are loaded — no 15 servers starting and failing

### For CLI
- Same runtime underneath — same direct tools, same plugin system
- CLI adds user-facing commands: `friday install`, `friday setup`, `friday schedule`
- User never thinks about "MCP vs direct" — they just install capabilities

### Implementation
Direct tools use `createSdkMcpServer()` which we already use for scheduled agent tools. This creates an in-process MCP server that the Claude SDK treats identically to external MCP servers — same tool discovery, same `canUseTool` permission gating — but with zero subprocess overhead.

---

## 6. Target Architecture

### Directory structure

```
friday-agent/
├── packages/
│   ├── runtime/                          # @friday/runtime
│   │   ├── package.json                  # Core deps only. Providers are optionalDependencies.
│   │   ├── index.js                      # Public API exports
│   │   │
│   │   ├── src/
│   │   │   ├── core/                     # Slim core (extracted from monolithic AgentRuntime.js)
│   │   │   │   ├── Runtime.js            # Agent loop + event emitter
│   │   │   │   ├── ToolRegistry.js       # Register direct tools + MCP tools, tool discovery
│   │   │   │   ├── PermissionManager.js  # Persistent permissions + policies + profiles
│   │   │   │   └── SessionManager.js     # Session lifecycle, persistence, resumption
│   │   │   │
│   │   │   ├── tools/                    # Built-in direct tools (in-process, no MCP overhead)
│   │   │   │   ├── filesystem.js         # Read, write, search, glob
│   │   │   │   ├── terminal.js           # Shell execution with sandboxing
│   │   │   │   └── web.js               # Web fetch, search
│   │   │   │
│   │   │   ├── plugins/                  # Plugin system
│   │   │   │   ├── PluginManager.js      # Load, configure, start, stop plugins
│   │   │   │   ├── PluginManifest.js     # What a plugin must declare
│   │   │   │   └── catalog.json          # Known plugins: name, npm package, capabilities
│   │   │   │
│   │   │   ├── providers/                # Multi-model AI providers
│   │   │   │   ├── ProviderRegistry.js   # Auto-select, preferences, lazy loading
│   │   │   │   ├── models.json           # Externalized model catalog (updatable without code changes)
│   │   │   │   └── adapters/             # Each adapter lazy-loaded via dynamic import()
│   │   │   │       ├── openai.js
│   │   │   │       ├── google.js
│   │   │   │       └── elevenlabs.js
│   │   │   │
│   │   │   ├── agents/                   # Agent definitions + management
│   │   │   │   ├── AgentManager.js
│   │   │   │   ├── SubAgentRunner.js     # Spawn child runtime instances for parallel work
│   │   │   │   └── definitions/          # Built-in agent definitions
│   │   │   │
│   │   │   ├── skills/                   # Skill system (proven, keep as-is)
│   │   │   │   ├── SkillManager.js
│   │   │   │   ├── global/               # 27+ expertise markdown files
│   │   │   │   └── templates/            # Project-type templates
│   │   │   │
│   │   │   ├── scheduler/               # Scheduling + triggers
│   │   │   │   ├── Scheduler.js          # Cron job management
│   │   │   │   ├── TriggerRouter.js      # Route external events to agents
│   │   │   │   ├── triggers/
│   │   │   │   │   ├── WebhookTrigger.js
│   │   │   │   │   ├── FileWatchTrigger.js
│   │   │   │   │   ├── GitHookTrigger.js
│   │   │   │   │   └── ChainTrigger.js   # Agent A completes → Agent B fires
│   │   │   │   ├── RunQueue.js           # Queue and execute triggered runs
│   │   │   │   └── RunStore.js           # Persist run state + history
│   │   │   │
│   │   │   ├── notifications/            # Outbound push (for headless/mobile)
│   │   │   │   ├── NotificationBus.js    # Central dispatcher
│   │   │   │   └── channels/
│   │   │   │       ├── WebSocketChannel.js
│   │   │   │       ├── WebhookChannel.js
│   │   │   │       └── QueueChannel.js   # Store for later retrieval
│   │   │   │
│   │   │   └── credentials/             # Credential management
│   │   │       ├── CredentialStore.js    # Keytar/file storage (from McpCredentials)
│   │   │       └── OAuthManager.js
│   │   │
│   │   └── config/
│   │       └── defaults.json             # Default settings, paths, behavior
│   │
│   └── cli/                              # @friday/cli
│       ├── package.json
│       ├── bin/friday.js                 # Entry point
│       └── src/
│           ├── app.js                    # Command router
│           ├── ui/                       # Clean terminal UI components
│           │   ├── renderer.js           # Markdown rendering, colors, spinners
│           │   ├── prompts.js            # Permission prompts, confirmations
│           │   └── setup-wizard.js       # First-run guided onboarding
│           └── commands/
│               ├── chat.js              # friday chat — interactive agent
│               ├── serve.js             # friday serve — HTTP/WS server
│               ├── setup.js             # friday setup — guided onboarding
│               ├── install.js           # friday install <plugin> — add capabilities
│               ├── schedule.js          # friday schedule — manage scheduled agents
│               └── config.js            # friday config — get/set preferences
│
├── docs/                                 # Public documentation (ships with repo)
│   ├── getting-started.md
│   ├── architecture.md
│   ├── cli-reference.md
│   ├── runtime-api.md
│   ├── plugins.md
│   ├── building-plugins.md
│   ├── permissions.md
│   ├── scheduled-agents.md
│   ├── capabilities/
│   │   ├── filesystem.md
│   │   ├── terminal.md
│   │   ├── web.md
│   │   ├── image-generation.md
│   │   ├── video-generation.md
│   │   ├── voice.md
│   │   └── multi-model.md
│   └── guides/
│       ├── self-hosting.md
│       ├── ios-integration.md
│       ├── electron-integration.md
│       └── ci-cd-integration.md
│
└── package.json                          # Workspace root
```

### Dependency strategy

**Core dependencies** (always installed):
```json
{
  "@anthropic-ai/claude-agent-sdk": "^0.2.23",
  "@anthropic-ai/sdk": "^0.71.2",
  "ws": "^8.18.3",
  "pino": "^9.0.0",
  "zod": "^3.24.1 || ^4.0.0",
  "dotenv": "^17.2.3"
}
```

**Optional dependencies** (installed but loaded only when used):
```json
{
  "optionalDependencies": {
    "openai": "^5.0.0",
    "@google/genai": "^1.0.0",
    "@elevenlabs/elevenlabs-js": "^2.0.0",
    "node-cron": "^3.0.3",
    "cron-parser": "^4.9.0",
    "keytar": "^7.0.0",
    "chokidar": "^4.0.0"
  }
}
```

**Plugin dependencies** (not installed by default, installed via `friday install`):
```
@modelcontextprotocol/server-github
@modelcontextprotocol/server-filesystem  (if user wants MCP filesystem instead of built-in)
firecrawl-mcp
figma-developer-mcp
slack-mcp-server
...etc
```

### Data flow comparison

**v0.1 (current) — Media tool call:**
```
User message
  → AgentRuntime.handleQuery()
    → Claude SDK query()
      → SDK spawns MCP child process (media-server.js)
        → media-server.js initializes ProviderRegistry
          → ProviderRegistry calls OpenAI SDK
            → OpenAI API responds
          ← Result flows back through stdio
        ← MCP protocol response
      ← Tool result back to SDK
    ← Claude generates response
  ← Event emitted to consumer
```

**v0.2 (proposed) — Media tool call:**
```
User message
  → Runtime.query()
    → Claude SDK query()
      → SDK calls in-process tool handler (createSdkMcpServer)
        → Handler calls ProviderRegistry
          → ProviderRegistry calls OpenAI SDK
            → OpenAI API responds
          ← Result returned directly
        ← Tool result (no IPC)
      ← Tool result back to SDK
    ← Claude generates response
  ← Event emitted to consumer
```

Two fewer process boundaries. Same permission gating.

---

## 7. Plugin System

### What is a plugin?

A plugin extends the runtime with new capabilities. It can provide:
- **Tools** — New tools the agent can call (via MCP or direct)
- **Credentials** — API keys or OAuth tokens it needs
- **Setup** — Instructions for the user to configure it

### Plugin manifest

Every plugin exports a manifest describing what it provides and needs:

```javascript
// Example: @friday/plugin-github
export default {
  id: 'github',
  name: 'GitHub',
  description: 'Access GitHub repositories, issues, PRs, and actions',
  version: '1.0.0',

  // What type of plugin
  type: 'mcp',  // 'mcp' | 'tools' | 'provider'

  // Credentials needed
  setup: {
    credentials: [
      {
        id: 'GITHUB_PERSONAL_ACCESS_TOKEN',
        label: 'GitHub Personal Access Token',
        env: 'GITHUB_PERSONAL_ACCESS_TOKEN',
        instructions: 'Create a token at https://github.com/settings/tokens',
        required: true,
      }
    ],
  },

  // For MCP plugins — how to start the server
  mcp: {
    package: '@modelcontextprotocol/server-github',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    env: {
      GITHUB_PERSONAL_ACCESS_TOKEN: '${GITHUB_PERSONAL_ACCESS_TOKEN}',
    },
  },
};
```

### Plugin catalog

A `catalog.json` ships with the runtime listing known plugins:

```json
{
  "version": "2026-02-14",
  "plugins": {
    "github": {
      "package": "@friday/plugin-github",
      "description": "GitHub repositories, issues, PRs",
      "category": "developer"
    },
    "slack": {
      "package": "@friday/plugin-slack",
      "description": "Slack messaging and channels",
      "category": "communication"
    },
    "figma": {
      "package": "@friday/plugin-figma",
      "description": "Figma design files",
      "category": "design"
    }
  }
}
```

The catalog is updatable from a remote URL so new plugins appear without a runtime upgrade.

### User experience

```
$ friday install github

  Installing GitHub plugin...

  GitHub requires a Personal Access Token.
  Create one at: https://github.com/settings/tokens

  Scopes needed: repo, read:org

  Paste your token: ghp_xxxx••••••••

  ✓ Token verified (user: amogh10, 42 repos accessible)
  ✓ GitHub plugin installed

  The agent can now access your GitHub repositories.

$ friday install slack

  Installing Slack plugin...

  Slack uses OAuth. Opening browser for authorization...
  [Browser opens Slack OAuth page]

  ✓ Connected to workspace: TryFriday
  ✓ Slack plugin installed

$ friday chat
  you> List my open PRs and summarize each one

  Friday is thinking...
  [Agent uses github tools to fetch PRs, summarizes each]
```

### Plugin lifecycle

```
friday install github
  1. npm install @friday/plugin-github (into ~/.friday/plugins/)
  2. Read plugin manifest
  3. Run setup flow (prompt for credentials)
  4. Store credentials in CredentialStore
  5. Update ~/.friday/plugins.json (installed plugins registry)
  6. Done — plugin available next time runtime starts

Runtime starts:
  1. Read ~/.friday/plugins.json
  2. For each installed plugin:
     a. Load manifest
     b. Check credentials are still valid
     c. Register tools (MCP: prepare server config; direct: register handler)
  3. MCP servers are NOT started yet (lazy — started on first tool use)

Agent calls a plugin tool:
  1. ToolRegistry looks up the tool → finds it belongs to a plugin
  2. If MCP plugin and server not started → start the MCP server now
  3. Route the tool call
  4. Return result
```

---

## 8. Permission System

### The problem with v0.1
Permissions are session-scoped. Every new session, the user re-approves the same tools. When an iOS app connects to the runtime, there's no persistent trust model.

### v0.2 permission model

Three layers, from most permissive to most restrictive:

#### Layer 1: Permission Profiles
Pre-defined profiles for common use patterns:

| Profile | Description | Auto-approves |
|---------|-------------|---------------|
| `developer` | For developers who trust the agent in their workspace | Filesystem (read/write in workspace), terminal (with sandboxing), web fetch |
| `safe` | For cautious users or read-only exploration | Filesystem (read only), web fetch. Everything else asks. |
| `locked` | For maximum control | Nothing auto-approved. Every tool call prompts. |
| `headless` | For containers/CI where no human is present | Configurable per-tool policy. Defaults to safe. |

#### Layer 2: Per-Tool Permissions
Granular overrides on top of the profile:

```json
{
  "profile": "developer",
  "overrides": {
    "terminal.execute": "ask-first",
    "github.create_issue": "auto-approve",
    "slack.send_message": "ask-first",
    "generate_image": "auto-approve"
  }
}
```

#### Layer 3: Per-App Permissions
When an external app (iOS, Electron, third-party) connects:

```json
{
  "apps": {
    "friday-ios": {
      "label": "Friday iOS App",
      "first_connected": "2026-02-14T10:00:00Z",
      "permissions": {
        "filesystem.read": "granted",
        "terminal.execute": "denied",
        "generate_image": "granted"
      }
    }
  }
}
```

On first connection, the app goes through a one-time permission grant flow. After that, the runtime checks the stored permissions without prompting.

### Storage

All permissions stored at `~/.friday/permissions.json`. Shared across all interfaces (CLI, desktop, iOS).

### Permission flow for event-triggered agents

When a scheduled or webhook-triggered agent needs approval:

1. Agent hits a permission gate → creates a `PendingPermission` record with a TTL (e.g., 5 minutes)
2. `NotificationBus` pushes to all connected clients:
   - Connected WebSocket clients see it instantly
   - iOS gets a push notification: "Friday needs approval to run `git push` on project X"
   - If no client connected, stored in `PermissionStore`
3. Any client can respond: `POST /api/permissions/:id` with `{ approved: true }`
4. If TTL expires → apply the trigger's default policy (deny by default)
5. Agent resumes or aborts

---

## 9. CLI Design

### Design philosophy
The CLI should feel like Claude Code — clean, minimal, friendly to non-coders. No framework dependencies (no Commander, no Ink). Pure Node.js readline with ANSI formatting.

### First-run experience

```
$ friday

  Welcome to Friday! Let's get you set up.

  Friday uses Claude by Anthropic as its AI engine.
  You'll need an Anthropic API key to get started.

  Get one at: https://console.anthropic.com/settings/keys

  Paste your API key: sk-ant-xxxx••••••••

  ✓ API key verified

  Choose a permission profile:

  1. Developer (recommended)
     Auto-approves file and terminal operations in your workspace.
     Best for coding, prototyping, and development tasks.

  2. Safe
     Read-only by default. Asks before writing files or running commands.
     Best for exploration and research tasks.

  3. Locked
     Asks permission for every action. Maximum control.

  > 1

  ✓ Setup complete! Your config is saved at ~/.friday/

  Tip: Run 'friday install github' to connect your GitHub account.

  Friday v0.2.0

  you>
```

### Chat interface

```
Friday v0.2.0

you> Build a React component for a todo list

Friday is thinking...

I'll create a todo list component for you.

  Creating src/components/TodoList.tsx...
  Creating src/components/TodoItem.tsx...
  Running npm install...

Done! I created two components:
- `src/components/TodoList.tsx` — Main list with add/remove
- `src/components/TodoItem.tsx` — Individual item with checkbox

you>
```

**Rules:**
- No `[RUNTIME]`, `[MCP]`, `[SkillManager]` prefixes
- Progress shown as clean indented lines with spinners
- Permission prompts are clear one-line questions
- Tool activity shown as brief action descriptions
- `--verbose` flag for full debug output (logs to `~/.friday/logs/`)

### Commands

| Command | Description |
|---------|-------------|
| `friday` or `friday chat` | Interactive chat (default) |
| `friday setup` | Guided onboarding wizard |
| `friday serve` | Start HTTP/WebSocket server |
| `friday install <plugin>` | Install a plugin with guided setup |
| `friday uninstall <plugin>` | Remove a plugin |
| `friday plugins` | List installed plugins |
| `friday schedule` | List/manage scheduled agents |
| `friday config get <key>` | Read a config value |
| `friday config set <key> <value>` | Set a config value |
| `friday --version` | Version info |
| `friday --help` | Help |

### In-chat commands

| Command | Description |
|---------|-------------|
| `:q` or `:quit` | Exit |
| `:new` | Start new session |
| `:allow` | Approve pending permission |
| `:deny [reason]` | Deny pending permission |
| `:sessions` | List recent sessions |
| `:resume <id>` | Resume a previous session |
| `:help` | Show help |

---

## 10. Runtime API for Services

### Programmatic API

The public API that all consumers use:

```javascript
import { Runtime } from '@friday/runtime';

// Minimal setup — just chat with Claude
const friday = new Runtime({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Full setup — plugins, permissions, workspace
const friday = new Runtime({
  apiKey: process.env.ANTHROPIC_API_KEY,
  workspace: '/path/to/project',
  plugins: ['github', 'slack'],
  permissions: 'developer',  // or a custom policy object
  providers: {
    openai: { apiKey: process.env.OPENAI_API_KEY },
    google: { apiKey: process.env.GOOGLE_API_KEY },
  },
});

// Events
friday.on('message', (msg) => { /* stream to UI */ });
friday.on('permission', (req) => { /* forward to user */ });
friday.on('tool_use', (tool) => { /* show progress */ });
friday.on('error', (err) => { /* handle error */ });

// Query
await friday.query('Deploy the latest changes', { sessionId: 'abc123' });

// Session management
const sessions = await friday.sessions.list();
const events = await friday.sessions.getEvents('abc123');

// Plugin management
await friday.plugins.install('github', { token: 'ghp_xxx' });
await friday.plugins.list();

// Scheduled agents
await friday.scheduler.create({
  name: 'Morning brief',
  instructions: 'Summarize overnight GitHub activity',
  cron: '0 9 * * *',
});
```

### HTTP/WebSocket API

For iOS, web, and remote clients:

**REST Endpoints:**
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check + readiness |
| POST | `/api/query` | Send a message (response via WebSocket) |
| GET | `/api/sessions` | List sessions |
| GET | `/api/sessions/:id` | Get session details |
| GET | `/api/sessions/:id/events` | Get session event log |
| POST | `/api/sessions/:id/resume` | Resume a session |
| GET | `/api/plugins` | List installed plugins |
| POST | `/api/plugins/install` | Install a plugin |
| DELETE | `/api/plugins/:id` | Uninstall a plugin |
| GET | `/api/agents` | List agents |
| POST | `/api/agents` | Create agent |
| GET | `/api/skills` | List skills |
| GET | `/api/schedule` | List scheduled agents |
| POST | `/api/schedule` | Create scheduled agent |
| POST | `/api/permissions/:id` | Respond to permission request |

**WebSocket (`/ws`):**
```javascript
// Client → Server
{ type: 'query', message: '...', sessionId: '...' }
{ type: 'permission_response', permissionId: '...', approved: true }
{ type: 'new_session' }

// Server → Client
{ type: 'chunk', data: '...' }
{ type: 'tool_use', tool: '...', input: {...} }
{ type: 'permission_request', id: '...', tool: '...', description: '...' }
{ type: 'complete', sessionId: '...' }
{ type: 'error', message: '...' }
```

### Authentication for remote access

| Mode | When to use | How it works |
|------|-------------|--------------|
| Bearer token | Self-hosted, single user | `friday serve --token my-secret-token`. All requests must include `Authorization: Bearer my-secret-token`. |
| API key | Multi-user SaaS | Each user gets a key. Stored in runtime config. |
| No auth | Local development | Default when running on localhost. |

---

## 11. Scheduled Agents & Triggers

### Current state (v0.1)
Only cron-based scheduling via `AgentScheduler`. Agents defined with a cron expression, executed by `AgentExecutor`, history tracked by `AgentRunHistory`.

### v0.2 additions

#### Trigger types

| Trigger | Source | Example |
|---------|--------|---------|
| **Cron** | Internal timer | "Every day at 9am" |
| **Webhook** | HTTP POST to runtime | GitHub push, Stripe payment, Vercel deploy |
| **File watch** | Filesystem change | New CSV in /uploads, new recording in /recordings |
| **Git hook** | Post-commit, post-push | Auto-review after commit |
| **Chain** | Agent completion event | Agent A done → Agent B starts |
| **Manual** | API call | iOS app says "run this now" |

#### Trigger configuration

```json
{
  "triggers": [
    {
      "id": "github-pr-review",
      "type": "webhook",
      "source": "github",
      "event": "pull_request.opened",
      "agent": {
        "instructions": "Review this PR for bugs, security, and style.",
        "plugins": ["github"],
        "permissions": {
          "github.create_review": "auto-approve",
          "github.add_comment": "auto-approve"
        }
      },
      "hmac_secret": "${GITHUB_WEBHOOK_SECRET}"
    },
    {
      "id": "csv-processor",
      "type": "file_watch",
      "path": "/uploads",
      "pattern": "*.csv",
      "agent": {
        "instructions": "Analyze this CSV, generate a summary report with charts.",
        "plugins": [],
        "permissions": {
          "filesystem.*": "auto-approve-in-workspace",
          "generate_image": "auto-approve"
        }
      }
    }
  ]
}
```

#### CLI for scheduling

```
$ friday schedule

  Scheduled agents:

  1. Morning Brief          Every day at 9:00 AM     Next: tomorrow 9:00 AM
  2. Dependency Audit        Every Sunday at 6:00 AM  Next: Feb 16 6:00 AM

  Commands:
    friday schedule create    Create a new scheduled agent
    friday schedule list      List all scheduled agents
    friday schedule delete    Delete a scheduled agent
    friday schedule trigger   Run a scheduled agent now
    friday schedule logs      View execution history

$ friday schedule create

  What should this agent do?
  > Check my GitHub notifications and summarize anything important

  How often?
  > Every morning at 8am

  Which plugins does it need?
  > github

  ✓ Created "GitHub Notification Summary"
    Schedule: Every day at 8:00 AM (0 8 * * *)
    Next run: tomorrow at 8:00 AM
```

---

## 12. Multi-Modal Providers

### Key changes from v0.1

1. **SDKs as optional dependencies** — `openai`, `@google/genai`, `@elevenlabs/elevenlabs-js` move to `optionalDependencies`. Loaded via `import()` on first use. If not installed, that provider just isn't available.

2. **Externalized model catalog** — `models.json` lists all known models with capabilities, pricing, and version info. Updatable without code changes. Can fetch from remote URL.

3. **Direct tool registration** — No MCP media server. Media tools registered via `createSdkMcpServer()` in-process. Same permission gating, zero subprocess overhead.

4. **Cost tracking** — Each provider call records estimated cost. `CostTracker` aggregates per-session and globally. Agent can call `estimate_cost` tool before expensive operations.

### models.json structure

```json
{
  "version": "2026-02-14",
  "updateUrl": "https://registry.tryfriday.ai/models.json",
  "providers": {
    "openai": {
      "envKey": "OPENAI_API_KEY",
      "sdk": "openai",
      "models": {
        "gpt-image-1.5": {
          "capabilities": ["image-gen"],
          "pricing": { "per_image_1024": 0.04, "per_image_1536": 0.08 },
          "default_for": ["image-gen"]
        },
        "sora-2": {
          "capabilities": ["video-gen"],
          "pricing": { "per_second_720p": 0.10, "per_second_1080p": 0.20 },
          "async": true
        }
      }
    }
  }
}
```

When a new model is released: update `models.json`, publish a new version (or the runtime fetches the latest from the update URL).

### Provider adapter interface

Each adapter implements the same interface:

```javascript
// adapters/openai.js
export default {
  id: 'openai',

  async initialize(apiKey) { /* create client */ },

  async generateImage({ prompt, model, size, quality, n }) { /* return { path, metadata } */ },
  async generateVideo({ prompt, model, duration, resolution }) { /* return { path, metadata } */ },
  async textToSpeech({ text, voice, model, speed, format }) { /* return { path, metadata } */ },
  async speechToText({ audioPath, model, language }) { /* return { text, metadata } */ },
  async chat({ messages, model, temperature }) { /* return { response, metadata } */ },

  getModels(capability) { /* return available models for this capability */ },
  estimateCost(capability, params) { /* return estimated cost in USD */ },
};
```

---

## 13. Subagent System

### Why
Some tasks are naturally parallel: "Review this PR for security, performance, and style" could be three agents working simultaneously instead of one agent doing three passes sequentially.

### How it works

```
Main Runtime receives query
  → Decides task needs parallel work
  → Spawns SubAgentRunner with N child contexts
  → Each child gets:
      - Its own system prompt (specialized for its subtask)
      - Shared read access to the session context
      - Its own tool permissions
  → Children run in parallel
  → Results collected and synthesized by main agent
  → Single response returned to user
```

### Implementation approach

Subagents are NOT separate processes. They're separate `query()` calls to the Claude SDK running concurrently within the same runtime. They share:
- The same MCP servers (no re-initialization)
- The same credential store
- The same workspace

They don't share:
- Session history (each has its own context)
- Permission cache (each gets its own)

### API

```javascript
// The agent can spawn subagents via a tool
{
  name: "spawn_subagents",
  description: "Run multiple specialized agents in parallel",
  inputSchema: {
    tasks: [
      {
        role: "security reviewer",
        instructions: "Review this code for security vulnerabilities",
        context: "... the code to review ..."
      },
      {
        role: "performance reviewer",
        instructions: "Review this code for performance issues",
        context: "... the code to review ..."
      }
    ]
  }
}
```

This is a Phase 3 feature. The core runtime needs to be solid first.

---

## 14. Documentation Plan

### Documentation as a deliverable
Every feature implementation includes its documentation. Docs are written in markdown, stored in `docs/`, and published publicly.

### Documentation structure

| Document | Audience | Content |
|----------|----------|---------|
| `docs/getting-started.md` | New users | Install, setup, first chat, install a plugin |
| `docs/architecture.md` | Contributors & developers | How the runtime works internally |
| `docs/cli-reference.md` | CLI users | All commands, flags, in-chat commands |
| `docs/runtime-api.md` | Developers embedding Friday | Programmatic API reference |
| `docs/plugins.md` | Users | How to install, configure, manage plugins |
| `docs/building-plugins.md` | Plugin authors | How to create a Friday plugin |
| `docs/permissions.md` | All users | Permission profiles, per-tool overrides, app permissions |
| `docs/scheduled-agents.md` | Users who want automation | How to create, manage, monitor scheduled agents |
| `docs/capabilities/filesystem.md` | Users | What the filesystem tool can do |
| `docs/capabilities/terminal.md` | Users | What the terminal tool can do |
| `docs/capabilities/web.md` | Users | What the web tool can do |
| `docs/capabilities/image-generation.md` | Users | Image generation across providers |
| `docs/capabilities/video-generation.md` | Users | Video generation across providers |
| `docs/capabilities/voice.md` | Users | TTS, STT, voice cloning |
| `docs/capabilities/multi-model.md` | Users | Using GPT, Gemini, etc. alongside Claude |
| `docs/guides/self-hosting.md` | DevOps | Docker, env config, health checks |
| `docs/guides/ios-integration.md` | iOS developers | WebSocket API, push notifications |
| `docs/guides/electron-integration.md` | Desktop developers | Importing runtime as library |
| `docs/guides/ci-cd-integration.md` | DevOps | Running Friday in CI pipelines |

### Writing rules
1. Every doc starts with a one-line description of what the reader will learn
2. Code examples are copy-pasteable and tested
3. No jargon without explanation
4. Progressive disclosure: basic usage first, advanced configuration later

---

## 15. Implementation Plan

### Phase 1: Foundation
**Goal:** Clean, working core. CLI that a non-coder can use. Documentation for everything built.

| Step | Task | Docs |
|------|------|------|
| 1.1 | Extract `AgentRuntime.js` → `Runtime.js` + `ToolRegistry.js` + `PermissionManager.js` + `SessionManager.js` | `architecture.md` |
| 1.2 | Convert terminal from MCP server to direct tool (in-process via `createSdkMcpServer`) | `capabilities/terminal.md` |
| 1.3 | Convert filesystem from external MCP to direct tool | `capabilities/filesystem.md` |
| 1.4 | Add web tool (fetch, search) as direct tool | `capabilities/web.md` |
| 1.5 | Clean CLI output — logger with levels, `--verbose` flag, no debug by default | `cli-reference.md` |
| 1.6 | `friday setup` — guided API key, permission profile, workspace config | `getting-started.md` |
| 1.7 | Persistent permissions — `~/.friday/permissions.json`, profiles, per-tool overrides | `permissions.md` |
| 1.8 | Move provider SDKs to `optionalDependencies` with dynamic `import()` | — |
| 1.9 | Externalize model catalog to `models.json` | — |
| 1.10 | Remove dead code: Electron wrappers, screen sharing, preview detection | — |

**Deliverable:** `friday setup && friday chat` works end-to-end with clean output. Core tools work without any plugins. Docs for getting started, CLI, permissions, and core capabilities.

### Phase 2: Plugin System
**Goal:** Users can install integrations with one command. Third-party developers can create plugins.

| Step | Task | Docs |
|------|------|------|
| 2.1 | `PluginManager` — load, configure, lifecycle | `architecture.md` (update) |
| 2.2 | Plugin manifest interface | `building-plugins.md` |
| 2.3 | Plugin catalog (`catalog.json`) | `plugins.md` |
| 2.4 | `friday install <plugin>` with guided credential setup | `plugins.md`, `cli-reference.md` (update) |
| 2.5 | Convert GitHub, Slack, Figma, Gmail, etc. into plugin manifests | `plugins.md` |
| 2.6 | Lazy MCP server startup (start on first tool use, not at boot) | — |
| 2.7 | `friday plugins` — list installed, available | `cli-reference.md` (update) |

**Deliverable:** `friday install github` works. Plugins are lazy-loaded. No more 15 MCP servers failing at startup.

### Phase 3: Advanced Features
**Goal:** Event-driven agents, subagents, multi-modal tools, HTTP API.

| Step | Task | Docs |
|------|------|------|
| 3.1 | Trigger system — `TriggerRouter`, `WebhookTrigger`, `FileWatchTrigger`, `ChainTrigger` | `scheduled-agents.md` (update) |
| 3.2 | `friday schedule` command with natural language | `cli-reference.md` (update) |
| 3.3 | Notification bus — push to WebSocket, webhook, queue | `architecture.md` (update) |
| 3.4 | Multi-modal provider tools as direct tools (replace MCP media server) | `capabilities/image-generation.md`, `voice.md`, `video-generation.md` |
| 3.5 | Cost tracking — per-session, per-provider, budget alerts | `capabilities/multi-model.md` |
| 3.6 | `SubAgentRunner` — parallel agent execution | `architecture.md` (update) |
| 3.7 | HTTP/WebSocket API with auth | `runtime-api.md` |
| 3.8 | Per-app permissions for remote clients | `permissions.md` (update) |

**Deliverable:** Webhook-triggered agents, scheduled agents with push notifications, parallel subagents, full HTTP API for iOS/web.

### Phase 4: Production & Publish
**Goal:** Production-ready, published to npm, submitted for review.

| Step | Task | Docs |
|------|------|------|
| 4.1 | Test suite — unit tests for core, integration tests for plugins, eval suite for agent quality | — |
| 4.2 | Dockerfile + docker-compose for self-hosting | `guides/self-hosting.md` |
| 4.3 | CI/CD pipeline (GitHub Actions) | `guides/ci-cd-integration.md` |
| 4.4 | npm publish as `@friday/runtime` + `@friday/cli` | `getting-started.md` (update) |
| 4.5 | iOS integration guide | `guides/ios-integration.md` |
| 4.6 | Electron migration guide | `guides/electron-integration.md` |
| 4.7 | Final review, security audit, documentation polish | All docs |

**Deliverable:** Published packages. Public documentation. Ready for external review.

---

## 16. Migration from v0.1

### Backward compatibility
v0.2 must not break the Electron app. The migration path:

1. **Phase 1** refactors internals but keeps the same public API (`AgentRuntime`, `loadBackendConfig`, `handleQuery`). The Electron app's `BackendManager` continues to work.

2. **Phase 2** adds new capabilities (plugins) without removing existing ones. The `.mcp.json` approach continues to work as a fallback.

3. **Phase 3** adds new APIs (triggers, subagents) alongside existing ones.

4. **Phase 4** is when the Electron app can optionally switch to `@friday/runtime` as a dependency instead of inline code.

### File mapping

| v0.1 file | v0.2 equivalent |
|-----------|-----------------|
| `src/runtime/AgentRuntime.js` | `src/core/Runtime.js` + `ToolRegistry.js` + `PermissionManager.js` + `SessionManager.js` |
| `mcp-servers/terminal-server.js` | `src/tools/terminal.js` (direct tool) |
| `mcp-servers/media-server.js` | `src/providers/` (direct tools via registry) |
| `providers/ProviderRegistry.js` | `src/providers/ProviderRegistry.js` (with lazy loading) |
| `providers/openai.js` | `src/providers/adapters/openai.js` |
| `.mcp.json` | `src/plugins/catalog.json` + `~/.friday/plugins.json` |
| `src/mcp/McpCredentials.js` | `src/credentials/CredentialStore.js` |
| `src/scheduled-agents/*` | `src/scheduler/*` (expanded with triggers) |

### What gets deleted
- `mcp-servers/media-server.js` — replaced by direct tool registration
- `mcp-servers/terminal-server.js` — replaced by direct tool
- Electron wrapper code in `AgentRuntime.js` (lines 144-248)
- Screen sharing state management
- Preview detection stubs
- `mcp-servers/resend/` — becomes a plugin

---

## Appendix: Open Questions

1. **npm org:** When do we create the `@friday` npm org and publish? Phase 4, or earlier for testing?

2. **Plugin hosting:** Do we host plugin manifests in this repo, or create separate `@friday/plugin-*` packages from the start?

3. **Remote model catalog:** Do we host `models.json` at `registry.tryfriday.ai` from the start, or ship it bundled-only initially?

4. **Push notifications for iOS:** This requires APNs integration. Build it into the runtime, or keep it as an external service that reads from the notification queue?

5. **Pricing/metering:** If Friday becomes a managed service, where does usage metering live — in the runtime or in a separate service?
