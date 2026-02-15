import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PermissionManager, PERMISSION } from '../src/permissions/PermissionManager.js';

describe('PermissionManager', () => {
  let pm;

  beforeEach(() => {
    pm = new PermissionManager();
    // Inject in-memory data to avoid touching filesystem
    pm._data = { profile: 'developer', overrides: {}, apps: {}, sessionApprovals: {} };
  });

  describe('profiles', () => {
    it('defaults to developer profile', () => {
      assert.equal(pm.getProfile(), 'developer');
    });

    it('can change profile', () => {
      pm.setProfile('safe');
      assert.equal(pm.getProfile(), 'safe');
    });

    it('rejects unknown profiles', () => {
      assert.throws(() => pm.setProfile('nonexistent'), /Unknown profile/);
    });
  });

  describe('check — developer profile', () => {
    it('auto-approves read_file', () => {
      const result = pm.check('mcp__filesystem__read_file');
      assert.equal(result.decision, PERMISSION.AUTO_APPROVE);
      assert.equal(result.source, 'profile');
    });

    it('auto-approves write_file in workspace', () => {
      const result = pm.check('mcp__filesystem__write_file', {
        filePath: '/home/user/workspace/foo.js',
        workspacePath: '/home/user/workspace',
      });
      assert.equal(result.decision, PERMISSION.AUTO_APPROVE);
      assert.equal(result.source, 'profile-in-workspace');
    });

    it('asks for write_file outside workspace', () => {
      const result = pm.check('mcp__filesystem__write_file', {
        filePath: '/etc/passwd',
        workspacePath: '/home/user/workspace',
      });
      assert.equal(result.decision, PERMISSION.ASK_FIRST);
      assert.equal(result.source, 'profile-outside-workspace');
    });

    it('asks for terminal commands', () => {
      const result = pm.check('mcp__terminal__execute_command');
      assert.equal(result.decision, PERMISSION.ASK_FIRST);
    });

    it('defaults to ask-first for unknown tools', () => {
      const result = pm.check('some_random_tool');
      assert.equal(result.decision, PERMISSION.ASK_FIRST);
      assert.equal(result.source, 'default');
    });
  });

  describe('check — safe profile', () => {
    beforeEach(() => {
      pm._data.profile = 'safe';
    });

    it('auto-approves reads', () => {
      const result = pm.check('mcp__filesystem__read_file');
      assert.equal(result.decision, PERMISSION.AUTO_APPROVE);
    });

    it('asks for writes', () => {
      const result = pm.check('mcp__filesystem__write_file');
      assert.equal(result.decision, PERMISSION.ASK_FIRST);
      assert.equal(result.source, 'default');
    });
  });

  describe('check — locked profile', () => {
    beforeEach(() => {
      pm._data.profile = 'locked';
    });

    it('asks for everything', () => {
      const result = pm.check('mcp__filesystem__read_file');
      assert.equal(result.decision, PERMISSION.ASK_FIRST);
      assert.equal(result.source, 'default');
    });
  });

  describe('always-safe tools', () => {
    it('auto-approves list_processes regardless of profile', () => {
      pm._data.profile = 'locked';
      const result = pm.check('mcp__terminal__list_processes');
      assert.equal(result.decision, PERMISSION.AUTO_APPROVE);
      assert.equal(result.source, 'always-safe');
    });
  });

  describe('overrides', () => {
    it('override takes precedence over profile', () => {
      pm.setOverride('mcp__filesystem__read_file', PERMISSION.DENY);
      const result = pm.check('mcp__filesystem__read_file');
      assert.equal(result.decision, PERMISSION.DENY);
      assert.equal(result.source, 'override');
    });

    it('removeOverride falls back to profile', () => {
      pm.setOverride('mcp__filesystem__read_file', PERMISSION.DENY);
      pm.removeOverride('mcp__filesystem__read_file');
      const result = pm.check('mcp__filesystem__read_file');
      assert.equal(result.decision, PERMISSION.AUTO_APPROVE);
      assert.equal(result.source, 'profile');
    });

    it('workspace-scoped override works', () => {
      pm.setOverride('my_tool', PERMISSION.AUTO_APPROVE_IN_WORKSPACE);
      const inWs = pm.check('my_tool', {
        filePath: '/home/user/ws/file.txt',
        workspacePath: '/home/user/ws',
      });
      assert.equal(inWs.decision, PERMISSION.AUTO_APPROVE);

      const outWs = pm.check('my_tool', {
        filePath: '/etc/file.txt',
        workspacePath: '/home/user/ws',
      });
      assert.equal(outWs.decision, PERMISSION.ASK_FIRST);
    });
  });

  describe('session approvals', () => {
    it('session approval overrides profile', () => {
      pm._data.profile = 'locked';
      pm.addSessionApproval('mcp__terminal__execute_command');
      const result = pm.check('mcp__terminal__execute_command');
      assert.equal(result.decision, PERMISSION.AUTO_APPROVE);
      assert.equal(result.source, 'session');
    });

    it('clearSessionApprovals removes session approvals', () => {
      pm.addSessionApproval('mcp__terminal__execute_command');
      pm.clearSessionApprovals();
      const result = pm.check('mcp__terminal__execute_command');
      assert.notEqual(result.source, 'session');
    });
  });

  describe('app permissions', () => {
    it('granted app permission auto-approves', () => {
      pm.grantAppPermission('ios-app', 'mcp__filesystem__read_file');
      const result = pm.check('mcp__filesystem__read_file', { appId: 'ios-app' });
      assert.equal(result.decision, PERMISSION.AUTO_APPROVE);
      assert.equal(result.source, 'app');
    });

    it('denied app permission denies', () => {
      pm.denyAppPermission('ios-app', 'mcp__terminal__bash');
      const result = pm.check('mcp__terminal__bash', { appId: 'ios-app' });
      assert.equal(result.decision, PERMISSION.DENY);
      assert.equal(result.source, 'app');
    });
  });

  describe('case insensitivity', () => {
    it('tool names are case insensitive', () => {
      pm.setOverride('MyTool', PERMISSION.DENY);
      const result = pm.check('mytool');
      assert.equal(result.decision, PERMISSION.DENY);
    });
  });
});
