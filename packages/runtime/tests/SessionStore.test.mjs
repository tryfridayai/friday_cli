import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SessionStore } from '../src/sessions/SessionStore.js';

describe('SessionStore', () => {
  let store;
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'friday-session-test-'));
    store = new SessionStore({ basePath: tmpDir });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('ensureSession', () => {
    it('creates a new session', async () => {
      const metadata = await store.ensureSession('test-123', {
        title: 'Test Session',
        workspacePath: '/tmp/ws',
      });
      assert.equal(metadata.id, 'test-123');
      assert.equal(metadata.title, 'Test Session');
      assert.equal(metadata.workspacePath, '/tmp/ws');
    });

    it('returns null for empty sessionId', async () => {
      const result = await store.ensureSession('');
      assert.equal(result, null);
    });

    it('returns existing session on second call', async () => {
      await store.ensureSession('test-123', { title: 'First' });
      const second = await store.ensureSession('test-123', { title: 'Second' });
      assert.equal(second.title, 'First'); // title doesn't change
    });

    it('creates session directory on disk', async () => {
      await store.ensureSession('test-abc');
      assert.ok(fs.existsSync(path.join(tmpDir, 'test-abc')));
    });
  });

  describe('defaultTitle', () => {
    it('generates title from first message', () => {
      const title = store.defaultTitle('abc123', 'Hello, can you help me?');
      assert.equal(title, 'Hello, can you help me?');
    });

    it('truncates long messages', () => {
      const longMsg = 'A'.repeat(100);
      const title = store.defaultTitle('abc', longMsg);
      assert.ok(title.length <= 60);
      assert.ok(title.endsWith('...'));
    });

    it('falls back to session ID', () => {
      const title = store.defaultTitle('abc12345-long-id');
      assert.equal(title, 'Session abc12345');
    });
  });

  describe('appendEvent', () => {
    it('writes event to log file', async () => {
      await store.ensureSession('s1');
      await store.appendEvent('s1', {
        direction: 'outbound',
        payload: { type: 'query', message: 'hello' },
      });

      const logPath = store.getLogPath('s1');
      assert.ok(fs.existsSync(logPath));
      const content = fs.readFileSync(logPath, 'utf8');
      assert.ok(content.includes('"hello"'));
    });

    it('increments messageCount for query events', async () => {
      await store.ensureSession('s1');
      await store.appendEvent('s1', { direction: 'outbound', payload: { type: 'query', message: 'hi' } });
      await store.appendEvent('s1', { direction: 'outbound', payload: { type: 'query', message: 'hello' } });

      const metadata = store.metadataCache.get('s1');
      assert.equal(metadata.messageCount, 2);
    });
  });

  describe('updateUsage', () => {
    it('accumulates token usage', async () => {
      await store.ensureSession('s1');
      await store.updateUsage('s1', { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 });
      await store.updateUsage('s1', { input_tokens: 200, output_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 });

      const metadata = store.metadataCache.get('s1');
      assert.equal(metadata.totalTokens.input, 300);
      assert.equal(metadata.totalTokens.output, 150);
    });
  });

  describe('listSessions', () => {
    it('lists all sessions sorted by update time', async () => {
      await store.ensureSession('s1', { title: 'First' });
      await store.ensureSession('s2', { title: 'Second' });

      const sessions = await store.listSessions();
      assert.equal(sessions.length, 2);
    });

    it('respects limit parameter', async () => {
      await store.ensureSession('s1');
      await store.ensureSession('s2');
      await store.ensureSession('s3');

      const sessions = await store.listSessions(2);
      assert.equal(sessions.length, 2);
    });
  });

  describe('deleteSession', () => {
    it('removes session from disk and cache', async () => {
      await store.ensureSession('s1');
      await store.deleteSession('s1');

      assert.ok(!fs.existsSync(path.join(tmpDir, 's1')));
      assert.equal(store.metadataCache.has('s1'), false);
    });
  });

  describe('getSessionEvents', () => {
    it('returns events from log file', async () => {
      await store.ensureSession('s1');
      await store.appendEvent('s1', { direction: 'out', payload: { type: 'query', message: 'hello' } });
      await store.appendEvent('s1', { direction: 'in', payload: { type: 'response', text: 'world' } });

      const events = await store.getSessionEvents('s1');
      assert.equal(events.length, 2);
    });

    it('returns empty for session without events', async () => {
      await store.ensureSession('s1');
      const events = await store.getSessionEvents('s1');
      assert.deepEqual(events, []);
    });
  });

  describe('screen context', () => {
    it('updates and retrieves screen context', async () => {
      await store.ensureSession('s1');
      await store.updateScreenContext('s1', 'User is on a login page');

      const ctx = await store.getScreenContext('s1');
      assert.equal(ctx.context, 'User is on a login page');
      assert.equal(ctx.hasUsedScreenShare, true);
    });

    it('clears screen context', async () => {
      await store.ensureSession('s1');
      await store.updateScreenContext('s1', 'something');
      await store.clearScreenContext('s1');

      const ctx = await store.getScreenContext('s1');
      assert.equal(ctx.context, null);
      assert.equal(ctx.hasUsedScreenShare, true); // preserved
    });
  });

  describe('active internal skills', () => {
    it('sets and gets active skills', async () => {
      await store.ensureSession('s1');
      await store.setActiveInternalSkills('s1', ['skill-a', 'skill-b']);

      const skills = await store.getActiveInternalSkills('s1');
      assert.deepEqual(skills, ['skill-a', 'skill-b']);
    });

    it('enforces max 2 skills', async () => {
      await store.ensureSession('s1');
      await store.setActiveInternalSkills('s1', ['a', 'b', 'c', 'd']);

      const skills = await store.getActiveInternalSkills('s1');
      assert.equal(skills.length, 2);
    });

    it('clears active skills', async () => {
      await store.ensureSession('s1');
      await store.setActiveInternalSkills('s1', ['a']);
      await store.clearActiveInternalSkills('s1');

      const skills = await store.getActiveInternalSkills('s1');
      assert.deepEqual(skills, []);
    });
  });
});
