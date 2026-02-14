import fs from 'fs';
import { promises as fsPromises } from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

/**
 * ScheduledAgentStore
 *
 * Manages CRUD operations for scheduled agent definitions.
 * Agents are stored as JSON files in ~/.friday/agents/{userId}/{agentId}.json
 *
 * This is a generic store that works with any MCP server configuration.
 *
 * Features:
 * - Memory: Rolling summary of past runs for context continuity
 * - Workspace: Each agent gets its own directory for file storage
 */
class ScheduledAgentStore {
  constructor(options = null) {
    let dataDir = null;
    let workspaceBasePath = null;

    if (options && typeof options === 'object' && !Array.isArray(options)) {
      dataDir = options.dataDir || null;
      workspaceBasePath = options.workspaceBasePath || null;
    } else {
      dataDir = options || null;
    }

    // Default to ~/.friday/agents/
    this.dataDir = dataDir || path.join(os.homedir(), '.friday', 'agents');
    this.workspaceBasePath = workspaceBasePath;
    this.workspacesDir = this.workspaceBasePath
      ? path.join(this.workspaceBasePath, '.friday', 'agent-workspaces')
      : path.join(os.homedir(), '.friday', 'agent-workspaces');
    this.ensureDataDir();
  }

  /**
   * Ensure the data directory exists
   */
  ensureDataDir() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    if (!fs.existsSync(this.workspacesDir)) {
      fs.mkdirSync(this.workspacesDir, { recursive: true });
    }
  }

  /**
   * Get agent's workspace directory
   * Each agent gets its own isolated workspace for file storage
   */
  getAgentWorkspace(agentId) {
    return path.join(this.workspacesDir, agentId);
  }

  /**
   * Ensure agent workspace directory exists
   */
  ensureAgentWorkspace(agentId) {
    const workspacePath = this.getAgentWorkspace(agentId);
    if (!fs.existsSync(workspacePath)) {
      fs.mkdirSync(workspacePath, { recursive: true });
    }
    return workspacePath;
  }

  /**
   * Get user's agent directory
   */
  getUserDir(userId) {
    return path.join(this.dataDir, userId);
  }

  /**
   * Ensure user directory exists
   */
  ensureUserDir(userId) {
    const userDir = this.getUserDir(userId);
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
  }

  /**
   * Generate a unique agent ID
   */
  generateAgentId(name) {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const randomSuffix = crypto.randomBytes(4).toString('hex');
    return `${slug}-${randomSuffix}`;
  }

  /**
   * Validate agent data
   */
  validateAgent(agentData) {
    const required = ['name', 'instructions', 'schedule', 'mcpServers'];
    const missing = required.filter(field => !agentData[field]);

    if (missing.length > 0) {
      throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }

    // Validate schedule
    if (!agentData.schedule.cron) {
      throw new Error('Schedule must include cron expression');
    }

    // Validate MCP servers is an array
    if (!Array.isArray(agentData.mcpServers)) {
      throw new Error('mcpServers must be an array');
    }

    return true;
  }

  /**
   * Create a new scheduled agent
   *
   * @param {string} userId - User ID
   * @param {Object} agentData - Agent configuration
   * @returns {Promise<Object>} Created agent
   */
  async createAgent(userId, agentData) {
    this.validateAgent(agentData);
    this.ensureUserDir(userId);

    const agentId = agentData.id || this.generateAgentId(agentData.name);

    // Create agent's workspace directory
    const workspacePath = this.ensureAgentWorkspace(agentId);

    const agent = {
      id: agentId,
      userId,
      name: agentData.name,
      description: agentData.description || '',

      schedule: {
        cron: agentData.schedule.cron,
        timezone: agentData.schedule.timezone || 'UTC',
        humanReadable: agentData.schedule.humanReadable || agentData.schedule.cron
      },

      instructions: agentData.instructions,
      mcpServers: agentData.mcpServers,
      maxRunsPerHour: agentData.maxRunsPerHour ?? 5,

      // Workspace path for file storage
      workspacePath,

      // Memory for context across runs
      memory: {
        summary: '',
        lastUpdated: null,
        recentTopics: [],
        recentFiles: []
      },

      permissions: {
        preAuthorized: agentData.permissions?.preAuthorized ?? true,
        tools: agentData.permissions?.tools || []
      },

      review: agentData.review || null,

      status: agentData.status || 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastRunAt: null,
      nextRunAt: null,
      runCount: 0,
      errorCount: 0,
      lastError: null
    };

    // Save to file
    const agentPath = path.join(this.getUserDir(userId), `${agent.id}.json`);
    await fsPromises.writeFile(agentPath, JSON.stringify(agent, null, 2));

    return agent;
  }

  /**
   * Get an agent by ID
   *
   * @param {string} userId - User ID
   * @param {string} agentId - Agent ID
   * @returns {Promise<Object|null>} Agent or null if not found
   */
  async getAgent(userId, agentId) {
    const agentPath = path.join(this.getUserDir(userId), `${agentId}.json`);

    if (!fs.existsSync(agentPath)) {
      return null;
    }

    const data = await fsPromises.readFile(agentPath, 'utf-8');
    return JSON.parse(data);
  }

  /**
   * List all agents for a user
   *
   * @param {string} userId - User ID
   * @param {Object} filters - Optional filters { status: 'active' }
   * @returns {Promise<Array>} Array of agents
   */
  async listAgents(userId, filters = {}) {
    this.ensureUserDir(userId);
    const userDir = this.getUserDir(userId);

    let files;
    try {
      files = await fsPromises.readdir(userDir);
    } catch (err) {
      return [];
    }

    const agents = await Promise.all(
      files
        .filter(file => file.endsWith('.json'))
        .map(async file => {
          const data = await fsPromises.readFile(path.join(userDir, file), 'utf-8');
          return JSON.parse(data);
        })
    );

    // Apply filters
    let filtered = agents;
    if (filters.status) {
      filtered = filtered.filter(agent => agent.status === filters.status);
    }

    // Sort by updatedAt (most recent first)
    filtered.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    return filtered;
  }

  /**
   * Update an agent
   *
   * @param {string} userId - User ID
   * @param {string} agentId - Agent ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated agent
   */
  async updateAgent(userId, agentId, updates) {
    const agent = await this.getAgent(userId, agentId);

    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    // Merge updates
    const updatedAgent = {
      ...agent,
      ...updates,
      id: agent.id,  // Never allow changing ID
      userId: agent.userId,  // Never allow changing userId
      updatedAt: new Date().toISOString()
    };

    // Validate if schedule or other critical fields changed
    if (updates.schedule || updates.mcpServers) {
      this.validateAgent(updatedAgent);
    }

    // Save to file
    const agentPath = path.join(this.getUserDir(userId), `${agentId}.json`);
    await fsPromises.writeFile(agentPath, JSON.stringify(updatedAgent, null, 2));

    return updatedAgent;
  }

  /**
   * Delete an agent
   *
   * @param {string} userId - User ID
   * @param {string} agentId - Agent ID
   * @returns {Promise<boolean>} Success
   */
  async deleteAgent(userId, agentId) {
    const agentPath = path.join(this.getUserDir(userId), `${agentId}.json`);

    if (!fs.existsSync(agentPath)) {
      return false;
    }

    await fsPromises.unlink(agentPath);
    return true;
  }

  /**
   * Toggle agent status (active/paused)
   *
   * @param {string} userId - User ID
   * @param {string} agentId - Agent ID
   * @param {string} status - 'active' | 'paused' | 'error'
   * @returns {Promise<Object>} Updated agent
   */
  async toggleStatus(userId, agentId, status) {
    if (!['active', 'paused', 'error'].includes(status)) {
      throw new Error(`Invalid status: ${status}`);
    }

    return this.updateAgent(userId, agentId, { status });
  }

  /**
   * Get all active agents across all users
   * Used by scheduler on startup to schedule all active agents
   *
   * @returns {Promise<Array>} Array of active agents
   */
  async getAllActiveAgents() {
    const agents = [];

    // Read all user directories
    let userDirs;
    try {
      userDirs = await fsPromises.readdir(this.dataDir);
    } catch (err) {
      return [];
    }

    for (const userId of userDirs) {
      const userPath = path.join(this.dataDir, userId);
      const stat = await fsPromises.stat(userPath);

      if (!stat.isDirectory()) {
        continue;
      }

      const userAgents = await this.listAgents(userId, { status: 'active' });
      agents.push(...userAgents);
    }

    return agents;
  }

  /**
   * Update agent statistics after execution
   *
   * @param {string} agentId - Agent ID (searches all users)
   * @param {Object} stats - Stats to update { lastRunAt, runCount, errorCount, etc. }
   * @returns {Promise<Object>} Updated agent
   */
  async updateStats(agentId, stats) {
    // Find the agent across all users
    const userDirs = await fsPromises.readdir(this.dataDir);

    for (const userId of userDirs) {
      const userPath = path.join(this.dataDir, userId);
      const stat = await fsPromises.stat(userPath);

      if (!stat.isDirectory()) {
        continue;
      }

      const agent = await this.getAgent(userId, agentId);
      if (agent) {
        return this.updateAgent(userId, agentId, stats);
      }
    }

    throw new Error(`Agent not found: ${agentId}`);
  }

  /**
   * Get agent by ID across all users
   *
   * @param {string} agentId - Agent ID
   * @returns {Promise<Object|null>} Agent or null
   */
  async getAgentById(agentId) {
    const userDirs = await fsPromises.readdir(this.dataDir);

    for (const userId of userDirs) {
      const userPath = path.join(this.dataDir, userId);
      const stat = await fsPromises.stat(userPath);

      if (!stat.isDirectory()) {
        continue;
      }

      const agent = await this.getAgent(userId, agentId);
      if (agent) {
        return agent;
      }
    }

    return null;
  }

  /**
   * Update agent memory after a run
   * Memory provides context continuity between runs
   *
   * @param {string} agentId - Agent ID
   * @param {Object} memoryUpdate - Memory fields to update
   * @returns {Promise<Object>} Updated agent
   */
  async updateMemory(agentId, memoryUpdate) {
    const agent = await this.getAgentById(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    // Merge memory updates
    const updatedMemory = {
      ...agent.memory,
      ...memoryUpdate,
      lastUpdated: new Date().toISOString()
    };

    // Keep recentTopics limited to last 10
    if (updatedMemory.recentTopics && updatedMemory.recentTopics.length > 10) {
      updatedMemory.recentTopics = updatedMemory.recentTopics.slice(-10);
    }

    // Keep recentFiles limited to last 20
    if (updatedMemory.recentFiles && updatedMemory.recentFiles.length > 20) {
      updatedMemory.recentFiles = updatedMemory.recentFiles.slice(-20);
    }

    return this.updateStats(agentId, { memory: updatedMemory });
  }

  /**
   * Get files in agent's workspace
   *
   * @param {string} agentId - Agent ID
   * @returns {Promise<Array>} List of files with metadata
   */
  async getWorkspaceFiles(agentId) {
    const workspacePath = this.getAgentWorkspace(agentId);

    if (!fs.existsSync(workspacePath)) {
      return [];
    }

    const files = await fsPromises.readdir(workspacePath);
    const fileList = [];

    for (const file of files) {
      const filePath = path.join(workspacePath, file);
      const stat = await fsPromises.stat(filePath);

      if (stat.isFile()) {
        fileList.push({
          name: file,
          path: filePath,
          size: stat.size,
          modifiedAt: stat.mtime.toISOString()
        });
      }
    }

    // Sort by modified date, most recent first
    fileList.sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));

    return fileList;
  }

  /**
   * Delete agent's workspace when agent is deleted
   *
   * @param {string} agentId - Agent ID
   */
  async deleteAgentWorkspace(agentId) {
    const workspacePath = this.getAgentWorkspace(agentId);

    if (fs.existsSync(workspacePath)) {
      await fsPromises.rm(workspacePath, { recursive: true });
    }
  }
}

export default ScheduledAgentStore;
