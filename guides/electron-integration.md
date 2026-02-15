# Electron Integration Guide

Embed Friday runtime directly in your Electron app — no external server needed.

## Architecture

```
Electron App
  ├── Main Process
  │     └── friday-runtime (embedded)
  │           ├── AgentRuntime
  │           ├── MCP Servers (child processes)
  │           └── SessionStore
  └── Renderer Process
        └── Chat UI ──IPC──▶ Main Process
```

## Setup

```bash
npm install friday-runtime
```

## Main Process — Embed the Runtime

```javascript
// main.js
import { app, BrowserWindow, ipcMain } from 'electron';
import { AgentRuntime, loadBackendConfig } from 'friday-runtime';

let runtime;

app.whenReady().then(async () => {
  const config = await loadBackendConfig();
  runtime = new AgentRuntime({
    workspacePath: config.workspacePath,
    rules: config.rules,
    mcpServers: config.mcpServers,
    sessionsPath: config.sessionsPath,
  });

  const win = new BrowserWindow({
    webPreferences: { preload: './preload.js' },
  });
  win.loadFile('index.html');

  // Forward runtime messages to renderer
  runtime.on('message', (msg) => {
    win.webContents.send('friday:message', msg);
  });

  // Handle queries from renderer
  ipcMain.handle('friday:query', async (event, { message, sessionId }) => {
    await runtime.handleQuery(message, { sessionId });
  });

  // Handle session listing
  ipcMain.handle('friday:sessions', async () => {
    return runtime.sessionStore.listSessions();
  });
});
```

## Preload Script

```javascript
// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('friday', {
  query: (message, sessionId) =>
    ipcRenderer.invoke('friday:query', { message, sessionId }),

  onMessage: (callback) =>
    ipcRenderer.on('friday:message', (event, msg) => callback(msg)),

  listSessions: () =>
    ipcRenderer.invoke('friday:sessions'),
});
```

## Renderer — Chat UI

```javascript
// renderer.js
const chatOutput = document.getElementById('chat-output');
const chatInput = document.getElementById('chat-input');

let currentResponse = '';

window.friday.onMessage((msg) => {
  switch (msg.type) {
    case 'chunk':
      currentResponse += msg.text;
      updateDisplay(currentResponse);
      break;

    case 'tool_use':
      showToolIndicator(msg.tool);
      break;

    case 'complete':
      appendMessage('assistant', currentResponse);
      currentResponse = '';
      if (msg.cost?.estimated > 0) {
        showCost(msg.cost.estimated, msg.cost.tokens);
      }
      break;
  }
});

chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    const message = chatInput.value.trim();
    if (!message) return;

    appendMessage('user', message);
    chatInput.value = '';
    window.friday.query(message);
  }
});
```

## Plugin Management

Use the PluginManager from the main process:

```javascript
import { PluginManager } from 'friday-runtime';

const pm = new PluginManager();

// List available plugins
const plugins = pm.listAvailable();

// Install with credentials
pm.install('github', { github_token: 'ghp_...' });

// Reload runtime config after plugin install
const newConfig = await loadBackendConfig();
// Restart runtime with new MCP servers...
```

## Permission Handling

```javascript
import { PermissionManager, PERMISSION } from 'friday-runtime';

const permissions = new PermissionManager();

// Use the canUseTool callback in AgentRuntime
runtime.on('permission_request', ({ tool, context }) => {
  const result = permissions.check(tool, {
    workspacePath: config.workspacePath,
    filePath: context?.filePath,
  });

  if (result.decision === PERMISSION.ASK_FIRST) {
    // Show Electron dialog
    const { response } = await dialog.showMessageBox(win, {
      type: 'question',
      buttons: ['Allow', 'Deny', 'Always Allow'],
      message: `Friday wants to use: ${tool}`,
    });

    if (response === 2) {
      permissions.addSessionApproval(tool);
    }
    return response !== 1; // true = allow
  }

  return result.decision === PERMISSION.AUTO_APPROVE;
});
```

## Cost Tracking

```javascript
import { CostTracker } from 'friday-runtime';

// Access the singleton tracker
import costTracker from 'friday-runtime';

// After each query
runtime.on('message', (msg) => {
  if (msg.type === 'complete' && msg.cost) {
    // Show in status bar
    updateStatusBar(`$${msg.cost.estimated.toFixed(4)} | ${msg.cost.tokens.input + msg.cost.tokens.output} tokens`);
  }
});
```

## Packaging Notes

- MCP server child processes need to be spawnable from the packaged app
- Include `node_modules` for MCP server packages in your asar config
- Set `FRIDAY_CONFIG_DIR` to an app-specific path (e.g., `app.getPath('userData')`)
- The workspace path should be user-configurable (defaults to `~/FridayWorkspace`)
