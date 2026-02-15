import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import McpCredentials from './mcp/McpCredentials.js';
import { PluginManager } from './plugins/PluginManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const appRoot = path.resolve(projectRoot, '..');

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function resolveWorkspacePath(explicitPath) {
  const fallbackHome = os.homedir() || process.cwd();
  const resolved = explicitPath || path.join(fallbackHome, 'FridayWorkspace');
  const absolute = path.resolve(resolved);
  ensureDirectory(absolute);
  return absolute;
}

function loadAutomationRules() {
  const rulesFilePath = path.join(projectRoot, 'rules', 'rules.json');
  try {
    const raw = fs.readFileSync(rulesFilePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (Array.isArray(parsed.rules)) {
      return parsed.rules;
    }
    console.error('[CONFIG] rules.json missing a top-level array');
  } catch (error) {
    console.error(`[CONFIG] Failed to load automation rules: ${error.message}`);
  }
  return [];
}

function applyTemplate(value, context) {
  if (typeof value === 'string') {
    return value.replace(/\$\{([^}]+)\}/g, (_, key) => {
      if (Object.prototype.hasOwnProperty.call(context, key)) {
        return context[key];
      }
      return process.env[key] || '';
    });
  }
  if (Array.isArray(value)) {
    return value.map((v) => applyTemplate(v, context));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, applyTemplate(v, context)])
    );
  }
  return value;
}

function normalizeMcpServerConfig(config, context) {
  const normalized = {};
  for (const [name, definition] of Object.entries(config || {})) {
    if (!definition || !definition.command) continue;
    normalized[name] = {
      ...definition,
      command: applyTemplate(definition.command, context),
      args: applyTemplate(definition.args || [], context),
      env: applyTemplate(definition.env || {}, context)
    };
  }
  return normalized;
}

function loadUserMcpServers() {
  const userConfigPath = path.join(os.homedir(), '.friday', 'user-mcp-servers.json');
  try {
    if (fs.existsSync(userConfigPath)) {
      const raw = fs.readFileSync(userConfigPath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed.mcpServers && typeof parsed.mcpServers === 'object') {
        console.log(`[CONFIG] Loaded ${Object.keys(parsed.mcpServers).length} user MCP server(s) from ${userConfigPath}`);
        return parsed.mcpServers;
      }
    }
  } catch (error) {
    console.error(`[CONFIG] Failed to load user MCP servers: ${error.message}`);
  }
  return {};
}

/**
 * Google Drive MCP expects a JSON credentials file on disk (not env vars).
 * Writes GOOGLE_CLIENT_ID/SECRET from process.env to the file the server reads.
 */
function writeGoogleDriveCredentialsFile(normalized) {
  const driveConfig = normalized['google-drive'];
  if (!driveConfig) return;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const credFilePath = driveConfig.env?.GOOGLE_DRIVE_OAUTH_CREDENTIALS;

  if (!clientId || !clientSecret || !credFilePath) return;

  const credFileContent = {
    installed: {
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uris: ['http://localhost']
    }
  };

  try {
    const dir = path.dirname(credFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(credFilePath, JSON.stringify(credFileContent, null, 2), 'utf8');
    console.log(`[CONFIG] Wrote Google Drive OAuth credentials to ${credFilePath}`);
  } catch (error) {
    console.error(`[CONFIG] Failed to write Google Drive credentials file: ${error.message}`);
  }
}

/**
 * Build the template context used for resolving ${VAR} placeholders
 * in MCP server configs.
 */
function buildTemplateContext(workspacePath) {
  return {
    WORKSPACE: workspacePath,
    HOME: os.homedir() || workspacePath,
    PATH: process.env.PATH || '',
    PROJECT_ROOT: projectRoot,
    APP_ROOT: appRoot,
    NODE_MODULES: path.join(projectRoot, 'node_modules'),
    NODE_BIN: process.execPath
  };
}

/**
 * Load core MCP servers (filesystem, terminal) from .mcp.json.
 * These always load regardless of plugins.
 */
function loadCoreServers(templateContext) {
  const configPath = path.join(projectRoot, '.mcp.json');
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed.mcpServers) {
      // Only extract core servers
      const coreIds = PluginManager.getCoreServerIds();
      const coreConfigs = {};
      for (const id of coreIds) {
        if (parsed.mcpServers[id]) {
          coreConfigs[id] = parsed.mcpServers[id];
        }
      }
      return normalizeMcpServerConfig(coreConfigs, templateContext);
    }
  } catch (error) {
    console.error(`[CONFIG] Failed to load .mcp.json: ${error.message}`);
  }

  // Fallback: bundled filesystem server
  return {
    filesystem: {
      command: process.execPath,
      args: [
        path.join(projectRoot, 'node_modules', '@modelcontextprotocol', 'server-filesystem', 'dist', 'index.js'),
        templateContext.WORKSPACE
      ],
      env: {
        ALLOWED_PATHS: templateContext.WORKSPACE
      }
    }
  };
}

