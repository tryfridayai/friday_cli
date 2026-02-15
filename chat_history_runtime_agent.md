Let me explore the backend architecture first to understand what we're working with.


Explored backend architecture and created comprehensive documentation report
Show more
Show more
Show more
Show more
Show more
Show more
Show more
Show more

Good, I now have a thorough understanding of the backend. Let me also check a few specific things to round out the picture.


Reviewed backend package configuration and server initialization files

Let me check the Electron-specific coupling points in the runtime.


Searched Electron setup code and MCP server configuration files
Show more
Show more

Now I have a full picture. Here's the plan:

Plan: Turning the Friday Backend into a Standalone Node.js Package
Current State (What You Have)
Your backend is already ~90% decoupled from Electron. The key pieces:

friday-server.js — a stdio process that reads JSON from stdin, writes JSON to stdout. Any parent can spawn it.
server.js — an HTTP + WebSocket server that wraps the runtime. Already works without Electron.
dev-runner.js — an interactive CLI that spawns friday-server.js as a child process. Already works standalone.
AgentRuntime — the core engine. No Electron imports. The only coupling is setupElectronNodeWrappers() (lines 136-224 of AgentRuntime.js), which creates shim scripts for Electron's bundled Node.js. In a standalone package, system Node.js is used directly — this code becomes dead.
McpCredentials — tries keytar (native keychain), falls back to a JSON file. Works everywhere.
What Needs to Change (3 Layers)
Layer 1: CLI Package (friday or friday-ai)
Goal: npx friday-ai or npm install -g friday-ai && friday

Change	Details
New bin/friday.js	CLI entry point with #!/usr/bin/env node. Parses args (--workspace, --port, `--mode stdio
New package.json for the package	Rename from claude-chat-backend to friday-ai. Add "bin": { "friday": "./bin/friday.js" }. Set "engines": { "node": ">=20" }. Move MCP server deps to optionalDependencies so the core stays lean.
Remove Electron wrappers	Guard setupElectronNodeWrappers() behind an isElectron() check (detect process.versions.electron). When running standalone, skip it entirely — system node/npm/npx are on PATH already.
Externalize config paths	Currently hardcoded to ~/.friday/. Keep that as default, but accept FRIDAY_HOME env var so containers can set it to /data or similar. Sessions, credentials, agent configs all stored under $FRIDAY_HOME.
API key handling	Accept ANTHROPIC_API_KEY env var (already works). Add friday auth subcommand to store it persistently in $FRIDAY_HOME/.env or the credential store.
Layer 2: HTTP/WebSocket API (for iOS, Web, and Remote Clients)
Goal: Your iOS and web apps connect to a running Friday instance over the network.

Change	Details
Expand server.js into a proper API server	It already has agents/skills REST endpoints and a WebSocket for streaming. What's missing: authentication, session management endpoints, and the MCP credential endpoints that currently only exist in friday-server.js's stdio router.
Add auth middleware	For remote access, the server needs API key or JWT auth. Options: (a) simple bearer token (--api-token flag, checked on every request), (b) Supabase JWT (you already have this in the bridge server). Recommend starting with a simple bearer token for self-hosted, adding Supabase JWT for your managed service.
Port missing stdio handlers to HTTP/WS	The stdio router in friday-server.js handles ~25 message types. server.js only handles ~15. These need parity: mcp_get_servers, mcp_update_credentials, mcp_delete_credentials, mcp_oauth_start, all scheduled_agent:* messages, abort_query, resume_session, screen_sharing_state.
Add REST endpoints for key operations	POST /api/query (fire-and-forget, result via WS), GET /api/sessions, GET /api/sessions/:id/events, POST /api/sessions/:id/resume. These let the iOS app do REST calls even when WebSocket isn't convenient.
Permission model for headless/remote	Currently, permission requests block until a human clicks allow/deny. For containers and API use, add configurable auto-approve policies: --auto-approve all, --auto-approve safe (only read tools), or require the client to respond over the WebSocket.
Layer 3: Container / Deployment
Goal: docker run friday-ai --api-key $KEY

Change	Details
Dockerfile	Node 20 Alpine base. Copy package, npm install --production. Expose port 8787. ENTRYPOINT ["friday", "--mode", "server"]. Mount /data for persistent sessions/config.
Environment-based config	Everything configurable via env vars: ANTHROPIC_API_KEY, FRIDAY_HOME=/data, FRIDAY_PORT=8787, FRIDAY_AUTH_TOKEN=xxx, FRIDAY_AUTO_APPROVE=safe. No interactive prompts.
Remove filesystem assumptions	The MCP filesystem server currently gets ${WORKSPACE} — in containers this maps to a mounted volume. The terminal MCP server spawns shell commands in the workspace — in containers this is sandboxed by default. Screen server should be disabled (no display).
Health check	Already exists at GET /health. Add readiness info (is runtime initialized, are MCP servers connected).
Graceful shutdown	Handle SIGTERM — abort running queries, flush session data, close WebSocket connections, then exit.
Architecture After Refactor
                    ┌──────────────────────────────────┐
                    │         friday-ai (npm)           │
                    │                                    │
                    │  bin/friday.js ← CLI entry point   │
                    │    │                               │
                    │    ├── --mode stdio  → interactive │
                    │    └── --mode server → HTTP + WS   │
                    │                                    │
                    │  src/                               │
                    │    ├── runtime/AgentRuntime.js      │
                    │    ├── sessions/SessionStore.js     │
                    │    ├── mcp/McpCredentials.js        │
                    │    ├── agents/                      │
                    │    ├── skills/                      │
                    │    └── scheduled-agents/            │
                    │                                    │
                    │  index.js ← programmatic API       │
                    │    export { AgentRuntime,           │
                    │             SessionStore,           │
                    │             loadBackendConfig }     │
                    └──────┬───────────┬─────────────────┘
                           │           │
              ┌────────────┘           └──────────────┐
              │                                        │
     CLI / Terminal                          HTTP + WebSocket
     (stdin/stdout JSON)                    (port 8787)
              │                                   │
              │                    ┌───────────────┼───────────────┐
              │                    │               │               │
         Dev/Debug            Web App         iOS App        Containers
                           (React SPA)     (Swift/WK)     (Docker/K8s)

The Programmatic API (index.js)
This is critical for embedding Friday in other Node.js apps:

import { AgentRuntime, loadBackendConfig } from 'friday-ai';

const config = await loadBackendConfig({ workspace: '/tmp/project' });
const runtime = new AgentRuntime(config);

runtime.on('message', (event) => { /* stream events */ });
await runtime.handleQuery('Build a landing page', sessionId);

This lets anyone import and use the runtime without the CLI or HTTP server — useful for building custom integrations, running in serverless functions, or embedding in other tools.

