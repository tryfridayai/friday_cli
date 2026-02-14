import { AgentRuntime } from '../runtime/AgentRuntime.js';
import crypto from 'crypto';

/**
 * AgentExecutor
 *
 * Executes scheduled agents in batch mode (non-interactive).
 * Wraps AgentRuntime with batch-specific logic:
 * - No streaming to UI
 * - Pre-authorized permissions
 * - Captures all tool calls for run history
 * - Timeout handling
 * - Result logging
 *
 * Generic: Works with any MCP server configuration
 */
class AgentExecutor {
  constructor(agentStore, runHistory, globalMcpConfig) {
    this.agentStore = agentStore;
    this.runHistory = runHistory;
    this.globalMcpConfig = globalMcpConfig;  // Full MCP config from .mcp.json
    this.maxToolCalls = 60;
  }

  /**
   * Filter global MCP config to only include specified servers
   *
   * @param {string[]} serverNames - Array of MCP server names (e.g., ["slack", "github"])
   * @returns {Object} Filtered MCP servers config
   */
  filterMcpServers(serverNames) {
    // Handle both { mcpServers: {...} } and direct {...} formats
    const mcpServers = this.globalMcpConfig?.mcpServers || this.globalMcpConfig || {};

    if (!mcpServers || Object.keys(mcpServers).length === 0) {
      console.warn('[AgentExecutor] No MCP servers configured');
      return {};
    }

    // If no specific servers requested, return empty (agent will use basic tools)
    if (!serverNames || serverNames.length === 0) {
      console.error('[AgentExecutor] No MCP servers requested for this agent');
      return {};
    }

    const filtered = {};
    for (const name of serverNames) {
      if (mcpServers[name]) {
        filtered[name] = mcpServers[name];
        console.error(`[AgentExecutor] Including MCP server: ${name}`);
      } else {
        console.warn(`[AgentExecutor] MCP server not found in config: ${name}. Available: ${Object.keys(mcpServers).join(', ')}`);
      }
    }

    return filtered;
  }

  /**
   * Parse outcome from agent result
   *
   * Analyzes the result and actions to create a summary of what happened.
   * Extracts links to external resources (LinkedIn posts, Slack messages, etc.)
   *
   * @param {Object} result - Result from AgentRuntime
   * @param {Array} actions - Tool calls made during execution
   * @returns {Object} Outcome summary
   */
  parseOutcome(result, actions) {
    const outcome = {
      type: 'response',
      summary: '',
      details: null,
      externalActions: []
    };

    // If there's an error, return error outcome
    if (result.error) {
      outcome.type = 'error';
      outcome.summary = result.error.message || 'Unknown error';
      outcome.details = result.error.stack;
      return outcome;
    }

    // Extract external actions from tool calls
    for (const action of actions) {
      if (!action.tool || !action.result) {
        continue;
      }

      // LinkedIn post
      if (action.tool.includes('linkedin') && action.tool.includes('post')) {
        outcome.externalActions.push({
          system: 'linkedin',
          action: 'Created post',
          url: action.result?.postUrl || action.result?.url
        });
      }

      // Slack message
      if (action.tool.includes('slack') && action.tool.includes('post')) {
        outcome.externalActions.push({
          system: 'slack',
          action: `Posted to ${action.input?.channel || 'channel'}`,
          url: action.result?.permalink || action.result?.url
        });
      }

      // GitHub issue/PR
      if (action.tool.includes('github') && action.tool.includes('create')) {
        outcome.externalActions.push({
          system: 'github',
          action: `Created ${action.input?.type || 'item'}`,
          url: action.result?.html_url || action.result?.url
        });
      }

      // Gmail send
      if (action.tool.includes('gmail') && action.tool.includes('send')) {
        outcome.externalActions.push({
          system: 'gmail',
          action: 'Sent email',
          url: null
        });
      }

      // Notion page
      if (action.tool.includes('notion') && action.tool.includes('create')) {
        outcome.externalActions.push({
          system: 'notion',
          action: 'Created page',
          url: action.result?.url
        });
      }
    }

    // Create summary
    if (outcome.externalActions.length > 0) {
      outcome.type = 'action';
      outcome.summary = outcome.externalActions
        .map(a => `${a.action}`)
        .join(', ');
    } else {
      outcome.type = 'response';
      outcome.summary = result.text || result.response || 'Completed';
    }

    // Store full result as details
    outcome.details = result.text || result.response || JSON.stringify(result);

    return outcome;
  }

