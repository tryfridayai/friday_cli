const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');

const { execSync } = require('child_process');

// ── Paths ───────────────────────────────────────────────────────────────

const isDev = !app.isPackaged;
const runtimeDir = isDev
  ? path.resolve(__dirname, '..', '..', 'runtime')
  : path.join(process.resourcesPath, 'runtime');
const serverScript = path.join(runtimeDir, 'friday-server.js');

// Find system Node.js binary (process.execPath is the Electron binary, not Node)
let nodeBin = 'node';
try {
  nodeBin = execSync('which node', { encoding: 'utf8' }).trim();
} catch {
  // fallback to 'node' in PATH
}

// ── BackendManager ──────────────────────────────────────────────────────

class BackendManager {
  constructor() {
    this.process = null;
    this.buffer = '';
    this.win = null;
    this.apiKeys = {};
  }

  async start(win) {
    this.win = win;
    if (this.process) this.stop();

    // Load API keys from keytar into env
    const env = { ...process.env };
    try {
      const keytar = require('keytar');
      const SERVICE = 'FridayAI-APIKeys';
      const keys = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY', 'ELEVENLABS_API_KEY'];
      for (const key of keys) {
        const val = await keytar.getPassword(SERVICE, key);
        if (val) {
          env[key] = val;
          this.apiKeys[key] = val;
        }
      }
    } catch (err) {
      console.error('[BackendManager] keytar load error:', err.message);
    }

    const workspace = env.FRIDAY_WORKSPACE || path.join(os.homedir(), 'FridayWorkspace');
    try { fs.mkdirSync(workspace, { recursive: true }); } catch {}
    env.FRIDAY_WORKSPACE = workspace;

    console.log('[BackendManager] Spawning:', nodeBin, serverScript);
    this.process = spawn(nodeBin, [serverScript], {
      cwd: runtimeDir,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.process.stdout.on('data', (chunk) => {
      this.buffer += chunk.toString();
      const lines = this.buffer.split(/\r?\n/);
      this.buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          // Route open_external_url to shell
          if (msg.type === 'open_external_url' && msg.url) {
            shell.openExternal(msg.url);
            return;
          }
          if (this.win && !this.win.isDestroyed()) {
            this.win.webContents.send('backend-message', msg);
          }
        } catch {
          // Non-JSON output, ignore
        }
      }
    });

    this.process.stderr.on('data', (chunk) => {
      // Log but don't forward stderr to renderer
      process.stderr.write(chunk);
    });

    this.process.on('exit', (code, signal) => {
      console.log(`[BackendManager] Exited code=${code} signal=${signal}`);
      this.process = null;
    });
  }

  send(data) {
    if (this.process && this.process.stdin.writable) {
      this.process.stdin.write(JSON.stringify(data) + '\n');
    }
  }

