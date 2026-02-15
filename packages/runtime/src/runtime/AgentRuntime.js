import EventEmitter from 'events';
import { query, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import SessionStore from '../sessions/SessionStore.js';
import { globalConfig } from '../../config/GlobalConfig.js';
import { skillManager } from '../skills/SkillManager.js';
import permissionManager, { PERMISSION } from '../permissions/PermissionManager.js';
import costTracker from '../providers/CostTracker.js';
import cronParser from 'cron-parser';

// =============================================================================
// DANGEROUS COMMAND FILTERING (Sandboxing)
// =============================================================================
//
// WHY THIS EXISTS:
// The agent can execute arbitrary shell commands via the bash tool. Without
// filtering, it could run destructive commands like:
//   - `kill/pkill/killall` to terminate system processes (including this app)
//   - `rm -rf /` to delete the entire filesystem
//   - `sudo` to gain elevated privileges
//   - Commands that modify system configuration
//
// This filter blocks commands that could:
//   1. Kill processes outside the agent's control
//   2. Delete files outside the workspace
//   3. Gain elevated privileges
//   4. Modify system configuration
//   5. Access sensitive system files
//
// When a dangerous command is detected, the permission is automatically denied
// and the agent receives an error explaining why.
// =============================================================================

const DANGEROUS_COMMAND_PATTERNS = [
  // Process killing - these bypass process tracking and could kill system processes
  { pattern: /\bkill\s+(-[a-zA-Z0-9]+\s+)*\d+/i, reason: 'Killing processes by PID is not allowed - it could terminate critical system processes' },
  { pattern: /\bkill\s+(-[a-zA-Z0-9]+\s+)*-/i, reason: 'Killing processes by signal is not allowed' },
  { pattern: /\bpkill\b/i, reason: 'pkill can terminate critical system processes including this application' },
  { pattern: /\bkillall\b/i, reason: 'killall can terminate critical system processes' },
  { pattern: /\bxkill\b/i, reason: 'xkill is not allowed' },

  // Destructive file operations outside workspace
  { pattern: /\brm\s+(-[a-zA-Z]*\s+)*-[a-zA-Z]*r[a-zA-Z]*\s+(-[a-zA-Z]*\s+)*[\/~](?!\S*\/Users\/\S+\/\S)/i, reason: 'Recursive deletion outside workspace is not allowed' },
  { pattern: /\brm\s+(-[a-zA-Z]*\s+)*\/(?:etc|usr|bin|sbin|var|lib|boot|root|sys|proc|dev)\b/i, reason: 'Deleting system directories is not allowed' },
  { pattern: /\brm\s+(-[a-zA-Z]*\s+)*~\s*$/i, reason: 'Deleting home directory is not allowed' },

  // Privilege escalation
  { pattern: /\bsudo\b/i, reason: 'Elevated privileges (sudo) are not allowed for security reasons' },
  { pattern: /\bsu\s+-?\s*$/i, reason: 'Switching to root user is not allowed' },
  { pattern: /\bsu\s+-?\s*root/i, reason: 'Switching to root user is not allowed' },
  { pattern: /\bdoas\b/i, reason: 'Elevated privileges (doas) are not allowed' },

  // System modification
  { pattern: /\bsystemctl\s+(start|stop|restart|enable|disable|mask)/i, reason: 'Modifying system services is not allowed' },
  { pattern: /\blaunchctl\s+(load|unload|start|stop|kill|remove)/i, reason: 'Modifying macOS services is not allowed' },
  { pattern: /\bchmod\s+[0-7]*\s+\/(?!Users)/i, reason: 'Changing permissions on system files is not allowed' },
  { pattern: /\bchown\b.*\/(?!Users)/i, reason: 'Changing ownership of system files is not allowed' },

  // Disk/filesystem operations
  { pattern: /\bmkfs\b/i, reason: 'Creating filesystems is not allowed' },
  { pattern: /\bfdisk\b/i, reason: 'Disk partitioning is not allowed' },
  { pattern: /\bdd\s+.*of=\/dev/i, reason: 'Writing directly to devices is not allowed' },
  { pattern: /\bmount\s/i, reason: 'Mounting filesystems is not allowed' },
  { pattern: /\bumount\s/i, reason: 'Unmounting filesystems is not allowed' },

  // Network security
  { pattern: /\biptables\b/i, reason: 'Modifying firewall rules is not allowed' },
  { pattern: /\bpfctl\b/i, reason: 'Modifying packet filter is not allowed' },

  // Dangerous redirects that could overwrite system files
  { pattern: />\s*\/etc\//i, reason: 'Writing to /etc is not allowed' },
  { pattern: />\s*\/usr\//i, reason: 'Writing to /usr is not allowed' },
  { pattern: />\s*\/bin\//i, reason: 'Writing to /bin is not allowed' },
  { pattern: />\s*\/sbin\//i, reason: 'Writing to /sbin is not allowed' },

  // Fork bombs and resource exhaustion
  { pattern: /:\(\)\s*\{\s*:\|:&\s*\}\s*;:/i, reason: 'Fork bombs are not allowed' },
  { pattern: /\bwhile\s+true\s*;\s*do\s+[^;]*;\s*done\s*&/i, reason: 'Infinite background loops are not allowed' },
];

// =============================================================================
// PERMISSION CACHING - High-Risk Tools
// =============================================================================
// These tools can NEVER be "always allowed" - they're capped at session level
// for security reasons. They involve arbitrary code execution or file modification.
// =============================================================================

const NEVER_ALWAYS_ALLOW = new Set([
  // Arbitrary code execution
  'bash', 'shell', 'command', 'execute_command',
  // File modification
  'write', 'filewrite', 'createfile',
  'edit', 'fileedit', 'editfile',
  // MCP variants that involve bash/write
  'mcp__terminal__execute_command',
  'mcp__terminal__bash',
]);

/**
 * Check if a bash command is dangerous and should be blocked
 * @param {string} command - The shell command to check
 * @returns {{ blocked: boolean, reason?: string }}
 */
function checkDangerousCommand(command) {
  if (!command || typeof command !== 'string') {
    return { blocked: false };
  }

  const normalizedCommand = command.replace(/\s+/g, ' ').trim();

  for (const { pattern, reason } of DANGEROUS_COMMAND_PATTERNS) {
    if (pattern.test(normalizedCommand)) {
      return { blocked: true, reason };
    }
  }

  return { blocked: false };
}


function safeSerialize(value, depth = 0) {
  if (depth > 5) {
    return '[truncated]';
  }
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => safeSerialize(item, depth + 1));
  }
  if (value && typeof value === 'object') {
    const serialized = {};
    for (const [key, nested] of Object.entries(value)) {
      serialized[key] = safeSerialize(nested, depth + 1);
    }
    return serialized;
  }
  return String(value);
}

function describeToolUse(toolName, toolInput) {
  if (!toolInput || typeof toolInput !== 'object') {
    return `Allow Friday to use ${toolName}`;
  }
  const pathHint =
    toolInput.file_path ||
    toolInput.path ||
    toolInput.destination ||
    toolInput.destination_path ||
    toolInput.target_path;
  if (pathHint) {
    return `${toolName} on ${pathHint}`;
  }
  if (toolInput.command) {
    return `${toolName}: ${String(toolInput.command).slice(0, 120)}`;
  }
  return `Allow Friday to use ${toolName}`;
}

// =============================================================================
// CRON VALIDATION FOR SCHEDULED AGENTS
// =============================================================================

/**
 * Validate cron expression
 */
function isValidCron(cron) {
  try {
    cronParser.parseExpression(cron);
    return true;
  } catch (e) {
    return false;
  }
}

function getToolThinkingLabel(toolName, toolInput) {
  const name = (toolName || 'tool').toLowerCase();

  // Generate human-readable labels for common tools
  if (name === 'bash' || name === 'shell') {
    const cmd = toolInput?.command || '';
    const shortCmd = cmd.length > 50 ? cmd.substring(0, 50) + '...' : cmd;
    return `Running command: ${shortCmd}`;
  } else if (name === 'read') {
    const file = toolInput?.file_path || '';
    const fileName = file.split('/').pop() || file;
    return `Reading file: ${fileName}`;
  } else if (name === 'write' || name === 'filewrite') {
    const file = toolInput?.file_path || '';
    const fileName = file.split('/').pop() || file;
    return `Writing file: ${fileName}`;
  } else if (name === 'edit' || name === 'fileedit') {
    const file = toolInput?.file_path || '';
    const fileName = file.split('/').pop() || file;
    return `Editing file: ${fileName}`;
  } else if (name === 'glob' || name === 'find') {
    const pattern = toolInput?.pattern || '';
    return `Searching files: ${pattern}`;
  } else if (name === 'grep' || name === 'search') {
    const pattern = toolInput?.pattern || '';
    return `Searching code: ${pattern}`;
  } else if (name === 'websearch') {
    const query = toolInput?.query || '';
    return `Web search: ${query}`;
  } else if (name === 'webfetch') {
    const url = toolInput?.url || '';
    return `Fetching: ${url}`;
  }

  // Default label
  return `Using ${toolName || 'tool'}`;
}

export class AgentRuntime extends EventEmitter {
  constructor({ workspacePath, rules = [], mcpServers = {}, sessionsPath, scheduledAgentStore = null, agentScheduler = null }) {
    super();
    this.workspacePath = workspacePath;
    this.rules = rules;
    this.mcpServers = mcpServers;

    this.currentSessionId = null;
    this.pendingPermissions = new Map();
    this.pendingRulePrompts = new Map();
    this.handledToolUseIds = new Set();
    this.rulePromptCounter = 0;
    this.permissionIdCounter = 0;
    this.sessionStore = sessionsPath ? new SessionStore({ basePath: sessionsPath }) : null;
    this.pendingSessionEvents = [];
    this.pendingSessionMetadata = null;
    this.pendingUsage = [];
    // Query abort controller for stop functionality
    this.currentAbortController = null;

    // Workspace change tracking - when workspace changes but session continues,
    // we should not resume the SDK session (stale file context)
    this.skipNextResume = false;

    // =============================================================================
    // PERMISSION CACHING
    // =============================================================================
    // Session-level approvals (cleared when session resets)
    // Key: normalized tool name (e.g., "bash", "mcp__firecrawl__search")
    // Value: { level: 'session', approvedAt: timestamp }
    this.sessionApprovals = new Map();

    // Reference to global config for persistent "always allow" permissions
    this.globalConfig = globalConfig;

    // =============================================================================
    // SCHEDULED AGENTS - In-process tool support
    // =============================================================================
    this.scheduledAgentStore = scheduledAgentStore;
    this.agentScheduler = agentScheduler;
    this.mcpToolCache = new Map();

    // Create in-process SDK MCP server for internal tools (no child process needed)
    this.internalMcpServer = this.createInternalMcpServer();

    this.log('[INIT] Agent runtime ready');

  }

  // =============================================================================
  // MCP TOOL DISCOVERY (Scheduled Agents)
  // =============================================================================

  buildMcpToolName(serverId, toolName) {
    if (!serverId || !toolName) return null;
    return `mcp__${serverId}__${toolName}`;
  }

  async getMcpToolsForServer(serverId) {
    if (!serverId) return [];
    if (this.mcpToolCache.has(serverId)) {
      return this.mcpToolCache.get(serverId);
    }

    const serverDef = this.mcpServers?.[serverId];
    if (!serverDef?.command) {
      return [];
    }

    const tools = [];
    let discovered = false;
    let client = null;
    let transport = null;
    const timeoutMs = 5000;

    try {
      const [{ Client }, { StdioClientTransport }] = await Promise.all([
        import('@modelcontextprotocol/sdk/client/index.js'),
        import('@modelcontextprotocol/sdk/client/stdio.js')
      ]);

      transport = new StdioClientTransport({
        command: serverDef.command,
        args: Array.isArray(serverDef.args) ? serverDef.args : [],
        env: {
          ...process.env,
          ...(serverDef.env || {})
        }
      });

      client = new Client(
        { name: 'friday-tool-discovery', version: '1.0.0' },
        { capabilities: {} }
      );

      const connectPromise = client.connect(transport);
      await Promise.race([
        connectPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('MCP tool discovery timeout (connect)')), timeoutMs))
      ]);

      const listPromise = client.listTools();
      const listResult = await Promise.race([
        listPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('MCP tool discovery timeout (list)')), timeoutMs))
      ]);

      const toolDefs = Array.isArray(listResult?.tools) ? listResult.tools : [];
      for (const tool of toolDefs) {
        const fullName = this.buildMcpToolName(serverId, tool?.name);
        if (fullName) tools.push(fullName);
      }
      discovered = true;
    } catch (error) {
      this.log(`[MCP] Failed to list tools for ${serverId}: ${error.message}`);
    } finally {
      try {
        if (client?.close) {
          await client.close();
        } else if (client?.disconnect) {
          await client.disconnect();
        }
      } catch (error) {
        this.log(`[MCP] Failed to close client for ${serverId}: ${error.message}`);
      }
      try {
        if (transport?.close) {
          await transport.close();
        }
      } catch (error) {
        this.log(`[MCP] Failed to close transport for ${serverId}: ${error.message}`);
      }
    }

    if (discovered) {
      this.mcpToolCache.set(serverId, tools);
    }
    return tools;
  }

  async getMcpToolsForServers(serverIds) {
    const ids = Array.isArray(serverIds) && serverIds.length > 0
      ? serverIds
      : Object.keys(this.mcpServers || {});
    const results = {};
    for (const serverId of ids) {
      results[serverId] = await this.getMcpToolsForServer(serverId);
    }
    return results;
  }

  /**
   * Create an in-process MCP server for internal tools using createSdkMcpServer.
   * This avoids the overhead of spawning child processes and HTTP APIs.
   * Tools defined here run in the same process as AgentRuntime.
   */
  createInternalMcpServer() {
    const self = this;
    const DEFAULT_USER_ID = 'local-user';

    return createSdkMcpServer({
      name: 'friday-internal',
      version: '1.0.0',
      tools: [
        {
          name: 'create_scheduled_agent',
          description: `Create a scheduled agent that runs automatically at specified times.

Use this tool when the user wants to:
- Automate a recurring task (e.g., "check my emails every morning")
- Schedule something to run later (e.g., "remind me tomorrow at 9am")
- Create a background automation (e.g., "research AI news daily")
- Set up a one-time scheduled task (e.g., "run this once at 5pm today")

The agent will run autonomously using the specified MCP tools.`,
          inputSchema: {
            name: z.string().describe('A short, descriptive name for the agent (e.g., "Daily AI News Research", "Morning Weather Check")'),
            instructions: z.string().describe('Detailed instructions for what the agent should do when it runs. Be specific about the task, data sources, and expected output.'),
            cron: z.string().describe('A standard 5-field cron expression for the schedule. Examples: "*/3 * * * *" (every 3 minutes), "0 9 * * *" (daily at 9am), "0 9 * * 1" (every Monday at 9am), "30 * * * *" (hourly at :30), "0 */2 * * *" (every 2 hours). Fields: minute hour day-of-month month day-of-week.'),
            schedule_description: z.string().describe('A short human-readable description of the schedule for display (e.g., "Every 3 minutes", "Daily at 9:00 AM", "Every Monday at 9am").'),
            mcp_servers: z.array(z.string()).optional().describe('List of MCP servers the agent needs. Use any MCP server available in the current config. Omit to allow all available MCP servers.'),
            max_runs_per_hour: z.number().optional().describe('Maximum number of runs allowed per hour (default: 5). Set higher for frequent schedules like every minute.')
          },
          handler: async (args) => {
            try {
              const { name: agentName, instructions, cron: cronExpression, schedule_description: humanReadable, mcp_servers = [], max_runs_per_hour } = args;

              if (!agentName || !instructions || !cronExpression) {
                return {
                  content: [
                    {
                      type: 'text',
                      text: 'Error: name, instructions, and cron are required to create an agent.'
                    }
                  ],
                  isError: true
                };
              }

              // Check if store is available
              if (!self.scheduledAgentStore) {
                return {
                  content: [
                    {
                      type: 'text',
                      text: 'Error: Scheduled agent system not initialized.'
                    }
                  ],
                  isError: true
                };
              }

              // Validate the cron expression
              if (!isValidCron(cronExpression)) {
                return {
                  content: [
                    {
                      type: 'text',
                      text: `Error: Invalid cron expression "${cronExpression}". Must be a valid 5-field cron expression.`
                    }
                  ],
                  isError: true
                };
              }

              const requestedServers = Array.isArray(mcp_servers) && mcp_servers.length > 0
                ? mcp_servers
                : Object.keys(self.mcpServers || {});

              const toolsByServer = await self.getMcpToolsForServers(requestedServers);
              const toolList = Object.values(toolsByServer).flat().filter(Boolean);

              const agentData = {
                name: agentName,
                instructions,
                schedule: {
                  cron: cronExpression,
                  humanReadable,
                  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
                },
                mcpServers: requestedServers,
                maxRunsPerHour: max_runs_per_hour ?? 5,
                permissions: {
                  preAuthorized: true,
                  tools: toolList
                }
              };

              const agent = await self.scheduledAgentStore.createAgent(DEFAULT_USER_ID, agentData);

              if (self.agentScheduler) {
                await self.agentScheduler.scheduleAgent(agent);
              }

              // Emit event for frontend
              self.emitMessage({ type: 'scheduled_agent:created', agent });

              self.log(`[INTERNAL] Created scheduled agent: ${agent.name} (${agent.id})`);

              return {
                content: [
                  {
                    type: 'text',
                    text: `Successfully created scheduled agent "${agent.name}" (ID: ${agent.id}).

Schedule: ${agent.schedule?.humanReadable || humanReadable || cronExpression}
Cron: ${agent.schedule?.cron}
Status: ${agent.status}

The agent will run automatically according to the schedule. The user can view and manage it in the Agents panel.`
                  }
                ]
              };
            } catch (error) {
              self.log(`[INTERNAL] Error creating agent: ${error.message}`);
              return {
                content: [
                  {
                    type: 'text',
                    text: `Error creating scheduled agent: ${error.message}`
                  }
                ],
                isError: true
              };
            }
          }
        }
      ]
    });
  }

  // =============================================================================
  // PERMISSION CACHING METHODS
  // =============================================================================

  /**
   * Normalize a tool name for consistent cache lookups
   * @param {string} toolName - Raw tool name
   * @returns {string} Normalized tool name (lowercase, trimmed)
   */
  normalizeToolName(toolName) {
    return (toolName || '').toLowerCase().trim();
  }

  /**
   * Check if a tool has cached permission approval
   * @param {string} toolName - The tool name to check
   * @returns {{ approved: boolean, level: 'session' | 'always' } | null} Cached permission or null
   */
  checkCachedPermission(toolName) {
    const normalizedName = this.normalizeToolName(toolName);

    // Check always-allow first (from GlobalConfig)
    const alwaysAllowPath = `permissions.alwaysAllow.${normalizedName}`;
    const alwaysAllowEntry = this.globalConfig.get(alwaysAllowPath);
    if (alwaysAllowEntry) {
      return { approved: true, level: 'always' };
    }

    // Check session approvals
    if (this.sessionApprovals.has(normalizedName)) {
      return { approved: true, level: 'session' };
    }

    return null;
  }

  /**
   * Store a permission approval based on the selected level
   * @param {string} toolName - The tool name
   * @param {string} level - 'once' | 'session' | 'always'
   * @param {string} [description] - Optional description for the tool
   * @returns {{ stored: boolean, actualLevel: string, warning?: string }}
   */
  storePermissionApproval(toolName, level, description) {
    const normalizedName = this.normalizeToolName(toolName);

    // "once" level = no storage needed
    if (level === 'once' || !level) {
      return { stored: false, actualLevel: 'once' };
    }

    // Check if this is a high-risk tool that can't be "always" allowed
    if (level === 'always' && NEVER_ALWAYS_ALLOW.has(normalizedName)) {
      // Downgrade to session level with warning
      this.log(`[PERMISSION] High-risk tool "${normalizedName}" downgraded from "always" to "session"`);
      this.sessionApprovals.set(normalizedName, {
        level: 'session',
        approvedAt: new Date().toISOString(),
        description: description || normalizedName
      });
      return {
        stored: true,
        actualLevel: 'session',
        warning: `High-risk tools like "${toolName}" can only be approved for the current session, not permanently.`
      };
    }

    if (level === 'session') {
      this.sessionApprovals.set(normalizedName, {
        level: 'session',
        approvedAt: new Date().toISOString(),
        description: description || normalizedName
      });
      this.log(`[PERMISSION] Stored session approval for: ${normalizedName}`);
      return { stored: true, actualLevel: 'session' };
    }

    if (level === 'always') {
      const alwaysAllowPath = `permissions.alwaysAllow.${normalizedName}`;
      this.globalConfig.set(alwaysAllowPath, {
        approvedAt: new Date().toISOString(),
        description: description || normalizedName
      });
      this.log(`[PERMISSION] Stored persistent approval for: ${normalizedName}`);
      return { stored: true, actualLevel: 'always' };
    }

    return { stored: false, actualLevel: level };
  }

  /**
   * Revoke a persistent "always allow" permission
   * @param {string} toolName - The tool name to revoke
   * @returns {boolean} Whether the revocation was successful
   */
  revokeAlwaysAllow(toolName) {
    const normalizedName = this.normalizeToolName(toolName);
    const alwaysAllowPath = `permissions.alwaysAllow.${normalizedName}`;

    if (this.globalConfig.has(alwaysAllowPath)) {
      this.globalConfig.delete(alwaysAllowPath);
      this.log(`[PERMISSION] Revoked persistent approval for: ${normalizedName}`);
      return true;
    }
    return false;
  }

  /**
   * Get all persistent "always allow" permissions
   * @returns {Array<{ tool: string, approvedAt: string, description: string }>}
   */
  getAlwaysAllowedTools() {
    const tools = [];
    const alwaysAllowKeys = this.globalConfig.getKeys('permissions.alwaysAllow');

    for (const toolName of alwaysAllowKeys) {
      const entry = this.globalConfig.get(`permissions.alwaysAllow.${toolName}`);
      if (entry) {
        tools.push({
          tool: toolName,
          approvedAt: entry.approvedAt,
          description: entry.description || toolName
        });
      }
    }

    return tools;
  }

  /**
   * Analyze screenshot using Claude Haiku (cheap, fast)
   * Returns a text description of what's on screen
   * @param {Object} screenshot - Screenshot data with image (base64), mimeType
   * @returns {Promise<string>} Text analysis of the screen
   */
  async analyzeScreenWithHaiku(screenshot) {
    if (!screenshot || !screenshot.image) {
      throw new Error('No screenshot data provided');
    }

    // Log image size for debugging performance
    const imageSizeKB = Math.round(screenshot.image.length * 0.75 / 1024); // base64 is ~33% larger
    this.log(`[SCREEN] Screenshot received (${imageSizeKB}KB), analyzing with Haiku...`);
    this.emitMessage({ type: 'info', message: 'Screenshot received, analyzing...' });

    const startTime = Date.now();

    try {
      const client = this.getAnthropicClient();

      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: screenshot.mimeType || 'image/jpeg',
                  data: screenshot.image
                }
              },
              {
                type: 'text',
                text: `Analyze this screenshot and provide a concise but comprehensive description of what you see. Include:
1. What application/website is shown (if identifiable)
2. Main content visible (text, UI elements, data)
3. Current state (any dialogs, forms, selections, errors)
4. Notable UI elements and their positions

Be specific about text content you can read. Keep the description under 500 words.`
              }
            ]
          }
        ]
      });

      const analysis = response.content[0]?.text || '';
      const elapsedMs = Date.now() - startTime;
      this.log(`[SCREEN] Haiku analysis complete (${analysis.length} chars) in ${elapsedMs}ms`);
      this.emitMessage({ type: 'info', message: 'Screen content analyzed' });

      return analysis;
    } catch (error) {
      this.log(`[SCREEN] Haiku analysis failed: ${error.message}`);
      this.emitMessage({ type: 'info', message: 'Screen analysis failed, continuing...' });
      throw error;
    }
  }

  updateMcpServers(nextServers = {}) {
    this.mcpServers = nextServers;
    this.emitMessage({
      type: 'mcp_servers_reloaded',
      servers: Object.keys(this.mcpServers || {})
    });
  }

  log(message) {
    console.error(message);
  }

  emitMessage(payload) {
    this.recordOutboundEvent(payload);
    this.emit('message', payload);
  }

  bufferSessionEvent(event) {
    this.pendingSessionEvents.push(event);
    if (this.pendingSessionEvents.length > 2000) {
      this.pendingSessionEvents.shift();
    }
  }

  recordInboundEvent(payload, { sessionId } = {}) {
    if (!this.sessionStore) {
      return;
    }
    const targetSession = sessionId || this.currentSessionId;
    const event = { direction: 'inbound', payload };
    if (!targetSession) {
      this.bufferSessionEvent(event);
      return;
    }
    this.sessionStore
      .appendEvent(targetSession, event, { workspacePath: this.workspacePath })
      .catch((error) => {
        this.log(`[SessionStore] Failed to append inbound event: ${error.message}`);
      });
  }

  recordOutboundEvent(payload) {
    if (!this.sessionStore) {
      return;
    }
    if (payload.type === 'session' && payload.session_id) {
      this.currentSessionId = payload.session_id;
      this.initializeSessionLogging(payload.session_id);
      return;
    }
    const event = { direction: 'outbound', payload };
    if (!this.currentSessionId) {
      if (payload.type === 'usage' && payload.usage) {
        this.pendingUsage.push(payload.usage);
      }
      this.bufferSessionEvent(event);
      return;
    }
    this.sessionStore
      .appendEvent(this.currentSessionId, event, { workspacePath: this.workspacePath })
      .catch((error) => {
        this.log(`[SessionStore] Failed to append outbound event: ${error.message}`);
      });
    if (payload.type === 'usage' && payload.usage) {
      this.sessionStore.updateUsage(this.currentSessionId, payload.usage).catch((error) => {
        this.log(`[SessionStore] Failed to record usage: ${error.message}`);
      });
    }
  }

  initializeSessionLogging(sessionId) {
    if (!this.sessionStore || !sessionId) {
      return;
    }
    const defaults = {
      workspacePath: this.pendingSessionMetadata?.workspacePath || this.workspacePath,
      title: this.pendingSessionMetadata?.title,
      firstMessage: this.pendingSessionMetadata?.firstMessage,
      model: this.pendingSessionMetadata?.model,
      createdAt: this.pendingSessionMetadata?.createdAt,
      updatedAt: new Date().toISOString()
    };
    this.sessionStore.ensureSession(sessionId, defaults).catch((error) => {
      this.log(`[SessionStore] Failed to initialize session ${sessionId}: ${error.message}`);
    });
    if (this.pendingSessionEvents.length > 0) {
      const events = [...this.pendingSessionEvents];
      this.pendingSessionEvents = [];
      events.forEach((event) => {
        this.sessionStore.appendEvent(sessionId, event).catch((error) => {
          this.log(`[SessionStore] Failed to flush buffered event: ${error.message}`);
        });
      });
    }
    if (this.pendingUsage.length > 0) {
      const usages = [...this.pendingUsage];
      this.pendingUsage = [];
      usages.forEach((usage) => {
        this.sessionStore.updateUsage(sessionId, usage).catch((error) => {
          this.log(`[SessionStore] Failed to flush usage: ${error.message}`);
        });
      });
    }
    this.pendingSessionMetadata = null;
  }

  preparePendingSessionMetadata(userMessage, metadata = {}) {
    if (!this.sessionStore) {
      return;
    }
    const now = new Date().toISOString();
    this.pendingSessionMetadata = {
      workspacePath: this.workspacePath,
      title: this.generateSessionTitle(userMessage),
      firstMessage: userMessage,
      model: metadata?.modelId || metadata?.model || null,
      createdAt: now
    };
  }

  generateSessionTitle(message = '') {
    const text = (message || '').trim();
    if (!text) {
      return 'New Session';
    }
    const normalized = text.replace(/\s+/g, ' ');
    const lowered = normalized.toLowerCase();
    const keyword = [
      { match: /\bfix\b/, label: 'Fix' },
      { match: /\bcreate\b/, label: 'Create' },
      { match: /\bbuild\b/, label: 'Build' },
      { match: /\bdebug\b/, label: 'Debug' },
      { match: /\bdesign\b/, label: 'Design' }
    ].find((entry) => entry.match.test(lowered));
    if (keyword) {
      const remainder = normalized.replace(keyword.match, '').trim();
      if (remainder) {
        return `${keyword.label} ${remainder}`.slice(0, 60);
      }
    }
    return normalized.length > 60 ? `${normalized.slice(0, 57)}...` : normalized;
  }

  createQueryContext(metadata = {}) {
    return {
      origin: metadata.origin || 'user',
      ruleId: metadata.ruleId || null,
      toolUses: [],
      createdFiles: [],
      detectedArtifacts: new Set(),
      fileExtensions: new Set(),
      triggeredRuleIds: new Set(),
      terminalOutput: ''
    };
  }

  /**
   * Build system prompt using two-tier skill system:
   * - Expert skills (user-tagged): Designer, Developer, Analyst - max 2
   * - Internal skills (agent-selected): loaded from session, max 2 per query
   *
   * Returns { systemPrompt, model, agentName }
   */
  async buildAgentSystemPrompt(metadata = {}, userMessage = '') {
    const userId = metadata.userId || 'default';
    const mentionedSkillIds = metadata.mentionedSkillIds || []; // Expert skill IDs from frontend (max 2)

    // Friday AI unified system prompt - STATIC (good for caching)
    const currentYear = new Date().getFullYear();
    const fridayBasePrompt = `You are Friday, an autonomous AI agent. You are NOT Claude - you are Friday.

## Important Context
- **Current Year**: ${currentYear}
- **Your Identity**: You are Friday, inspired by Tony Stark's AI assistant. Always identify as "Friday" - never say you are Claude, an AI assistant, or a language model.
- When searching the web or using firecrawl, always use ${currentYear} as the current year for date-relevant queries.

## What You Can Do
Friday is a powerful autonomous agent for founders, product managers, and builders. You can:
- **Research & Analyze**: Web research, competitor analysis, market research, data analysis, citations
- **Build Applications**: Create web apps, prototypes, dashboards, landing pages
- **Write & Edit Code**: Work on existing codebases, debug, refactor, push to GitHub
- **Automate Outreach**: Search leads, write personalized emails, run email campaigns
- **Create Content**: Write documents, reports, marketing copy, social media content
- **Clone & Design**: Replicate website designs, create UI/UX mockups

## Your Expertise
You have deep knowledge in:
- **Research**: Web research, data gathering, competitive analysis, market research
- **Data Analysis**: Statistical methods, visualization, deriving insights from any data
- **Full-Stack Development**: Frontend, backend, APIs, databases, system design
- **UI/UX Design**: Visual design, accessibility, user experience patterns
- **Marketing & Sales**: Email campaigns, lead generation, copywriting, outreach

## How You Work
1. Understand what the user is trying to accomplish
2. Use the most appropriate expertise for the task
3. Apply relevant skills and knowledge dynamically
4. Execute tasks using tools - don't just describe what to do
5. Be proactive - anticipate what the user might need next

## Core Principles
- **Be practical**: Solve the actual problem, not hypothetical ones
- **Use tools**: Always use Write, Edit, Bash tools to execute tasks
- **Stay current**: Use ${currentYear} for any date-sensitive searches or content
- **Stay focused**: Complete the task efficiently without over-engineering
- **Explain decisions**: Share your reasoning when making design or architecture choices

## Web Search Tools
Choose the right tool for the search task:
- **WebSearch/WebFetch** (default): Use for simple queries like weather, quick facts, current events, simple lookups
- **Firecrawl**: Use for deep research requiring page crawling, content scraping, extracting structured data from multiple pages, competitor analysis, or gathering comprehensive information from websites
`;

    // Core tool usage instructions (always included)
    // NOTE: workspacePath is injected below to tell agent where to save files
    const coreInstructions = `
## Working Directory

**CRITICAL: Your working directory is: ${this.workspacePath}**

ALL files you create MUST be saved directly in this workspace directory (or subdirectories within it).
- CORRECT: ${this.workspacePath}/my-file.md
- CORRECT: ${this.workspacePath}/src/component.tsx
- WRONG: /tmp/anything (NEVER use /tmp for project files)
- WRONG: /var/folders/... (NEVER use temp directories)

When using the Write tool, always use paths starting with ${this.workspacePath}

## Tool Usage Requirements

You MUST use tools to complete tasks. Never just describe what should happen.

MANDATORY TOOL USAGE:
- Create file → Write tool REQUIRED (path MUST start with ${this.workspacePath})
- Edit file → Edit tool REQUIRED
- Run command → Bash tool REQUIRED
- Read file → Read tool REQUIRED

TOOL USAGE:
- File operations: ALWAYS use Write tool with workspace path (not Bash echo, not description)
- Command execution: ALWAYS use Bash tool (not explanation)
- Data analysis: ALWAYS save results as CSV using Write tool in the workspace

STAY FOCUSED: If you find yourself doing more than 2-3 steps for a simple request, you're overcomplicating it.
`;

    try {
      // ============================================
      // PROMPT CACHING OPTIMIZATION
      // ============================================
      // Static content FIRST (cacheable by Claude API)
      // Dynamic content LAST (skills, screen sharing)
      // This ensures ~900 tokens are always cached
      // ============================================

      let systemPrompt = fridayBasePrompt + coreInstructions; // STATIC PREFIX (~900 tokens) - CACHED

      // ============================================
      // TWO-TIER SKILL SYSTEM (DYNAMIC)
      // ============================================
      // Tier 1: Expert skills (user-tagged via @mention) - max 2
      // Tier 2: Internal skills (agent-selected, stored in session) - max 2
      // ============================================

      try {
        // 1. Load EXPERT skills (user-tagged, max 2)
        const expertSkillIds = (mentionedSkillIds || []).slice(0, 2);
        const expertSkills = await skillManager.loadSkillsByIds(expertSkillIds);

        // 2. Load ACTIVE INTERNAL skills from session (max 2)
        let activeInternalSkillIds = [];
        if (this.sessionStore && this.currentSessionId) {
          activeInternalSkillIds = await this.sessionStore.getActiveInternalSkills(this.currentSessionId);
        }
        const activeInternalSkills = await skillManager.loadSkillsByIds(activeInternalSkillIds.slice(0, 2));

        const totalSkills = expertSkills.length + activeInternalSkills.length;

        // Inject EXPERT skills (user-tagged personas)
        if (expertSkills.length > 0) {
          const expertNames = expertSkills.map(s => s.name).join(', ');
          console.error(`\n[FRIDAY AGENT] 👤 EXPERT MODE: [ ${expertNames} ]`);
          systemPrompt += '\n\n## Expert Mode\n';
          systemPrompt += 'The user has tagged the following expert personas. Apply their specialized approach:\n';
          for (const skill of expertSkills) {
            systemPrompt += `\n### ${skill.name}\n${skill.content}\n`;
          }
        }

        // Inject ACTIVE INTERNAL skills (agent-selected knowledge)
        if (activeInternalSkills.length > 0) {
          const internalNames = activeInternalSkills.map(s => s.name).join(', ');
          console.error(`\n[FRIDAY AGENT] 📚 ACTIVE KNOWLEDGE: [ ${internalNames} ]`);
          systemPrompt += '\n\n## Active Knowledge\n';
          systemPrompt += 'The following specialized knowledge is available for this session:\n';
          for (const skill of activeInternalSkills) {
            systemPrompt += `\n### ${skill.name}\n${skill.content}\n`;
          }
        }

        // Only show internal skill index when NO skills are active
        // This stabilizes the prompt for better caching when skills ARE active
        if (totalSkills === 0) {
          const fullInternalIndex = await skillManager.getInternalSkillIndex();
          if (fullInternalIndex.length > 0) {
            systemPrompt += '\n\n## Available Specialized Knowledge\n';
            systemPrompt += 'If you need specialized knowledge for this task, include this at the START of your response:\n';
            systemPrompt += '`[REQUEST_SKILLS: skill-id-1, skill-id-2]`\n';
            systemPrompt += 'The knowledge will be available for your next response. Available skills:\n';
            for (const s of fullInternalIndex) {
              systemPrompt += `- \`${s.id}\`: ${s.hint}\n`;
            }
          }
        }

        if (totalSkills > 0) {
          this.log(`[FRIDAY] Loaded ${expertSkills.length} expert + ${activeInternalSkills.length} internal skills`);
        }

        // Emit skills_activated event for frontend
        if (totalSkills > 0) {
          this.emitMessage({
            type: 'skills_activated',
            skills: [
              ...expertSkills.map(s => ({ id: s.id, name: s.name, source: 'expert' })),
              ...activeInternalSkills.map(s => ({ id: s.id, name: s.name, source: 'internal' }))
            ]
          });
        }
      } catch (error) {
        this.log(`[FRIDAY] Failed to load skills: ${error.message}`);
      }

      return {
        systemPrompt,
        model: 'claude-sonnet-4-5',
        agentName: 'Friday'
      };
    } catch (error) {
      this.log(`[FRIDAY] Error building system prompt: ${error.message}`);
      return this.getDefaultSystemPrompt();
    }
  }

  /* ============ AGENT ROUTING METHODS - COMMENTED OUT ============
  // These methods were used for agent-based routing. Preserved for future reference.

  async buildAgentSystemPromptWithAgents(metadata = {}, userMessage = '') {
    // Original agent-based implementation...
  }
  ============ END AGENT ROUTING METHODS ============ */

  /**
   * Detect workspace type from package.json, requirements.txt, etc.
   */
  detectWorkspaceType() {
    if (!this.workspacePath) return 'unknown';

    try {
      const fs = require('fs');
      const packageJsonPath = path.join(this.workspacePath, 'package.json');
      const requirementsPath = path.join(this.workspacePath, 'requirements.txt');

      if (fs.existsSync(packageJsonPath)) {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        if (pkg.dependencies?.react || pkg.devDependencies?.react) {
          return 'react';
        }
        if (pkg.dependencies?.vue || pkg.devDependencies?.vue) {
          return 'vue';
        }
        if (pkg.dependencies?.express || pkg.devDependencies?.express) {
          return 'node-express';
        }
        return 'node';
      }

      if (fs.existsSync(requirementsPath)) {
        return 'python';
      }

      return 'unknown';
    } catch {
      return 'unknown';
    }
  }

  /**
   * Get default system prompt (fallback)
   */
  getDefaultSystemPrompt() {
    const currentYear = new Date().getFullYear();
    return {
      systemPrompt: `You are Friday, an autonomous AI agent. You are NOT Claude - you are Friday.

CURRENT YEAR: ${currentYear} - Use this year for any date-sensitive searches or content.

Friday is your autonomous agent for research, data analysis, building apps, writing code, sending emails, and automated outreach.

WORKING DIRECTORY: ${this.workspacePath}
ALL files MUST be created in this workspace directory. NEVER use /tmp or temporary directories.

MANDATORY TOOL USAGE:
- Create file → Write tool REQUIRED (path must start with ${this.workspacePath})
- Edit file → Edit tool REQUIRED
- Run command → Bash tool REQUIRED
- Read file → Read tool REQUIRED

WEB SEARCH:
- Simple queries (weather, facts, quick lookups) → WebSearch/WebFetch
- Deep research (crawling, scraping, multi-page analysis) → Firecrawl
- Always use ${currentYear} for date-sensitive searches

STAY FOCUSED: Complete tasks efficiently using the appropriate tools.`,
      model: 'claude-sonnet-4-5',
      agentName: 'Friday'
    };
  }

  snapshotContext(context) {
    return {
      origin: context.origin,
      ruleId: context.ruleId,
      toolUses: context.toolUses,
      createdFiles: context.createdFiles,
      detectedArtifacts: Array.from(context.detectedArtifacts),
      fileExtensions: Array.from(context.fileExtensions)
    };
  }

  recordToolUse(context, toolName, toolInput, toolUseId) {
    if (!context) return;
    const normalizedName = (toolName || 'tool').toLowerCase();
    context.toolUses.push({
      name: normalizedName,
      toolUseId: toolUseId || null,
      input: safeSerialize(toolInput)
    });
  }

  classifyArtifactFromPath(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (WEB_EXTENSIONS.has(ext)) {
      return 'web_app';
    }
    if (BACKEND_EXTENSIONS.has(ext)) {
      if (filePath.toLowerCase().includes('server') || filePath.toLowerCase().includes('api')) {
        return 'backend_service';
      }
      return 'code';
    }
    if (filePath.toLowerCase().includes('package.json')) {
      return 'node_project';
    }
    return null;
  }

  registerCreatedFile(context, filePath, toolName) {
    if (!context) return;
    context.createdFiles.push({ path: filePath, toolName });
    const ext = path.extname(filePath).toLowerCase();
    if (ext) {
      context.fileExtensions.add(ext);
    }
    const artifact = this.classifyArtifactFromPath(filePath);
    if (artifact) {
      context.detectedArtifacts.add(artifact);
    }
  }

  renderTemplate(template = '', data = {}) {
    if (!template) return '';
    return template.replace(/{{\s*([^}]+)\s*}}/g, (_, rawKey) => {
      const key = rawKey.trim();
      const value = data[key];
      if (value === undefined || value === null) {
        return '';
      }
      if (Array.isArray(value)) {
        return value.join(', ');
      }
      return String(value);
    });
  }

  buildTemplateData(contextSnapshot) {
    const createdFileList = contextSnapshot.createdFiles.map((file) => {
      try {
        return path.relative(this.workspacePath, file.path);
      } catch (error) {
        return file.path;
      }
    });
    const detectedArtifacts = contextSnapshot.detectedArtifacts || [];
    let artifactDescriptor = 'the project';
    if (detectedArtifacts.includes('web_app')) {
      artifactDescriptor = 'the web application';
    } else if (detectedArtifacts.includes('backend_service')) {
      artifactDescriptor = 'the backend service';
    } else if (detectedArtifacts.length > 0) {
      artifactDescriptor = `the ${detectedArtifacts[0].replace('_', ' ')}`;
    }
    return {
      createdFileCount: contextSnapshot.createdFiles.length,
      createdFileList,
      createdFilesSentence: createdFileList.join(', '),
      workspacePath: this.workspacePath,
      artifactDescriptor,
      artifactTypes: detectedArtifacts
    };
  }

  renderRulePrompt(rule, templateData) {
    const prompt = rule.prompt || {};
    const title = this.renderTemplate(prompt.title || rule.name || 'Additional action', templateData);
    const message = this.renderTemplate(prompt.message || '', templateData);
    const actions = (prompt.actions || []).map((action) => ({
      id: action.id,
      label: this.renderTemplate(action.label || 'Continue', templateData),
      style: action.style || 'primary',
      type: action.type || 'dismiss'
    }));
    return { title, message, actions };
  }

  ruleMatchesContext(rule, context) {
    if (!rule?.triggers) {
      return false;
    }
    const triggers = rule.triggers;
    if (typeof triggers.minCreatedFiles === 'number' && context.createdFiles.length < triggers.minCreatedFiles) {
      return false;
    }
    if (Array.isArray(triggers.extensions) && triggers.extensions.length > 0) {
      const hasExtension = triggers.extensions.some((ext) => context.fileExtensions.has(ext));
      if (!hasExtension) {
        return false;
      }
    }
    if (Array.isArray(triggers.requireTools) && triggers.requireTools.length > 0) {
      const toolNames = context.toolUses.map((entry) => entry.name);
      const hasRequiredTool = triggers.requireTools.some((tool) => toolNames.includes(tool.toLowerCase()));
      if (!hasRequiredTool) {
        return false;
      }
    }
    if (Array.isArray(triggers.artifactTypes) && triggers.artifactTypes.length > 0) {
      const artifacts = context.detectedArtifacts;
      const hasArtifact = triggers.artifactTypes.some((type) => artifacts.has(type));
      if (!hasArtifact) {
        return false;
      }
    }
    return true;
  }

  evaluateAutomationRules(context) {
    if (!context || context.origin !== 'user' || this.rules.length === 0) {
      return [];
    }
    const results = [];
    for (const rule of this.rules) {
      if (!rule || context.triggeredRuleIds.has(rule.id)) continue;
      if (!this.ruleMatchesContext(rule, context)) continue;
      const snapshot = this.snapshotContext(context);
      const templateData = this.buildTemplateData(snapshot);
      const renderedPrompt = this.renderRulePrompt(rule, templateData);
      results.push({
        rule,
        contextSnapshot: snapshot,
        renderedPrompt,
        templateData
      });
      context.triggeredRuleIds.add(rule.id);
    }
    return results;
  }

  generateRulePromptId(ruleId) {
    this.rulePromptCounter += 1;
    return `${ruleId || 'rule'}-${Date.now()}-${this.rulePromptCounter}`;
  }

  sanitizePathToWorkspace(targetPath) {
    if (!targetPath || typeof targetPath !== 'string') {
      return targetPath;
    }
    try {
      return this.normalizeWorkspaceTarget(targetPath);
    } catch (_) {
      const fallbackName = path.basename(targetPath);
      return path.join(this.workspacePath, fallbackName);
    }
  }

  enforceWorkspaceForTool(toolName, toolInput) {
    if (!toolInput || typeof toolInput !== 'object') {
      return toolInput;
    }
    const normalizedName = (toolName || '').toLowerCase();
    const pathKeys = ['file_path', 'path', 'destination', 'destination_path', 'target_path'];
    let updated = null;
    for (const key of pathKeys) {
      if (typeof toolInput[key] === 'string') {
        const coerced = this.sanitizePathToWorkspace(toolInput[key]);
        if (coerced && coerced !== toolInput[key]) {
          if (!updated) {
            updated = { ...toolInput };
          }
          updated[key] = coerced;
        }
      }
    }
    if (normalizedName === 'bash' || normalizedName === 'shell' || normalizedName === 'command') {
      const cwd = toolInput.cwd;
      if (cwd !== this.workspacePath) {
        if (!updated) {
          updated = { ...toolInput };
        }
        updated.cwd = this.workspacePath;
      }
    }
    return updated || toolInput;
  }

  /**
   * Wait for a permission decision from the user
   * @param {number} permissionId - The permission request ID
   * @param {AbortSignal} signal - Abort signal for cancellation
   * @param {{ toolName: string, description?: string }} context - Tool context for storing approval
   */
  async waitForPermissionDecision(permissionId, signal, context = {}) {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        this.pendingPermissions.delete(permissionId);
        if (signal) {
          signal.removeEventListener('abort', abortHandler);
        }
      };
      const abortHandler = () => {
        cleanup();
        this.emitMessage({
          type: 'permission_cancelled',
          permission_id: permissionId
        });
        reject(new Error('Permission request aborted by Claude runtime'));
      };
      this.pendingPermissions.set(permissionId, {
        // Store tool context for later use in handlePermissionResponse
        toolName: context.toolName,
        description: context.description,
        resolve: (decision) => {
          cleanup();
          resolve(decision);
        },
        reject: (error) => {
          cleanup();
          reject(error);
        }
      });
      if (signal) {
        if (signal.aborted) {
          abortHandler();
          return;
        }
        signal.addEventListener('abort', abortHandler, { once: true });
      }
    });
  }

 async handlePermissionGate({ toolName, toolInput, suggestions, signal, toolUseID }) {
    const cleanName = (toolName || '').trim();

    // =========================================================================
    // PERMISSION MANAGER: Check profile + overrides + session approvals
    // =========================================================================
    const filePath = toolInput?.file_path || toolInput?.path || null;
    const permCheck = permissionManager.check(cleanName, {
      workspacePath: this.workspacePath,
      filePath,
    });

    if (permCheck.decision === PERMISSION.AUTO_APPROVE) {
      this.log(`[PERMISSION] Auto-approved (${permCheck.source}): ${cleanName}`);
      return { behavior: 'allow', updatedInput: toolInput };
    }

    if (permCheck.decision === PERMISSION.DENY) {
      this.log(`[PERMISSION] Denied (${permCheck.source}): ${cleanName}`);
      return { behavior: 'deny', message: `Tool denied by ${permCheck.source} policy`, interrupt: false };
    }

    // Legacy cache check (GlobalConfig-based "always allow")
    const cachedPermission = this.checkCachedPermission(cleanName);
    if (cachedPermission?.approved) {
      return { behavior: 'allow', updatedInput: toolInput };
    }

    if (this.currentQueryMetadata?.batchMode) {
      console.error(`[PERMISSION] 🚫 Batch mode denied for non-preapproved tool: ${cleanName}`);
      return {
        behavior: 'deny',
        message: 'Scheduled agents must use pre-approved tools only. Use the configured MCP tools for this task.',
        interrupt: false
      };
    }

    // =========================================================================
    // SECURITY: Block dangerous bash/shell commands automatically
    // =========================================================================
    // Check if this is a bash/shell command and if it matches dangerous patterns.
    // This prevents the agent from running commands that could:
    // - Kill system processes (pkill, killall, kill)
    // - Delete critical files (rm -rf /)
    // - Escalate privileges (sudo, su)
    // - Modify system configuration
    // =========================================================================
    const normalizedToolName = cleanName.toLowerCase();
    if (normalizedToolName === 'bash' || normalizedToolName === 'shell' || normalizedToolName.includes('bash')) {
      const command = toolInput?.command || '';
      const dangerCheck = checkDangerousCommand(command);

      if (dangerCheck.blocked) {
        console.error(`[PERMISSION] 🚫 BLOCKED dangerous command: ${command}`);
        console.error(`[PERMISSION] Reason: ${dangerCheck.reason}`);

        // Emit a message to notify the frontend that command was blocked
        this.emitMessage({
          type: 'command_blocked',
          tool_name: toolName,
          command: command,
          reason: dangerCheck.reason
        });

        // Return deny with a helpful message for the agent
        return {
          behavior: 'deny',
          message: `Command blocked for security: ${dangerCheck.reason}. The command "${command}" was not executed.`,
          interrupt: false
        };
      }
    }

    const permissionId = this.permissionIdCounter++;
    const serializableInput = safeSerialize(toolInput);
    const description = describeToolUse(toolName, serializableInput);
    
    this.emitMessage({
      type: 'permission_request',
      permission_id: permissionId,
      tool_name: toolName,
      tool_use_id: toolUseID,
      tool_input: serializableInput,
      description,
      cwd: this.workspacePath,
      suggestions
    });

    let decision;
    try {
      decision = await this.waitForPermissionDecision(permissionId, signal, {
        toolName: toolName,
        description: description
      });
    } catch (error) {
      this.log(`[DEBUG] Permission ${permissionId} aborted: ${error.message}`);
      return {
        behavior: 'deny',
        message: 'Permission request cancelled',
        interrupt: false
      };
    }

    const approved = Boolean(decision?.approved);
    if (approved) {
      const decisionInput =
        decision?.updatedInput && typeof decision.updatedInput === 'object'
          ? decision.updatedInput
          : toolInput;
      const updatedInput = this.enforceWorkspaceForTool(toolName, decisionInput);
      const updatedPermissions =
        Array.isArray(decision?.updatedPermissions) && decision.updatedPermissions.length > 0
          ? decision.updatedPermissions
          : Array.isArray(suggestions) && suggestions.length > 0
            ? suggestions
            : undefined;
      return {
        behavior: 'allow',
        updatedInput,
        updatedPermissions
      };
    }
    return {
      behavior: 'deny',
      message: decision?.message || 'User denied this request',
      interrupt: decision?.interrupt ?? true
    };
  }

  /**
   * Parse agent response for skill requests and store them in session
   * Pattern: [REQUEST_SKILLS: skill-id-1, skill-id-2]
   * Skills will be loaded for the next query in this session
   */
  parseAndStoreSkillRequests(text) {
    if (!text || !this.sessionStore || !this.currentSessionId) return;

    // Match pattern: [REQUEST_SKILLS: skill-id-1, skill-id-2]
    const skillRequestMatch = text.match(/\[REQUEST_SKILLS:\s*([^\]]+)\]/i);
    if (skillRequestMatch) {
      const requestedSkillIds = skillRequestMatch[1]
        .split(',')
        .map(id => id.trim())
        .filter(id => id.length > 0)
        .slice(0, 2); // Max 2 internal skills

      if (requestedSkillIds.length > 0) {
        this.log(`[SKILLS] Agent requested skills: ${requestedSkillIds.join(', ')}`);

        // Store for next query
        this.sessionStore.setActiveInternalSkills(this.currentSessionId, requestedSkillIds)
          .then(() => {
            this.log(`[SKILLS] Stored ${requestedSkillIds.length} internal skills for next query`);
            // Notify frontend about skill activation
            this.emitMessage({
              type: 'skills_requested',
              skillIds: requestedSkillIds,
              message: 'Skills will be active in next response'
            });
          })
          .catch(err => this.log(`[SKILLS] Failed to store skill request: ${err.message}`));
      }
    }
  }

  resetSessionState() {
    this.handledToolUseIds.clear();
    this.pendingRulePrompts.clear();
    this.pendingPermissions.clear();
    this.currentSessionId = null;
    this.pendingSessionEvents = [];
    this.pendingSessionMetadata = null;
    this.pendingUsage = [];
    // Clear session-level permission approvals (but keep persistent "always allow")
    this.sessionApprovals.clear();
    permissionManager.clearSessionApprovals();
    this.log('[PERMISSION] Session approvals cleared');
  }

  async handleQuery(userMessage, sessionId = null, metadata = {}) {
    console.error(`[RUNTIME] 🟣 handleQuery called. Message: "${userMessage.slice(0, 50)}..."`);

    // Create abort controller for this query
    this.currentAbortController = new AbortController();
    const abortSignal = this.currentAbortController.signal;
    this.currentQueryMetadata = metadata;

    if (sessionId) {
      this.currentSessionId = sessionId;
      if (this.sessionStore) {
        this.sessionStore
          .ensureSession(sessionId, {
            workspacePath: this.workspacePath,
            title: this.generateSessionTitle(userMessage),
            model: metadata?.modelId || metadata?.model,
            updatedAt: new Date().toISOString()
          })
          .catch((error) => {
            this.log(`[SessionStore] Failed to ensure session ${sessionId}: ${error.message}`);
          });
      }
    } else if (!this.currentSessionId) {
      this.preparePendingSessionMetadata(userMessage, metadata);
    }
    this.recordInboundEvent(
      {
        type: 'query',
        message: userMessage,
        metadata
      },
      { sessionId }
    );

    const queryContext = this.createQueryContext(metadata);

    // Build system prompt with skills (agent routing commented out)
    const { systemPrompt, model: agentModel, agentName } = await this.buildAgentSystemPrompt(metadata, userMessage);

    // Log that Friday is handling the request
    this.emitMessage({ type: 'info', message: `${agentName} is processing your request...` });

    // Combine external MCP servers with internal SDK MCP server
    // Skip friday-internal in batch mode — its tools (e.g. create_scheduled_agent) don't work without a store
    // Strip non-SDK properties (e.g., 'auth') — the SDK only accepts command/args/env/type
    const sdkMcpServers = {};
    for (const [id, def] of Object.entries(this.mcpServers || {})) {
      sdkMcpServers[id] = {
        command: def.command,
        ...(def.args ? { args: def.args } : {}),
        ...(def.env ? { env: def.env } : {})
      };
    }
    const allMcpServers = {
      ...sdkMcpServers,
      ...(this.internalMcpServer && !metadata?.batchMode ? { 'friday-internal': this.internalMcpServer } : {})
    };

    // Debug: log which MCP servers are being passed to the SDK
    this.log(`[MCP] Passing ${Object.keys(allMcpServers).length} servers to SDK: ${Object.keys(allMcpServers).join(', ')}`);
    if (allMcpServers.vercel) {
      this.log(`[MCP] Vercel config: ${JSON.stringify(allMcpServers.vercel)}`);
    }

    const queryOptions = {
      model: agentModel || 'claude-sonnet-4-5',
      cwd: this.workspacePath,
      additionalDirectories: [this.workspacePath],
      permissionMode: 'default',
      canUseTool: (toolName, toolInput, { signal, suggestions, toolUseID }) =>
        this.handlePermissionGate({ toolName, toolInput, suggestions, signal, toolUseID }),
      mcpServers: allMcpServers,
      systemPrompt,
      env: process.env,
      stderr: (data) => {
        this.log(`[SDK stderr] ${data.trim()}`);
      }
    };

    if (sessionId && !this.skipNextResume) {
      queryOptions.resume = sessionId;
      this.emitMessage({ type: 'info', message: `Resuming session: ${sessionId}` });
    } else if (this.skipNextResume) {
      // Workspace changed but session continued - skip resume to avoid stale file context
      this.log('[RUNTIME] Skipping session resume after workspace change');
      this.skipNextResume = false; // Clear flag after first query
    }

    const prompt = userMessage;
    let messageSessionId = null;
    let fullResponse = '';

    try {
      const queryStream = query({ prompt, options: queryOptions });

      // Check MCP server status after query starts
      try {
        const mcpStatus = await queryStream.mcpServerStatus();
        this.log(`[MCP] Server status: ${JSON.stringify(mcpStatus.map(s => ({ name: s.name, status: s.status, error: s.error })))}`);
        const vercelStatus = mcpStatus.find(s => s.name === 'vercel');
        if (vercelStatus) {
          this.log(`[MCP] Vercel status: ${vercelStatus.status}, tools: ${vercelStatus.tools?.length || 0}, error: ${vercelStatus.error || 'none'}`);
        }
      } catch (statusErr) {
        this.log(`[MCP] Failed to get server status: ${statusErr.message}`);
      }

      for await (const message of queryStream) {
        // Check if abort was requested
        // Note: If abortCurrentQuery() was called, it already emitted 'complete' with aborted: true
        // So we just exit silently to avoid duplicate messages
        if (abortSignal.aborted) {
          this.log('[RUNTIME] Query aborted by user (detected in loop)');
          // Don't emit duplicate 'complete' - abortCurrentQuery() already handled it
          return { sessionId: this.currentSessionId, response: fullResponse, aborted: true };
        }

        if (message.session_id && !messageSessionId) {
          messageSessionId = message.session_id;
          this.currentSessionId = message.session_id;
          this.emitMessage({ type: 'session', session_id: message.session_id });
        }
        const appended = await this.routeAgentMessage(message, queryContext, fullResponse);
        if (appended) {
          fullResponse += appended;
        }
      }
      this.currentAbortController = null;
      return { sessionId: this.currentSessionId, response: fullResponse };
    } catch (error) {
      this.currentAbortController = null;
      // Check if this was an abort
      // Note: If abortCurrentQuery() was called, it already emitted 'complete' with aborted: true
      if (abortSignal.aborted) {
        this.log('[RUNTIME] Query aborted during execution (caught exception)');
        // Don't emit duplicate 'complete' - abortCurrentQuery() already handled it
        return { sessionId: this.currentSessionId, response: fullResponse, aborted: true };
      }
      this.log(`[RUNTIME] Error in handleQuery: ${error.message}`);
      this.emitMessage({ type: 'error', message: error.message });
      throw error;
    }
  }

  /**
   * Abort the currently running query
   * This cancels any pending permission requests and signals the query loop to stop.
   * Note: Already-running tool executions (like terminal commands) may continue until
   * they complete - this is a limitation of the current MCP architecture.
   */
  abortCurrentQuery() {
    if (this.currentAbortController) {
      this.log('[RUNTIME] Aborting current query');

      // 1. Abort the signal - this will:
      //    - Cancel pending permission waits via the abort handler
      //    - Signal the query loop to break on next iteration
      this.currentAbortController.abort();

      // 2. Clear any pending permissions that haven't been responded to
      // This ensures the UI doesn't show stale permission cards
      if (this.pendingPermissions && this.pendingPermissions.size > 0) {
        this.log(`[RUNTIME] Cancelling ${this.pendingPermissions.size} pending permission(s)`);
        for (const [permissionId] of this.pendingPermissions) {
          this.emitMessage({
            type: 'permission_cancelled',
            permission_id: permissionId
          });
        }
        this.pendingPermissions.clear();
      }

      // 3. Emit messages to update UI
      this.emitMessage({ type: 'info', message: 'Stopping...' });
      this.emitMessage({ type: 'thinking_complete' }); // Clear thinking state

      // 4. Emit complete so frontend knows query is done
      // This ensures the UI stops showing "thinking" state immediately
      this.emitMessage({
        type: 'complete',
        result: 'Query cancelled by user',
        session_id: this.currentSessionId,
        aborted: true
      });

      this.currentAbortController = null;
      return true;
    }
    this.log('[RUNTIME] No active query to abort');
    return false;
  }

  async routeAgentMessage(message, queryContext, fullResponse) {
    let appended = '';
    switch (message.type) {
      case 'text':
        if (message.text) {
          appended += message.text;
          this.emitMessage({ type: 'chunk', text: message.text });
        }
        break;
      case 'assistant':
        appended += await this.handleAssistantMessage(message, queryContext);
        break;
      case 'thinking':
        this.emitMessage({ type: 'thinking', content: message.thinking || message.content || 'Thinking...' });
        break;
      case 'tool_use':
        await this.handleToolUse(message, queryContext);
        break;
      case 'tool_result':
        // Clear thinking state after tool completes
        this.emitMessage({ type: 'thinking_complete' });

        this.emitMessage({
          type: 'tool_result',
          tool_name: message.tool_name || message.tool_use_id || 'tool',
          tool_use_id: message.tool_use_id,
          tool_result: message.content || message.result || null,
          is_error: message.is_error || false
        });
        break;
      case 'usage':
        if (message.usage) {
          costTracker.recordTokenUsage(this.currentSessionId, message.usage, this.model);
          this.emitMessage({ type: 'usage', usage: message.usage });
        }
        break;
      case 'result':
        if (message.subtype === 'success') {
          await this.handleSuccessResult(queryContext, fullResponse);
          const sessionCost = costTracker.getSessionCost(this.currentSessionId);
          this.emitMessage({
            type: 'complete',
            result: message.result,
            session_id: this.currentSessionId,
            cost: {
              tokens: sessionCost.tokens,
              estimated: sessionCost.totalCost,
            },
          });
        }
        break;
      default:
        break;
    }
    return appended;
  }

  async handleAssistantMessage(message, queryContext) {
    let appended = '';
    const assistantMsg = message.message;
    if (assistantMsg && Array.isArray(assistantMsg.content)) {
      // Check if this message has any tool uses
      const hasToolUse = assistantMsg.content.some(c => c.type === 'tool_use');

      for (const content of assistantMsg.content) {
        if (content.type === 'tool_use') {
          await this.handleToolUsePersistence(content.name, content.input, content.id, queryContext);

          // Emit thinking event for tool execution
          const toolLabel = getToolThinkingLabel(content.name, content.input);
          this.emitMessage({
            type: 'thinking',
            thinking: {
              steps: [{ label: toolLabel }],
              duration: 'live'
            }
          });

          this.emitMessage({
            type: 'tool_use',
            tool_name: content.name || 'tool',
            tool_use_id: content.id,
            input: content.input
          });
        } else if (content.type === 'text' && content.text) {
          // Only clear thinking if there are no tool uses in this message
          // (tools will be cleared when tool_result arrives)
          if (!hasToolUse) {
            this.emitMessage({ type: 'thinking_complete' });
          }

          // Parse and store skill requests for next query
          this.parseAndStoreSkillRequests(content.text);

          this.emitMessage({ type: 'chunk', text: content.text });
          appended += content.text;
        }
      }
    } else if (assistantMsg && typeof assistantMsg.content === 'string') {
      // Clear thinking state when assistant responds with text only
      this.emitMessage({ type: 'thinking_complete' });

      // Parse and store skill requests for next query
      this.parseAndStoreSkillRequests(assistantMsg.content);

      this.emitMessage({ type: 'chunk', text: assistantMsg.content });
      appended += assistantMsg.content;
    } else {
      this.emitMessage({ type: 'thinking', content: 'Processing...' });
    }
    return appended;
  }

  async handleToolUse(message, queryContext) {
    if (message.name === 'bash' || message.name === 'execute_command') {
       console.error(`[RUNTIME] 🛠️ Executing command: ${JSON.stringify(message.input)}`);
    }
    await this.handleToolUsePersistence(message.name, message.input, message.tool_use_id, queryContext);
    const toolName = message.name || 'tool';

    // Emit thinking event for tool execution
    const toolLabel = getToolThinkingLabel(toolName, message.input);
    this.emitMessage({
      type: 'thinking',
      thinking: {
        steps: [{ label: toolLabel }],
        duration: 'live'
      }
    });

    this.emitMessage({
      type: 'tool_use',
      tool_name: toolName,
      tool_use_id: message.tool_use_id,
      input: message.input
    });
  }

  async handleSuccessResult(queryContext, fullResponse) {
    console.error(`[RUNTIME] 🟢 handleSuccessResult called. ToolUses count: ${queryContext?.toolUses?.length || 0}`);
    // Clear thinking state when query completes
    this.emitMessage({ type: 'thinking_complete' });

    const promptedRules = this.evaluateAutomationRules(queryContext);
    for (const prompt of promptedRules) {
      const promptId = this.generateRulePromptId(prompt.rule.id);
      this.pendingRulePrompts.set(promptId, {
        rule: prompt.rule,
        contextSnapshot: prompt.contextSnapshot
      });
      this.emitMessage({
        type: 'rule_prompt',
        prompt_id: promptId,
        rule_id: prompt.rule.id,
        title: prompt.renderedPrompt.title,
        message: prompt.renderedPrompt.message,
        actions: prompt.renderedPrompt.actions
      });
    }
  }

  normalizeWorkspaceTarget(targetPath) {
    if (!targetPath || typeof targetPath !== 'string') {
      return null;
    }
    const expanded =
      targetPath.startsWith('~') && process.env.HOME
        ? path.join(process.env.HOME, targetPath.slice(1))
        : targetPath;
    const absolutePath = path.isAbsolute(expanded)
      ? expanded
      : path.join(this.workspacePath, expanded);
    const normalizedTarget = path.normalize(absolutePath);
    const normalizedWorkspace = path.normalize(this.workspacePath);
    const workspaceWithSep = normalizedWorkspace.endsWith(path.sep)
      ? normalizedWorkspace
      : `${normalizedWorkspace}${path.sep}`;
    if (
      normalizedTarget === normalizedWorkspace ||
      normalizedTarget.startsWith(workspaceWithSep)
    ) {
      return normalizedTarget;
    }
    throw new Error(`Target path ${normalizedTarget} is outside of workspace ${normalizedWorkspace}`);
  }

  async persistFileWrite(input, queryContext) {
    const resolvedPath = this.normalizeWorkspaceTarget(input.file_path);
    if (!resolvedPath) {
      throw new Error('Missing file_path for FileWrite');
    }
    this.registerCreatedFile(queryContext, resolvedPath, 'filewrite');
    return resolvedPath;
  }

  async persistFileEdit(input, queryContext) {
    const resolvedPath = this.normalizeWorkspaceTarget(input.file_path);
    if (!resolvedPath) {
      throw new Error('Missing file_path for FileEdit');
    }
    this.registerCreatedFile(queryContext, resolvedPath, 'fileedit');
    return resolvedPath;
  }

  async handleToolUsePersistence(toolName, toolInput, toolUseId, queryContext) {
    if (!toolName || !toolInput) {
      return;
    }
    if (toolUseId && this.handledToolUseIds.has(toolUseId)) {
      return;
    }
    const normalizedName = String(toolName).toLowerCase();
    try {
      this.recordToolUse(queryContext, toolName, toolInput, toolUseId);
      if (['filewrite', 'write', 'createfile'].includes(normalizedName)) {
        if (toolInput.file_path && typeof toolInput.content === 'string') {
          await this.persistFileWrite(toolInput, queryContext);
          if (toolUseId) this.handledToolUseIds.add(toolUseId);
        }
      } else if (['fileedit', 'editfile', 'edit'].includes(normalizedName)) {
        if (
          toolInput.file_path &&
          typeof toolInput.old_string === 'string' &&
          typeof toolInput.new_string === 'string'
        ) {
          await this.persistFileEdit(toolInput, queryContext);
          if (toolUseId) this.handledToolUseIds.add(toolUseId);
        }
      }
    } catch (error) {
      this.log(`[DEBUG] Local persistence failed for ${toolName}: ${error.message}`);
    }
    if (this.handledToolUseIds.size > 500) {
      this.handledToolUseIds.clear();
    }
  }

  handlePermissionResponse(data) {
    this.recordInboundEvent({
      type: 'permission_response',
      permission_id: data.permission_id,
      approved: data.approved,
      permission_level: data.permission_level,
      updated_input: data.updated_input,
      updated_permissions: data.updated_permissions
    });

    const permissionId = data.permission_id;
    const approved = Boolean(data.approved);
    const handler = this.pendingPermissions.get(permissionId);

    // Get tool context from the pending permission (stored when request was created)
    const toolName = handler?.toolName || data.tool_name;
    const description = handler?.description || data.description;

    // Store permission approval based on level (if approved)
    if (approved && toolName) {
      const permissionLevel = data.permission_level || 'once';
      // Also store in PermissionManager for session-level approvals
      if (permissionLevel === 'session' || permissionLevel === 'always') {
        permissionManager.addSessionApproval(toolName);
      }
      const storeResult = this.storePermissionApproval(
        toolName,
        permissionLevel,
        description
      );

      // Emit warning if tool was downgraded from "always" to "session"
      if (storeResult.warning) {
        this.emitMessage({
          type: 'permission_warning',
          tool_name: toolName,
          message: storeResult.warning,
          requestedLevel: permissionLevel,
          actualLevel: storeResult.actualLevel
        });
      }
    }

    if (handler) {
      handler.resolve({
        approved,
        updatedInput: data.updated_input,
        updatedPermissions: data.updated_permissions,
        alwaysAllow: Boolean(data.always_allow),
        message: data.message,
        interrupt: data.interrupt
      });
    } else {
      this.log(`[DEBUG] No pending permission for id ${permissionId}`);
    }

    // Emit permission_cancelled to notify all windows to remove this permission from UI
    // This ensures sync between desktop, spotlight, and preview pill
    this.emitMessage({
      type: 'permission_cancelled',
      permission_id: permissionId
    });
  }

  async handleRuleActionMessage(data) {
    const promptId = data.prompt_id;
    const actionId = data.action_id;
    if (!promptId || !actionId) {
      this.log('[DEBUG] rule_action missing prompt_id or action_id');
      return;
    }
    this.recordInboundEvent({
      type: 'rule_action',
      prompt_id: promptId,
      action_id: actionId
    });
    const pending = this.pendingRulePrompts.get(promptId);
    if (!pending) {
      this.log(`[DEBUG] No pending rule prompt for id ${promptId}`);
      return;
    }
    this.pendingRulePrompts.delete(promptId);
    const rule = pending.rule;
    const actions = rule?.prompt?.actions || [];
    const actionConfig = actions.find((action) => action.id === actionId);
    if (!actionConfig) {
      this.log(`[DEBUG] No action ${actionId} for rule ${rule?.id}`);
      return;
    }
    const baseStatus = {
      type: 'rule_action_status',
      prompt_id: promptId,
      rule_id: rule?.id || 'unknown',
      action_id: actionId
    };
    this.emitMessage({ ...baseStatus, status: 'started' });
    if (actionConfig.type === 'followup_prompt') {
      const templateData = this.buildTemplateData(pending.contextSnapshot);
      const followupPrompt =
        this.renderTemplate(actionConfig.promptTemplate || actionConfig.prompt, templateData) ||
        '';
      if (!followupPrompt.trim()) {
        this.emitMessage({ ...baseStatus, status: 'error', message: 'Rule action missing prompt' });
        return;
      }
      try {
        await this.handleQuery(followupPrompt, this.currentSessionId, {
          origin: 'rule_action',
          ruleId: rule?.id || null
        });
        this.emitMessage({ ...baseStatus, status: 'completed' });
      } catch (error) {
        this.emitMessage({ ...baseStatus, status: 'error', message: error.message });
      }
    } else {
      this.emitMessage({ ...baseStatus, status: 'dismissed' });
    }
  }
}
