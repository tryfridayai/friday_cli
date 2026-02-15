import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { CostTracker } from '../src/providers/CostTracker.js';

describe('CostTracker', () => {
  let tracker;

  beforeEach(() => {
    tracker = new CostTracker();
  });

  describe('recordTokenUsage', () => {
    it('tracks input and output tokens', () => {
      tracker.recordTokenUsage('s1', {
        input_tokens: 1000,
        output_tokens: 500,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      }, 'claude-sonnet-4-5-20250929');

      const cost = tracker.getSessionCost('s1');
      assert.equal(cost.tokens.input, 1000);
      assert.equal(cost.tokens.output, 500);
    });

    it('accumulates tokens across calls', () => {
      const usage = { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
      tracker.recordTokenUsage('s1', usage, 'claude-sonnet-4-5-20250929');
      tracker.recordTokenUsage('s1', usage, 'claude-sonnet-4-5-20250929');

      const cost = tracker.getSessionCost('s1');
      assert.equal(cost.tokens.input, 200);
      assert.equal(cost.tokens.output, 100);
    });

    it('calculates cost using Sonnet pricing', () => {
      tracker.recordTokenUsage('s1', {
        input_tokens: 1_000_000,
        output_tokens: 1_000_000,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      }, 'claude-sonnet-4-5-20250929');

      const cost = tracker.getSessionCost('s1');
      // Sonnet: $3/M input + $15/M output = $18
      assert.equal(cost.claudeCost, 18);
    });

    it('calculates cost using Opus pricing', () => {
      tracker.recordTokenUsage('s1', {
        input_tokens: 1_000_000,
        output_tokens: 1_000_000,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      }, 'claude-opus-4-6');

      const cost = tracker.getSessionCost('s1');
      // Opus: $15/M input + $75/M output = $90
      assert.equal(cost.claudeCost, 90);
    });

    it('falls back to default pricing for unknown models', () => {
      tracker.recordTokenUsage('s1', {
        input_tokens: 1_000_000,
        output_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      }, 'claude-unknown-model');

      const cost = tracker.getSessionCost('s1');
      assert.equal(cost.claudeCost, 3); // default = Sonnet pricing
    });

    it('tracks cache tokens', () => {
      tracker.recordTokenUsage('s1', {
        input_tokens: 500,
        output_tokens: 200,
        cache_creation_input_tokens: 100,
        cache_read_input_tokens: 50,
      }, 'claude-sonnet-4-5-20250929');

      const cost = tracker.getSessionCost('s1');
      assert.equal(cost.tokens.cacheCreation, 100);
      assert.equal(cost.tokens.cacheRead, 50);
    });
  });

  describe('recordProviderCost', () => {
    it('tracks provider costs', () => {
      tracker.recordProviderCost('s1', {
        provider: 'openai',
        capability: 'image-gen',
        cost: 0.04,
      });

      const cost = tracker.getSessionCost('s1');
      assert.equal(cost.totalProviderCost, 0.04);
      assert.equal(cost.providerCosts.length, 1);
      assert.equal(cost.providerCosts[0].provider, 'openai');
    });

    it('accumulates multiple provider costs', () => {
      tracker.recordProviderCost('s1', { provider: 'openai', capability: 'image-gen', cost: 0.04 });
      tracker.recordProviderCost('s1', { provider: 'elevenlabs', capability: 'tts', cost: 0.10 });

      const cost = tracker.getSessionCost('s1');
      assert.ok(Math.abs(cost.totalProviderCost - 0.14) < 0.001);
      assert.equal(cost.providerCosts.length, 2);
    });
  });

  describe('getSessionCost', () => {
    it('returns zeros for unknown session', () => {
      const cost = tracker.getSessionCost('nonexistent');
      assert.equal(cost.tokens.input, 0);
      assert.equal(cost.totalCost, 0);
    });

    it('combines Claude and provider costs in totalCost', () => {
      tracker.recordTokenUsage('s1', {
        input_tokens: 1_000_000,
        output_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      }, 'claude-sonnet-4-5-20250929');
      tracker.recordProviderCost('s1', { provider: 'openai', capability: 'image-gen', cost: 1.00 });

      const cost = tracker.getSessionCost('s1');
      assert.equal(cost.totalCost, 4); // $3 Claude + $1 provider
    });
  });

  describe('getAggregateCost', () => {
    it('aggregates across sessions', () => {
      const usage = { input_tokens: 1000, output_tokens: 500, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
      tracker.recordTokenUsage('a', usage, 'claude-sonnet-4-5-20250929');
      tracker.recordTokenUsage('b', usage, 'claude-sonnet-4-5-20250929');

      const agg = tracker.getAggregateCost();
      assert.equal(agg.totalTokens.input, 2000);
      assert.equal(agg.totalTokens.output, 1000);
      assert.equal(agg.sessionCount, 2);
    });
  });

  describe('clearSession', () => {
    it('removes session data', () => {
      tracker.recordTokenUsage('s1', { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }, 'claude-sonnet-4-5-20250929');
      tracker.clearSession('s1');

      const cost = tracker.getSessionCost('s1');
      assert.equal(cost.tokens.input, 0);
    });
  });

  describe('formatCost', () => {
    it('formats small costs in cents', () => {
      assert.match(CostTracker.formatCost(0.005), /c$/);
    });

    it('formats larger costs in dollars', () => {
      assert.match(CostTracker.formatCost(1.5), /^\$/);
    });
  });
});