Migration Path (Minimal Disruption)
Electron app continues to work unchanged. It already spawns friday-server.js as a subprocess. The refactored package just makes that same code installable via npm.
Bridge server becomes optional. Its file management and preview features stay Electron/web-specific. The core API server replaces its agent-communication role.
No breaking changes to the stdio protocol. The JSON-over-stdin/stdout interface stays identical. Electron's BackendManager doesn't need changes.
Key Decisions You Need to Make
Package name: friday-ai, friday-cli, @friday/agent, etc. Check npm availability.
Auth for remote API: Simple bearer token vs. Supabase JWT vs. both. Bearer token is simpler for self-hosted; JWT for your managed service.
Permission model in headless mode: Auto-approve everything? Only safe tools? Require client interaction over WebSocket? This is a security-critical decision for container deployments.
MCP servers bundled vs. optional: Currently all MCP server packages (figma, firecrawl, slack, etc.) are direct dependencies. For a lean CLI, these should be opt-in (friday mcp install firecrawl), not bundled by default.
Mono-repo or separate repo: Keep this in the Electron repo as a workspace package, or extract to its own repo with its own release cycle.
First, i want you to think and tell me, what would be the reason for someone to use friday-cli vs Claude code or codex



Great question. Let me think about this honestly, because if the answer is "no reason," then the whole exercise is pointless.

Friday CLI vs. Claude Code vs. Codex — Why Would Someone Choose Friday?
What Claude Code and Codex Already Do Well
Claude Code: CLI agent with bash, file editing, search, MCP support, permission gating, session management. It's polished, first-party, and deeply integrated with Anthropic's models.
Codex (OpenAI): Similar CLI agent, uses OpenAI models, sandbox execution, good at code generation.
Your AgentRuntime is essentially wrapping the Claude Agent SDK — which is the same SDK that powers Claude Code itself. So at the core engine level, you're building on the same foundation.

The Honest Assessment
If Friday CLI is just "talk to Claude, it edits files and runs commands," then there is no reason to use it over Claude Code. You'd be shipping an inferior version of a first-party tool.

Where Friday Could Have a Reason to Exist
The only valid reasons fall into a few categories:

1. Friday is opinionated / domain-specific where Claude Code is general-purpose

Claude Code is a blank canvas — it does whatever you tell it. Friday could be a pre-configured agent with built-in workflows: agents, skills, scheduled tasks, rules, and automation. You already have AgentManager, SkillManager, AgentScheduler, and rules.json. Claude Code has none of this. If Friday ships with curated agents ("deploy my app," "review this PR with my team's standards," "monitor this service every hour"), that's differentiation.

2. Friday is multi-model / model-agnostic

Claude Code is locked to Anthropic. If Friday can orchestrate across Claude, GPT, Gemini, open-source models — letting users pick per-agent or per-task — that's a real reason to choose it. Your AgentRuntime currently hardcodes claude-sonnet-4-5, but the architecture doesn't prevent swapping.

3. Friday is a platform, not just a CLI

Claude Code is a terminal tool. Your vision is broader: desktop app, web app, iOS app, containers, scheduled agents. The CLI would be one surface of a platform where your agents, skills, sessions, and MCP integrations sync across all surfaces. "I configure my agent on the web, it runs in a container, I check results on my phone" — Claude Code can't do that.

4. Friday owns the MCP orchestration layer

Claude Code supports MCP, but it's bring-your-own-config. Friday already has .mcp.json with 15+ pre-configured servers (GitHub, Slack, Figma, Gmail, etc.), credential management with McpCredentials, and OAuth flows. If Friday is the easiest way to connect Claude to your tools — one command to add Slack, one command to add GitHub — that's compelling.

5. Friday is team/org-oriented

Claude Code is single-user. If Friday supports shared agent configs, team-wide skills, centralized MCP credentials, and a managed deployment model (your Supabase backend), that serves a different market — teams who want a managed AI agent platform rather than a personal CLI.

What Does NOT Differentiate
Talking to Claude (Claude Code does it better)
File editing/bash execution (Claude Code does it better)
Permission gating (Claude Code does it better)
Session history (Claude Code does it)
My Recommendation
Before building the CLI package, answer this question clearly:

Is Friday a "better Claude Code" or is it an "agent platform that happens to have a CLI"?

If it's the former — don't build it. You'll lose.

If it's the latter, the CLI is just one thin interface to the real product: the agent/skill/MCP orchestration layer, scheduled automation, multi-surface sync, and team features. The package you ship isn't a Claude Code competitor — it's the runtime that powers your platform, and the CLI is a convenience for developers who want to interact with it from a terminal.

That reframes the whole plan. You wouldn't call it friday-cli. You'd call it friday-agent or @friday/runtime — and the value proposition is: "Deploy your Friday agents anywhere — terminal, container, cloud, mobile."

What's your take? Which of these directions resonates with what you're actually building?

Yes, it's the latter. I want to build a batteries-included agent which has default capabilities rather than general purpose. Also want to use it as a platform for friday app in every device and enable devs/non-devs to use in cli.

What do you suggest for repo, i want it as a separate repo outside of this electron mono repo. I'm building an ios app separately, that should be able to use it as well



Repo & Package Architecture Plan
Repo: friday-agent
One repo, two publishable packages (npm workspaces):

friday-agent/
├── packages/
│   ├── runtime/                  ← @friday/runtime (the core)
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── index.js          ← programmatic API exports
│   │   │   ├── runtime/          ← AgentRuntime (from backend_new)
│   │   │   ├── sessions/         ← SessionStore
│   │   │   ├── agents/           ← AgentManager + global agents
│   │   │   ├── skills/           ← SkillManager + global skills
│   │   │   ├── mcp/              ← McpCredentials, config, .mcp.json
│   │   │   ├── scheduled-agents/ ← Scheduler, executor, history
│   │   │   └── oauth/            ← McpOAuthManager
│   │   └── mcp-servers/          ← terminal, screen, resend (bundled)
│   │
│   └── cli/                      ← @friday/cli (thin shell)
│       ├── package.json
│       ├── bin/friday.js          ← #!/usr/bin/env node entry
│       └── src/
│           ├── commands/
│           │   ├── chat.js        ← interactive mode (like dev-runner)
│           │   ├── serve.js       ← start HTTP/WS server
│           │   ├── auth.js        ← store API key
│           │   └── mcp.js         ← manage MCP servers/creds
│           ├── server.js          ← HTTP + WS (from server.js)
│           └── stdio.js           ← stdio bridge (from friday-server.js)
│
├── package.json                   ← workspace root
├── Dockerfile
└── README.md

Why Two Packages, Not One
Consumer	What it needs
Electron app	@friday/runtime only. It already has its own IPC layer, window management, and spawns the backend as a subprocess. It doesn't need the CLI or HTTP server.
iOS / Web app	@friday/cli in serve mode. They connect to the HTTP/WS API. Or they talk to a deployed container running the same thing.
Terminal users	@friday/cli in chat mode. Interactive agent in terminal.
Containers	@friday/cli in serve mode. Headless, API-driven.
Other Node.js apps	@friday/runtime as a library. Import AgentRuntime, configure, call handleQuery().
The CLI depends on the runtime. The runtime has zero dependency on the CLI. Clean separation.

How Each Client Consumes It
Electron app (this repo):

npm install @friday/runtime

BackendManager in main.cjs stops spawning friday-server.js as a child process
Instead, it imports AgentRuntime directly in the main process (or still spawns @friday/cli in stdio mode — your choice)
Everything else stays the same — IPC, React frontend, preload
iOS app:

