import http from 'http';
import { WebSocketServer } from 'ws';
import { AgentRuntime } from './src/runtime/AgentRuntime.js';
import { loadBackendConfig } from './src/config.js';
import { agentManager } from './src/agents/AgentManager.js';
import { skillManager } from './src/skills/SkillManager.js';

const config = await loadBackendConfig();
const port = Number(process.env.PORT || 8787);

// Helper to parse JSON body
async function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
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

// Helper to send JSON response
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

// Helper to parse URL and query params
function parseUrl(url) {
  const [pathname, queryString] = url.split('?');
  const query = {};
  if (queryString) {
    queryString.split('&').forEach(pair => {
      const [key, value] = pair.split('=');
      query[decodeURIComponent(key)] = decodeURIComponent(value || '');
    });
  }
  return { pathname, query };
}

const httpServer = http.createServer(async (req, res) => {
  const { pathname, query } = parseUrl(req.url);
  const method = req.method;

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
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

    // ============ AGENT ENDPOINTS ============

    // GET /api/agents - Get all agents for user
    if (pathname === '/api/agents' && method === 'GET') {
      const userId = query.userId || 'default';
      const agents = await agentManager.getUserAgents(userId);
      sendJson(res, 200, { agents });
      return;
    }

    // GET /api/agents/:agentId - Get specific agent
    const agentMatch = pathname.match(/^\/api\/agents\/([^\/]+)$/);
    if (agentMatch && method === 'GET') {
      const agentId = agentMatch[1];
      const userId = query.userId || 'default';
      try {
        const agent = await agentManager.loadUserAgentConfig(userId, agentId);
        sendJson(res, 200, { agent });
      } catch (error) {
        sendJson(res, 404, { error: error.message });
      }
      return;
    }

    // POST /api/agents/:agentId/customize - Customize agent
    const customizeMatch = pathname.match(/^\/api\/agents\/([^\/]+)\/customize$/);
    if (customizeMatch && method === 'POST') {
      const agentId = customizeMatch[1];
      const body = await parseBody(req);
      const { userId = 'default', customizations } = body;
      const updated = await agentManager.saveUserAgentConfig(userId, agentId, customizations);
      sendJson(res, 200, { success: true, config: updated });
      return;
    }

    // POST /api/agents/:agentId/reset - Reset agent to defaults
    const resetMatch = pathname.match(/^\/api\/agents\/([^\/]+)\/reset$/);
    if (resetMatch && method === 'POST') {
      const agentId = resetMatch[1];
      const body = await parseBody(req);
      const { userId = 'default' } = body;
      const defaultConfig = await agentManager.resetUserAgentConfig(userId, agentId);
      sendJson(res, 200, { success: true, config: defaultConfig });
      return;
    }

    // POST /api/agents/custom - Create custom agent
    if (pathname === '/api/agents/custom' && method === 'POST') {
      const body = await parseBody(req);
      const { userId = 'default', agentData } = body;
      const newAgent = await agentManager.createUserAgent(userId, agentData);
      sendJson(res, 201, { success: true, agent: newAgent });
      return;
    }

    // DELETE /api/agents/custom/:agentId - Delete custom agent
    const deleteAgentMatch = pathname.match(/^\/api\/agents\/custom\/([^\/]+)$/);
    if (deleteAgentMatch && method === 'DELETE') {
      const agentId = deleteAgentMatch[1];
      const userId = query.userId || 'default';
      await agentManager.deleteUserAgent(userId, agentId);
      sendJson(res, 200, { success: true });
      return;
    }

    // ============ SKILL ENDPOINTS ============

    // GET /api/skills - Get all skills for user
    if (pathname === '/api/skills' && method === 'GET') {
      const userId = query.userId || 'default';
      const skills = await skillManager.getUserAvailableSkills(userId);
      sendJson(res, 200, skills);
      return;
    }

    // GET /api/skills/preferences - Get skill preferences
    if (pathname === '/api/skills/preferences' && method === 'GET') {
      const userId = query.userId || 'default';
      const preferences = await skillManager.getUserSkillPreferences(userId);
      sendJson(res, 200, preferences);
      return;
    }

    // POST /api/skills/toggle - Toggle skill enabled/disabled
    if (pathname === '/api/skills/toggle' && method === 'POST') {
      const body = await parseBody(req);
      const { userId = 'default', skillId, enabled } = body;
      const preferences = await skillManager.toggleSkill(userId, skillId, enabled);
      sendJson(res, 200, { success: true, preferences });
      return;
    }

    // POST /api/skills - Create custom skill
    if (pathname === '/api/skills' && method === 'POST') {
      const body = await parseBody(req);
      const { userId = 'default', ...skillData } = body;
      const newSkill = await skillManager.createUserSkill(userId, skillData);
      sendJson(res, 201, { success: true, skill: newSkill });
      return;
    }

    // PUT /api/skills/:skillId - Update custom skill
    const updateSkillMatch = pathname.match(/^\/api\/skills\/([^\/]+)$/);
    if (updateSkillMatch && method === 'PUT') {
      const skillId = updateSkillMatch[1];
      const body = await parseBody(req);
      const { userId = 'default', ...updates } = body;
      const updatedSkill = await skillManager.updateUserSkill(userId, skillId, updates);
      sendJson(res, 200, { success: true, skill: updatedSkill });
      return;
    }

    // DELETE /api/skills/:skillId - Delete custom skill
    const deleteSkillMatch = pathname.match(/^\/api\/skills\/([^\/]+)$/);
    if (deleteSkillMatch && method === 'DELETE') {
      const skillId = deleteSkillMatch[1];
      const userId = query.userId || 'default';
      await skillManager.deleteUserSkill(userId, skillId);
      sendJson(res, 200, { success: true });
      return;
    }

    // GET /api/skills/search - Search skills
    if (pathname === '/api/skills/search' && method === 'GET') {
      const userId = query.userId || 'default';
      const searchQuery = query.q || '';
      const results = await skillManager.searchSkills(userId, searchQuery);
      sendJson(res, 200, { results });
      return;
    }

    // ============ TEMPLATE ENDPOINTS ============

    // GET /api/templates - Get all skill templates
    if (pathname === '/api/templates' && method === 'GET') {
      const templates = await skillManager.loadTemplates();
      sendJson(res, 200, { templates });
      return;
    }

    // GET /api/templates/:templateId - Get specific template
    const templateMatch = pathname.match(/^\/api\/templates\/([^\/]+)$/);
    if (templateMatch && method === 'GET') {
      const templateId = templateMatch[1];
      try {
        const template = await skillManager.getTemplate(templateId);
        if (!template) {
          sendJson(res, 404, { error: 'Template not found' });
          return;
        }
        sendJson(res, 200, { template });
      } catch (error) {
        sendJson(res, 500, { error: error.message });
      }
      return;
    }

    // POST /api/templates/:templateId/apply - Apply template to user
    const applyTemplateMatch = pathname.match(/^\/api\/templates\/([^\/]+)\/apply$/);
    if (applyTemplateMatch && method === 'POST') {
      const templateId = applyTemplateMatch[1];
      const body = await parseBody(req);
      const { userId = 'default' } = body;
      try {
        const skill = await skillManager.applyTemplateToUser(userId, templateId);
        sendJson(res, 200, { success: true, skill });
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    // ============ WORKSPACE DETECTION ENDPOINTS ============

    // POST /api/workspace/detect - Detect project type
    if (pathname === '/api/workspace/detect' && method === 'POST') {
      const body = await parseBody(req);
      const { workspacePath } = body;
      try {
        const detection = await skillManager.detectProjectType(workspacePath);
        sendJson(res, 200, detection);
      } catch (error) {
        sendJson(res, 500, { error: error.message });
      }
      return;
    }

    // POST /api/workspace/suggestions - Get skill suggestions for workspace
    if (pathname === '/api/workspace/suggestions' && method === 'POST') {
      const body = await parseBody(req);
      const { userId = 'default', workspacePath } = body;
      try {
        const suggestions = await skillManager.getSuggestedSkillsForWorkspace(userId, workspacePath);
        sendJson(res, 200, suggestions);
      } catch (error) {
        sendJson(res, 500, { error: error.message });
      }
      return;
    }

    // 404 for unmatched routes
    sendJson(res, 404, { error: 'Not found' });

  } catch (error) {
    console.error('[HTTP] Error:', error);
    sendJson(res, 500, { error: error.message });
  }
});

const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

wss.on('connection', (socket) => {
  const runtime = new AgentRuntime({
    workspacePath: config.workspacePath,
    rules: config.rules,
    mcpServers: config.mcpServers,
    sessionsPath: config.sessionsPath
  });

  const send = (payload) => {
    try {
      socket.send(JSON.stringify(payload));
    } catch (error) {
      console.error('[WS] Failed to send payload', error);
    }
  };

  runtime.on('message', send);
  send({ type: 'ready' });

  socket.on('message', async (raw) => {
    try {
      const data = JSON.parse(raw.toString());
      const userId = data.userId || 'default';

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

        // ============ AGENT MESSAGES ============
        case 'get_agents':
          {
            const agents = await agentManager.getUserAgents(userId);
            send({ type: 'agents_list', agents });
          }
          break;
        case 'get_agent':
          {
            const agent = await agentManager.loadUserAgentConfig(userId, data.agentId);
            send({ type: 'agent_config', agent });
          }
          break;
        case 'customize_agent':
          {
            const updated = await agentManager.saveUserAgentConfig(userId, data.agentId, data.customizations);
            send({ type: 'agent_customized', agentId: data.agentId, config: updated });
          }
          break;
        case 'reset_agent':
          {
            const defaultConfig = await agentManager.resetUserAgentConfig(userId, data.agentId);
            send({ type: 'agent_reset', agentId: data.agentId, config: defaultConfig });
          }
          break;
        case 'create_custom_agent':
          {
            const newAgent = await agentManager.createUserAgent(userId, data.agentData);
            send({ type: 'custom_agent_created', agent: newAgent });
          }
          break;
        case 'delete_custom_agent':
          {
            await agentManager.deleteUserAgent(userId, data.agentId);
            send({ type: 'custom_agent_deleted', agentId: data.agentId });
          }
          break;

        // ============ SKILL MESSAGES ============
        case 'get_skills':
          {
            const skills = await skillManager.getUserAvailableSkills(userId);
            send({ type: 'skills_list', skills });
          }
          break;
        case 'get_skill_preferences':
          {
            const preferences = await skillManager.getUserSkillPreferences(userId);
            send({ type: 'skill_preferences', preferences });
          }
          break;
        case 'toggle_skill':
          {
            const preferences = await skillManager.toggleSkill(userId, data.skillId, data.enabled);
            send({ type: 'skill_toggled', skillId: data.skillId, enabled: data.enabled, preferences });
          }
          break;
        case 'create_skill':
          {
            const newSkill = await skillManager.createUserSkill(userId, data.skillData);
            send({ type: 'skill_created', skill: newSkill });
          }
          break;
        case 'update_skill':
          {
            const updatedSkill = await skillManager.updateUserSkill(userId, data.skillId, data.updates);
            send({ type: 'skill_updated', skill: updatedSkill });
          }
          break;
        case 'delete_skill':
          {
            await skillManager.deleteUserSkill(userId, data.skillId);
            send({ type: 'skill_deleted', skillId: data.skillId });
          }
          break;
        case 'search_skills':
          {
            const results = await skillManager.searchSkills(userId, data.query);
            send({ type: 'skills_search_results', results });
          }
          break;

        default:
          runtime.emitMessage({ type: 'error', message: `Unknown message type: ${data.type}` });
      }
    } catch (error) {
      runtime.emitMessage({ type: 'error', message: error.message || 'Invalid payload' });
    }
  });

  socket.on('close', () => {
    runtime.removeAllListeners('message');
  });
});

httpServer.listen(port, () => {
  console.error(`[SERVER] Friday backend listening on :${port}`);
});
