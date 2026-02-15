/**
 * CostTracker — Per-session and per-provider cost estimation.
 *
 * Tracks token usage and calculates estimated costs based on
 * Claude API pricing. Also tracks multi-modal provider costs
 * (image gen, TTS, etc.) when reported by provider adapters.
 *
 * Usage:
 *   const tracker = new CostTracker();
 *   tracker.recordTokenUsage(sessionId, usage);
 *   tracker.recordProviderCost(sessionId, { provider: 'openai', capability: 'image-gen', cost: 0.04 });
 *   const summary = tracker.getSessionCost(sessionId);
 */

// Claude API pricing (USD per million tokens) — updated Feb 2026
const CLAUDE_PRICING = {
  'claude-sonnet-4-5-20250929': { input: 3.00, output: 15.00, cacheWrite: 3.75, cacheRead: 0.30 },
  'claude-opus-4-6': { input: 15.00, output: 75.00, cacheWrite: 18.75, cacheRead: 1.50 },
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4.00, cacheWrite: 1.00, cacheRead: 0.08 },
  // Fallback for unknown models
  default: { input: 3.00, output: 15.00, cacheWrite: 3.75, cacheRead: 0.30 },
};

export class CostTracker {
  constructor() {
    // sessionId → { tokens, providerCosts, totalEstimatedCost }
    this._sessions = new Map();
  }

  _ensureSession(sessionId) {
    if (!this._sessions.has(sessionId)) {
      this._sessions.set(sessionId, {
        tokens: {
          input: 0,
          output: 0,
          cacheCreation: 0,
          cacheRead: 0,
        },
        claudeCost: 0,
        providerCosts: [],
        totalProviderCost: 0,
      });
    }
    return this._sessions.get(sessionId);
  }

  /**
   * Record Claude API token usage for a session.
   * @param {string} sessionId
   * @param {Object} usage - { input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens }
   * @param {string} [model] - Model ID for pricing lookup
   */
  recordTokenUsage(sessionId, usage, model) {
    const session = this._ensureSession(sessionId);

    const inputTokens = (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0);
    const outputTokens = usage.output_tokens || 0;
    const cacheCreation = (usage.cache_creation_input_tokens || 0) + (usage.cache_creation_output_tokens || 0);
    const cacheRead = usage.cache_read_input_tokens || 0;

    session.tokens.input += inputTokens;
    session.tokens.output += outputTokens;
    session.tokens.cacheCreation += cacheCreation;
    session.tokens.cacheRead += cacheRead;

    // Calculate cost
    const pricing = CLAUDE_PRICING[model] || CLAUDE_PRICING.default;
    const cost =
      ((usage.input_tokens || 0) / 1_000_000) * pricing.input +
      (outputTokens / 1_000_000) * pricing.output +
      ((usage.cache_creation_input_tokens || 0) / 1_000_000) * pricing.cacheWrite +
      ((usage.cache_read_input_tokens || 0) / 1_000_000) * pricing.cacheRead;

    session.claudeCost += cost;
  }

  /**
   * Record a cost from a multi-modal provider (image gen, TTS, etc.).
   * @param {string} sessionId
   * @param {Object} entry - { provider, capability, model, cost, metadata }
   */
  recordProviderCost(sessionId, entry) {
    const session = this._ensureSession(sessionId);
    session.providerCosts.push({
      ...entry,
      timestamp: new Date().toISOString(),
    });
    session.totalProviderCost += entry.cost || 0;
  }

  /**
   * Get cost summary for a session.
   * @param {string} sessionId
   * @returns {{ tokens, claudeCost, providerCosts, totalProviderCost, totalCost }}
   */
  getSessionCost(sessionId) {
    const session = this._sessions.get(sessionId);
    if (!session) {
      return {
        tokens: { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 },
        claudeCost: 0,
        providerCosts: [],
        totalProviderCost: 0,
        totalCost: 0,
      };
    }
    return {
      ...session,
      totalCost: session.claudeCost + session.totalProviderCost,
    };
  }

  /**
   * Get aggregate cost across all sessions.
   * @returns {{ totalTokens, totalClaudeCost, totalProviderCost, totalCost, sessionCount }}
   */
  getAggregateCost() {
    let totalTokens = { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 };
    let totalClaudeCost = 0;
    let totalProviderCost = 0;

    for (const session of this._sessions.values()) {
      totalTokens.input += session.tokens.input;
      totalTokens.output += session.tokens.output;
      totalTokens.cacheCreation += session.tokens.cacheCreation;
      totalTokens.cacheRead += session.tokens.cacheRead;
      totalClaudeCost += session.claudeCost;
      totalProviderCost += session.totalProviderCost;
    }

    return {
      totalTokens,
      totalClaudeCost,
      totalProviderCost,
      totalCost: totalClaudeCost + totalProviderCost,
      sessionCount: this._sessions.size,
    };
  }

  /**
   * Format cost as human-readable string.
   */
  static formatCost(cost) {
    if (cost < 0.01) return `$${(cost * 100).toFixed(2)}c`;
    return `$${cost.toFixed(4)}`;
  }

  /**
   * Clear tracking for a session.
   */
  clearSession(sessionId) {
    this._sessions.delete(sessionId);
  }
}

export default new CostTracker();
