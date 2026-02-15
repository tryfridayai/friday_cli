/**
 * PluginManager — Install, uninstall, and manage plugins.
 *
 * Plugins are integrations (MCP servers) that users explicitly install.
 * Each plugin has a manifest in catalog.json describing its MCP config
 * and credential requirements.
 *
 * Installed plugins are tracked in ~/.friday/plugins.json.
 * Credentials are stored via the existing McpCredentials system.
 *
 * Only installed plugins (+ core servers) get loaded into the runtime.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_DIR = process.env.FRIDAY_CONFIG_DIR || path.join(os.homedir(), '.friday');
const PLUGINS_FILE = path.join(CONFIG_DIR, 'plugins.json');

// Core servers that are always loaded (not plugins)
const CORE_SERVERS = new Set(['filesystem', 'terminal']);

export class PluginManager {
  constructor() {
    this._catalog = null;
    this._installed = null;
  }

  // ── Catalog ──────────────────────────────────────────────────────────

  /**
   * Load the bundled plugin catalog.
   */
  getCatalog() {
    if (!this._catalog) {
      const catalogPath = path.join(__dirname, 'catalog.json');
      this._catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    }
    return this._catalog;
  }

  /**
   * Get a specific plugin manifest from the catalog.
   */
  getPluginManifest(pluginId) {
    const catalog = this.getCatalog();
    return catalog.plugins[pluginId] || null;
  }

  /**
   * List all available plugins from the catalog.
   * Returns array of { id, name, description, category, installed }
   */
  listAvailable() {
    const catalog = this.getCatalog();
    const installed = this._loadInstalled();
    return Object.entries(catalog.plugins).map(([id, plugin]) => ({
      id,
      name: plugin.name,
      description: plugin.description,
      category: plugin.category,
      installed: !!installed.plugins[id],
    }));
  }

  // ── Installed plugins ────────────────────────────────────────────────

  _loadInstalled() {
    if (this._installed) return this._installed;
    try {
      if (fs.existsSync(PLUGINS_FILE)) {
        this._installed = JSON.parse(fs.readFileSync(PLUGINS_FILE, 'utf8'));
      }
    } catch {
      // ignore corrupt file
    }
    if (!this._installed || typeof this._installed !== 'object') {
      this._installed = { plugins: {} };
    }
    return this._installed;
  }

  _saveInstalled() {
    try {
      const dir = path.dirname(PLUGINS_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(PLUGINS_FILE, JSON.stringify(this._installed, null, 2), 'utf8');
    } catch {
      // silent fail — state stays in memory
    }
  }

  /**
   * List installed plugins.
   * Returns array of { id, name, installedAt }
   */
  listInstalled() {
    const installed = this._loadInstalled();
    const catalog = this.getCatalog();
    return Object.entries(installed.plugins).map(([id, meta]) => ({
      id,
      name: catalog.plugins[id]?.name || id,
      description: catalog.plugins[id]?.description || '',
      installedAt: meta.installedAt,
    }));
  }

  /**
   * Check if a plugin is installed.
   */
  isInstalled(pluginId) {
    const installed = this._loadInstalled();
    return !!installed.plugins[pluginId];
  }

  /**
   * Mark a plugin as installed after credential setup is complete.
   * @param {string} pluginId
   * @param {Object} credentials - Key-value pairs of credential values
   */
  install(pluginId, credentials = {}) {
    const manifest = this.getPluginManifest(pluginId);
    if (!manifest) {
      throw new Error(`Unknown plugin: ${pluginId}. Run 'friday plugins' to see available plugins.`);
    }

    const installed = this._loadInstalled();
    installed.plugins[pluginId] = {
      installedAt: new Date().toISOString(),
      credentials: this._buildCredentialEnvMap(manifest, credentials),
    };
    this._installed = installed;
    this._saveInstalled();
  }

  /**
   * Uninstall a plugin.
   */
  uninstall(pluginId) {
    const installed = this._loadInstalled();
    if (!installed.plugins[pluginId]) {
      throw new Error(`Plugin '${pluginId}' is not installed.`);
    }
    delete installed.plugins[pluginId];
    this._installed = installed;
    this._saveInstalled();
  }

  // ── Credential helpers ───────────────────────────────────────────────

  /**
   * Build env var map from user-provided credential values and manifest.
   * @param {Object} manifest - Plugin manifest
   * @param {Object} credentials - { key: value } from user input
   * @returns {Object} - { ENV_VAR: value } map
   */
  _buildCredentialEnvMap(manifest, credentials) {
    const envMap = {};
    const fields = manifest.setup?.credentials || [];
    for (const field of fields) {
      const value = credentials[field.key];
      if (value) {
        // Map to all env vars this credential populates
        for (const envVar of (field.env || [])) {
          envMap[envVar] = value;
        }
      }
    }
    return envMap;
  }

  /**
   * Get credential fields required for a plugin.
   * Returns the setup.credentials array from the manifest.
   */
  getCredentialFields(pluginId) {
    const manifest = this.getPluginManifest(pluginId);
    if (!manifest) return [];
    return manifest.setup?.credentials || [];
  }

  // ── MCP Server Config Generation ────────────────────────────────────

  /**
   * Get MCP server configs for all installed plugins.
   * Used by the runtime's config loader to build the server list.
   *
   * @param {Object} templateContext - Template vars (WORKSPACE, HOME, etc.)
   * @returns {Object} - { serverId: { command, args, env } }
   */
  getInstalledMcpServers(templateContext = {}) {
    const installed = this._loadInstalled();
    const catalog = this.getCatalog();
    const servers = {};

    for (const [pluginId, meta] of Object.entries(installed.plugins)) {
      const manifest = catalog.plugins[pluginId];
      if (!manifest || manifest.type !== 'mcp') continue;

      const mcpConfig = manifest.mcp;
      if (!mcpConfig) continue;

      // Apply template variables and stored credentials to env
      const resolvedEnv = {};
      for (const [key, template] of Object.entries(mcpConfig.env || {})) {
        resolvedEnv[key] = this._resolveTemplate(template, templateContext, meta.credentials || {});
      }

      // Also inject stored credentials directly
      for (const [envKey, value] of Object.entries(meta.credentials || {})) {
        if (!resolvedEnv[envKey]) {
          resolvedEnv[envKey] = value;
        }
      }

      servers[pluginId] = {
        command: this._resolveTemplate(mcpConfig.command, templateContext, meta.credentials || {}),
        args: (mcpConfig.args || []).map(a =>
          this._resolveTemplate(a, templateContext, meta.credentials || {})
        ),
        env: resolvedEnv,
      };
    }

    return servers;
  }

  /**
   * Resolve ${VAR} templates using context and credentials.
   */
  _resolveTemplate(value, context, credentials) {
    if (typeof value !== 'string') return value;
    return value.replace(/\$\{([^}]+)\}/g, (_, key) => {
      if (context[key] !== undefined) return context[key];
      if (credentials[key] !== undefined) return credentials[key];
      return process.env[key] || '';
    });
  }

  // ── Static helpers ───────────────────────────────────────────────────

  /**
   * Check if a server ID is a core server (not a plugin).
   */
  static isCoreServer(serverId) {
    return CORE_SERVERS.has(serverId);
  }

  /**
   * Get the set of core server IDs.
   */
  static getCoreServerIds() {
    return [...CORE_SERVERS];
  }
}

export const pluginManager = new PluginManager();
export default pluginManager;
