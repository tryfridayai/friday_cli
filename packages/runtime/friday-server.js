import { createInterface } from 'readline';
import { AgentRuntime } from './src/runtime/AgentRuntime.js';
import { loadBackendConfig } from './src/config.js';
import { agentManager } from './src/agents/AgentManager.js';
import { skillManager } from './src/skills/SkillManager.js';
import ScheduledAgentStore from './src/scheduled-agents/ScheduledAgentStore.js';
import AgentRunHistory from './src/scheduled-agents/AgentRunHistory.js';
import AgentExecutor from './src/scheduled-agents/AgentExecutor.js';
import AgentScheduler from './src/scheduled-agents/AgentScheduler.js';
import McpOAuthManager from './src/oauth/McpOAuthManager.js';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import cronParser from 'cron-parser';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';

// =============================================================================
// SCHEDULE PARSING HELPERS
// =============================================================================

/**
 * Parse natural language schedule to cron expression
 */
function parseScheduleToCron(humanReadable) {
  const text = humanReadable.toLowerCase().trim();

  if (text.includes('every minute')) return '* * * * *';
  if (text.includes('every hour')) return '0 * * * *';
  if (text.includes('every day at midnight') || text === 'daily at midnight') return '0 0 * * *';

  // Every N minutes: "every 3 minutes", "every 15 minutes"
  const everyNMinMatch = text.match(/every\s+(\d+)\s+minutes?/i);
  if (everyNMinMatch) {
    const n = parseInt(everyNMinMatch[1]);
    if (n > 0 && n <= 59) return `*/${n} * * * *`;
  }

  // Every N hours: "every 2 hours", "every 6 hours"
  const everyNHourMatch = text.match(/every\s+(\d+)\s+hours?/i);
  if (everyNHourMatch) {
    const n = parseInt(everyNHourMatch[1]);
    if (n > 0 && n <= 23) return `0 */${n} * * *`;
  }

  const dailyMatch = text.match(/(?:daily|every day)\s+at\s+(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
  if (dailyMatch) {
    let hour = parseInt(dailyMatch[1]);
    const minute = parseInt(dailyMatch[2] || '0');
    const period = dailyMatch[3]?.toLowerCase();
    if (period === 'pm' && hour !== 12) hour += 12;
    if (period === 'am' && hour === 12) hour = 0;
    return `${minute} ${hour} * * *`;
  }

  const hourlyMatch = text.match(/hourly\s+at\s+:?(\d{1,2})/i);
  if (hourlyMatch) {
    const minute = parseInt(hourlyMatch[1]);
    return `${minute} * * * *`;
  }

  const weeklyMatch = text.match(/every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+at\s+(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
  if (weeklyMatch) {
    const days = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
    const day = days[weeklyMatch[1].toLowerCase()];
    let hour = parseInt(weeklyMatch[2]);
    const minute = parseInt(weeklyMatch[3] || '0');
    const period = weeklyMatch[4]?.toLowerCase();
    if (period === 'pm' && hour !== 12) hour += 12;
    if (period === 'am' && hour === 12) hour = 0;
    return `${minute} ${hour} * * ${day}`;
  }

  if (text.includes('one-time') || text.includes('once') || text.includes('one time')) {
    const now = new Date();
    return `${now.getMinutes() + 1} ${now.getHours()} ${now.getDate()} ${now.getMonth() + 1} *`;
  }

  console.error(`[Server] Could not parse schedule "${humanReadable}", defaulting to daily at 9am`);
  return '0 9 * * *';
}

function isValidCron(cron) {
  try {
    cronParser.parseExpression(cron);
    return true;
  } catch (e) {
    return false;
  }
}

const DEFAULT_METADATA_FLAGS = { label: true, description: true, expiresAt: true };

function sanitizeAuthDefinitions(auth = []) {
  if (!Array.isArray(auth)) {
    return [];
  }
  return auth.map((entry) => {
    if (entry?.type === 'credentials') {
      return {
        id: entry.id || entry.method || 'default',
        type: 'credentials',
        label: entry.label || 'Credentials',
        description: entry.description || '',
        fields: (entry.fields || []).map((field) => {
          const metadata = field.metadata || {};
          return {
            key: field.key,
            label: field.label || field.key,
            type: field.type || 'text',
            required: field.required !== false,
            placeholder: field.placeholder || '',
            metadata: {
              label: metadata.label ?? DEFAULT_METADATA_FLAGS.label,
              description: metadata.description ?? DEFAULT_METADATA_FLAGS.description,
              expiresAt: metadata.expiresAt ?? DEFAULT_METADATA_FLAGS.expiresAt
            }
          };
        })
      };
    }
    if (entry?.type === 'oauth') {
      return {
        id: entry.id || entry.provider || 'oauth',
        type: 'oauth',
        label: entry.label || 'OAuth',
        description: entry.description || '',
        provider: entry.provider || null,
        scopes: Array.isArray(entry.scopes) ? entry.scopes : []
      };
    }
    if (entry?.type === 'remote-oauth') {
      return {
        id: entry.id || entry.provider || 'remote-oauth',
        type: 'remote-oauth',
        label: entry.label || 'Remote Login',
        description: entry.description || '',
        provider: entry.provider || null
      };
    }
    return entry;
  });
}

// 1. Get the current folder path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 2. Load the .env file from the ROOT folder (one level up)
// In production, .env is in app.asar.unpacked; in dev, it's in project root
const appPath = path.join(__dirname, '..');
const envPath = appPath.includes('app.asar')
  ? appPath.replace('app.asar', 'app.asar.unpacked') + '/.env'
  : path.join(appPath, '.env');
dotenv.config({ path: envPath });
console.error('[Backend] Loading .env from:', envPath);

// =============================================================================
// INITIALIZATION
// =============================================================================

// Load config first
const config = await loadBackendConfig();

// Store reference to credentials manager
const mcpCredentials = config.mcpCredentials;

// Initialize scheduled agents system BEFORE runtime
// (AgentRuntime needs these for in-process tool handlers)
const scheduledAgentStore = new ScheduledAgentStore({ workspaceBasePath: config.workspacePath });
const agentRunHistory = new AgentRunHistory();
const agentExecutor = new AgentExecutor(scheduledAgentStore, agentRunHistory, config);
const agentScheduler = new AgentScheduler(scheduledAgentStore, agentExecutor);

// Create runtime with scheduled agent dependencies
// The in-process SDK MCP server for create_scheduled_agent will be created internally
const runtime = new AgentRuntime({
  workspacePath: config.workspacePath,
  rules: config.rules,
  mcpServers: config.mcpServers,
  sessionsPath: config.sessionsPath,
  scheduledAgentStore,
  agentScheduler
});

agentScheduler.emitEvent = (payload) => runtime.emitMessage(payload);

// Initialize OAuth manager for MCP servers
const oauthManager = new McpOAuthManager({
  mcpCredentials,
  loadBackendConfig,
  runtime,
  config
});
oauthManager.loadClientsFromEnv();

async function hydrateScheduledAgentPermissions() {
  const agents = await scheduledAgentStore.getAllActiveAgents();
  for (const agent of agents) {
    const updates = {};

    const hasTools = Array.isArray(agent.permissions?.tools) && agent.permissions.tools.length > 0;
    if (!hasTools) {
      const requestedServers = Array.isArray(agent.mcpServers) && agent.mcpServers.length > 0
        ? agent.mcpServers
        : Object.keys(config.mcpServers || {});

      const toolsByServer = await runtime.getMcpToolsForServers(requestedServers);
      const toolList = Object.values(toolsByServer).flat().filter(Boolean);

      updates.mcpServers = requestedServers;
      updates.permissions = {
        ...(agent.permissions || {}),
        preAuthorized: true,
        tools: toolList
      };
    }

    if (Object.keys(updates).length > 0) {
      await scheduledAgentStore.updateAgent(agent.userId || 'default', agent.id, updates);
    }
  }
}

// Initialize scheduler (load and schedule all active agents)
await hydrateScheduledAgentPermissions();
await agentScheduler.initialize();

runtime.on('message', (payload) => {
  try {
    console.log(JSON.stringify(payload));
  } catch (error) {
    console.error('[STDIO] Failed to serialize payload', payload);
  }
});

const readline = createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

// =============================================================================
// REMOTE OAUTH HELPERS (for mcp-remote based servers like Vercel)
// =============================================================================

/**
 * Store a marker credential so syncMcpConnections recognizes the server as configured.
 */
async function storeRemoteOAuthMarker(serverId) {
  const serverDef = config.mcpServers[serverId] || {};
  await mcpCredentials.setCredentials(serverId, {
    authId: 'oauth',
    fields: { remoteAuth: { value: 'authenticated' } }
  }, { auth: serverDef.auth || [] });

  // Reload config so runtime picks up the new state
  const newConfig = await loadBackendConfig();
  runtime.updateMcpServers(newConfig.mcpServers);
  config.mcpServers = newConfig.mcpServers;
}

/**
 * Handle OAuth for servers using mcp-remote (e.g., Vercel).
 * Spawns the server process which handles OAuth internally via browser.
 * Returns { success: true } or { success: false, error: string }.
 */
async function handleRemoteOAuth(serverId) {
  console.log(`[RemoteOAuth] handleRemoteOAuth called for serverId=${serverId}`);
  const serverDef = config.mcpServers[serverId];
  console.log(`[RemoteOAuth] serverDef:`, JSON.stringify(serverDef ? { command: serverDef.command, args: serverDef.args } : null));
  if (!serverDef) {
    return { success: false, error: `Unknown server: ${serverId}` };
  }

  const command = serverDef.command;
  const args = serverDef.args || [];
  const env = { ...process.env, ...(serverDef.env || {}) };

  console.log(`[RemoteOAuth] Spawning: ${command} ${args.join(' ')}`);

  return new Promise((resolve) => {
    let resolved = false;
    let stdout = '';

    const proc = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env
    });

    // 3 minute timeout for user to complete browser auth
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        proc.kill();
        resolve({ success: false, error: 'Authentication timed out (3 minutes). Please try again.' });
      }
    }, 180000);

    proc.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        console.error(`[RemoteOAuth] Spawn error for ${serverId}:`, err.message);
        resolve({ success: false, error: `Failed to start server process: ${err.message}` });
      }
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString();
      console.error(`[RemoteOAuth] ${serverId} stderr (raw):`, JSON.stringify(text));

      // mcp-remote prints "Please authorize this client by visiting:\n<URL>"
      // to stderr. Electron's node can't use the bundled `open` package reliably,
      // so we extract the URL and ask the Electron main process to open it via
      // shell.openExternal(). Match the auth URL by looking for OAuth-related
      // URL patterns (may arrive in same or separate chunks).
      const urlMatch = text.match(/(https?:\/\/[^\s]+)/g);
      console.log(`[RemoteOAuth] URL matches found:`, urlMatch);
      if (urlMatch) {
        for (const url of urlMatch) {
          console.log(`[RemoteOAuth] Checking URL: ${url}`);
          if (url.includes('/authorize') || url.includes('oauth') || url.includes('client_id')) {
            console.log(`[RemoteOAuth] *** MATCH! Emitting open_external_url for: ${url}`);
            runtime.emitMessage({ type: 'open_external_url', url });
            break;
          } else {
            console.log(`[RemoteOAuth] URL did not match auth patterns`);
          }
        }
      }
    });

    proc.stdout.on('data', (data) => {
      const chunk = data.toString();
      console.log(`[RemoteOAuth] ${serverId} stdout (raw):`, JSON.stringify(chunk));
      stdout += chunk;

      // Parse newline-delimited JSON responses from stdout
      const lines = stdout.split('\n');
      // Keep the last incomplete line in the buffer
      stdout = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const msg = JSON.parse(trimmed);
          // A valid JSON-RPC response to our initialize request means auth succeeded
          if (msg.jsonrpc === '2.0' && msg.id === 1 && msg.result) {
            console.log(`[RemoteOAuth] Got initialize response for ${serverId} — auth successful`);
            if (!resolved) {
              resolved = true;
              clearTimeout(timeout);
              proc.kill();
              storeRemoteOAuthMarker(serverId)
                .then(() => resolve({ success: true, serverId }))
                .catch((err) => {
                  console.error(`[RemoteOAuth] Failed to store marker for ${serverId}:`, err);
                  resolve({ success: false, error: 'Auth succeeded but failed to save state' });
                });
            }
          }
          // JSON-RPC error response
          if (msg.jsonrpc === '2.0' && msg.id === 1 && msg.error) {
            console.error(`[RemoteOAuth] Server returned error for ${serverId}:`, msg.error);
            if (!resolved) {
              resolved = true;
              clearTimeout(timeout);
              proc.kill();
              resolve({ success: false, error: msg.error.message || 'Server returned an error' });
            }
          }
        } catch {
          // Not JSON, ignore
        }
      }
    });

    proc.on('close', (code) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        console.log(`[RemoteOAuth] Process exited with code ${code} for ${serverId}`);
        resolve({ success: false, error: `Server process exited unexpectedly (code ${code})` });
      }
    });

    // Send MCP initialize JSON-RPC request to trigger the connection
    const initRequest = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'friday', version: '1.0.0' }
      }
    });

    proc.stdin.write(initRequest + '\n');
  });
}

