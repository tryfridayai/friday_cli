import cron from 'node-cron';
import parser from 'cron-parser';

/**
 * AgentScheduler
 *
 * Manages cron-based scheduling for scheduled agents.
 * Loads all active agents on startup and registers cron jobs.
 * Supports schedule/unschedule/reschedule operations.
 *
 * Uses node-cron for job scheduling and cron-parser for validation/calculation.
 */
class AgentScheduler {
  constructor(agentStore, agentExecutor, emitEvent = null) {
    this.agentStore = agentStore;
    this.agentExecutor = agentExecutor;
    this.emitEvent = typeof emitEvent === 'function' ? emitEvent : null;

    // Map of agentId -> CronJob
    this.scheduledJobs = new Map();

    // Track currently executing agents (prevent concurrent runs)
    this.runningAgents = new Set();

    // Track recent execution timestamps per agent for rate limiting
    // Map of agentId -> Date[] (timestamps of runs in the last hour)
    this.recentRuns = new Map();
  }

  /**
   * Initialize scheduler
   *
   * Loads all active agents and schedules them.
   * Also runs catch-up for any missed runs while the app was closed.
   * Called on server startup.
   */
  async initialize() {
    console.error('[AgentScheduler] Initializing scheduler...');

    try {
      // Load all active agents across all users
      const agents = await this.agentStore.getAllActiveAgents();

      console.error(`[AgentScheduler] Found ${agents.length} active agents`);

      const missedAgents = [];

      for (const agent of agents) {
        try {
          this.scheduleAgent(agent);
          console.error(`[AgentScheduler] ✓ Scheduled: ${agent.name} (${agent.schedule.humanReadable})`);

          // Check for missed runs (agent should have run but didn't)
          if (agent.nextRunAt && agent.lastRunAt) {
            const nextRunTime = new Date(agent.nextRunAt);
            const now = new Date();

            // If nextRunAt is in the past, we missed a run
            if (nextRunTime < now) {
              missedAgents.push(agent);
            }
          }
        } catch (error) {
          console.error(`[AgentScheduler] ✗ Failed to schedule ${agent.name}:`, error.message);
        }
      }

      console.error(`[AgentScheduler] Scheduler initialized with ${this.scheduledJobs.size} jobs`);

      // Run catch-up for missed agents (async, don't block startup)
      if (missedAgents.length > 0) {
        console.error(`[AgentScheduler] Found ${missedAgents.length} agents with missed runs, starting catch-up...`);
        this.runCatchUp(missedAgents);
      }
    } catch (error) {
      console.error('[AgentScheduler] Failed to initialize:', error.message);
      throw error;
    }
  }