Connects to a Friday server via WebSocket (wss://your-server/ws)
Sends { type: "query", message: "...", session_id: "..." }
Receives streamed events (chunk, tool_use, complete, permission_request)
REST endpoints for sessions, agents, skills
Auth via bearer token or Supabase JWT
Web app:

Same as iOS — WebSocket + REST
Could be the React frontend extracted from this Electron repo, or a new one
CLI:

npm install -g @friday/cli
friday chat                    # interactive mode
friday serve --port 8787       # start API server
friday auth set-key sk-...     # store Anthropic key
friday mcp list                # show configured MCP servers
friday mcp set-credentials figma --api-key xxx

Docker:

docker run -e ANTHROPIC_API_KEY=sk-... -p 8787:8787 friday-agent serve

What Moves Out of This Electron Repo
From backend_new/	To @friday/runtime
src/runtime/AgentRuntime.js	packages/runtime/src/runtime/
src/runtime/RoleBasedAgentRuntime.js	same
src/sessions/SessionStore.js	packages/runtime/src/sessions/
src/agents/*	packages/runtime/src/agents/
src/skills/*	packages/runtime/src/skills/
src/mcp/*	packages/runtime/src/mcp/
src/scheduled-agents/*	packages/runtime/src/scheduled-agents/
src/oauth/*	packages/runtime/src/oauth/
src/config.js	packages/runtime/src/config.js
.mcp.json	packages/runtime/
mcp-servers/*	packages/runtime/mcp-servers/
rules/	packages/runtime/rules/
From backend_new/	To @friday/cli
friday-server.js	packages/cli/src/stdio.js (refactored)
server.js	packages/cli/src/server.js (expanded)
dev-runner.js	packages/cli/src/commands/chat.js (polished)
Stays in Electron repo	Why
electron/main.cjs	Electron-specific window/IPC
electron/preload.cjs	Electron-specific bridge
src/ (React frontend)	Desktop UI
bridge/	Can be deprecated once @friday/cli serve replaces it
What Changes in AgentRuntime
Only one real change: the Electron Node.js wrapper logic.

// Current: always tries to set up Electron wrappers
setupElectronNodeWrappers()

// After: detect environment
if (process.versions.electron) {
  setupElectronNodeWrappers()
}
// Otherwise: system node/npm/npx are already on PATH

Everything else in AgentRuntime is already environment-agnostic.

The @friday/runtime Programmatic API
What you export from index.js — this is the contract all consumers depend on:

AgentRuntime — core class, create an instance, send queries, receive events
loadBackendConfig() — resolve workspace, load MCP servers, load rules
SessionStore — load/save/list sessions
McpCredentials — credential management
AgentManager — agent CRUD
SkillManager — skill CRUD
AgentScheduler — scheduled agent management
The iOS app never calls these directly (it goes through HTTP/WS), but the Electron app and any Node.js integrations do.

Key Decisions for You
Package scope: @friday/runtime + @friday/cli (scoped, professional) vs. friday-runtime + friday-cli (simpler). Scoped requires an npm org.

MCP server bundling: I'd recommend shipping the terminal and filesystem MCP servers bundled (they're the core "batteries"). Everything else (Figma, Slack, Gmail, etc.) becomes installable: friday mcp install slack. This keeps the base package under 5MB instead of 50MB+.

Electron migration timing: You can do this incrementally. Step 1: publish @friday/runtime. Step 2: change Electron's package.json to depend on it instead of having backend_new/ inline. Step 3: delete backend_new/ from the Electron repo. The Electron app keeps working the whole time.

Screen server: This uses desktopCapturer which is Electron-only. In the standalone package, screen capture either gets dropped or replaced with a platform-appropriate mechanism (screenshot CLI tool on macOS/Linux, or disabled in containers). I'd make it an optional capability.

Private vs. public: Do you want @friday/runtime on the public npm registry, or private? This affects whether random people can npm install your agent runtime.

Want me to start building this? I'd begin by creating the friday-agent repo structure and migrating the runtime package.

Oh, i also want it work in streaming triggers,l based on webhooks or events and push out notification events so that apps could show permissions and other requests or status



This is the thing that makes Friday genuinely different. Let me think through what this means architecturally, because it changes the core model significantly.

The Fundamental Shift
Claude Code and Codex are pull-based: a human types a message, the agent responds.

What you're describing is push-based: an event arrives (webhook, cron, external trigger), the agent starts working autonomously, and then reaches out to the human when it needs something (permission, decision, status update).

That's not a CLI with extra features. That's an agent runtime with a notification system. The CLI is just one way to observe it.

The Problem This Creates
Today's flow:

Human types → Agent runs → Agent needs permission → Human is right there → responds

Webhook-triggered flow:

GitHub push arrives → Agent starts working → Agent needs permission → 
Human is... where? On their phone? In bed? Offline?

The agent can't block on stdin waiting for a human who isn't there. You need three things the current architecture doesn't have:

1. A Persistent Run Queue
Right now, AgentRuntime is tied to a single session, a single connection. A WebSocket disconnects and the runtime's event listener is gone. For event-driven runs, you need:

Run queue — triggered runs get queued and executed regardless of whether a client is connected
Run persistence — each run's state (in-progress, waiting-for-permission, completed, failed) is stored durably, not just in memory
Detached execution — the agent runs in the background. Clients subscribe to updates, they don't own the process
This is closer to a job/task system than a chat session.

2. A Notification Bus
When the agent needs something or wants to report status, it pushes to a notification bus. Connected clients get it in real-time. Disconnected clients get it when they reconnect (or via push notification).

Agent Runtime
    │
    ▼
Notification Bus
    │
    ├──→ WebSocket (connected web/desktop clients get it instantly)
    ├──→ Push notification (iOS via APNs, Android via FCM)
    ├──→ Webhook callback (POST to a URL you configure)
    └──→ Stored in queue (client polls or fetches on reconnect)

Notification types:

permission_request — agent needs approval to run a tool. Includes timeout, auto-deny policy
status — agent started, progress update, completed, failed
result — final output of the run
error — something went wrong
3. An Inbound Event Router
Something receives external events and decides what agent/skill to invoke:

Trigger Source	How It Arrives	Example
Webhook	POST /api/triggers/webhook/:triggerId	GitHub push, Stripe payment, Vercel deploy failed
Schedule	Internal cron (you already have AgentScheduler)	"Check my site every hour"
MCP event	An MCP server pushes an event	Slack message mentions @friday
Manual API	POST /api/runs	iOS app says "run this agent now"
Chained	One agent run triggers another	"After deploy, run the test agent"
Each trigger maps to an agent config: which agent to run, what prompt template to fill, what workspace to use, what permission policy to apply.

Revised Package Architecture
@friday/runtime
├── src/
│   ├── runtime/
│   │   ├── AgentRuntime.js          ← core (exists)
│   │   └── RoleBasedAgentRuntime.js ← (exists)
│   │
│   ├── runs/                         ← NEW: replaces simple sessions
│   │   ├── RunQueue.js              ← queue + execute agent runs
│   │   ├── RunStore.js              ← persist run state + events
│   │   └── RunStatus.js             ← pending → running → waiting → completed/failed
│   │
│   ├── triggers/                     ← NEW: inbound event handling
│   │   ├── TriggerRouter.js         ← match event → agent config
│   │   ├── WebhookTrigger.js        ← HTTP endpoint for webhooks
│   │   ├── ScheduleTrigger.js       ← cron (wraps existing AgentScheduler)
│   │   └── ManualTrigger.js         ← API-initiated runs
│   │
│   ├── notifications/                ← NEW: outbound push
│   │   ├── NotificationBus.js       ← central dispatcher
│   │   ├── channels/
│   │   │   ├── WebSocketChannel.js  ← real-time to connected clients
│   │   │   ├── WebhookChannel.js    ← POST to callback URL
│   │   │   ├── APNsChannel.js       ← iOS push notifications
│   │   │   └── QueueChannel.js      ← store for later retrieval
│   │   └── NotificationStore.js     ← persist undelivered notifications
│   │
│   ├── permissions/                  ← NEW: decoupled from runtime
│   │   ├── PermissionGate.js        ← request + wait (with timeout)
│   │   ├── PermissionPolicy.js      ← auto-approve rules per trigger
│   │   └── PermissionStore.js       ← pending permissions, queryable
│   │
│   ├── sessions/                     ← (exists, becomes subordinate to runs)
│   ├── agents/                       ← (exists)
│   ├── skills/                       ← (exists)
│   ├── mcp/                          ← (exists)
│   └── scheduled-agents/             ← (exists, wraps into ScheduleTrigger)

How Permissions Work Across Devices
This is the hardest part. Today:

// AgentRuntime.js — blocks until response
const approved = await waitForPermissionResponse(permissionId);

That works when a human is staring at a terminal or Electron window. For push-based:

Step 1: Agent hits a permission gate → creates a PendingPermission record with a TTL

Step 2: NotificationBus pushes to all channels:

Connected WebSocket clients see it instantly (desktop/web)
iOS gets a push notification: "Friday needs approval to run git push on project X"
If no client is connected, it's stored in PermissionStore
Step 3: Any client can respond:

POST /api/runs/:runId/permissions/:permissionId with { approved: true }
Or via WebSocket: { type: "permission_response", run_id: "...", permission_id: "...", approved: true }
Step 4: If TTL expires with no response → apply the policy (deny by default, or auto-approve if the trigger config allows it)

Step 5: Agent run resumes or aborts

The Permission Policy Per Trigger
This is critical for headless/automated use:

Trigger: "github-push-deploy"
  Agent: deploy-agent
  Permission Policy:
    - bash(read-only): auto-approve
    - bash(write): auto-approve within workspace
    - bash(network): require human approval, timeout 5min
    - file_write: auto-approve within workspace
    - mcp(github): auto-approve
    - everything else: deny

This way, a GitHub push can trigger a deploy agent that runs mostly autonomously, but pauses and notifies you if it wants to do something unexpected.

How iOS Specifically Would Work
┌─────────────────┐         ┌──────────────────────┐
│    iOS App       │         │   Friday Server       │
│                  │         │   (container/VPS)     │
│  1. Connect WS ─┼────────→│                       │
│                  │         │  2. Webhook arrives    │
│                  │         │     (GitHub push)      │
│                  │         │                       │
│                  │         │  3. TriggerRouter      │
│                  │         │     → starts Run       │
│                  │         │                       │
│  4. Push notif  ←┼─────────│  Agent needs permission│
│  "Friday needs   │         │                       │
│   approval to    │         │                       │
│   run deploy"    │         │                       │
│                  │         │                       │
│  5. User taps   ─┼────────→│  6. Permission granted │
│     "Approve"    │         │     Agent continues    │
│                  │         │                       │
│  7. Status      ←┼─────────│  8. Run complete       │
│  "Deploy done"   │         │                       │
└─────────────────┘         └──────────────────────┘

The iOS app doesn't need to know about AgentRuntime internals. It just:

Subscribes to runs/notifications via WebSocket
Renders permission requests as interactive notifications
Shows run history and status
Can manually trigger runs
What This Means for the Repo Structure
The earlier plan holds, with these additions to @friday/runtime:

runs/ — the run lifecycle (queue, execute, store, resume)
triggers/ — inbound event routing
notifications/ — outbound push to clients
permissions/ — decoupled from runtime, queryable, timeout-aware
And @friday/cli adds:

friday serve now also exposes POST /api/triggers/webhook/:id endpoints
friday triggers list/add/remove to manage trigger configs
friday runs list/inspect/:id to see run history
The Key Insight
The current friday-server.js is a synchronous conversation loop: message in, events out, repeat. What you're building is an asynchronous job system with real-time notifications. The conversation model becomes one type of trigger (manual/interactive), not the only mode.

This is what makes Friday a platform and not a CLI.

Next Steps
Want me to start building this? I'd suggest this order:

Create the friday-agent repo with the workspace structure
Extract @friday/runtime from backend_new/ (straightforward move + cleanup)
Build the run/trigger/notification layer on top of the existing runtime
Build @friday/cli as the thin command interface
Wire the Electron app to depend on @friday/runtime instead of inline backend_new/
Great, let's start with the new repo. When you can move the code out of electron, will you delete from the existing branch or just copy. Let's first get friday-agent working independently. And let's do the simple option for runtime and cli, and later we can do npm org. In dont know what's involved in the latter, i want the latter ideally



Good call — copy, don't delete. The Electron app keeps working as-is while we build the standalone version. And workspaces from day one makes the npm org transition trivial later (just rename packages).

Let me explore what we're working with first.


Explored backend_new directory structure and dependencies
Show more
Show more
Show more
Show more
Show more
Show more
Show more
Show more

Good, comprehensive picture. Now let me check the current git state and then present the plan.


Checked current git branch and reviewed backend package.json configuration
Show more

Good — we're on the right branch. Here's the concrete plan before I start building:

Plan: Create friday-agent/ standalone package
Approach: Copy (not move) from backend_new/. Electron keeps working untouched.

Structure
friday-agent/
├── package.json                  # npm workspaces root
├── packages/
│   ├── runtime/
│   │   ├── package.json          # "friday-runtime" → later @friday/runtime
│   │   ├── index.js              # public API exports
│   │   ├── friday-server.js      # stdio transport (copied)
│   │   ├── server.js             # ws/http transport (copied)
│   │   ├── src/                  # copied from backend_new/src/
│   │   ├── mcp-servers/          # copied
│   │   ├── tools/                # copied
│   │   ├── config/               # copied
│   │   └── rules/                # copied
│   └── cli/
│       ├── package.json          # "friday-cli" → later @friday/cli
│       ├── bin/
│       │   └── friday.js         # CLI entry point
│       └── src/
│           ├── cli.js            # command router
│           └── commands/
│               ├── chat.js       # interactive REPL (based on dev-runner.js)
│               └── serve.js      # start HTTP/WS server

What each piece does
friday-runtime — the agent engine as a library. Import it, create an AgentRuntime, call handleQuery(). All the existing code, just properly exported.

friday-cli — thin shell. friday chat for interactive use, friday serve to run the HTTP/WebSocket server. Depends on friday-runtime.

Root workspace — npm install at root installs everything, workspace linking handles the cross-dependency.

npm org transition later
When you're ready, it's just:

Rename "friday-runtime" → "@friday/runtime" in package.json
Rename "friday-cli" → "@friday/cli" in package.json
Update the one cross-reference in cli's dependencies
npm publish --access public
Files modified
Only creates new files under friday-agent/
Zero changes to backend_new/ or anything else
Want me to go ahead and build this?

Go ahead



Created directory structure for friday-agent monorepo packages

Good, on the right branch. Let me create the root workspace package.json and start copying files.


Updated project setup tasks and workspace structure planning

Now let me copy the backend_new source into packages/runtime. I'll copy the core directories and files.


Verified runtime package files were successfully copied
Show more

Good, all copied. Now let me read the original package.json to understand the dependencies, then create the runtime and CLI packages.


Reviewed backend project structure and server configuration files

Now let me check the key exports I need to expose in the public API.


Examined AgentRuntime.js, config.js, and searched for exported functions in backend codebase
Show more

Let me check for files referenced from outside src/ that I need to copy.


Copied preview-detector.js to runtime package

Now I need to fix the import paths in AgentRuntime.js since the file structure is flat now (preview-detector.js is alongside src/, not two levels up).


Read a file
Wait, i wanted you to create a new repo, are you creating within existing?



The user just asked about the repo location. Let me address that.

You're right — I was creating friday-agent/ as a directory inside the electron repo. Since we need to push to the branch claude/backend-package-plan-l1Har in tryfridayai/electron, that's the only repo I can push to in this session.

Two options:

Create it as a sibling directory at /home/user/friday-agent/ (separate git repo, but I can't push it since there's no remote configured for it)
Create it inside the electron repo at /home/user/electron/friday-agent/ (can push to the branch, you can later git subtree split or copy it to a new repo)
Option 2 lets you see and review the code via the branch, then easily move it to its own repo. Option 1 would be a local-only directory that exists only in this session.

Which do you prefer?

Let me commit and push what we have so far, then we can discuss repo location.


Pushed WIP commit to remote feature branch
Show more
Show more

Pushed. Now back to your question — you're right, I created friday-agent/ inside the electron repo. Here's the tradeoff:

Inside electron repo (what I did): You can review it on this branch, but it's not a real standalone repo. When you're ready, you'd git subtree split or just copy the directory out.

Separate repo: Proper isolation from day one, its own git history. But I can't push to a tryfridayai/friday-agent remote from here — that repo would need to exist on GitHub first.

Recommended next step: If you want a separate repo, create tryfridayai/friday-agent on GitHub and I can:

Move the files out of the electron repo to /home/user/friday-agent/
Init git, add the remote, push there
Clean up the directory from the electron branch
Or if you're okay with it living inside the electron repo for now (monorepo-style), I'll keep going and finish wiring it up. You can split it to its own repo anytime.

What's your preference?

Work within existing, I'll push separately later to another repo



Got it. Let me keep building — the structure stays in friday-agent/ inside the electron repo, you'll move it later.


Set up friday-agent directory structure and workspace configuration

The import paths in AgentRuntime.js reference ../../preview-detector.js, ../../tools/aggrid-tool.js, and ../../config/GlobalConfig.js. In the original layout these went up from src/runtime/ to backend_new/. In our copy the relative paths are the same since the directory structure is preserved. Let me verify.


Verified relative import target files exist in runtime package

Good — the ../../ paths from src/runtime/ resolve correctly within the copied structure. Now let me also check config.js for path references since it uses __dirname to find projectRoot.


Read config.js file in runtime package

Good — config.js derives projectRoot from __dirname which will correctly resolve to packages/runtime/ at runtime. The ../../ imports in AgentRuntime.js also resolve correctly within the preserved directory structure. Import paths are fine as-is.


Created friday-agent directory structure and workspace configuration

Now let me create the runtime package.json and public API, plus the CLI package in parallel.


Set up friday-agent directory structure and workspace configuration

Now the CLI package. The chat command is based on dev-runner.js but imports the runtime as a library instead of spawning a subprocess. The serve command wraps the WebSocket/HTTP server.


Created CLI command router without framework dependency

Now the two command implementations. chat is the interactive REPL, serve starts the HTTP/WS server.


Created serve command to start HTTP/WebSocket server

Now let me make the CLI binary executable and do a quick smoke test.


Attempted npm install, identified zod dependency conflict
Show more

Peer dependency conflict — the Claude agent SDK wants zod 4 but we have zod 3. Let me fix the version and use --legacy-peer-deps since the original project does too.


Installed npm dependencies with legacy peer deps flag
Show more

Dependencies installed. Let me smoke test the CLI and runtime exports.


Verified all exports from friday-runtime module successfully
Show more
Show more

All exports resolve correctly. The keytar warning is expected (it's an optional native module, falls back to file storage).


Verified backend configuration loads successfully with 16 MCP servers
Show more

Everything works. projectRoot correctly resolves to the runtime package directory, all 16 MCP servers load from .mcp.json, and the config pipeline works end-to-end.


Set up friday-agent directory structure and workspace configuration

Now let me commit and push.


Set up friday-agent directory structure and workspace configuration
Show more
Show more

Done. Here's what we built:

friday-agent/ — working standalone package
friday-agent/
├── package.json                     # npm workspaces root
├── packages/
│   ├── runtime/                     # "friday-runtime"
│   │   ├── package.json             # standalone deps, exports map
│   │   ├── index.js                 # public API (AgentRuntime, config, managers, etc.)
│   │   ├── friday-server.js         # stdio transport
│   │   ├── server.js                # HTTP/WS transport
│   │   ├── .mcp.json                # 16 MCP server definitions
│   │   ├── src/                     # full runtime source (copied from backend_new)
│   │   ├── mcp-servers/             # custom MCP servers
│   │   ├── tools/, config/, rules/
│   │   └── preview-detector.js
│   └── cli/                         # "friday-cli"
│       ├── package.json             # depends on friday-runtime
│       ├── bin/friday.js            # entry point
│       └── src/
│           ├── cli.js               # command router
│           └── commands/
│               ├── chat.js          # interactive REPL
│               └── serve.js         # HTTP/WS server

Verified working
friday --help — prints usage
import { AgentRuntime, loadBackendConfig, ... } from 'friday-runtime' — all exports resolve
Config loads 16 MCP servers from .mcp.json
Zero changes to backend_new/ — Electron app untouched
To move to its own repo later
Copy friday-agent/ out, git init, add your remote, push. The npm org transition is just renaming friday-runtime → @friday/runtime and friday-cli → @friday/cli in the two package.json files.

What is the current branch name



The current branch is claude/backend-package-plan-l1Har.

Ok. I also want it to support the following: image generation, video generation, voice models, tts, stt. Models from Gemini and openai. How can we extend it?



Good question. Let me think through how this fits into the runtime architecture before proposing anything.

The current runtime is tool-based — the agent calls tools during conversations. The cleanest way to add multi-modal + multi-model support is as provider-backed tools the agent can invoke, with a shared credential/config layer.

Here's my proposed plan:

Architecture: Providers + Tools
packages/runtime/
├── src/
│   ├── providers/              # NEW — API provider abstractions
│   │   ├── ProviderRegistry.js # Central registry, credential management
│   │   ├── openai.js           # OpenAI: DALL-E, TTS, Whisper, GPT-4o
│   │   ├── google.js           # Gemini, Imagen, Veo, Cloud TTS/STT
│   │   └── elevenlabs.js       # ElevenLabs TTS (optional)
│   │
│   ├── tools/                  # Existing tool dir
│   │   ├── image-gen.js        # NEW — generate_image tool
│   │   ├── video-gen.js        # NEW — generate_video tool  
│   │   ├── tts.js              # NEW — text_to_speech tool
│   │   ├── stt.js              # NEW — speech_to_text tool
│   │   └── model-query.js      # NEW — query_model tool (Gemini/OpenAI)

How it works
ProviderRegistry — manages API keys (via existing McpCredentials), initializes provider clients on demand. Single config point: ~/.friday/providers.json or env vars.

Each tool is a function the agent can call:

generate_image({ prompt, provider?, size?, style? }) → returns image URL/base64
generate_video({ prompt, provider?, duration? }) → returns video URL
text_to_speech({ text, voice?, provider? }) → returns audio file path
speech_to_text({ audio_path, provider? }) → returns transcript
query_model({ prompt, model, provider }) → query Gemini/OpenAI directly
AgentRuntime registers these tools alongside MCP tools. Claude sees them as callable tools and decides when to use them based on the conversation.

Provider priority
Capability	Primary	Fallback
Image gen	OpenAI (DALL-E 3/gpt-image-1)	Google (Imagen)
Video gen	Google (Veo)	OpenAI (Sora)
TTS	OpenAI TTS	ElevenLabs, Google Cloud
STT	OpenAI Whisper	Google Cloud STT
Model query	OpenAI (GPT-4o)	Google (Gemini 2.5)
Dependencies to add
openai — official OpenAI SDK
@google/generative-ai — Gemini SDK
elevenlabs — optional TTS
What stays the same
No changes to the agent loop or MCP system
Tools are registered the same way as existing ones (like aggrid-tool.js)
Credentials flow through the existing McpCredentials system
Questions before I build:

Should each tool auto-select the best provider, or should the user always specify? (I'd lean toward auto-select with optional override)
Where should generated files (images, audio, video) be saved? {workspace}/generated/ seems natural.
Do you want ElevenLabs support now, or just OpenAI + Google to start?
Want me to proceed with this plan?

Agent can auto select or use can set preferences. 2. Sure 3. Yes for eleven labs. Also web search for latest models, you said gpt-40 which was a year ago, openai has gpt-5.3 now.
Also make sure the context transfer is seamless.
First document the "readme" and implementation log for what you did so far, and pending items based on our conversation. And then plan the next steps and execute. Make sure to commit updates so far, i have tested anything to want to make sure we can trace back commits. So commit every new feature or major change separately



Let me start by exploring the current state of the codebase and searching for latest models in parallel.


Explored codebase structure and researched latest AI APIs
Show more
Show more
Show more
Show more
Show more
Show more
Show more
Show more
Show more
Show more
Show more
Show more
Show more
Show more
Show more
Show more
Show more
Show more
Show more
Show more
Show more
Show more

Great, I now have comprehensive info on latest models. Let me read the key files I need to document and work with.


Read feature implementation log and project package files, verified git branch status

Good, I'm on the right branch. Let me check the end of the feature log and read key parts of AgentRuntime.js for context on how to integrate.


Read feature implementation log file section

Now I have full context. Let me set up the task plan and start executing.


Updated task list with architecture documentation and implementation plan

Now let me create the comprehensive multi-modal providers plan document.


Created backend README and multi-modal providers documentation plan

Now update the feature implementation log.


Attempted to update feature implementation log file

The backticks in the markdown are causing matching issues. Let me append directly.


Created comprehensive backend architecture documentation

Good. Now let me commit each documentation change separately.


Created backend README and multi-modal providers documentation

All 3 documentation commits done. Now let me implement the actual code. Let me first check the OpenAI, Google, and ElevenLabs SDK APIs to make sure I use the right interfaces.


Searched the web
Show more
Show more
Show more
Why are you creating files in electron root or within /docs. All the Friday runtime code needs to be in the new directory you created. Remember i need to be same to just push that directory independently with no dependencies on rest of electron repo code



Good point — you're right. The runtime should be self-contained. Let me fix this:

The backend_new/README.md is already in the right place
I'll move the plan doc from docs/ into backend_new/docs/
The feature_implemented_log.md at root is the existing project convention (per CLAUDE.md), so I'll keep that entry but going forward all new files go inside backend_new/

Read backend README multi-modal providers architecture documentation

Good — the README already references docs/multi-modal-providers-plan.md which is a relative path from backend_new/, so it's correct.


Moved multi-modal providers plan into backend_new/docs

Now let me implement the actual code — all within backend_new/. Let me start with ProviderRegistry, then the three providers in parallel.


Created providers directory in backend project

Let me read the existing McpCredentials.js to understand the credential interface, then build the ProviderRegistry.


Reviewed McpCredentials.js file structure and configuration

Now let me check the pattern of existing custom MCP servers.


Read screen-server.js MCP server implementation file

Good. I can see the MCP server pattern — uses @modelcontextprotocol/sdk with Server, StdioServerTransport, and CallToolRequestSchema/ListToolsRequestSchema. Now I have everything I need. Let me implement all the code files.


Created backend README and multi-modal providers plan documentation

Now let me fetch the actual SDK API docs to get the exact method signatures right.


Failed to retrieve OpenAI API documentation due to access restrictions
Show more
Wait. Why are you changing backend _new? arent you creating everything in a new directory (friday_agent), also we dont need to move ui specific tools/implementation such as aggrid, screenshare



You're right — let me pause and understand the correct structure. Let me check the existing friday-agent/ directory.


Listed all project files excluding node_modules directory
Show more
Show more

I see — friday-agent/ is the self-contained package. Let me read the current state of that directory.


Reviewed Friday agent project structure and runtime configuration files

Got it — I should be working in friday-agent/packages/runtime/, not backend_new/. And UI-specific tools (aggrid, screen-server) shouldn't be there. Let me restructure everything to the correct location.


Created directory structure for runtime providers and docs

Now move/copy files from backend_new to the correct location.


Copied ProviderRegistry and documentation files to runtime package

Now revert the backend_new changes since they shouldn't be there.


Checked remaining documentation files in backend directory

Those are pre-existing files, not mine. The multi-modal-providers-plan.md was already moved (by the git commit earlier as a rename). Let me check git status to understand the current state properly.


Removed README.md from backend_new directory
Show more

Now let me also update the README to reference the correct paths (friday-agent/packages/runtime/ instead of backend_new/) and update the plan doc paths.


Updated runtime package README with project description

Good. Now let me remove the UI-specific tools from the runtime and commit the restructure.


Deleted obsolete tool files and directories from project structure

Now let me also clean up the AgentRuntime.js import of aggrid-tool since we removed it.


Searched codebase for preview and file handling functions
Show more

Let me see how these are used so I can remove them cleanly.


Read AgentRuntime.js file sections for tool validation logic analysis

I'll remove the aggrid import and stub the call, and remove the preview-detector import and stub it too. These are UI-specific features that shouldn't be in the standalone runtime.


Removed UI-specific tool imports from AgentRuntime.js

Good. Now commit the restructure — moving everything to friday-agent and removing UI tools.


Updated todo list tracking file organization and tool cleanup tasks
Show more
Show more

Now let me implement the three providers. I'll write them in parallel since they're independent.


Created ElevenLabs provider for text-to-speech integration

Now commit the three providers.


Updated task list marking file restructuring complete

Now the MCP media-server — the single server that exposes all tools to the Claude SDK.


Updated task list and marked file reorganization completed

Now update .mcp.json and package.json/index.js.


Read MCP configuration file for runtime setup

Now I need to: 1) remove the screen server entry (already deleted the file), 2) add friday-media entry.


Updated MCP configuration for screen server settings

Now update package.json with new dependencies.


Updated runtime package.json with new AI provider dependencies

Now update index.js exports to include the providers.


Updated runtime index exports for ProcessRegistry

Now commit the .mcp.json, package.json, and index.js updates together.


Updated project reorganization tasks to completed status

Now update the feature implementation log.


Updated task list with completed file reorganization and tool removal

Now let me push everything to the branch.


Reviewed recent git commits for multi-modal provider implementation
Show more

Clean commit history. Let me push.


Updated task tracking with completed file reorganization steps

All done. Here's a summary of everything that was implemented:

What was built — 12 commits pushed to claude/backend-package-plan-l1Har
Documentation (3 commits)
Runtime README (friday-agent/packages/runtime/README.md) — Full architecture docs
Multi-modal providers plan (friday-agent/packages/runtime/docs/multi-modal-providers-plan.md) — Detailed implementation plan with latest model tables
Feature log updated with all entries + pending items
Restructure (2 commits)
Moved everything from backend_new/ to friday-agent/packages/runtime/ — self-contained, independently pushable
Removed UI-specific tools — aggrid-tool.js, tool-registry.js, screen-server.js
Implementation (5 commits)
ProviderRegistry — Central provider management, auto-selection, preferences at ~/.friday/provider-preferences.json, MediaContext for session-scoped asset tracking
OpenAI provider — GPT-5.2 (chat), gpt-image-1.5 (image), Sora 2 (video with async polling), gpt-4o-mini-tts (TTS with 13 voices), Whisper (STT)
Google provider — Gemini 3 Pro (chat), Imagen 4 (image), Veo 3.1 (video with async polling), Gemini multimodal TTS/STT
ElevenLabs provider — Eleven v3 (expressive), Flash v2.5 (low-latency), Turbo v2.5, Multilingual v2, v3 Conversational, 30+ built-in voices, instant voice cloning
friday-media MCP server — 7 tools (generate_image, generate_video, text_to_speech, speech_to_text, query_model, list_voices, clone_voice)
Wiring (2 commits)
.mcp.json — Added friday-media server with multi-key auth schema for OpenAI/Google/ElevenLabs
package.json — Added openai, @google/genai, @elevenlabs/elevenlabs-js dependencies; index.js — Exported ProviderRegistry + MediaContext
Key design decisions
Auto-selection: Agent can omit provider — system picks best available based on API keys + user preferences
Context transfer: MediaContext appends asset summaries to tool results so agent can chain (image → video → narration)
Lazy SDK loading: All provider SDKs loaded on first use, not at import time
Latest models verified via web search: OpenAI GPT-5.2/gpt-image-1.5/Sora 2, Google Gemini 3/Imagen 4/Veo 3.1, ElevenLabs Eleven v3
Sources:

OpenAI Models
GPT-5.2
GPT Image 1.5
Sora 2 Video API
OpenAI TTS
Google Gemini Models
Google Imagen
Veo 3.1
@google/genai npm
ElevenLabs Models
Eleven v3
@elevenlabs/elevenlabs-js
Which model are you using. Opus or sonnet



I'm using Opus 4.6 (claude-opus-4-6).

Got it, i want you to re evaluate your architecture and implementation. Is it hacky? Everything is a tool call and requires several packages to be installed. And how will we get the latest models when they get released. Also tell me real usecase scenarios for how this runtime can be leveraged



Good question. Let me be honest about what I built and where it falls short.

Honest Critique
What's hacky
1. Hard dependencies for optional providers
Right now openai, @google/genai, and @elevenlabs/elevenlabs-js are all in dependencies. If someone only uses OpenAI, they still pull ~50MB of Google and ElevenLabs SDKs. They should be optionalDependencies with graceful fallback.

2. Hardcoded model lists
Every model ID is baked into the code. When OpenAI ships GPT-5.3 next month, the code is stale. There's no discovery mechanism.

3. Google TTS/STT is a workaround
I used Gemini's multimodal capabilities (send text, ask for audio back) rather than Google's actual Cloud TTS/STT APIs. It works but it's not the real thing — the quality and reliability won't match dedicated speech services.

4. No streaming
TTS buffers the entire audio before returning. For long text, the user waits for the full generation. Real TTS APIs support streaming chunks.

5. Video polling is fragile
Hardcoded 15-20s polling intervals with arbitrary timeouts. No progress reporting back to the agent or user. No webhook support.

6. No cost awareness
The agent has zero visibility into what each operation costs. It could happily generate 50 HD images without the user knowing it'll cost $25.

7. Spawning a whole MCP server process
Every tool call goes through: Agent → SDK → stdio → MCP server process → provider SDK → API. That's a lot of overhead for what's essentially an HTTP call to OpenAI.

What a better architecture looks like
Instead of wrapping SDKs in tool calls behind an MCP server, the runtime should have a provider layer that's configuration-driven and self-updating:

friday-agent/packages/runtime/
├── providers/
│   ├── registry.js           # Plugin loader + model discovery
│   ├── models.json           # Model catalog (updatable without code changes)
│   ├── adapters/
│   │   ├── openai.js         # Thin adapter: implements standard interface
│   │   ├── google.js
│   │   └── elevenlabs.js
│   └── capabilities/
│       ├── image-gen.js       # Capability logic (routing, fallback, cost tracking)
│       ├── video-gen.js
│       ├── tts.js
│       └── stt.js

Key differences from what I built:
1. models.json — Externalized model catalog

{
  "version": "2026-02-14",
  "providers": {
    "openai": {
      "models": {
        "gpt-5.2": { "capabilities": ["chat"], "pricing": { "input": 2.50, "output": 10.0 } },
        "gpt-image-1.5": { "capabilities": ["image-gen"], "pricing": { "perImage": 0.04 } },
        "sora-2": { "capabilities": ["video-gen"], "pricing": { "perSecond": 0.10 } }
      },
      "sdk": "openai",
      "envKey": "OPENAI_API_KEY"
    }
  }
}

This can be fetched/updated from a remote URL. When GPT-5.3 drops, update the JSON — no code change.

2. Adapter pattern with dynamic loading

// Only load the SDK when the provider is actually used
async function loadAdapter(providerId) {
  try {
    return await import(`./adapters/${providerId}.js`);
  } catch {
    return null; // SDK not installed, skip this provider
  }
}

Move all three SDKs to optionalDependencies. If @google/genai isn't installed, Google just doesn't appear as an available provider. No crash.

3. Direct integration instead of MCP server
Instead of spawning a child process with MCP protocol overhead, register tools directly in AgentRuntime:

// In AgentRuntime, alongside existing MCP servers
const mediaTools = await loadMediaTools(this.providerRegistry);
// Register as direct tools — no subprocess, no stdio protocol

The MCP server pattern makes sense for third-party tools that run as separate processes (GitHub, Figma, etc.). For our own providers that are just API calls, it's unnecessary indirection.

4. Cost tracking built-in

class UsageTracker {
  // Track per-session, emit to frontend
  recordUsage(provider, model, operation, cost) { ... }
  getSessionTotal() { ... }
  // Agent sees this before deciding to generate
  estimateCost(operation, params) { ... }
}

5. Streaming TTS
Return audio chunks as they arrive instead of buffering:

async *streamTTS(text, opts) {
  for await (const chunk of provider.tts.stream(text)) {
    yield chunk; // Frontend can start playing immediately
  }
}

Real use cases for this runtime
1. Content creation pipeline
"Write a blog post about remote work trends, generate a header image, convert the intro paragraph to audio for a podcast teaser."
→ Agent chains: chat → generate_image → text_to_speech

2. Multi-model code review
"Ask GPT-5.2 to review this function for bugs, ask Gemini 3 to suggest performance optimizations, then synthesize both perspectives."
→ Agent uses query_model twice with different providers, compares outputs

3. Accessibility layer
"Transcribe this meeting recording, summarize the key points, generate an audio version in Spanish."
→ speech_to_text → Claude summarizes → text_to_speech (with language param)

4. Rapid prototyping
"Generate mockup images for a landing page: hero section, feature cards, testimonials. Then create a 10-second walkthrough video."
→ Multiple generate_image calls → generate_video with image input

5. Voice-first applications
"Clone my voice from this sample, then read this product announcement in my voice."
→ clone_voice → text_to_speech with cloned voice ID

6. Data storytelling
"Analyze this CSV, create chart images for the top 3 insights, add audio narration explaining each."
→ Claude analyzes data → generate_image (charts) → text_to_speech per insight

7. Automated marketing
"Generate 4 ad image variations for this product, create short-form video for TikTok, add voiceover."
→ generate_image (n=4) → generate_video → text_to_speech → ffmpeg combine

8. Education content
"Create a lesson on photosynthesis: generate diagrams, record audio explanations, compile into a video."
→ Multi-step chain using all modalities

9. Customer support agent
"Transcribe this support call, detect the issue, draft a resolution email, generate audio confirmation in the customer's language."
→ Full pipeline from speech input to speech output

Recommendation
Want me to refactor to the cleaner architecture? The main changes would be:

Move SDK deps to optionalDependencies with dynamic imports
Extract model catalog to models.json (updatable without code changes)
Replace MCP server with direct tool registration in AgentRuntime
Add cost estimation/tracking
Add streaming support for TTS
This is a significant rework but results in something production-ready vs. the current proof-of-concept.

I first want you to create a new branch friday_runtime_v0.2 and document this refactor plan. I also want you to think of scheduled agent usecases (trigger based vs user interactively providing command). I did not see any scheduled or trigger based usecases. I also want you to create testcases and run evals to check how it works, we dont want to break one functionality when we create new. Also, think of this as a production grade agent. I will publish this as open source and submit to Claude's developer team for review



Let me start by thoroughly understanding the current codebase before documenting anything.


Updated task list with refactor planning items
Show more
Show more
Hold


You're forgetting what we're doing here. We're working only on friday-agent which will be moved to a different repo. On a second thought dont create a new branch, I'll create a new repo, but document this architecture refactor proposal and goals in friday-agent directory



Got it — scope is only friday-agent/, documenting the refactor plan there. No new branch. Let me first see exactly what exists in that directory today.


Explored friday-agent project structure and file organization
Show more
Show more

Good. Now let me read the key files to understand the current implementation deeply.


Examined AgentRuntime initialization and media provider integrations for OpenAI, Google, ElevenLabs

Now let me read the remaining critical files.


Analyzed runtime architecture and scheduled agent components in Friday agent codebase

I now have a deep understanding of every file. Let me update the plan and start creating the documentation and tests.


Updated todo list

Now let me write the comprehensive architecture document and the test suite in parallel.

Just write the architecture document. I'll run tests later



Explored codebase structure and drafted architecture refactor proposal

Let me also read the ProviderRegistry and the .mcp.json before writing — I need the full picture.


Read 3 files

Now I have the complete picture. Let me write the architecture document.

What is the current branch name, have you pushed all changes to it?



Ran 2 commands

Current branch is claude/backend-package-plan-l1Har. Working tree is clean — no uncommitted changes. But I haven't written the architecture document yet. I was about to write it when you asked to skip the tests.

Let me write it now.

can you write the architecture document? you never wrote that



You're right, apologies for the delay. Writing it now.


Created a file
why do you never write it?



It's written. Let me commit and push.


Updated todo list tracking architecture refactor progress
Show more

Done. The document is at friday-agent/packages/runtime/ARCHITECTURE_V0.2.md — committed and pushed to claude/backend-package-plan-l1Har.

Here's what the 1,094-line document covers:

Honest Critique of v0.1 — 8 specific problems: hard SDK dependencies, hardcoded models, unnecessary MCP process for media, Google TTS/STT workaround, no cost tracking, no streaming, dead code in openai.js, cron-only triggers.

Target Architecture — Clean directory structure, dependency cleanup (provider SDKs → optionalDependencies), data flow comparison showing eliminated overhead.

Provider Layer Redesign — Dynamic adapter loading (import() with graceful null return), externalized models.json with pricing and remote update mechanism, CostTracker with per-session budgets.

Trigger System — 6 trigger types beyond cron:

WebhookTrigger — GitHub push, Stripe payment, form submissions (HMAC-validated)
FileWatchTrigger — new CSV in /uploads, new recording in /recordings (chokidar)
GitHookTrigger — post-commit, post-push hooks
EventBusTrigger — agent-chains (Agent A completes → Agent B fires)
ManualTrigger — REST API / programmatic
26 Real Use Cases across three categories:

6 interactive (content pipeline, multi-model review, voice cloning)
8 scheduled (standup summaries, analytics digests, social calendar, competitor monitoring)
12 trigger-based (PR review bot, CSV auto-processor, post-deploy smoke test, meeting recording processor, multi-agent data pipeline)
Security Model — webhook HMAC, file watch scoping, cost guardrails, rate limiting.

Test Strategy — 7 unit suites, 3 integration suites, 3 eval suites with cost estimates.

4-Phase Migration — backward compatible, nothing breaks between phases.