/**
 * Load MCP servers: core servers + installed plugins + user overrides.
 *
 * Core servers (filesystem, terminal) always load from .mcp.json.
 * Plugin servers load from installed plugins (via PluginManager).
 * User-defined servers from ~/.friday/user-mcp-servers.json are merged last.
 */
async function loadMcpServers(workspacePath, mcpCredentials) {
  const templateContext = buildTemplateContext(workspacePath);

  // 1. Core servers (always loaded)
  const coreServers = loadCoreServers(templateContext);

  // 2. Installed plugin servers
  const pm = new PluginManager();
  const pluginServers = pm.getInstalledMcpServers(templateContext);

  // 3. User-defined servers (overrides)
  const userServers = loadUserMcpServers();
  const userNormalized = normalizeMcpServerConfig(userServers, templateContext);

  // Merge: core + plugins + user (user overrides plugins, plugins override core)
  const merged = { ...coreServers, ...pluginServers, ...userNormalized };

  // Apply credentials from McpCredentials store (legacy keytar-based)
  if (mcpCredentials) {
    // Load .mcp.json for auth definitions (needed for credential env mapping)
    let authDefs = {};
    try {
      const configPath = path.join(projectRoot, '.mcp.json');
      const raw = fs.readFileSync(configPath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed.mcpServers) {
        for (const [id, def] of Object.entries(parsed.mcpServers)) {
          if (def.auth) authDefs[id] = def.auth;
        }
      }
    } catch { /* ignore */ }

    const mergers = Object.keys(merged).map(async (serverId) => {
      const auth = authDefs[serverId] || merged[serverId].auth;
      if (!auth) return;
      const credEnv = await mcpCredentials.getEnvironmentForServer(serverId, auth);
      merged[serverId].env = { ...merged[serverId].env, ...credEnv };
      // Re-resolve args templates using credential env vars
      if (merged[serverId].args?.length && Object.keys(credEnv).length) {
        merged[serverId].args = merged[serverId].args.map((arg) => {
          if (typeof arg !== 'string') return arg;
          return arg.replace(/\$\{([^}]+)\}/g, (match, key) => credEnv[key] || match);
        });
      }
    });
    await Promise.all(mergers);

    // Supabase: append --read-only / --project-ref based on stored mode
    if (merged['supabase']) {
      const mode = merged['supabase'].env.SUPABASE_MODE;
      const projectRef = merged['supabase'].env.SUPABASE_PROJECT_REF;
      if (mode === 'readonly') merged['supabase'].args.push('--read-only');
      if (projectRef?.trim()) merged['supabase'].args.push('--project-ref', projectRef.trim());
    }

    // Google Drive: write OAuth credentials file
    if (merged['google-drive']) {
      await writeGoogleDriveCredentialsFile(merged);
    }
  }

  return merged;
}

export async function loadBackendConfig(options = {}) {
  const workspacePath = resolveWorkspacePath(options.workspacePath || process.env.FRIDAY_WORKSPACE);
  const rules = loadAutomationRules();
  const mcpCredentials = new McpCredentials(projectRoot);
  await mcpCredentials.ensureReady();
  const mcpServers = await loadMcpServers(workspacePath, mcpCredentials);
  const sessionsBase = process.env.FRIDAY_SESSIONS_PATH
    ? path.resolve(process.env.FRIDAY_SESSIONS_PATH)
    : path.join(projectRoot, 'sessions');
  ensureDirectory(sessionsBase);

  return {
    projectRoot,
    workspacePath,
    rules,
    mcpServers,
    mcpCredentials,
    sessionsPath: sessionsBase
  };
}
