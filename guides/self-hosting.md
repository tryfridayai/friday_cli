# Self-Hosting Friday

Run Friday as a server for iOS apps, web clients, or other remote consumers.

## Docker (Recommended)

```bash
# 1. Clone the repo
git clone https://github.com/tryfridayai/friday_cli.git
cd friday_cli

# 2. Create .env from template
cp .env.example .env
# Edit .env — set ANTHROPIC_API_KEY at minimum

# 3. Start
docker compose up -d

# Server is now running at http://localhost:8787
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Claude API key |
| `OPENAI_API_KEY` | No | For image generation, TTS, STT |
| `GOOGLE_API_KEY` | No | For Imagen, Veo, Gemini |
| `ELEVENLABS_API_KEY` | No | For high-quality TTS |
| `FRIDAY_PORT` | No | Server port (default: 8787) |

### Persistent Storage

Docker compose creates two volumes:

- `friday-config` → `/root/.friday` (plugins, permissions, preferences)
- `friday-workspace` → `/workspace` (agent working directory)

To use a local directory instead:

```yaml
volumes:
  - ./my-workspace:/workspace
  - ./my-config:/root/.friday
```

## Without Docker

```bash
cd packages/runtime
npm install
export ANTHROPIC_API_KEY=sk-ant-...
node server.js
```

## HTTP API

### Health Check

```
GET /health
→ { "status": "ok" }
```

### Send Query (REST)

```
POST /query
Content-Type: application/json

{ "message": "Hello", "session_id": "optional" }

→ { "result": "...", "session_id": "..." }
```

### Sessions

```
GET /sessions              → List sessions
GET /sessions/:id          → Get session metadata
GET /sessions/:id/events   → Get session event log
DELETE /sessions/:id       → Delete session
```

### Agents

```
GET /agents                → List available agents
```

## WebSocket API

For streaming responses, connect via WebSocket:

```javascript
const ws = new WebSocket('ws://localhost:8787');

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'query',
    message: 'Build me a landing page',
    session_id: 'my-session-1',
  }));
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  switch (msg.type) {
    case 'chunk':
      process.stdout.write(msg.text);
      break;
    case 'tool_use':
      console.log(`Using tool: ${msg.tool}`);
      break;
    case 'complete':
      console.log(`\nDone. Cost: $${msg.cost?.estimated}`);
      break;
  }
};
```

## Security Considerations

- The server binds to `0.0.0.0` — use a reverse proxy (nginx, Caddy) for TLS
- Set up authentication in your reverse proxy; the runtime has no built-in auth
- Permission profiles control what the agent can do, not who can connect
- For production, use the `headless` permission profile and configure per-tool rules
- Never expose the server directly to the internet without authentication