  stop() {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  async restart(win) {
    this.stop();
    // Small delay so the OS releases the port/resources
    await new Promise((r) => setTimeout(r, 500));
    await this.start(win || this.win);
  }
}

const backend = new BackendManager();

// ── Window ──────────────────────────────────────────────────────────────

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#0a0a0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // needed for keytar native module
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5188');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Start backend once window is ready
  mainWindow.webContents.on('did-finish-load', () => {
    backend.start(mainWindow);
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  backend.stop();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', () => {
  backend.stop();
});

// ── IPC Handlers ────────────────────────────────────────────────────────

// Send message to backend
ipcMain.on('send-to-backend', (_event, data) => {
  backend.send(data);
});

// Query
ipcMain.on('send-query', (_event, { message, sessionId, metadata }) => {
  backend.send({ type: 'query', message, session_id: sessionId || null, metadata: metadata || {} });
});

// Abort
ipcMain.on('abort-query', () => {
  backend.send({ type: 'abort_query' });
});

// New session
ipcMain.on('new-session', () => {
  backend.send({ type: 'new_session' });
});

// Resume session
ipcMain.on('resume-session', (_event, sessionId) => {
  backend.send({ type: 'resume_session', session_id: sessionId });
});

// Permission response
ipcMain.on('permission-response', (_event, { permissionId, approved, updatedInput, message }) => {
  backend.send({
    type: 'permission_response',
    permission_id: permissionId,
    approved,
    updated_input: updatedInput,
    message,
  });
});

// Workspace
ipcMain.on('workspace-changed', (_event, { path: wsPath, resetSession }) => {
  backend.send({ type: 'workspace_changed', path: wsPath, resetSession });
});

// MCP servers
ipcMain.on('mcp-get-servers', () => {
  backend.send({ type: 'mcp_get_servers' });
});

ipcMain.on('mcp-update-credentials', (_event, { serverId, credentials }) => {
  backend.send({ type: 'mcp_update_credentials', serverId, credentials });
});

ipcMain.on('mcp-delete-credentials', (_event, { serverId }) => {
  backend.send({ type: 'mcp_delete_credentials', serverId });
});

ipcMain.on('mcp-oauth-start', (_event, { providerId, serverId, scopes }) => {
  backend.send({ type: 'mcp_oauth_start', providerId, serverId, scopes });
});

// Scheduled agents
ipcMain.on('scheduled-agent', (_event, data) => {
  backend.send(data);
});

// ── Keytar (API Keys) IPC ───────────────────────────────────────────────

const KEYTAR_SERVICE = 'FridayAI-APIKeys';
const API_KEY_DEFS = {
  ANTHROPIC_API_KEY: { label: 'Anthropic', unlocks: 'Chat (Claude)' },
  OPENAI_API_KEY: { label: 'OpenAI', unlocks: 'Chat, Images, Voice, Video' },
  GOOGLE_API_KEY: { label: 'Google AI', unlocks: 'Chat, Images, Voice, Video' },
  ELEVENLABS_API_KEY: { label: 'ElevenLabs', unlocks: 'Premium Voice' },
};

ipcMain.handle('get-api-key-status', async () => {
  const result = {};
  try {
    const keytar = require('keytar');
    for (const [key, def] of Object.entries(API_KEY_DEFS)) {
      const val = await keytar.getPassword(KEYTAR_SERVICE, key);
      result[key] = {
        ...def,
        configured: !!val,
        preview: val ? '****' + val.slice(-4) : null,
      };
    }
  } catch (err) {
    console.error('[Keytar] Error getting status:', err.message);
    for (const [key, def] of Object.entries(API_KEY_DEFS)) {
      result[key] = { ...def, configured: false, preview: null };
    }
  }
  return result;
});

ipcMain.handle('set-api-key', async (_event, { keyName, value }) => {
  try {
    const keytar = require('keytar');
    await keytar.setPassword(KEYTAR_SERVICE, keyName, value);
    // Restart backend so it picks up the new key
    await backend.restart();
    return { success: true };
  } catch (err) {
    console.error('[Keytar] Error setting key:', err.message);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('delete-api-key', async (_event, { keyName }) => {
  try {
    const keytar = require('keytar');
    await keytar.deletePassword(KEYTAR_SERVICE, keyName);
    await backend.restart();
    return { success: true };
  } catch (err) {
    console.error('[Keytar] Error deleting key:', err.message);
    return { success: false, error: err.message };
  }
});

// ── Session history IPC ─────────────────────────────────────────────────

ipcMain.handle('get-sessions', async () => {
  try {
    const sessionsPath = path.join(os.homedir(), '.friday', 'sessions');
    const indexPath = path.join(sessionsPath, 'sessions.index.json');
    if (fs.existsSync(indexPath)) {
      const raw = fs.readFileSync(indexPath, 'utf8');
      return JSON.parse(raw);
    }
    return [];
  } catch (err) {
    console.error('[Sessions] Error:', err.message);
    return [];
  }
});

ipcMain.handle('delete-session', async (_event, sessionId) => {
  try {
    const sessionsPath = path.join(os.homedir(), '.friday', 'sessions', sessionId);
    if (fs.existsSync(sessionsPath)) {
      fs.rmSync(sessionsPath, { recursive: true, force: true });
    }
    // Reload index
    const indexPath = path.join(os.homedir(), '.friday', 'sessions', 'sessions.index.json');
    if (fs.existsSync(indexPath)) {
      const sessions = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
      const filtered = sessions.filter((s) => s.id !== sessionId);
      fs.writeFileSync(indexPath, JSON.stringify(filtered, null, 2), 'utf8');
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ── Utility IPC ─────────────────────────────────────────────────────────

ipcMain.handle('get-workspace', () => {
  return process.env.FRIDAY_WORKSPACE || path.join(os.homedir(), 'FridayWorkspace');
});

ipcMain.handle('open-external', (_event, url) => {
  shell.openExternal(url);
});

ipcMain.on('restart-backend', () => {
  backend.restart();
});
