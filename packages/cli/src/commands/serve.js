/**
 * friday serve — Start the HTTP/WebSocket server
 *
 * Exposes the agent runtime over WebSocket (for real-time streaming)
 * and HTTP REST (for agent/skill management). Clients connect via
 * ws://host:port/ws for conversations.
 */

import http from 'http';
import { WebSocketServer } from 'ws';
import { AgentRuntime, loadBackendConfig, agentManager, skillManager } from 'friday-runtime';

// --- HTTP helpers ---

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data));
}

function parseUrl(url) {
  const [pathname, queryString] = url.split('?');
  const query = {};
  if (queryString) {
    queryString.split('&').forEach((pair) => {
      const [key, value] = pair.split('=');
      query[decodeURIComponent(key)] = decodeURIComponent(value || '');
    });
  }
  return { pathname, query };
}

// --- Server ---

export default async function serve(args) {
  const port = Number(args.port || process.env.PORT || 8787);

  if (args.help) {
    console.log(`
friday serve — Start HTTP/WebSocket server

Options:
  --port <port>        Port to listen on (default: 8787)
  --workspace <path>   Working directory for agent (default: ~/FridayWorkspace)
`);
    process.exit(0);
  }

  if (args.workspace) {
    process.env.FRIDAY_WORKSPACE = args.workspace;
  }

  const config = await loadBackendConfig();

  const httpServer = http.createServer(async (req, res) => {
    const { pathname, query } = parseUrl(req.url);
    const method = req.method;

    if (method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }

    try {
      // Health check
      if (pathname === '/health') {
        sendJson(res, 200, { ok: true, workspace: config.workspacePath });
        return;
      }

      // --- Agent endpoints ---

      if (pathname === '/api/agents' && method === 'GET') {
        const userId = query.userId || 'default';
        const agents = await agentManager.getUserAgents(userId);
        sendJson(res, 200, { agents });
        return;
      }

      const agentMatch = pathname.match(/^\/api\/agents\/([^/]+)$/);
      if (agentMatch && method === 'GET') {
        const userId = query.userId || 'default';
        try {
          const agent = await agentManager.loadUserAgentConfig(userId, agentMatch[1]);
          sendJson(res, 200, { agent });
        } catch (error) {
          sendJson(res, 404, { error: error.message });
        }
        return;
      }

      if (pathname === '/api/agents/custom' && method === 'POST') {
        const body = await parseBody(req);
        const { userId = 'default', agentData } = body;
        const newAgent = await agentManager.createUserAgent(userId, agentData);
        sendJson(res, 201, { success: true, agent: newAgent });
        return;
      }

      // --- Skill endpoints ---

      if (pathname === '/api/skills' && method === 'GET') {
        const userId = query.userId || 'default';
        const skills = await skillManager.getUserAvailableSkills(userId);
        sendJson(res, 200, skills);
        return;
      }

      if (pathname === '/api/skills/search' && method === 'GET') {
        const userId = query.userId || 'default';
        const results = await skillManager.searchSkills(userId, query.q || '');
        sendJson(res, 200, { results });
        return;
      }

      sendJson(res, 404, { error: 'Not found' });
    } catch (error) {
      console.error('[HTTP] Error:', error);
      sendJson(res, 500, { error: error.message });
    }
  });

  // --- WebSocket ---

  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (socket) => {
    const runtime = new AgentRuntime({
      workspacePath: config.workspacePath,
      rules: config.rules,
      mcpServers: config.mcpServers,
      sessionsPath: config.sessionsPath,
    });

    const send = (payload) => {
      try {
        socket.send(JSON.stringify(payload));
      } catch (error) {
        console.error('[WS] Failed to send:', error.message);
      }
    };

    runtime.on('message', send);
    send({ type: 'ready' });

    socket.on('message', async (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        switch (data.type) {
          case 'query':
            await runtime.handleQuery(data.message, data.session_id || null, data.metadata || {});
            break;
          case 'new_session':
            runtime.currentSessionId = null;
            runtime.resetSessionState();
            runtime.emitMessage({ type: 'info', message: 'Started new conversation' });
            break;
          case 'permission_response':
            runtime.handlePermissionResponse(data);
            break;
          case 'rule_action':
            await runtime.handleRuleActionMessage(data);
            break;
          default:
            runtime.emitMessage({ type: 'error', message: `Unknown message type: ${data.type}` });
        }
      } catch (error) {
        send({ type: 'error', message: error.message || 'Invalid payload' });
      }
    });

    socket.on('close', () => {
      runtime.removeAllListeners('message');
    });
  });

  httpServer.listen(port, () => {
    console.log(`Friday server listening on http://localhost:${port}`);
    console.log(`WebSocket: ws://localhost:${port}/ws`);
    console.log(`Workspace: ${config.workspacePath}`);
  });
}
