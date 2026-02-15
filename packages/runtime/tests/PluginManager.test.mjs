import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PluginManager } from '../src/plugins/PluginManager.js';

describe('PluginManager', () => {
  let pm;

  beforeEach(() => {
    pm = new PluginManager();
    // Override installed state to avoid filesystem
    pm._installed = { plugins: {} };
  });

  describe('catalog', () => {
    it('loads the plugin catalog', () => {
      const catalog = pm.getCatalog();
      assert.ok(catalog);
      assert.ok(catalog.plugins);
      assert.ok(Object.keys(catalog.plugins).length > 0);
    });

    it('catalog has known plugins', () => {
      const catalog = pm.getCatalog();
      assert.ok(catalog.plugins.github, 'should have github plugin');
      assert.ok(catalog.plugins.vercel, 'should have vercel plugin');
      assert.ok(catalog.plugins.slack, 'should have slack plugin');
    });

    it('each plugin has required fields', () => {
      const catalog = pm.getCatalog();
      for (const [id, plugin] of Object.entries(catalog.plugins)) {
        assert.ok(plugin.name, `${id} should have name`);
        assert.ok(plugin.description, `${id} should have description`);
        assert.ok(plugin.category, `${id} should have category`);
        assert.ok(plugin.type, `${id} should have type`);
      }
    });
  });

  describe('getPluginManifest', () => {
    it('returns manifest for known plugin', () => {
      const manifest = pm.getPluginManifest('github');
      assert.ok(manifest);
      assert.equal(manifest.type, 'mcp');
    });

    it('returns null for unknown plugin', () => {
      const manifest = pm.getPluginManifest('nonexistent');
      assert.equal(manifest, null);
    });
  });

  describe('listAvailable', () => {
    it('returns all plugins with installed status', () => {
      const list = pm.listAvailable();
      assert.ok(Array.isArray(list));
      assert.ok(list.length > 0);
      for (const item of list) {
        assert.ok(item.id);
        assert.ok(item.name);
        assert.equal(typeof item.installed, 'boolean');
      }
    });

    it('marks installed plugins', () => {
      pm._installed = { plugins: { vercel: { installedAt: '2026-01-01T00:00:00Z', credentials: {} } } };
      pm._catalog = null; // force reload
      const list = pm.listAvailable();
      const vercel = list.find(p => p.id === 'vercel');
      assert.ok(vercel);
      assert.equal(vercel.installed, true);
    });
  });

  describe('install / uninstall', () => {
    it('installs a plugin', () => {
      pm.install('vercel', {});
      assert.equal(pm.isInstalled('vercel'), true);
    });

    it('stores credentials on install', () => {
      pm.install('github', { github_token: 'ghp_test123' });
      const installed = pm._loadInstalled();
      assert.ok(installed.plugins.github);
      assert.ok(installed.plugins.github.credentials);
    });

    it('throws for unknown plugin', () => {
      assert.throws(() => pm.install('nonexistent', {}), /Unknown plugin/);
    });

    it('uninstalls a plugin', () => {
      pm.install('vercel', {});
      pm.uninstall('vercel');
      assert.equal(pm.isInstalled('vercel'), false);
    });

    it('throws when uninstalling not-installed plugin', () => {
      assert.throws(() => pm.uninstall('vercel'), /not installed/);
    });
  });

  describe('listInstalled', () => {
    it('returns empty array when no plugins installed', () => {
      const list = pm.listInstalled();
      assert.deepEqual(list, []);
    });

    it('returns installed plugins', () => {
      pm.install('vercel', {});
      const list = pm.listInstalled();
      assert.equal(list.length, 1);
      assert.equal(list[0].id, 'vercel');
    });
  });

  describe('getInstalledMcpServers', () => {
    it('returns empty object when no plugins installed', () => {
      const servers = pm.getInstalledMcpServers({});
      assert.deepEqual(servers, {});
    });

    it('returns server config for installed plugins', () => {
      pm.install('vercel', {});
      const servers = pm.getInstalledMcpServers({ HOME: '/home/user' });
      assert.ok(servers.vercel);
      assert.ok(servers.vercel.command);
    });
  });

  describe('getCredentialFields', () => {
    it('returns credential fields for a plugin', () => {
      const fields = pm.getCredentialFields('github');
      assert.ok(Array.isArray(fields));
      assert.ok(fields.length > 0);
      assert.ok(fields[0].key);
    });

    it('returns empty array for unknown plugin', () => {
      const fields = pm.getCredentialFields('nonexistent');
      assert.deepEqual(fields, []);
    });
  });

  describe('static methods', () => {
    it('isCoreServer identifies filesystem and terminal', () => {
      assert.equal(PluginManager.isCoreServer('filesystem'), true);
      assert.equal(PluginManager.isCoreServer('terminal'), true);
      assert.equal(PluginManager.isCoreServer('github'), false);
    });

    it('getCoreServerIds returns core servers', () => {
      const ids = PluginManager.getCoreServerIds();
      assert.ok(ids.includes('filesystem'));
      assert.ok(ids.includes('terminal'));
      assert.equal(ids.length, 2);
    });
  });

  describe('template resolution', () => {
    it('resolves template variables', () => {
      const result = pm._resolveTemplate('${HOME}/.friday', { HOME: '/home/user' }, {});
      assert.equal(result, '/home/user/.friday');
    });

    it('resolves credential variables', () => {
      const result = pm._resolveTemplate('key=${TOKEN}', {}, { TOKEN: 'abc123' });
      assert.equal(result, 'key=abc123');
    });

    it('returns non-string values unchanged', () => {
      const result = pm._resolveTemplate(42, {}, {});
      assert.equal(result, 42);
    });
  });
});