  /**
   * Build instructions with memory context
   * Prepends agent's memory/context to instructions
   *
   * @param {Object} agent - Agent definition
   * @returns {string} Instructions with memory context
   */
  buildInstructionsWithMemory(agent) {
    let instructions = agent.instructions;

    // Add memory context if available
    if (agent.memory && agent.memory.summary) {
      const memoryContext = `
## Context from Previous Runs

${agent.memory.summary}

${agent.memory.recentTopics?.length > 0 ? `Recent topics covered: ${agent.memory.recentTopics.join(', ')}` : ''}

${agent.memory.recentFiles?.length > 0 ? `Recent files created: ${agent.memory.recentFiles.slice(-5).join(', ')}` : ''}

**Important:** Use this context to avoid repeating recent content and to build upon previous work.

---

## Your Task

`;
      instructions = memoryContext + instructions;
    }

    // Add workspace path instruction — use the main workspace, not the hidden agent-specific dir
    const mainWorkspace = this.globalMcpConfig?.workspacePath;
    if (mainWorkspace) {
      instructions += `\n\n**Workspace:** Save any files to: ${mainWorkspace}`;
    }

    return instructions;
  }

  /**
   * Execute an agent in batch mode
   *
   * @param {Object} agent - Agent definition
   * @returns {Promise<Object>} Execution result { success, run, error? }
   */
  async execute(agent, options = {}) {
    const runId = `run_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    // Create run record
    const run = {
      id: runId,
      agentId: agent.id,
      startedAt: new Date().toISOString(),
      status: 'running',
      actions: [],
      filesCreated: []
    };

    console.error(`[AgentExecutor] Starting execution for agent: ${agent.name} (${agent.id})`);
    console.error(`[AgentExecutor] Agent workspace: ${agent.workspacePath}`);
    console.error(`[AgentExecutor] Agent MCP servers requested: ${agent.mcpServers?.join(', ') || 'none'}`);

    // Validate API key before attempting execution
    if (!process.env.ANTHROPIC_API_KEY) {
      const error = new Error('ANTHROPIC_API_KEY is not set. Please add your API key in Settings before running scheduled agents.');
      console.error(`[AgentExecutor] ✗ ${error.message}`);
      run.status = 'error';
      run.completedAt = new Date().toISOString();
      run.durationMs = 0;
      run.error = { message: error.message };
      await this.runHistory.saveRun(run);
      await this.agentStore.updateStats(agent.id, {
        lastRunAt: run.completedAt,
        errorCount: (agent.errorCount || 0) + 1,
        status: 'error',
        lastError: error.message
      });
      if (typeof options.onRunComplete === 'function') {
        options.onRunComplete({ run, success: false, error });
      }
      return { success: false, error, run };
    }

    if (typeof options.onRunStart === 'function') {
      options.onRunStart(run);
    }

    try {
      // 1. Load MCP servers specified in agent
      const mcpServers = this.filterMcpServers(agent.mcpServers);

      // Allow agents to run without MCP servers (basic Claude capabilities)
      if (Object.keys(mcpServers).length === 0 && agent.mcpServers?.length > 0) {
        console.warn(`[AgentExecutor] Warning: None of the required MCP servers are available: ${agent.mcpServers.join(', ')}`);
        console.warn(`[AgentExecutor] Agent will run with basic capabilities only`);
      }

      console.error(`[AgentExecutor] Loaded MCP servers: ${Object.keys(mcpServers).join(', ') || 'none'}`);

      // 2. Create AgentRuntime instance for batch execution
      // Use the main workspace so files are visible to the user (not hidden in .friday/)
      const mainWorkspace = this.globalMcpConfig?.workspacePath || process.cwd();
      console.error(`[AgentExecutor] Creating runtime with workspace: ${mainWorkspace}`);
      const runtime = new AgentRuntime({
        workspacePath: mainWorkspace,
        mcpServers: mcpServers,
        sessionsPath: null  // No session storage for batch mode
      });
      console.error(`[AgentExecutor] Runtime created successfully`);

      // 3. Build instructions with memory context
      const instructionsWithMemory = this.buildInstructionsWithMemory(agent);

      // 3. Pre-approve tools (no permission prompts during execution)
      if (agent.permissions?.preAuthorized) {
        // Store all MCP tools as pre-approved at session level
        for (const tool of agent.permissions.tools || []) {
          runtime.storePermissionApproval(tool, 'session');
        }

        // Also approve common built-in tools (file ops + web)
        const builtinTools = [
          'bash', 'read', 'write', 'edit', 'glob', 'grep',
          'Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep',
          'WebSearch', 'WebFetch', 'Task',
          'NotebookEdit', 'NotebookRead'
        ];
        for (const tool of builtinTools) {
          runtime.storePermissionApproval(tool, 'session');
        }
      }

      // 4. Set up tool call capture
      const capturedToolCalls = [];

      // Intercept emitted messages to capture tool usage
      let toolCallCount = 0;
      let toolLimitExceeded = false;
      const maxToolCalls = agent.permissions?.maxToolCalls || this.maxToolCalls;

      const messageHandler = (payload) => {
        if (payload.type === 'tool_use' || payload.type === 'tool_result') {
          const toolName = payload.tool_name || payload.toolName;
          const toolUseId = payload.tool_use_id || payload.toolUseId;
          capturedToolCalls.push({
            type: payload.type,
            tool: toolName,
            toolUseId: toolUseId,
            input: payload.tool_input || payload.input,
            result: payload.tool_result || payload.result,
            timestamp: new Date().toISOString()
          });

          if (payload.type === 'tool_use') {
            toolCallCount += 1;
            if (!toolLimitExceeded && toolCallCount > maxToolCalls) {
              toolLimitExceeded = true;
              runtime.abortCurrentQuery();
            }
          }
        }
      };

      runtime.on('message', messageHandler);

      // 5. Execute with instructions (with timeout)
      const timeoutMs = 5 * 60 * 1000;  // 5 minutes max
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Execution timeout (5 minutes)')), timeoutMs);
      });

      console.error(`[AgentExecutor] Starting query execution...`);
      console.error(`[AgentExecutor] Instructions length: ${instructionsWithMemory.length} chars`);

      const executionPromise = runtime.handleQuery(
        instructionsWithMemory,  // Use instructions with memory context
        null,  // No session ID for batch mode
        {
          modelId: 'claude-sonnet-4-5',
          batchMode: true  // Flag for batch execution
        }
      );

      // Wait for execution or timeout
      console.error(`[AgentExecutor] Waiting for execution to complete (timeout: ${timeoutMs}ms)...`);
      const result = await Promise.race([executionPromise, timeoutPromise]);
      console.error(`[AgentExecutor] Execution completed`);

      if (toolLimitExceeded) {
        throw new Error(`Tool call limit exceeded (${maxToolCalls})`);
      }

      // Clean up listener
      runtime.removeListener('message', messageHandler);

      // 6. Process captured tool calls into actions
      run.actions = this.processToolCalls(capturedToolCalls);

      // 7. Save successful run
      run.status = 'success';
      run.completedAt = new Date().toISOString();
      run.durationMs = Date.now() - new Date(run.startedAt).getTime();
      run.outcome = this.parseOutcome(result, run.actions);

      // Save token usage if available
      if (result.usage) {
        run.usage = {
          inputTokens: result.usage.input_tokens || 0,
          outputTokens: result.usage.output_tokens || 0
        };
      }

      // Extract files created during this run
      run.filesCreated = this.extractFilesCreated(run.actions, mainWorkspace);

      await this.runHistory.saveRun(run);

      // 8. Update agent stats
      await this.agentStore.updateStats(agent.id, {
        lastRunAt: run.completedAt,
        runCount: agent.runCount + 1,
        status: 'active',  // Reset error status on success
        lastError: null
      });

      // 9. Update agent memory with run context
      await this.updateAgentMemory(agent, run);

      console.error(`[AgentExecutor] ✓ Execution successful for ${agent.name}`);

      if (typeof options.onRunComplete === 'function') {
        options.onRunComplete({ run, success: true });
      }

      return { success: true, run };

    } catch (error) {
      console.error(`[AgentExecutor] ✗ Execution failed for ${agent.name}:`, error.message);

      // Handle errors
      run.status = 'error';
      run.completedAt = new Date().toISOString();
      run.durationMs = Date.now() - new Date(run.startedAt).getTime();
      run.error = {
        message: error.message,
        stack: error.stack
      };

      // Determine which action failed
      if (run.actions.length > 0) {
        run.error.failedAction = run.actions[run.actions.length - 1].tool;
      }

      await this.runHistory.saveRun(run);

      // Update agent stats with error
      await this.agentStore.updateStats(agent.id, {
        lastRunAt: run.completedAt,
        errorCount: agent.errorCount + 1,
        status: 'error',
        lastError: error.message
      });

      if (typeof options.onRunComplete === 'function') {
        options.onRunComplete({ run, success: false, error });
      }

      return { success: false, error, run };
    }
  }

  /**
   * Process raw tool calls into structured actions
   *
   * @param {Array} toolCalls - Raw tool call events
   * @returns {Array} Structured actions
   */
  processToolCalls(toolCalls) {
    const actions = [];
    const toolUseMap = new Map();  // toolUseId -> { tool, input, timestamp }

    for (const call of toolCalls) {
      if (call.type === 'tool_use') {
        toolUseMap.set(call.toolUseId || call.tool, {
          tool: call.tool,
          input: call.input,
          timestamp: call.timestamp
        });
      } else if (call.type === 'tool_result') {
        const toolUse = toolUseMap.get(call.toolUseId || call.tool);
        if (toolUse) {
          actions.push({
            tool: toolUse.tool,
            input: toolUse.input,
            result: call.result,
            timestamp: toolUse.timestamp,
            durationMs: call.durationMs || 0
          });
          toolUseMap.delete(call.toolUseId || call.tool);
        }
      }
    }

    return actions;
  }

  /**
   * Extract files created during a run from tool calls
   *
   * @param {Array} actions - Tool call actions
   * @param {string} workspacePath - Agent's workspace path
   * @returns {Array} List of file paths created
   */
  extractFilesCreated(actions, workspacePath) {
    const files = [];

    for (const action of actions) {
      // Check for write/edit tool calls
      if (action.tool === 'write' || action.tool === 'edit' || action.tool === 'Write' || action.tool === 'Edit') {
        const filePath = action.input?.file_path || action.input?.path;
        if (filePath) {
          files.push(filePath);
        }
      }

      // Check for bash commands that create files
      if (action.tool === 'bash' || action.tool === 'Bash') {
        const command = action.input?.command || '';
        // Simple heuristic: look for redirects or common file creation patterns
        const redirectMatch = command.match(/>\s*["']?([^"'\s>]+)/);
        if (redirectMatch && workspacePath && redirectMatch[1].startsWith(workspacePath)) {
          files.push(redirectMatch[1]);
        }
      }
    }

    return files;
  }

  /**
   * Update agent memory after a run
   * Creates a rolling summary of recent runs for context
   *
   * @param {Object} agent - Agent definition
   * @param {Object} run - Completed run record
   */
  async updateAgentMemory(agent, run) {
    try {
      // Extract topics from this run (simple heuristic based on outcome)
      const topicMatch = run.outcome?.summary || run.outcome?.details || '';
      const newTopics = [];

      // Extract date for context
      const runDate = new Date(run.startedAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });

      // Create a brief summary entry for this run
      let runSummary = `${runDate}: ${run.outcome?.summary || 'Completed'}`;
      if (run.filesCreated?.length > 0) {
        const fileNames = run.filesCreated.map(f => f.split('/').pop());
        runSummary += ` (created: ${fileNames.join(', ')})`;
      }

      // Get existing topics and add new ones
      const existingTopics = agent.memory?.recentTopics || [];

      // Build updated summary (keep last 5 run summaries)
      const existingSummary = agent.memory?.summary || '';
      const summaryLines = existingSummary.split('\n').filter(l => l.trim());

      // Add new summary at the end, keep max 5 lines
      summaryLines.push(runSummary);
      if (summaryLines.length > 5) {
        summaryLines.shift();
      }

      // Update memory
      await this.agentStore.updateMemory(agent.id, {
        summary: summaryLines.join('\n'),
        recentTopics: [...existingTopics, ...newTopics],
        recentFiles: [
          ...(agent.memory?.recentFiles || []),
          ...(run.filesCreated || [])
        ]
      });

      console.error(`[AgentExecutor] Updated memory for agent: ${agent.name}`);
    } catch (error) {
      // Don't fail the run if memory update fails
      console.error(`[AgentExecutor] Failed to update memory for ${agent.name}:`, error.message);
    }
  }

  /**
   * Execute an agent with retry logic
   *
   * @param {Object} agent - Agent definition
   * @param {number} maxRetries - Maximum number of retries (default 3)
   * @returns {Promise<Object>} Execution result
   */
  async executeWithRetry(agent, maxRetries = 3, options = {}) {
    let lastError = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      console.error(`[AgentExecutor] Attempt ${attempt + 1}/${maxRetries} for agent: ${agent.name}`);

      const result = await this.execute(agent, options);

      if (result.success) {
        return result;
      }

      lastError = result.error;

      // Don't retry on certain errors
      if (result.error.message.includes('timeout')) {
        console.error(`[AgentExecutor] Timeout error, not retrying`);
        break;
      }

      if (result.error.message.includes('Tool call limit exceeded')) {
        console.error(`[AgentExecutor] Tool limit error, not retrying`);
        break;
      }

      if (result.error.message.includes('not configured') || result.error.message.includes('API_KEY is not set')) {
        console.error(`[AgentExecutor] Configuration error, not retrying`);
        break;
      }

      // Exponential backoff before retry
      if (attempt < maxRetries - 1) {
        const backoffMs = Math.pow(2, attempt) * 2000;  // 2s, 4s, 8s
        console.error(`[AgentExecutor] Waiting ${backoffMs}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }

    return { success: false, error: lastError };
  }
}

export default AgentExecutor;
