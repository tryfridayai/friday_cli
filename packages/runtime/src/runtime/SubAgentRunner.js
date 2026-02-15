/**
 * SubAgentRunner — Run multiple specialized agents in parallel.
 *
 * Each subagent gets its own system prompt and role, but shares
 * the same MCP servers, workspace, and credentials. Results are
 * collected and returned as an array.
 *
 * Usage:
 *   const runner = new SubAgentRunner(runtime);
 *   const results = await runner.run([
 *     { role: 'security reviewer', instructions: 'Check for vulnerabilities', context: '...' },
 *     { role: 'performance reviewer', instructions: 'Check for perf issues', context: '...' },
 *   ]);
 *
 * Subagents are NOT separate processes — they're concurrent query() calls
 * to the Claude SDK running within the same runtime.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';

export class SubAgentRunner {
  /**
   * @param {Object} options
   * @param {string} options.workspacePath - Workspace for file access
   * @param {Object} options.mcpServers - MCP server configs to share
   * @param {string} [options.model] - Model to use (defaults to claude-sonnet-4-5)
   * @param {number} [options.timeoutMs] - Timeout per subagent (defaults to 120000)
   */
  constructor(options = {}) {
    this.workspacePath = options.workspacePath;
    this.mcpServers = options.mcpServers || {};
    this.model = options.model || 'claude-sonnet-4-5';
    this.timeoutMs = options.timeoutMs || 120_000;
  }

  /**
   * Run multiple subagents in parallel.
   *
   * @param {Array<Object>} tasks - Array of task definitions
   * @param {string} tasks[].role - The subagent's role (e.g. "security reviewer")
   * @param {string} tasks[].instructions - What the subagent should do
   * @param {string} [tasks[].context] - Additional context to include
   * @param {string} [tasks[].model] - Override model for this task
   * @returns {Promise<Array<{ role, result, error, durationMs }>>}
   */
  async run(tasks) {
    if (!tasks || tasks.length === 0) {
      return [];
    }

    const promises = tasks.map((task, index) =>
      this._runSingle(task, index)
    );

    return Promise.all(promises);
  }

  /**
   * Run a single subagent.
   */
  async _runSingle(task, index) {
    const startTime = Date.now();
    const role = task.role || `Subagent ${index + 1}`;

    // Build system prompt for this subagent
    const systemPrompt = this._buildSubAgentPrompt(task);

    // Build the user prompt
    const prompt = task.context
      ? `${task.instructions}\n\nContext:\n${task.context}`
      : task.instructions;

    // Clean MCP server configs for SDK
    const sdkMcpServers = {};
    for (const [id, def] of Object.entries(this.mcpServers)) {
      sdkMcpServers[id] = {
        command: def.command,
        ...(def.args ? { args: def.args } : {}),
        ...(def.env ? { env: def.env } : {}),
      };
    }

    const queryOptions = {
      model: task.model || this.model,
      cwd: this.workspacePath,
      additionalDirectories: [this.workspacePath],
      permissionMode: 'default',
      // Subagents auto-approve filesystem reads, deny writes by default
      canUseTool: (toolName) => {
        const name = (toolName || '').toLowerCase();
        if (name.includes('read') || name.includes('list') || name.includes('search') || name.includes('get')) {
          return { behavior: 'allow', updatedInput: undefined };
        }
        return { behavior: 'deny', message: 'Subagents cannot write files or run commands', interrupt: false };
      },
      mcpServers: sdkMcpServers,
      systemPrompt,
      env: process.env,
    };

    try {
      const abortController = new AbortController();
      const timeout = setTimeout(() => abortController.abort(), this.timeoutMs);

      let fullResponse = '';
      const queryStream = query({ prompt, options: queryOptions });

      for await (const message of queryStream) {
        if (abortController.signal.aborted) break;

        if (message.type === 'text' && message.text) {
          fullResponse += message.text;
        } else if (message.type === 'result' && message.subtype === 'success') {
          // Done
        }
      }

      clearTimeout(timeout);

      return {
        role,
        result: fullResponse,
        error: null,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        role,
        result: null,
        error: error.message,
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Build a focused system prompt for a subagent.
   */
  _buildSubAgentPrompt(task) {
    const parts = [
      `You are a specialized agent with the role: ${task.role}.`,
      '',
      'You are running as a subagent within a larger system.',
      'Focus specifically on your assigned task and provide a clear, concise response.',
      'Do not ask follow-up questions — complete the task with the information provided.',
    ];

    if (task.instructions) {
      parts.push('', '## Your Task', task.instructions);
    }

    return parts.join('\n');
  }
}

export default SubAgentRunner;
