import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import McpCredentials from './mcp/McpCredentials.js';

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

async function loadMcpServers(workspacePath, mcpCredentials) {
  const templateContext = {
    WORKSPACE: workspacePath,
    HOME: os.homedir() || workspacePath,
    PATH: process.env.PATH || '',
    PROJECT_ROOT: projectRoot,
    APP_ROOT: appRoot,
    NODE_MODULES: path.join(projectRoot, 'node_modules'),
    NODE_BIN: process.execPath
  };
  const configPath = path.join(projectRoot, '.mcp.json');
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed.mcpServers) {
      // Merge user-defined servers (user entries override built-in on same ID)
      const userServers = loadUserMcpServers();
      const merged = { ...parsed.mcpServers, ...userServers };

      const normalized = normalizeMcpServerConfig(merged, templateContext);

      if (mcpCredentials) {
        const mergers = Object.keys(normalized).map(async (serverId) => {
          const credEnv = await mcpCredentials.getEnvironmentForServer(serverId, normalized[serverId].auth);
          normalized[serverId].env = {
            ...normalized[serverId].env,
            ...credEnv
          };
          // Re-resolve args templates using credential env vars
          // (e.g., --access-token ${SUPABASE_PAT} where PAT comes from keytar)
          if (normalized[serverId].args?.length && Object.keys(credEnv).length) {
            normalized[serverId].args = normalized[serverId].args.map((arg) => {
              if (typeof arg !== 'string') return arg;
              return arg.replace(/\$\{([^}]+)\}/g, (match, key) => credEnv[key] || match);
            });
          }
        });
        await Promise.all(mergers);

        // Supabase: append --read-only / --project-ref based on stored mode
        const supabaseConfig = normalized['supabase'];
        if (supabaseConfig) {
          const mode = supabaseConfig.env.SUPABASE_MODE;
          const projectRef = supabaseConfig.env.SUPABASE_PROJECT_REF;
          if (mode === 'readonly') {
            supabaseConfig.args.push('--read-only');
          }
          if (projectRef && projectRef.trim()) {
            supabaseConfig.args.push('--project-ref', projectRef.trim());
          }
        }

        // Google Drive: write OAuth credentials to the JSON file the server expects
        await writeGoogleDriveCredentialsFile(normalized);
      }

      return normalized;
    }
  } catch (error) {
    console.error(`[CONFIG] Failed to load .mcp.json (using defaults): ${error.message}`);
  }

  // Fallback: use bundled filesystem server with Electron's Node.js
  return {
    filesystem: {
      command: process.execPath,
     args: [
        path.join(projectRoot, 'node_modules', '@modelcontextprotocol', 'server-filesystem', 'dist', 'index.js'),
        workspacePath
      ],
      env: {
        ALLOWED_PATHS: workspacePath
      }
    }
  };
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
