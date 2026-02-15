/**
 * TriggerRouter — Route events to agents.
 *
 * Central dispatcher that receives events from various trigger sources
 * (webhooks, file watches, chain triggers, manual API calls) and routes
 * them to the appropriate agent for execution.
 *
 * Trigger types:
 *   - webhook:    HTTP POST to runtime → agent execution
 *   - file_watch: Filesystem change → agent execution
 *   - chain:      Agent A completes → Agent B starts
 *   - manual:     API call → agent execution
 *   - cron:       Handled by AgentScheduler (existing system)
 */

import EventEmitter from 'events';

export class TriggerRouter extends EventEmitter {
  /**
   * @param {Object} options
   * @param {Object} options.agentExecutor - AgentExecutor instance
   * @param {Object} options.agentStore - ScheduledAgentStore instance
   */
  constructor(options = {}) {
    super();
    this.agentExecutor = options.agentExecutor;
    this.agentStore = options.agentStore;
    this._triggers = new Map(); // triggerId → trigger config
    this._chainListeners = new Map(); // sourceAgentId → [targetTrigger]
  }

  /**
   * Register a trigger.
   * @param {Object} trigger - Trigger configuration
   * @param {string} trigger.id - Unique trigger ID
   * @param {string} trigger.type - webhook | file_watch | chain | manual
   * @param {string} trigger.agentId - Agent to execute when triggered
   * @param {Object} [trigger.config] - Type-specific configuration
   */
  register(trigger) {
    if (!trigger.id || !trigger.type || !trigger.agentId) {
      throw new Error('Trigger requires id, type, and agentId');
    }

    this._triggers.set(trigger.id, trigger);

    // Set up chain listeners
    if (trigger.type === 'chain' && trigger.config?.sourceAgentId) {
      const sourceId = trigger.config.sourceAgentId;
      if (!this._chainListeners.has(sourceId)) {
        this._chainListeners.set(sourceId, []);
      }
      this._chainListeners.get(sourceId).push(trigger);
    }

    this.emit('trigger:registered', trigger);
  }

  /**
   * Remove a trigger.
   */
  unregister(triggerId) {
    const trigger = this._triggers.get(triggerId);
    if (!trigger) return;

    // Clean up chain listeners
    if (trigger.type === 'chain' && trigger.config?.sourceAgentId) {
      const sourceId = trigger.config.sourceAgentId;
      const listeners = this._chainListeners.get(sourceId);
      if (listeners) {
        const filtered = listeners.filter(t => t.id !== triggerId);
        if (filtered.length > 0) {
          this._chainListeners.set(sourceId, filtered);
        } else {
          this._chainListeners.delete(sourceId);
        }
      }
    }

    this._triggers.delete(triggerId);
    this.emit('trigger:unregistered', triggerId);
  }

  /**
   * Fire a trigger by ID with optional event data.
   * This executes the associated agent.
   *
   * @param {string} triggerId - Trigger to fire
   * @param {Object} [eventData] - Event payload to pass to the agent
   * @returns {Promise<Object>} - Execution result
   */
  async fire(triggerId, eventData = {}) {
    const trigger = this._triggers.get(triggerId);
    if (!trigger) {
      throw new Error(`Unknown trigger: ${triggerId}`);
    }

    this.emit('trigger:firing', { triggerId, eventData });

    try {
      const result = await this._executeAgent(trigger, eventData);
      this.emit('trigger:complete', { triggerId, result });

      // Check for chain triggers
      await this._fireChainTriggers(trigger.agentId, result);

      return result;
    } catch (error) {
      this.emit('trigger:error', { triggerId, error });
      throw error;
    }
  }

  /**
   * Notify that an agent has completed execution.
   * Checks for chain triggers and fires them.
   *
   * @param {string} agentId - The agent that completed
   * @param {Object} result - Execution result
   */
  async notifyAgentComplete(agentId, result) {
    await this._fireChainTriggers(agentId, result);
  }

  /**
   * Handle incoming webhook event.
   * Finds triggers that match the source/event and fires them.
   *
   * @param {string} source - Webhook source (e.g. 'github')
   * @param {string} event - Event type (e.g. 'pull_request.opened')
   * @param {Object} payload - Event payload
   */
  async handleWebhook(source, event, payload) {
    const matching = [];
    for (const trigger of this._triggers.values()) {
      if (trigger.type !== 'webhook') continue;
      if (trigger.config?.source === source && trigger.config?.event === event) {
        matching.push(trigger);
      }
    }

    const results = [];
    for (const trigger of matching) {
      try {
        const result = await this.fire(trigger.id, { source, event, payload });
        results.push({ triggerId: trigger.id, result });
      } catch (error) {
        results.push({ triggerId: trigger.id, error: error.message });
      }
    }
    return results;
  }

  /**
   * List all registered triggers.
   */
  listTriggers() {
    return [...this._triggers.values()];
  }

  /**
   * Get triggers for a specific agent.
   */
  getTriggersForAgent(agentId) {
    return [...this._triggers.values()].filter(t => t.agentId === agentId);
  }

  // ── Internal ──────────────────────────────────────────────────────────

  async _executeAgent(trigger, eventData) {
    if (!this.agentExecutor) {
      throw new Error('No agentExecutor configured');
    }

    // Build context from event data
    const contextPrefix = eventData && Object.keys(eventData).length > 0
      ? `\n\nTrigger event data:\n${JSON.stringify(eventData, null, 2)}\n\n`
      : '';

    return this.agentExecutor.executeAgent(trigger.agentId, {
      additionalContext: contextPrefix,
    });
  }

  async _fireChainTriggers(agentId, result) {
    const chainTriggers = this._chainListeners.get(agentId);
    if (!chainTriggers || chainTriggers.length === 0) return;

    for (const trigger of chainTriggers) {
      try {
        await this.fire(trigger.id, {
          chainSource: agentId,
          previousResult: result,
        });
      } catch (error) {
        this.emit('trigger:chain-error', {
          sourceAgentId: agentId,
          targetTriggerId: trigger.id,
          error,
        });
      }
    }
  }
}

export default TriggerRouter;