  /**
   * Run catch-up for missed agents
   * Executes agents that missed their scheduled runs while the app was closed
   *
   * @param {Array} missedAgents - Agents that missed runs
   */
  async runCatchUp(missedAgents) {
    console.error(`[AgentScheduler] Running catch-up for ${missedAgents.length} agents`);

    for (const agent of missedAgents) {
      try {
        // Calculate how many runs were missed
        const lastRun = new Date(agent.lastRunAt);
        const now = new Date();
        const missedTime = now - lastRun;
        const missedHours = Math.round(missedTime / (1000 * 60 * 60));

        console.error(`[AgentScheduler] Catch-up: ${agent.name} (missed ~${missedHours} hours)`);

        // Only run once for catch-up, regardless of how many runs were missed
        // This prevents flooding after a long absence
        await this.executeAgent(agent.id, { trigger: 'catchup' });

        console.error(`[AgentScheduler] ✓ Catch-up complete: ${agent.name}`);
      } catch (error) {
        console.error(`[AgentScheduler] ✗ Catch-up failed for ${agent.name}:`, error.message);
      }

      // Small delay between catch-up runs to avoid overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.error('[AgentScheduler] Catch-up complete');
  }

  /**
   * Validate a cron expression
   *
   * @param {string} cronExpr - Cron expression
   * @returns {Object} { valid: boolean, error?: string, nextRun?: Date }
   */
  validateCron(cronExpr) {
    try {
      // Try to parse the cron expression
      const interval = parser.parseExpression(cronExpr);
      const nextRun = interval.next().toDate();

      return {
        valid: true,
        nextRun
      };
    } catch (err) {
      return {
        valid: false,
        error: err.message || 'Invalid cron expression'
      };
    }
  }

  /**
   * Calculate next run time for a cron expression
   *
   * @param {string} cronExpr - Cron expression
   * @param {string} timezone - Timezone (default UTC)
   * @returns {Date|null} Next run time or null if invalid
   */
  getNextRunTime(cronExpr, timezone = 'UTC') {
    try {
      const interval = parser.parseExpression(cronExpr, {
        currentDate: new Date(),
        tz: timezone
      });
      return interval.next().toDate();
    } catch (err) {
      console.error(`[AgentScheduler] Failed to calculate next run for "${cronExpr}":`, err.message);
      return null;
    }
  }

  /**
   * Check if agent has exceeded its max runs per hour.
   * Returns a skip reason or null if the agent can run.
   */
  shouldSkipExecution(agent) {
    const maxPerHour = agent.maxRunsPerHour ?? 5;
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    // Get recent timestamps, filter to last hour
    const timestamps = (this.recentRuns.get(agent.id) || []).filter(t => t > oneHourAgo);
    this.recentRuns.set(agent.id, timestamps);

    if (timestamps.length >= maxPerHour) {
      return {
        type: 'rate_limit',
        detail: `Skipped: ${timestamps.length}/${maxPerHour} runs in the last hour`
      };
    }

    return null;
  }

  /**
   * Record that an agent ran (for rate limiting)
   */
  recordRun(agentId) {
    const timestamps = this.recentRuns.get(agentId) || [];
    timestamps.push(Date.now());
    this.recentRuns.set(agentId, timestamps);
  }

  /**
   * Schedule an agent
   *
   * Creates a cron job and registers it in the jobs map.
   *
   * @param {Object} agent - Agent definition
   */
  scheduleAgent(agent) {
    if (agent.status !== 'active') {
      console.error(`[AgentScheduler] Skipping non-active agent: ${agent.name} (${agent.status})`);
      return;
    }

    // Validate cron expression
    const validation = this.validateCron(agent.schedule.cron);
    if (!validation.valid) {
      throw new Error(`Invalid cron expression: ${validation.error}`);
    }

    // Unschedule if already scheduled
    if (this.scheduledJobs.has(agent.id)) {
      this.unscheduleAgent(agent.id);
    }

    // Create cron job
    const job = cron.schedule(
      agent.schedule.cron,
      async () => {
        await this.executeAgent(agent.id, { trigger: 'cron' });
      },
      {
        scheduled: true,
        timezone: agent.schedule.timezone || 'UTC'
      }
    );

    // Store in map
    this.scheduledJobs.set(agent.id, job);

    console.error(`[AgentScheduler] ✓ Scheduled: ${agent.name} (${agent.id}) with cron "${agent.schedule.cron}" tz=${agent.schedule.timezone || 'UTC'}`);

    // Calculate and update next run time
    const nextRun = this.getNextRunTime(agent.schedule.cron, agent.schedule.timezone);
    if (nextRun) {
      this.agentStore.updateStats(agent.id, {
        nextRunAt: nextRun.toISOString()
      }).catch(err => {
        console.error(`[AgentScheduler] Failed to update nextRunAt for ${agent.id}:`, err.message);
      });
    }
  }

  /**
   * Unschedule an agent
   *
   * Stops the cron job and removes it from the map.
   *
   * @param {string} agentId - Agent ID
   */
  unscheduleAgent(agentId) {
    const job = this.scheduledJobs.get(agentId);
    if (job) {
      job.stop();
      this.scheduledJobs.delete(agentId);
      console.error(`[AgentScheduler] Unscheduled agent: ${agentId}`);
    }
  }

  /**
   * Reschedule an agent
   *
   * Unschedules the old job and creates a new one with updated schedule.
   *
   * @param {Object} agent - Updated agent definition
   */
  rescheduleAgent(agent) {
    this.unscheduleAgent(agent.id);
    this.scheduleAgent(agent);
    console.error(`[AgentScheduler] Rescheduled agent: ${agent.name}`);
  }

  /**
   * Execute an agent (called by cron job)
   *
   * @param {string} agentId - Agent ID
   */
  async executeAgent(agentId, context = {}) {
    // Prevent concurrent execution of the same agent
    if (this.runningAgents.has(agentId)) {
      console.error(`[AgentScheduler] Agent ${agentId} is already running, skipping this execution`);
      return;
    }

    this.runningAgents.add(agentId);

    try {
      // Load fresh agent data
      const agent = await this.agentStore.getAgentById(agentId);

      if (!agent) {
        console.error(`[AgentScheduler] Agent not found: ${agentId}`);
        return;
      }

      if (agent.status !== 'active') {
        console.error(`[AgentScheduler] Agent ${agent.name} is not active (${agent.status}), skipping execution`);
        return;
      }

      console.error(`[AgentScheduler] 🚀 Executing agent: ${agent.name}`);

      const skipInfo = context.trigger === 'manual' ? null : this.shouldSkipExecution(agent);
      if (skipInfo) {
        console.error(`[AgentScheduler] ⏭ ${agent.name}: ${skipInfo.detail}`);
        return { success: false, skipped: true };
      }

      // Record this run for rate limiting
      this.recordRun(agentId);

      // Execute with retry logic
      const result = await this.agentExecutor.executeWithRetry(agent, 3, {
        onRunStart: (run) => {
          if (this.emitEvent) {
            this.emitEvent({
              type: 'scheduled_agent:run_started',
              agentId: agent.id,
              runId: run.id,
              startedAt: run.startedAt,
              trigger: context.trigger || 'cron'
            });
          }
        },
        onRunComplete: ({ run, success, error }) => {
          if (this.emitEvent) {
            this.emitEvent({
              type: 'scheduled_agent:run_completed',
              agentId: agent.id,
              runId: run.id,
              status: run.status,
              completedAt: run.completedAt,
              outcome: run.outcome,
              error: error ? { message: error.message } : null
            });
          }
        }
      });

      if (result.success) {
        console.error(`[AgentScheduler] ✓ Agent ${agent.name} executed successfully`);
      } else {
        console.error(`[AgentScheduler] ✗ Agent ${agent.name} failed:`, result.error?.message);
      }

      // Update next run time
      const nextRun = this.getNextRunTime(agent.schedule.cron, agent.schedule.timezone);
      if (nextRun) {
        await this.agentStore.updateStats(agentId, {
          nextRunAt: nextRun.toISOString()
        });
      }

      return result;
    } catch (error) {
      console.error(`[AgentScheduler] Error executing agent ${agentId}:`, error.message);
      return { success: false, error };
    } finally {
      this.runningAgents.delete(agentId);
    }
  }

  /**
   * Manually trigger an agent execution (for testing)
   *
   * @param {string} agentId - Agent ID
   * @returns {Promise<Object>} Execution result
   */
  async triggerAgent(agentId) {
    const agent = await this.agentStore.getAgentById(agentId);

    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    console.error(`[AgentScheduler] Manually triggering agent: ${agent.name}`);

    return await this.executeAgent(agentId, { trigger: 'manual' });
  }

  /**
   * Get all scheduled jobs info
   *
   * @returns {Array} Array of { agentId, scheduled: boolean }
   */
  getScheduledJobs() {
    const jobs = [];

    for (const [agentId, job] of this.scheduledJobs) {
      jobs.push({
        agentId,
        scheduled: true,
        running: this.runningAgents.has(agentId)
      });
    }

    return jobs;
  }

  /**
   * Check if an agent is scheduled
   *
   * @param {string} agentId - Agent ID
   * @returns {boolean}
   */
  isScheduled(agentId) {
    return this.scheduledJobs.has(agentId);
  }

  /**
   * Get scheduler status
   *
   * @returns {Object} Status info
   */
  getStatus() {
    return {
      totalJobs: this.scheduledJobs.size,
      runningJobs: this.runningAgents.size,
      jobs: this.getScheduledJobs()
    };
  }

  /**
   * Shutdown scheduler
   *
   * Stops all cron jobs. Called on server shutdown.
   */
  shutdown() {
    console.error('[AgentScheduler] Shutting down scheduler...');

    for (const [agentId, job] of this.scheduledJobs) {
      job.stop();
    }

    this.scheduledJobs.clear();

    console.error('[AgentScheduler] Scheduler shutdown complete');
  }
}

export default AgentScheduler;
