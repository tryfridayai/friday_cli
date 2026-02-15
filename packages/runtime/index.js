/**
 * friday-runtime — public API
 *
 * The core agent execution engine. Import this package to create and run
 * Claude agents programmatically with MCP tools, permission gates,
 * session persistence, and skill injection.
 *
 * Quick start:
 *
 *   import { AgentRuntime, loadBackendConfig } from 'friday-runtime';
 *
 *   const config = await loadBackendConfig();
 *   const runtime = new AgentRuntime({
 *     workspacePath: config.workspacePath,
 *     rules: config.rules,
 *     mcpServers: config.mcpServers,
 *     sessionsPath: config.sessionsPath,
 *   });
 *
 *   runtime.on('message', (msg) => console.log(msg));
 *   await runtime.handleQuery('Hello, Friday');
 */

// Core runtime
export { AgentRuntime } from './src/runtime/AgentRuntime.js';
export { RoleBasedAgentRuntime, createRoleBasedAgentRuntime } from './src/runtime/RoleBasedAgentRuntime.js';

// Configuration
export { loadBackendConfig } from './src/config.js';

// Managers
export { AgentManager, agentManager } from './src/agents/AgentManager.js';
export { SkillManager, skillManager } from './src/skills/SkillManager.js';

// Sessions
export { SessionStore } from './src/sessions/SessionStore.js';

// Permissions
export { PermissionManager, PERMISSION } from './src/permissions/PermissionManager.js';

// Plugins
export { PluginManager, pluginManager } from './src/plugins/PluginManager.js';

// Cost tracking
export { CostTracker, default as costTracker } from './src/providers/CostTracker.js';

// Subagents
export { SubAgentRunner } from './src/runtime/SubAgentRunner.js';

// Triggers
export { TriggerRouter } from './src/scheduler/TriggerRouter.js';

// MCP
export { default as McpCredentials } from './src/mcp/McpCredentials.js';
export { default as McpOAuthManager } from './src/oauth/McpOAuthManager.js';

// Scheduled agents
export { default as AgentScheduler } from './src/scheduled-agents/AgentScheduler.js';
export { default as AgentExecutor } from './src/scheduled-agents/AgentExecutor.js';
export { default as ScheduledAgentStore } from './src/scheduled-agents/ScheduledAgentStore.js';
export { default as AgentRunHistory } from './src/scheduled-agents/AgentRunHistory.js';

// Sandbox
export { default as ProcessRegistry, getProcessRegistry } from './src/sandbox/ProcessRegistry.js';

// Multi-modal providers
export { default as ProviderRegistry, MediaContext, CAPABILITIES, PROVIDERS } from './providers/ProviderRegistry.js';
export { BaseAdapter } from './src/providers/adapters/BaseAdapter.js';
export { OpenAIAdapter } from './src/providers/adapters/OpenAIAdapter.js';
export { GoogleAdapter } from './src/providers/adapters/GoogleAdapter.js';
export { ElevenLabsAdapter } from './src/providers/adapters/ElevenLabsAdapter.js';
