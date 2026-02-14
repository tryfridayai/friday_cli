/**
 * AgentManager
 * Manages global and user-specific agents, handles agent loading and configuration
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { uiDesignerAgent } from './global/ui-designer.js';
import { frontendDeveloperAgent } from './global/frontend-developer.js';
import { backendDeveloperAgent } from './global/backend-developer.js';
import { analystAgent } from './global/analyst.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class AgentManager {
  constructor({ baseConfigPath = path.join(__dirname, '../config/agents') } = {}) {
    this.baseConfigPath = baseConfigPath;

    // Global agents (read-only, available to all users)
    this.globalAgents = new Map([
      ['ui-designer', uiDesignerAgent],
      ['frontend-developer', frontendDeveloperAgent],
      ['backend-developer', backendDeveloperAgent],
      ['analyst', analystAgent]
    ]);

    // Cache for user agents
    this.userAgentsCache = new Map();
  }

  /**
   * Get all available agent roles
   */
  getGlobalAgents() {
    return Array.from(this.globalAgents.values());
  }

  /**
   * Get a specific global agent by ID
   */
  getGlobalAgent(agentId) {
    return this.globalAgents.get(agentId);
  }

  /**
   * Get user's configuration path
   */
  getUserConfigPath(userId) {
    return path.join(this.baseConfigPath, userId);
  }

  /**
   * Load user-specific agent configuration
   * Merges global agent with user customizations
   */
  async loadUserAgentConfig(userId, agentId) {
    const globalAgent = this.globalAgents.get(agentId);
    if (!globalAgent) {
      throw new Error(`Unknown agent ID: ${agentId}`);
    }

    // Load user-specific configuration if exists
    const userConfigPath = path.join(
      this.getUserConfigPath(userId),
      'config.json'
    );

    let userConfig = {};
    try {
      const configData = await fs.readFile(userConfigPath, 'utf8');
      userConfig = JSON.parse(configData);
    } catch (error) {
      // No user config exists, use defaults
      if (error.code !== 'ENOENT') {
        console.error(`Error loading user config for ${userId}:`, error.message);
      }
    }

    // Get agent-specific customizations
    const agentCustomizations = userConfig[agentId] || {};

    // Merge global agent with user customizations
    return this.mergeAgentConfig(globalAgent, agentCustomizations);
  }

  /**
   * Merge global agent configuration with user customizations
   */
  mergeAgentConfig(globalAgent, userCustomizations) {
    const merged = {
      ...globalAgent,
      // User customizations take precedence
      ...userCustomizations,

      // Special handling for system prompt
      systemPrompt: this.mergeSystemPrompts(
        globalAgent.systemPrompt,
        userCustomizations.customInstructions
      ),

      // Merge skills (global + user custom skills)
      skills: [
        ...(globalAgent.defaultSkills || []),
        ...(userCustomizations.customSkills || [])
      ],

      // User can enable/disable specific skills
      enabledSkills: userCustomizations.enabledSkills || null,

      // User can customize allowed tools (within bounds)
      allowedTools: userCustomizations.allowedTools || globalAgent.allowedTools,

      // User can adjust temperature within reasonable bounds
      temperature: userCustomizations.temperature !== undefined
        ? this.clampTemperature(userCustomizations.temperature)
        : globalAgent.temperature,

      // Track that this is a user-customized instance
      isCustomized: Object.keys(userCustomizations).length > 0,
      baseAgentId: globalAgent.id,
    };

    return merged;
  }

  /**
   * Merge global system prompt with user custom instructions
   */
  mergeSystemPrompts(globalPrompt, customInstructions) {
    if (!customInstructions || !customInstructions.trim()) {
      return globalPrompt;
    }

    return `${globalPrompt}

## User Custom Instructions
${customInstructions}

**Note**: When there's a conflict between default behavior and custom instructions, prioritize the user's custom instructions above.`;
  }

  /**
   * Clamp temperature to reasonable bounds (0.0 to 1.0)
   */
  clampTemperature(temperature) {
    return Math.max(0.0, Math.min(1.0, temperature));
  }

  /**
   * Save user-specific agent configuration
   */
  async saveUserAgentConfig(userId, agentId, customizations) {
    // Validate that the agent exists
    if (!this.globalAgents.has(agentId)) {
      throw new Error(`Unknown agent ID: ${agentId}`);
    }

    // Ensure user config directory exists
    const userConfigDir = this.getUserConfigPath(userId);
    await fs.mkdir(userConfigDir, { recursive: true });

    // Load existing config
    const configPath = path.join(userConfigDir, 'config.json');
    let config = {};
    try {
      const existing = await fs.readFile(configPath, 'utf8');
      config = JSON.parse(existing);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error(`Error reading existing config:`, error.message);
      }
    }

    // Update agent-specific configuration
    config[agentId] = {
      ...config[agentId],
      ...customizations,
      updatedAt: new Date().toISOString()
    };

    // Save updated configuration
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');

    // Clear cache for this user
    this.userAgentsCache.delete(userId);

    return config[agentId];
  }

  /**
   * Load custom user-created agents (not based on global templates)
   */
  async loadUserCustomAgents(userId) {
    const userAgentsPath = path.join(
      this.getUserConfigPath(userId),
      'agents'
    );

    try {
      const agentFiles = await fs.readdir(userAgentsPath);
      const customAgents = [];

      for (const file of agentFiles) {
        if (file.endsWith('.json')) {
          try {
            const agentPath = path.join(userAgentsPath, file);
            const agentData = await fs.readFile(agentPath, 'utf8');
            const agent = JSON.parse(agentData);
            customAgents.push({
              ...agent,
              isGlobal: false,
              isCustom: true,
              userId
            });
          } catch (error) {
            console.error(`Error loading custom agent ${file}:`, error.message);
          }
        }
      }

      return customAgents;
    } catch (error) {
      // No custom agents directory exists
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Create a new custom agent for a user
   */
  async createUserAgent(userId, agentData) {
    // Validate required fields
    if (!agentData.id || !agentData.name || !agentData.systemPrompt) {
      throw new Error('Agent must have id, name, and systemPrompt');
    }

    // Ensure the ID doesn't conflict with global agents
    if (this.globalAgents.has(agentData.id)) {
      throw new Error(`Agent ID "${agentData.id}" conflicts with a global agent. Please choose a different ID.`);
    }

    // Create user agents directory
    const userAgentsPath = path.join(
      this.getUserConfigPath(userId),
      'agents'
    );
    await fs.mkdir(userAgentsPath, { recursive: true });

    // Prepare agent configuration
    const agent = {
      id: agentData.id,
      name: agentData.name,
      role: agentData.role || agentData.name,
      description: agentData.description || '',
      systemPrompt: agentData.systemPrompt,
      allowedTools: agentData.allowedTools || [
        'read', 'write', 'edit', 'bash', 'glob', 'grep'
      ],
      model: agentData.model || 'claude-sonnet-4-5',
      temperature: this.clampTemperature(agentData.temperature || 0.5),
      skills: agentData.skills || [],
      isGlobal: false,
      isCustom: true,
      metadata: {
        createdAt: new Date().toISOString(),
        createdBy: userId,
        version: '1.0.0'
      }
    };

    // Save agent configuration
    const agentPath = path.join(userAgentsPath, `${agent.id}.json`);
    await fs.writeFile(agentPath, JSON.stringify(agent, null, 2), 'utf8');

    // Clear cache
    this.userAgentsCache.delete(userId);

    return agent;
  }

  /**
   * Update a custom user agent
   */
  async updateUserAgent(userId, agentId, updates) {
    const userAgentsPath = path.join(
      this.getUserConfigPath(userId),
      'agents',
      `${agentId}.json`
    );

    // Load existing agent
    let agent;
    try {
      const agentData = await fs.readFile(userAgentsPath, 'utf8');
      agent = JSON.parse(agentData);
    } catch (error) {
      throw new Error(`Custom agent "${agentId}" not found for user ${userId}`);
    }

    // Verify this is a custom agent (not global)
    if (agent.isGlobal) {
      throw new Error('Cannot modify global agents');
    }

    // Update agent
    const updatedAgent = {
      ...agent,
      ...updates,
      // Preserve certain fields
      id: agent.id,
      isGlobal: false,
      isCustom: true,
      metadata: {
        ...agent.metadata,
        updatedAt: new Date().toISOString()
      }
    };

    // Save updated agent
    await fs.writeFile(userAgentsPath, JSON.stringify(updatedAgent, null, 2), 'utf8');

    // Clear cache
    this.userAgentsCache.delete(userId);

    return updatedAgent;
  }

  /**
   * Delete a custom user agent
   */
  async deleteUserAgent(userId, agentId) {
    // Prevent deletion of global agents
    if (this.globalAgents.has(agentId)) {
      throw new Error('Cannot delete global agents');
    }

    const userAgentsPath = path.join(
      this.getUserConfigPath(userId),
      'agents',
      `${agentId}.json`
    );

    try {
      await fs.unlink(userAgentsPath);
      this.userAgentsCache.delete(userId);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Custom agent "${agentId}" not found`);
      }
      throw error;
    }
  }

  /**
   * Get all agents available to a user (global + custom)
   */
  async getUserAgents(userId) {
    // Check cache
    if (this.userAgentsCache.has(userId)) {
      return this.userAgentsCache.get(userId);
    }

    // Get global agents
    const globalAgents = this.getGlobalAgents();

    // Get custom user agents
    const customAgents = await this.loadUserCustomAgents(userId);

    // Combine
    const allAgents = [
      ...globalAgents.map(agent => ({
        ...agent,
        isGlobal: true,
        isCustom: false
      })),
      ...customAgents
    ];

    // Cache result
    this.userAgentsCache.set(userId, allAgents);

    return allAgents;
  }

  /**
   * Reset user agent configuration to defaults
   */
  async resetUserAgentConfig(userId, agentId) {
    if (!this.globalAgents.has(agentId)) {
      throw new Error(`Agent ID "${agentId}" is not a global agent`);
    }

    const configPath = path.join(
      this.getUserConfigPath(userId),
      'config.json'
    );

    try {
      const configData = await fs.readFile(configPath, 'utf8');
      const config = JSON.parse(configData);

      // Remove agent-specific customizations
      delete config[agentId];

      // Save updated config
      await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');

      // Clear cache
      this.userAgentsCache.delete(userId);

      return this.globalAgents.get(agentId);
    } catch (error) {
      if (error.code === 'ENOENT') {
        // No config file, already at defaults
        return this.globalAgents.get(agentId);
      }
      throw error;
    }
  }
}

// Export singleton instance
export const agentManager = new AgentManager();