/**
 * Clean up mcp-remote's local token cache for a given server URL.
 * Best-effort: silently ignores errors.
 */
function cleanRemoteOAuthCache(serverId) {
  try {
    const serverDef = config.mcpServers[serverId];
    if (!serverDef) return;

    // Extract the remote URL from args (e.g., "https://mcp.vercel.com/sse")
    const remoteUrl = (serverDef.args || []).find(a => a.startsWith('http'));
    if (!remoteUrl) return;

    const cacheDir = path.join(os.homedir(), '.mcp-auth');
    if (!fs.existsSync(cacheDir)) return;

    const files = fs.readdirSync(cacheDir);
    for (const file of files) {
      const filePath = path.join(cacheDir, file);
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        if (content.includes(remoteUrl)) {
          fs.unlinkSync(filePath);
          console.log(`[RemoteOAuth] Cleaned cache file: ${file}`);
        }
      } catch {
        // Ignore per-file errors
      }
    }
  } catch (err) {
    console.error(`[RemoteOAuth] Cache cleanup error (non-fatal):`, err.message);
  }
}

console.log(JSON.stringify({ type: 'ready' }));

readline.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) {
    return;
  }
  try {
    const data = JSON.parse(trimmed);
    switch (data.type) {
      case 'query':
        await runtime.handleQuery(data.message, data.session_id || null, data.metadata || {});
        break;
      case 'new_session':
        runtime.currentSessionId = null;
        runtime.resetSessionState();
        runtime.emitMessage({ type: 'info', message: 'Started new conversation' });
        break;
      case 'resume_session':
        if (data.session_id) {
          runtime.currentSessionId = data.session_id;
          // Note: Not emitting info message as it's noisy during view switches
        }
        break;
      case 'permission_response':
        runtime.handlePermissionResponse(data);
        break;
      case 'rule_action':
        await runtime.handleRuleActionMessage(data);
        break;
      case 'workspace_changed':
        if (data.path) {
          // Update workspace path
          runtime.workspacePath = data.path;

          // Only reset session if explicitly requested (user chose "New Session")
          // If resetSession is false, user wants to continue conversation in new workspace
          if (data.resetSession !== false) {
            runtime.currentSessionId = null;
            runtime.emitMessage({ type: 'session_reset', reason: 'workspace_changed' });
          } else if (!data.isSessionRestore) {
            // User chose "Continue Session" (not restoring from history)
            // Skip SDK resume on next query because old context has stale file paths
            runtime.skipNextResume = true;
          }
          // If isSessionRestore is true, we're resuming a session from history
          // and WANT to resume the SDK session (correct workspace context)

          runtime.emitMessage({ type: 'info', message: `Workspace updated to: ${data.path}` });
        }
        break;
      case 'screen_sharing_state':
        runtime.setScreenSharingState(Boolean(data.active));
        break;
      case 'abort_query':
        runtime.abortCurrentQuery();
        break;
      case 'mcp_get_servers':
        {
          const servers = await Promise.all(
            Object.keys(config.mcpServers).map(async (id) => {
              const serverDef = config.mcpServers[id] || {};
              const auth = sanitizeAuthDefinitions(serverDef.auth || []);
              const credentialMethods = auth.filter((method) => method.type === 'credentials');
              const creds = await mcpCredentials.getCredentials(id);

              // Determine if server is configured:
              // 1. User has stored credentials, OR
              // 2. For Firecrawl: system default is available via environment variable
              let isConfigured = Object.keys(creds).length > 0;

              // Firecrawl has a system default fallback - always available
              if (id === 'firecrawl' && !isConfigured) {
                isConfigured = Boolean(process.env.FIRECRAWL_API_KEY);
              }

              return {
                id,
                name: serverDef.displayName || id.charAt(0).toUpperCase() + id.slice(1),
                enabled: true,
                configured: isConfigured,
                requiresCredentials: credentialMethods.length > 0,
                auth
              };
            })
          );
          runtime.emitMessage({ type: 'mcp_servers_list', servers });
        }
        break;
      case 'mcp_update_credentials':
        {
          let serverId;
          try {
            console.log('[MCP] Received mcp_update_credentials:', JSON.stringify(data, null, 2));
            ({ serverId } = data);
            const { credentials } = data;
            if (!serverId || !credentials) {
              runtime.emitMessage({ type: 'error', message: 'serverId and credentials required' });
              break;
            }
            console.log('[MCP] Setting credentials for:', serverId);
            const serverDef = config.mcpServers[serverId] || {};
            await mcpCredentials.setCredentials(serverId, credentials, { auth: serverDef.auth || [] });
            console.log('[MCP] Credentials saved, reloading config');
            const newConfig = await loadBackendConfig();
            runtime.updateMcpServers(newConfig.mcpServers);
            config.mcpServers = newConfig.mcpServers;
            console.log('[MCP] Sending success response');
            runtime.emitMessage({ type: 'mcp_credentials_updated', serverId, success: true });
            console.log('[MCP] Success response sent');
          } catch (error) {
            console.error('[MCP] Error updating credentials:', error);
            runtime.emitMessage({ type: 'error', message: `Failed to update credentials: ${error.message}` });
            runtime.emitMessage({
              type: 'mcp_credentials_updated',
              serverId,
              success: false,
              error: error.message
            });
          }
        }
        break;
      case 'mcp_delete_credentials':
        {
          const { serverId } = data;
          try {
            console.log('[MCP] Received mcp_delete_credentials for:', serverId);
            if (!serverId) {
              runtime.emitMessage({ type: 'error', message: 'serverId is required' });
              break;
            }

            // 1. Delete from Secure Storage
            if (mcpCredentials.deleteCredentials) {
                await mcpCredentials.deleteCredentials(serverId);
            } else {
                // Fallback if the wrapper is different, though deleteCredentials is standard
                console.warn('[MCP] mcpCredentials.deleteCredentials method not found');
            }

            // 1b. Clean up mcp-remote token cache for remote-oauth servers
            const serverDefForDelete = config.mcpServers[serverId] || {};
            const isRemoteOAuthServer = (serverDefForDelete.auth || []).some(a => a.type === 'remote-oauth');
            if (isRemoteOAuthServer) {
              cleanRemoteOAuthCache(serverId);
            }

            // 2. Reload Config to ensure memory is in sync (removes 'configured' flag)
            console.log('[MCP] Credentials deleted, reloading config');
            const newConfig = await loadBackendConfig();
            runtime.updateMcpServers(newConfig.mcpServers);
            config.mcpServers = newConfig.mcpServers;

            // 3. Send Success
            runtime.emitMessage({ type: 'mcp_credentials_deleted', serverId, success: true });
            console.log('[MCP] Delete success response sent');

          } catch (error) {
            console.error('[MCP] Error deleting credentials:', error);
            runtime.emitMessage({
              type: 'mcp_credentials_deleted',
              serverId,
              success: false,
              error: error.message
            });
          }
        }
        break;
    case 'mcp_get_credentials':
        {
          const { serverId } = data;
          const creds = await mcpCredentials.getCredentials(serverId);
          runtime.emitMessage({ type: 'mcp_credentials', serverId, credentials: creds });
        }
        break;
      case 'mcp_toggle_server':
        {
          const { serverId, enabled } = data;
          // For now, just acknowledge
          runtime.emitMessage({ type: 'mcp_server_toggled', serverId, enabled });
        }
        break;

      // ============ AGENT MESSAGES ============
      case 'get_agents':
        {
          const userId = data.userId || 'default';
          const agents = await agentManager.getUserAgents(userId);
          runtime.emitMessage({ type: 'agents_list', agents });
        }
        break;
      case 'get_agent':
        {
          const userId = data.userId || 'default';
          try {
            const agent = await agentManager.loadUserAgentConfig(userId, data.agentId);
            runtime.emitMessage({ type: 'agent_config', agent });
          } catch (error) {
            runtime.emitMessage({ type: 'error', message: error.message });
          }
        }
        break;
      case 'customize_agent':
        {
          const userId = data.userId || 'default';
          try {
            const updated = await agentManager.saveUserAgentConfig(userId, data.agentId, data.customizations);
            runtime.emitMessage({ type: 'agent_customized', agentId: data.agentId, config: updated });
          } catch (error) {
            runtime.emitMessage({ type: 'error', message: error.message });
          }
        }
        break;
      case 'reset_agent':
        {
          const userId = data.userId || 'default';
          try {
            const defaultConfig = await agentManager.resetUserAgentConfig(userId, data.agentId);
            runtime.emitMessage({ type: 'agent_reset', agentId: data.agentId, config: defaultConfig });
          } catch (error) {
            runtime.emitMessage({ type: 'error', message: error.message });
          }
        }
        break;
      case 'create_custom_agent':
        {
          const userId = data.userId || 'default';
          try {
            const newAgent = await agentManager.createUserAgent(userId, data.agentData);
            runtime.emitMessage({ type: 'custom_agent_created', agent: newAgent });
          } catch (error) {
            runtime.emitMessage({ type: 'error', message: error.message });
          }
        }
        break;
      case 'delete_custom_agent':
        {
          const userId = data.userId || 'default';
          try {
            await agentManager.deleteUserAgent(userId, data.agentId);
            runtime.emitMessage({ type: 'custom_agent_deleted', agentId: data.agentId });
          } catch (error) {
            runtime.emitMessage({ type: 'error', message: error.message });
          }
        }
        break;

      // ============ SKILL MESSAGES ============
      case 'get_skills':
        {
          const userId = data.userId || 'default';
          const skills = await skillManager.getUserAvailableSkills(userId);
          runtime.emitMessage({ type: 'skills_list', skills });
        }
        break;
      case 'get_expert_skills':
        {
          // Two-tier skill system: Only return expert skills for frontend UI
          // Expert skills are user-facing personas (Designer, Developer, Analyst)
          const expertSkills = await skillManager.getExpertSkills();
          runtime.emitMessage({ type: 'expert_skills_list', skills: expertSkills });
        }
        break;
      case 'get_skill_preferences':
        {
          const userId = data.userId || 'default';
          const preferences = await skillManager.getUserSkillPreferences(userId);
          runtime.emitMessage({ type: 'skill_preferences', preferences });
        }
        break;
      case 'toggle_skill':
        {
          const userId = data.userId || 'default';
          try {
            const preferences = await skillManager.toggleSkill(userId, data.skillId, data.enabled);
            runtime.emitMessage({ type: 'skill_toggled', skillId: data.skillId, enabled: data.enabled, preferences });
          } catch (error) {
            runtime.emitMessage({ type: 'error', message: error.message });
          }
        }
        break;
      case 'create_skill':
        {
          const userId = data.userId || 'default';
          try {
            const newSkill = await skillManager.createUserSkill(userId, data.skillData);
            runtime.emitMessage({ type: 'skill_created', skill: newSkill });
          } catch (error) {
            runtime.emitMessage({ type: 'error', message: error.message });
          }
        }
        break;
      case 'update_skill':
        {
          const userId = data.userId || 'default';
          try {
            const updatedSkill = await skillManager.updateUserSkill(userId, data.skillId, data.updates);
            runtime.emitMessage({ type: 'skill_updated', skill: updatedSkill });
          } catch (error) {
            runtime.emitMessage({ type: 'error', message: error.message });
          }
        }
        break;
      case 'delete_skill':
        {
          const userId = data.userId || 'default';
          try {
            await skillManager.deleteUserSkill(userId, data.skillId);
            runtime.emitMessage({ type: 'skill_deleted', skillId: data.skillId });
          } catch (error) {
            runtime.emitMessage({ type: 'error', message: error.message });
          }
        }
        break;
      case 'search_skills':
        {
          const userId = data.userId || 'default';
          const results = await skillManager.searchSkills(userId, data.query || '');
          runtime.emitMessage({ type: 'skills_search_results', results });
        }
        break;

      // ============ TEMPLATE MESSAGES ============
      case 'get_templates':
        {
          const templates = await skillManager.loadTemplates();
          runtime.emitMessage({ type: 'templates_list', templates });
        }
        break;
      case 'get_template':
        {
          try {
            const template = await skillManager.getTemplate(data.templateId);
            if (!template) {
              runtime.emitMessage({ type: 'error', message: 'Template not found' });
            } else {
              runtime.emitMessage({ type: 'template_details', template });
            }
          } catch (error) {
            runtime.emitMessage({ type: 'error', message: error.message });
          }
        }
        break;
      case 'apply_template':
        {
          const userId = data.userId || 'default';
          try {
            const skill = await skillManager.applyTemplateToUser(userId, data.templateId);
            runtime.emitMessage({ type: 'template_applied', skill });
          } catch (error) {
            runtime.emitMessage({ type: 'error', message: error.message });
          }
        }
        break;

      // ============ WORKSPACE DETECTION MESSAGES ============
      case 'detect_project_type':
        {
          try {
            const detection = await skillManager.detectProjectType(data.workspacePath);
            runtime.emitMessage({ type: 'project_type_detected', ...detection });
          } catch (error) {
            runtime.emitMessage({ type: 'error', message: error.message });
          }
        }
        break;
      case 'get_workspace_suggestions':
        {
          const userId = data.userId || 'default';
          try {
            const suggestions = await skillManager.getSuggestedSkillsForWorkspace(userId, data.workspacePath);
            runtime.emitMessage({ type: 'workspace_suggestions', suggestions });
          } catch (error) {
            runtime.emitMessage({ type: 'error', message: error.message });
          }
        }
        break;

      // =================================================================
      // SCHEDULED AGENTS MESSAGE HANDLERS
      // =================================================================

      case 'scheduled_agent:create':
        {
          try {
            const { userId, agentData } = data;
            if (!userId || !agentData) {
              runtime.emitMessage({ type: 'error', message: 'userId and agentData required' });
              break;
            }

            const requestedServers = Array.isArray(agentData.mcpServers) && agentData.mcpServers.length > 0
              ? agentData.mcpServers
              : Object.keys(config.mcpServers || {});

            const toolsByServer = await runtime.getMcpToolsForServers(requestedServers);
            const toolList = Object.values(toolsByServer).flat().filter(Boolean);

            const enrichedAgentData = {
              ...agentData,
              mcpServers: requestedServers,
              permissions: {
                ...(agentData.permissions || {}),
                preAuthorized: true,
                tools: toolList
              }
            };

            const agent = await scheduledAgentStore.createAgent(userId, enrichedAgentData);
            await agentScheduler.scheduleAgent(agent);
            runtime.emitMessage({ type: 'scheduled_agent:created', agent });
          } catch (error) {
            console.error('[ScheduledAgent] Error creating agent:', error);
            runtime.emitMessage({ type: 'error', message: `Failed to create agent: ${error.message}` });
          }
        }
        break;

      case 'scheduled_agent:list':
        {
          try {
            const { userId, filters } = data;
            if (!userId) {
              runtime.emitMessage({ type: 'error', message: 'userId required' });
              break;
            }

            const agents = await scheduledAgentStore.listAgents(userId, filters);
            runtime.emitMessage({ type: 'scheduled_agent:list', agents });
          } catch (error) {
            console.error('[ScheduledAgent] Error listing agents:', error);
            runtime.emitMessage({ type: 'error', message: `Failed to list agents: ${error.message}` });
          }
        }
        break;

      case 'scheduled_agent:get':
        {
          try {
            const { userId, agentId } = data;
            if (!userId || !agentId) {
              runtime.emitMessage({ type: 'error', message: 'userId and agentId required' });
              break;
            }

            const agent = await scheduledAgentStore.getAgent(userId, agentId);
            runtime.emitMessage({ type: 'scheduled_agent:get', agent });
          } catch (error) {
            console.error('[ScheduledAgent] Error getting agent:', error);
            runtime.emitMessage({ type: 'error', message: `Failed to get agent: ${error.message}` });
          }
        }
        break;

      case 'scheduled_agent:update':
        {
          try {
            const { userId, agentId, updates } = data;
            if (!userId || !agentId || !updates) {
              runtime.emitMessage({ type: 'error', message: 'userId, agentId, and updates required' });
              break;
            }

            // Ensure schedule has timezone and cron
            if (updates.schedule) {
              if (!updates.schedule.timezone) {
                updates.schedule.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
              }
              // If cron is missing but humanReadable is present, parse it (legacy fallback)
              if (!updates.schedule.cron && updates.schedule.humanReadable) {
                const humanReadable = updates.schedule.humanReadable;
                updates.schedule.cron = isValidCron(humanReadable)
                  ? humanReadable
                  : parseScheduleToCron(humanReadable);
              }
            }

            if (updates.mcpServers !== undefined) {
              const requestedServers = Array.isArray(updates.mcpServers) && updates.mcpServers.length > 0
                ? updates.mcpServers
                : Object.keys(config.mcpServers || {});

              const toolsByServer = await runtime.getMcpToolsForServers(requestedServers);
              const toolList = Object.values(toolsByServer).flat().filter(Boolean);

              updates.mcpServers = requestedServers;
              updates.permissions = {
                ...(updates.permissions || {}),
                preAuthorized: true,
                tools: toolList
              };
            }

            const agent = await scheduledAgentStore.updateAgent(userId, agentId, updates);

            // If schedule changed, reschedule the job
            if (updates.schedule || updates.status) {
              if (agent.status === 'active') {
                await agentScheduler.rescheduleAgent(agent);
              } else {
                agentScheduler.unscheduleAgent(agentId);
              }
            }

            runtime.emitMessage({ type: 'scheduled_agent:updated', agent });
          } catch (error) {
            console.error('[ScheduledAgent] Error updating agent:', error);
            runtime.emitMessage({ type: 'error', message: `Failed to update agent: ${error.message}` });
          }
        }
        break;

      case 'scheduled_agent:delete':
        {
          try {
            const { userId, agentId } = data;
            if (!userId || !agentId) {
              runtime.emitMessage({ type: 'error', message: 'userId and agentId required' });
              break;
            }

            // Unschedule first
            agentScheduler.unscheduleAgent(agentId);

            // Delete agent
            const success = await scheduledAgentStore.deleteAgent(userId, agentId);

            // Optionally delete run history
            if (success) {
              await agentRunHistory.deleteAgentHistory(agentId);
            }

            runtime.emitMessage({ type: 'scheduled_agent:deleted', agentId, success });
          } catch (error) {
            console.error('[ScheduledAgent] Error deleting agent:', error);
            runtime.emitMessage({ type: 'error', message: `Failed to delete agent: ${error.message}` });
          }
        }
        break;

      case 'scheduled_agent:toggle':
        {
          try {
            const { userId, agentId, status } = data;
            if (!userId || !agentId || !status) {
              runtime.emitMessage({ type: 'error', message: 'userId, agentId, and status required' });
              break;
            }

            const agent = await scheduledAgentStore.toggleStatus(userId, agentId, status);

            // Schedule or unschedule based on status
            if (status === 'active') {
              await agentScheduler.scheduleAgent(agent);
            } else {
              agentScheduler.unscheduleAgent(agentId);
            }

            runtime.emitMessage({ type: 'scheduled_agent:toggled', agent });
          } catch (error) {
            console.error('[ScheduledAgent] Error toggling agent:', error);
            runtime.emitMessage({ type: 'error', message: `Failed to toggle agent: ${error.message}` });
          }
        }
        break;

      case 'scheduled_agent:get_history':
        {
          try {
            const { agentId, limit } = data;
            if (!agentId) {
              runtime.emitMessage({ type: 'error', message: 'agentId required' });
              break;
            }

            const history = await agentRunHistory.getRunHistory(agentId, limit);
            runtime.emitMessage({ type: 'scheduled_agent:history', agentId, history });
          } catch (error) {
            console.error('[ScheduledAgent] Error getting history:', error);
            runtime.emitMessage({ type: 'error', message: `Failed to get history: ${error.message}` });
          }
        }
        break;

      case 'scheduled_agent:trigger':
        {
          const { agentId } = data;
          console.error(`[ScheduledAgent] === TRIGGER MESSAGE RECEIVED for: ${agentId} ===`);

          if (!agentId) {
            runtime.emitMessage({ type: 'scheduled_agent:triggered', agentId: null, success: false, error: 'agentId required' });
            break;
          }

          // Send immediate acknowledgment that we received the request
          // Then run execution in background (don't await it for the IPC response)
          console.error(`[ScheduledAgent] Sending immediate response, starting execution in background...`);

          // Start execution in background (don't block the response)
          agentScheduler.triggerAgent(agentId)
            .then(result => {
              if (result && typeof result.success === 'boolean') {
                console.error(`[ScheduledAgent] Background execution completed for ${agentId}:`, result.success ? 'SUCCESS' : 'FAILED');
              } else if (result?.skipped) {
                console.error(`[ScheduledAgent] Background execution skipped for ${agentId}`);
              } else {
                console.error(`[ScheduledAgent] Background execution completed for ${agentId}: UNKNOWN`);
              }
            })
            .catch(error => {
              console.error(`[ScheduledAgent] Background execution error for ${agentId}:`, error.message);
            });

          // Respond immediately so IPC doesn't timeout
          runtime.emitMessage({
            type: 'scheduled_agent:triggered',
            agentId,
            success: true,
            message: 'Agent execution started in background'
          });
        }
        break;

      case 'scheduled_agent:get_status':
        {
          try {
            const status = agentScheduler.getStatus();
            runtime.emitMessage({ type: 'scheduled_agent:status', status });
          } catch (error) {
            console.error('[ScheduledAgent] Error getting status:', error);
            runtime.emitMessage({ type: 'error', message: `Failed to get status: ${error.message}` });
          }
        }
        break;

      // ============ OAUTH MESSAGES ============
      case 'mcp_oauth_start':
        {
          const { providerId, serverId, scopes } = data;
          console.log(`[OAuth] mcp_oauth_start received: providerId=${providerId}, serverId=${serverId}`);
          if (!providerId || !serverId) {
            runtime.emitMessage({ type: 'mcp_oauth_result', success: false, error: 'providerId and serverId required' });
            break;
          }

          // Check if this server uses remote-oauth (mcp-remote handles auth internally)
          const serverDef = config.mcpServers[serverId] || {};
          const authDefs = serverDef.auth || [];
          console.log(`[OAuth] Server ${serverId} auth definitions:`, JSON.stringify(authDefs));
          const isRemoteOAuth = authDefs.some(a => a.type === 'remote-oauth');
          console.log(`[OAuth] isRemoteOAuth=${isRemoteOAuth}`);

          if (isRemoteOAuth) {
            console.log(`[RemoteOAuth] Starting remote OAuth flow for server=${serverId}`);
            try {
              const result = await handleRemoteOAuth(serverId);
              runtime.emitMessage({ type: 'mcp_oauth_result', ...result });
              if (result.success) {
                runtime.emitMessage({ type: 'mcp_credentials_updated', serverId, success: true });
              }
            } catch (error) {
              console.error('[RemoteOAuth] Flow error:', error);
              runtime.emitMessage({ type: 'mcp_oauth_result', success: false, serverId, error: error.message });
            }
            break;
          }

          console.log(`[OAuth] Starting OAuth flow for provider=${providerId}, server=${serverId}`);
          try {
            const result = await oauthManager.startFlow(providerId, serverId, scopes);
            runtime.emitMessage({ type: 'mcp_oauth_result', ...result });

            // If successful, also emit updated server list so frontend can refresh
            if (result.success) {
              runtime.emitMessage({ type: 'mcp_credentials_updated', serverId, success: true });
            }
          } catch (error) {
            console.error('[OAuth] Flow error:', error);
            runtime.emitMessage({ type: 'mcp_oauth_result', success: false, serverId, error: error.message });
          }
        }
        break;

      case 'mcp_oauth_status':
        {
          const { serverId } = data;
          if (!serverId) {
            runtime.emitMessage({ type: 'error', message: 'serverId required' });
            break;
          }
          try {
            const status = await oauthManager.getStatus(serverId);
            runtime.emitMessage({ type: 'mcp_oauth_status', ...status });
          } catch (error) {
            runtime.emitMessage({ type: 'error', message: error.message });
          }
        }
        break;

      case 'mcp_oauth_disconnect':
        {
          const { serverId } = data;
          if (!serverId) {
            runtime.emitMessage({ type: 'error', message: 'serverId required' });
            break;
          }
          try {
            const result = await oauthManager.disconnect(serverId);
            runtime.emitMessage({ type: 'mcp_oauth_disconnected', ...result });
          } catch (error) {
            runtime.emitMessage({ type: 'error', message: error.message });
          }
        }
        break;

      case 'mcp_supabase_projects':
        {
          const { accessToken } = data;
          if (!accessToken) {
            runtime.emitMessage({ type: 'mcp_supabase_projects_result', success: false, error: 'Access token is required' });
            break;
          }
          try {
            const resp = await fetch('https://api.supabase.com/v1/projects', {
              headers: { Authorization: `Bearer ${accessToken}` }
            });
            if (resp.status === 401) {
              runtime.emitMessage({ type: 'mcp_supabase_projects_result', success: false, error: 'Invalid access token. Please check your PAT and try again.' });
              break;
            }
            if (!resp.ok) {
              runtime.emitMessage({ type: 'mcp_supabase_projects_result', success: false, error: `Supabase API error (${resp.status})` });
              break;
            }
            const rawProjects = await resp.json();
            const projects = rawProjects.map(p => ({ id: p.id, name: p.name, ref: p.ref || p.id, region: p.region, status: p.status }));
            runtime.emitMessage({ type: 'mcp_supabase_projects_result', success: true, projects });
          } catch (error) {
            runtime.emitMessage({ type: 'mcp_supabase_projects_result', success: false, error: error.message || 'Failed to fetch projects' });
          }
        }
        break;

      default:
        runtime.emitMessage({ type: 'error', message: `Unknown message type: ${data.type}` });
        break;
    }
  } catch (error) {
    runtime.emitMessage({ type: 'error', message: error.message || 'Invalid input format' });
  }
});
