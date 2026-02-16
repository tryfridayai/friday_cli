const { app, BrowserWindow, ipcMain, shell, protocol } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');

const { execSync } = require('child_process');

// ── Custom protocol for serving local media files ───────────────────────
// Must be registered before app.whenReady()
// No 'standard: true' — prevents URL normalization that lowercases path components
protocol.registerSchemesAsPrivileged([
  { scheme: 'friday-media', privileges: { secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);

// ── Constants ────────────────────────────────────────────────────────────

const KEYTAR_SERVICE = 'FridayAI-APIKeys';

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
    this.apiKeys = {}; // Cache: { KEY_NAME: 'value' }
    this.keysLoaded = false;
  }

  // Load all API keys from keytar in a single batch call (1 keychain prompt)
  async loadKeysFromKeytar() {
    try {
      const keytar = require('keytar');
      // findCredentials reads ALL credentials for the service in one OS call
      const allCreds = await keytar.findCredentials(KEYTAR_SERVICE);
      this.apiKeys = {};
      for (const { account, password } of allCreds) {
        if (password) this.apiKeys[account] = password;
      }
      this.keysLoaded = true;
    } catch (err) {
      console.error('[BackendManager] keytar load error:', err.message);
      this.keysLoaded = true; // Mark as loaded even on error to avoid retries
    }
  }

  async start(win) {
    this.win = win;
    if (this.process) this.stop();

    // Load API keys from keytar cache into env
    if (!this.keysLoaded) await this.loadKeysFromKeytar();
    const env = { ...process.env };
    for (const [key, val] of Object.entries(this.apiKeys)) {
      env[key] = val;
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
    backgroundColor: '#ffffff',
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

// ── MIME type lookup ──────────────────────────────────────────────────────
const MIME_TYPES = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
};

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

app.whenReady().then(() => {
  // Register protocol handler to serve local files with proper MIME types + range support
  protocol.handle('friday-media', async (request) => {
    // Extract path: friday-media:///Users/... → /Users/...
    let filePath = decodeURIComponent(request.url.replace('friday-media://', ''));
    if (!filePath.startsWith('/')) filePath = '/' + filePath;

    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch {
      return new Response('Not Found', { status: 404 });
    }

    const mimeType = getMimeType(filePath);
    const fileSize = stat.size;
    const rangeHeader = request.headers.get('range');

    // Parse range header if present
    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (match) {
        const start = parseInt(match[1], 10);
        // Open-ended range (bytes=0-): serve from start to end of file (standard HTTP)
        // Explicit end (bytes=0-1023): honour it, clamped to file size
        const requestedEnd = match[2] ? parseInt(match[2], 10) : fileSize - 1;
        const end = Math.min(requestedEnd, fileSize - 1);

        if (start >= fileSize) {
          return new Response('', {
            status: 416,
            headers: { 'Content-Range': `bytes */${fileSize}` },
          });
        }

        const chunkSize = end - start + 1;
        const buffer = Buffer.alloc(chunkSize);
        let fd;
        try {
          fd = fs.openSync(filePath, 'r');
          fs.readSync(fd, buffer, 0, chunkSize, start);
        } finally {
          if (fd !== undefined) fs.closeSync(fd);
        }

        return new Response(buffer, {
          status: 206,
          headers: {
            'Content-Type': mimeType,
            'Content-Length': String(chunkSize),
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
          },
        });
      }
    }

    // Non-range request: for small files read fully; for large files return first chunk
    // so the browser can start playback and then issue range requests
    const data = fs.readFileSync(filePath);
    return new Response(data, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Length': String(fileSize),
        'Accept-Ranges': 'bytes',
      },
    });
  });

  createWindow();
});

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

const API_KEY_DEFS = {
  ANTHROPIC_API_KEY: { label: 'Anthropic', unlocks: 'Chat (Claude)' },
  OPENAI_API_KEY: { label: 'OpenAI', unlocks: 'Chat, Images, Voice, Video' },
  GOOGLE_API_KEY: { label: 'Google AI', unlocks: 'Chat, Images, Voice, Video' },
  ELEVENLABS_API_KEY: { label: 'ElevenLabs', unlocks: 'Premium Voice' },
};

ipcMain.handle('get-api-key-status', async () => {
  // Use cached keys from BackendManager — no additional keychain prompts
  const result = {};
  for (const [key, def] of Object.entries(API_KEY_DEFS)) {
    const val = backend.apiKeys[key];
    result[key] = {
      ...def,
      configured: !!val,
      preview: val ? '****' + val.slice(-4) : null,
    };
  }
  return result;
});

ipcMain.handle('set-api-key', async (_event, { keyName, value }) => {
  try {
    const keytar = require('keytar');
    await keytar.setPassword(KEYTAR_SERVICE, keyName, value);
    // Update cache so get-api-key-status stays in sync without hitting keytar
    backend.apiKeys[keyName] = value;
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
    // Update cache
    delete backend.apiKeys[keyName];
    await backend.restart();
    return { success: true };
  } catch (err) {
    console.error('[Keytar] Error deleting key:', err.message);
    return { success: false, error: err.message };
  }
});

// ── Media file scanning IPC ──────────────────────────────────────────────

const MEDIA_EXTENSIONS = {
  images: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'],
  audio: ['.mp3', '.wav', '.ogg'],
  video: ['.mp4', '.webm', '.mov'],
};

function scanDirForMedia(dirPath) {
  const result = { images: [], audio: [], video: [] };
  if (!fs.existsSync(dirPath)) return result;

  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        let category = null;
        if (MEDIA_EXTENSIONS.images.includes(ext)) category = 'images';
        else if (MEDIA_EXTENSIONS.audio.includes(ext)) category = 'audio';
        else if (MEDIA_EXTENSIONS.video.includes(ext)) category = 'video';
        if (category) {
          try {
            const stat = fs.statSync(fullPath);
            result[category].push({
              name: entry.name,
              path: fullPath,
              size: stat.size,
              modified: stat.mtimeMs,
            });
          } catch { /* skip unreadable files */ }
        }
      }
    }
  }

  walk(dirPath);
  // Sort each category by most recent first
  for (const cat of ['images', 'audio', 'video']) {
    result[cat].sort((a, b) => b.modified - a.modified);
  }
  return result;
}

ipcMain.handle('scan-media-files', async () => {
  const workspace = process.env.FRIDAY_WORKSPACE || path.join(os.homedir(), 'FridayWorkspace');
  const generatedDir = path.join(workspace, 'generated');
  return scanDirForMedia(generatedDir);
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

ipcMain.handle('open-file-path', (_event, filePath) => {
  shell.openPath(filePath);
});

ipcMain.on('restart-backend', () => {
  backend.restart();
});
