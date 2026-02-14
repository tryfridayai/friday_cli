import fs from 'fs';
import { promises as fsPromises } from 'fs';
import path from 'path';
import os from 'os';

/**
 * AgentRunHistory
 *
 * Manages storage and retrieval of agent execution history.
 * Run records are stored as JSON files in ~/.friday/agent-runs/{agentId}/{timestamp}.json
 *
 * Each run includes:
 * - Timing (start, end, duration)
 * - Status (success, error, cancelled)
 * - Actions taken (tool calls with inputs and results)
 * - Outcome summary
 * - Error details if failed
 */
class AgentRunHistory {
  constructor(dataDir = null) {
    // Default to ~/.friday/agent-runs/
    this.dataDir = dataDir || path.join(os.homedir(), '.friday', 'agent-runs');
    this.ensureDataDir();
  }

  /**
   * Ensure the data directory exists
   */
  ensureDataDir() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  /**
   * Get agent's run directory
   */
  getAgentRunDir(agentId) {
    return path.join(this.dataDir, agentId);
  }

  /**
   * Ensure agent run directory exists
   */
  ensureAgentRunDir(agentId) {
    const runDir = this.getAgentRunDir(agentId);
    if (!fs.existsSync(runDir)) {
      fs.mkdirSync(runDir, { recursive: true });
    }
  }

  /**
   * Generate run filename from timestamp
   */
  getRunFilename(timestamp) {
    // Replace colons with hyphens for filesystem compatibility
    return `${timestamp.replace(/:/g, '-')}.json`;
  }

  /**
   * Save a run record
   *
   * @param {Object} run - Run record
   * @returns {Promise<void>}
   */
  async saveRun(run) {
    if (!run.agentId || !run.startedAt) {
      throw new Error('Run must include agentId and startedAt');
    }

    this.ensureAgentRunDir(run.agentId);

    const filename = this.getRunFilename(run.startedAt);
    const runPath = path.join(this.getAgentRunDir(run.agentId), filename);

    await fsPromises.writeFile(runPath, JSON.stringify(run, null, 2));
  }

  /**
   * Get run history for an agent
   *
   * @param {string} agentId - Agent ID
   * @param {number} limit - Maximum number of runs to return (default 30)
   * @returns {Promise<Array>} Array of run records, sorted by most recent first
   */
  async getRunHistory(agentId, limit = 30) {
    const runDir = this.getAgentRunDir(agentId);

    if (!fs.existsSync(runDir)) {
      return [];
    }

    let files;
    try {
      files = await fsPromises.readdir(runDir);
    } catch (err) {
      return [];
    }

    // Sort files by name (which is timestamp) in reverse order
    const sortedFiles = files
      .filter(file => file.endsWith('.json'))
      .sort()
      .reverse()
      .slice(0, limit);

    const runs = await Promise.all(
      sortedFiles.map(async file => {
        const data = await fsPromises.readFile(path.join(runDir, file), 'utf-8');
        return JSON.parse(data);
      })
    );

    return runs;
  }

  /**
   * Get a specific run by ID
   *
   * @param {string} agentId - Agent ID
   * @param {string} runId - Run ID or timestamp
   * @returns {Promise<Object|null>} Run record or null
   */
  async getRunById(agentId, runId) {
    const runDir = this.getAgentRunDir(agentId);

    if (!fs.existsSync(runDir)) {
      return null;
    }

    // Try to find by exact ID first
    let files;
    try {
      files = await fsPromises.readdir(runDir);
    } catch (err) {
      return null;
    }

    // Search for matching run
    for (const file of files) {
      const data = await fsPromises.readFile(path.join(runDir, file), 'utf-8');
      const run = JSON.parse(data);

      if (run.id === runId || run.startedAt === runId) {
        return run;
      }
    }

    return null;
  }

  /**
   * Get the most recent run for an agent
   *
   * @param {string} agentId - Agent ID
   * @returns {Promise<Object|null>} Most recent run or null
   */
  async getLatestRun(agentId) {
    const runs = await this.getRunHistory(agentId, 1);
    return runs.length > 0 ? runs[0] : null;
  }

  /**
   * Get run statistics for an agent
   *
   * @param {string} agentId - Agent ID
   * @returns {Promise<Object>} Statistics
   */
  async getRunStats(agentId) {
    const runs = await this.getRunHistory(agentId, 100);  // Last 100 runs

    if (runs.length === 0) {
      return {
        totalRuns: 0,
        successCount: 0,
        errorCount: 0,
        averageDuration: 0,
        lastRun: null
      };
    }

    const successCount = runs.filter(r => r.status === 'success').length;
    const errorCount = runs.filter(r => r.status === 'error').length;
    const avgDuration = runs.reduce((sum, r) => sum + (r.durationMs || 0), 0) / runs.length;

    return {
      totalRuns: runs.length,
      successCount,
      errorCount,
      averageDuration: Math.round(avgDuration),
      lastRun: runs[0]
    };
  }

  /**
   * Delete run history older than specified days
   *
   * @param {number} daysToKeep - Number of days to keep (default 30)
   * @returns {Promise<number>} Number of runs deleted
   */
  async cleanup(daysToKeep = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    const cutoffTimestamp = cutoffDate.toISOString();

    let deletedCount = 0;

    // Get all agent directories
    let agentDirs;
    try {
      agentDirs = await fsPromises.readdir(this.dataDir);
    } catch (err) {
      return 0;
    }

    for (const agentId of agentDirs) {
      const runDir = path.join(this.dataDir, agentId);
      const stat = await fsPromises.stat(runDir);

      if (!stat.isDirectory()) {
        continue;
      }

      const files = await fsPromises.readdir(runDir);

      for (const file of files) {
        if (!file.endsWith('.json')) {
          continue;
        }

        const filePath = path.join(runDir, file);
        const data = await fsPromises.readFile(filePath, 'utf-8');
        const run = JSON.parse(data);

        if (run.startedAt < cutoffTimestamp) {
          await fsPromises.unlink(filePath);
          deletedCount++;
        }
      }
    }

    return deletedCount;
  }

  /**
   * Delete all run history for an agent
   *
   * @param {string} agentId - Agent ID
   * @returns {Promise<number>} Number of runs deleted
   */
  async deleteAgentHistory(agentId) {
    const runDir = this.getAgentRunDir(agentId);

    if (!fs.existsSync(runDir)) {
      return 0;
    }

    const files = await fsPromises.readdir(runDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    for (const file of jsonFiles) {
      await fsPromises.unlink(path.join(runDir, file));
    }

    // Remove the directory if empty
    await fsPromises.rmdir(runDir);

    return jsonFiles.length;
  }

  /**
   * Get total storage size for run history
   *
   * @returns {Promise<Object>} Storage stats
   */
  async getStorageStats() {
    let totalSize = 0;
    let totalFiles = 0;

    const agentDirs = await fsPromises.readdir(this.dataDir);

    for (const agentId of agentDirs) {
      const runDir = path.join(this.dataDir, agentId);
      const stat = await fsPromises.stat(runDir);

      if (!stat.isDirectory()) {
        continue;
      }

      const files = await fsPromises.readdir(runDir);

      for (const file of files) {
        if (!file.endsWith('.json')) {
          continue;
        }

        const filePath = path.join(runDir, file);
        const fileStat = await fsPromises.stat(filePath);
        totalSize += fileStat.size;
        totalFiles++;
      }
    }

    return {
      totalSize,
      totalFiles,
      totalSizeMB: (totalSize / 1024 / 1024).toFixed(2)
    };
  }
}

export default AgentRunHistory;
