import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SubAgentRunner } from '../src/runtime/SubAgentRunner.js';

describe('SubAgentRunner', () => {
  describe('constructor', () => {
    it('sets defaults', () => {
      const runner = new SubAgentRunner({
        workspacePath: '/tmp/ws',
        mcpServers: { fs: { command: 'node' } },
      });
      assert.equal(runner.workspacePath, '/tmp/ws');
      assert.ok(runner.mcpServers.fs);
      assert.equal(runner.model, 'claude-sonnet-4-5'); // default
      assert.equal(runner.timeoutMs, 120_000);
    });

    it('accepts custom model and timeout', () => {
      const runner = new SubAgentRunner({
        workspacePath: '/tmp',
        mcpServers: {},
        model: 'claude-haiku-4-5-20251001',
        timeoutMs: 30_000,
      });
      assert.equal(runner.model, 'claude-haiku-4-5-20251001');
      assert.equal(runner.timeoutMs, 30_000);
    });
  });

  describe('run', () => {
    it('requires tasks array', async () => {
      const runner = new SubAgentRunner({ workspacePath: '/tmp', mcpServers: {} });
      // run with empty array should return empty
      const results = await runner.run([]);
      assert.deepEqual(results, []);
    });
  });
});
