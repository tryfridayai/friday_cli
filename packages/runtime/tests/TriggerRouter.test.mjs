import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { TriggerRouter } from '../src/scheduler/TriggerRouter.js';

describe('TriggerRouter', () => {
  let router;

  beforeEach(() => {
    router = new TriggerRouter();
  });

  describe('register', () => {
    it('registers a trigger', () => {
      router.register({ id: 't1', type: 'manual', agentId: 'agent-1' });
      assert.equal(router.listTriggers().length, 1);
    });

    it('throws for missing required fields', () => {
      assert.throws(() => router.register({ id: 't1' }), /requires id, type, and agentId/);
      assert.throws(() => router.register({ type: 'manual' }), /requires id, type, and agentId/);
    });

    it('sets up chain listeners', () => {
      router.register({
        id: 'chain-1',
        type: 'chain',
        agentId: 'agent-b',
        config: { sourceAgentId: 'agent-a' },
      });
      assert.equal(router._chainListeners.size, 1);
      assert.ok(router._chainListeners.has('agent-a'));
    });

    it('emits trigger:registered event', (t, done) => {
      router.on('trigger:registered', (trigger) => {
        assert.equal(trigger.id, 't1');
        done();
      });
      router.register({ id: 't1', type: 'manual', agentId: 'a1' });
    });
  });

  describe('unregister', () => {
    it('removes a trigger', () => {
      router.register({ id: 't1', type: 'manual', agentId: 'a1' });
      router.unregister('t1');
      assert.equal(router.listTriggers().length, 0);
    });

    it('cleans up chain listeners', () => {
      router.register({
        id: 'chain-1',
        type: 'chain',
        agentId: 'agent-b',
        config: { sourceAgentId: 'agent-a' },
      });
      router.unregister('chain-1');
      assert.equal(router._chainListeners.has('agent-a'), false);
    });

    it('does nothing for nonexistent trigger', () => {
      router.unregister('nonexistent'); // should not throw
    });

    it('emits trigger:unregistered event', (t, done) => {
      router.register({ id: 't1', type: 'manual', agentId: 'a1' });
      router.on('trigger:unregistered', (id) => {
        assert.equal(id, 't1');
        done();
      });
      router.unregister('t1');
    });
  });

  describe('fire', () => {
    it('throws for unknown trigger', async () => {
      await assert.rejects(() => router.fire('nonexistent'), /Unknown trigger/);
    });

    it('throws without agentExecutor', async () => {
      router.register({ id: 't1', type: 'manual', agentId: 'a1' });
      await assert.rejects(() => router.fire('t1'), /No agentExecutor configured/);
    });

    it('executes agent via agentExecutor', async () => {
      let executedWith = null;
      router.agentExecutor = {
        executeAgent: async (agentId, opts) => {
          executedWith = { agentId, opts };
          return { success: true };
        },
      };
      router.register({ id: 't1', type: 'manual', agentId: 'test-agent' });

      const result = await router.fire('t1', { key: 'value' });
      assert.ok(executedWith);
      assert.equal(executedWith.agentId, 'test-agent');
      assert.deepEqual(result, { success: true });
    });

    it('emits trigger:firing and trigger:complete', async () => {
      const events = [];
      router.agentExecutor = {
        executeAgent: async () => ({ ok: true }),
      };
      router.register({ id: 't1', type: 'manual', agentId: 'a1' });
      router.on('trigger:firing', (e) => events.push('firing'));
      router.on('trigger:complete', (e) => events.push('complete'));

      await router.fire('t1');
      assert.deepEqual(events, ['firing', 'complete']);
    });

    it('emits trigger:error on failure', async () => {
      let errorEvent = null;
      router.agentExecutor = {
        executeAgent: async () => { throw new Error('agent failed'); },
      };
      router.register({ id: 't1', type: 'manual', agentId: 'a1' });
      router.on('trigger:error', (e) => { errorEvent = e; });

      await assert.rejects(() => router.fire('t1'), /agent failed/);
      assert.ok(errorEvent);
    });
  });

  describe('handleWebhook', () => {
    it('fires matching webhook triggers', async () => {
      const fired = [];
      router.agentExecutor = {
        executeAgent: async (agentId) => {
          fired.push(agentId);
          return { ok: true };
        },
      };

      router.register({ id: 'wh1', type: 'webhook', agentId: 'a1', config: { source: 'github', event: 'push' } });
      router.register({ id: 'wh2', type: 'webhook', agentId: 'a2', config: { source: 'github', event: 'pull_request' } });
      router.register({ id: 'wh3', type: 'webhook', agentId: 'a3', config: { source: 'github', event: 'push' } });

      const results = await router.handleWebhook('github', 'push', { ref: 'main' });
      assert.equal(results.length, 2);
      assert.ok(fired.includes('a1'));
      assert.ok(fired.includes('a3'));
      assert.ok(!fired.includes('a2'));
    });

    it('returns empty for no matches', async () => {
      const results = await router.handleWebhook('github', 'push', {});
      assert.deepEqual(results, []);
    });
  });

  describe('chain triggers', () => {
    it('fires chain triggers when source agent completes', async () => {
      const fired = [];
      router.agentExecutor = {
        executeAgent: async (agentId) => {
          fired.push(agentId);
          return { ok: true };
        },
      };

      router.register({
        id: 'chain-1',
        type: 'chain',
        agentId: 'agent-b',
        config: { sourceAgentId: 'agent-a' },
      });

      await router.notifyAgentComplete('agent-a', { result: 'done' });
      assert.ok(fired.includes('agent-b'));
    });
  });

  describe('getTriggersForAgent', () => {
    it('returns triggers for a specific agent', () => {
      router.register({ id: 't1', type: 'manual', agentId: 'a1' });
      router.register({ id: 't2', type: 'manual', agentId: 'a2' });
      router.register({ id: 't3', type: 'webhook', agentId: 'a1', config: {} });

      const triggers = router.getTriggersForAgent('a1');
      assert.equal(triggers.length, 2);
    });
  });
});
