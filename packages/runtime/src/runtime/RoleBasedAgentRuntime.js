/**
 * RoleBasedAgentRuntime
 * Extension of AgentRuntime that supports role-based agents with skills
 */

import { AgentRuntime } from './AgentRuntime.js';
import { agentManager } from '../agents/AgentManager.js';
import { skillManager } from '../skills/SkillManager.js';

export class RoleBasedAgentRuntime extends AgentRuntime {
  constructor(options) {
    super(options);
    this.agentManager = agentManager;
    this.skillManager = skillManager;
    this.currentAgentRole = null;
    this.currentUserId = null;
  }

  /**
   * Set the current agent role and user
   */
  async setAgentRole(userId, agentId) {
    this.currentUserId = userId;
    this.currentAgentRole = agentId;

    // Load agent configuration
    const agentConfig = await this.agentManager.loadUserAgentConfig(userId, agentId);

    // Load enabled skills for this agent
    const enabledSkills = await this.skillManager.getEnabledSkillsForUser(userId);

    return {
      agentConfig,
      enabledSkills
    };
  }

  /**
   * Build system prompt with agent role and skills
   */
  async buildSystemPrompt(userId, agentId) {
    // Load agent configuration
    const agentConfig = await this.agentManager.loadUserAgentConfig(userId, agentId);

    // Get base system prompt from agent
    let systemPrompt = agentConfig.systemPrompt;

    // Load and inject enabled skills
    const enabledSkills = await this.skillManager.getEnabledSkillsForUser(userId);

    if (enabledSkills.length > 0) {
      const skillsSections = enabledSkills.map(skill => {
        return `## Skill: ${skill.name}\n${skill.content}`;
      }).join('\n\n');

      systemPrompt += `\n\n# Additional Skills\n\n${skillsSections}`;
    }

    return systemPrompt;
  }

  /**
   * Handle query with role-based agent
   */
  async handleQueryWithRole(userMessage, { userId, agentId, sessionId = null, metadata = {} }) {
    if (!userId || !agentId) {
      throw new Error('userId and agentId are required for role-based queries');
    }

    // Build system prompt with agent role and skills
    const systemPrompt = await this.buildSystemPrompt(userId, agentId);

    // Load agent configuration
    const agentConfig = await this.agentManager.loadUserAgentConfig(userId, agentId);

    // Merge metadata with agent configuration
    const enhancedMetadata = {
      ...metadata,
      agentRole: agentId,
      agentName: agentConfig.name,
      userId,
      model: agentConfig.model,
      temperature: agentConfig.temperature
    };

    // Store current agent role for context
    this.currentAgentRole = agentId;
    this.currentUserId = userId;

    // Prepare session metadata
    if (sessionId) {
      this.currentSessionId = sessionId;
      if (this.sessionStore) {
        this.sessionStore
          .ensureSession(sessionId, {
            workspacePath: this.workspacePath,
            title: this.generateSessionTitle(userMessage),
            model: enhancedMetadata.model || metadata.modelId || metadata.model,
            agentRole: agentId,
            updatedAt: new Date().toISOString()
          })
          .catch((error) => {
            this.log(`[SessionStore] Failed to ensure session ${sessionId}: ${error.message}`);
          });
      }
    } else if (!this.currentSessionId) {
      this.preparePendingSessionMetadata(userMessage, enhancedMetadata);
    }

    this.recordInboundEvent(
      {
        type: 'query',
        message: userMessage,
        metadata: enhancedMetadata
      },
      { sessionId }
    );

    const queryContext = this.createQueryContext(enhancedMetadata);

    const queryOptions = {
      model: agentConfig.model || 'claude-sonnet-4-5',
      temperature: agentConfig.temperature,
      cwd: this.workspacePath,
      additionalDirectories: [this.workspacePath],
      permissionMode: 'default',
      canUseTool: (toolName, toolInput, { signal, suggestions, toolUseID }) =>
        this.handlePermissionGate({ toolName, toolInput, suggestions, signal, toolUseID }),
      mcpServers: this.mcpServers,
      systemPrompt
    };

    if (sessionId) {
      queryOptions.resume = sessionId;
      this.emitMessage({ type: 'info', message: `Resuming session: ${sessionId}` });
    }

    let messageSessionId = null;
    let fullResponse = '';

    try {
      const { query } = await import('@anthropic-ai/claude-agent-sdk');

      for await (const message of query({ prompt: userMessage, options: queryOptions })) {
        if (message.session_id && !messageSessionId) {
          messageSessionId = message.session_id;
          this.currentSessionId = message.session_id;
          this.emitMessage({
            type: 'session',
            session_id: message.session_id,
            agent_role: agentId,
            agent_name: agentConfig.name
          });
        }

        const appended = await this.routeAgentMessage(message, queryContext, fullResponse);
        if (appended) {
          fullResponse += appended;
        }
      }

      return {
        sessionId: this.currentSessionId,
        response: fullResponse,
        agentRole: agentId
      };
    } catch (error) {
      this.log(`[RUNTIME] Error in handleQueryWithRole: ${error.message}`);
      this.emitMessage({ type: 'error', message: error.message });
      throw error;
    }
  }

  /**
   * Get available agent roles for a user
   */
  async getAvailableAgents(userId) {
    return this.agentManager.getUserAgents(userId);
  }

  /**
   * Get available skills for a user
   */
  async getAvailableSkills(userId) {
    return this.skillManager.getUserAvailableSkills(userId);
  }

  /**
   * Override handleQuery to support backward compatibility
   * If no agent role specified, use default behavior
   */
  async handleQuery(userMessage, sessionId = null, metadata = {}) {
    // If userId and agentId provided, use role-based query
    if (metadata.userId && metadata.agentId) {
      return this.handleQueryWithRole(userMessage, {
        userId: metadata.userId,
        agentId: metadata.agentId,
        sessionId,
        metadata
      });
    }

    // Otherwise, use default behavior
    return super.handleQuery(userMessage, sessionId, metadata);
  }
}

// Export singleton instance factory
export function createRoleBasedAgentRuntime(options) {
  return new RoleBasedAgentRuntime(options);
}
