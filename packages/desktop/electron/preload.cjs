const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('friday', {
  // ── Backend communication ───────────────────────────────────────────
  onBackendMessage: (callback) => {
    const handler = (_event, msg) => callback(msg);
    ipcRenderer.on('backend-message', handler);
    return () => ipcRenderer.removeListener('backend-message', handler);
  },
  sendToBackend: (data) => ipcRenderer.send('send-to-backend', data),

  // ── Chat ────────────────────────────────────────────────────────────
  sendQuery: (message, sessionId, metadata) =>
    ipcRenderer.send('send-query', { message, sessionId, metadata }),
  abortQuery: () => ipcRenderer.send('abort-query'),
  newSession: () => ipcRenderer.send('new-session'),
  resumeSession: (sessionId) => ipcRenderer.send('resume-session', sessionId),

  // ── Permissions ─────────────────────────────────────────────────────
  sendPermissionResponse: (permissionId, approved, opts = {}) =>
    ipcRenderer.send('permission-response', {
      permissionId,
      approved,
      updatedInput: opts.updatedInput,
      message: opts.message,
    }),

  // ── Workspace ───────────────────────────────────────────────────────
  getWorkspace: () => ipcRenderer.invoke('get-workspace'),
  changeWorkspace: (wsPath, resetSession) =>
    ipcRenderer.send('workspace-changed', { path: wsPath, resetSession }),

  // ── API Keys (keytar) ──────────────────────────────────────────────
  getApiKeyStatus: () => ipcRenderer.invoke('get-api-key-status'),
  setApiKey: (keyName, value) => ipcRenderer.invoke('set-api-key', { keyName, value }),
  deleteApiKey: (keyName) => ipcRenderer.invoke('delete-api-key', { keyName }),

  // ── Sessions ────────────────────────────────────────────────────────
  getSessions: () => ipcRenderer.invoke('get-sessions'),
  deleteSession: (sessionId) => ipcRenderer.invoke('delete-session', sessionId),

  // ── MCP Servers ─────────────────────────────────────────────────────
  getMcpServers: () => ipcRenderer.send('mcp-get-servers'),
  updateMcpCredentials: (serverId, credentials) =>
    ipcRenderer.send('mcp-update-credentials', { serverId, credentials }),
  deleteMcpCredentials: (serverId) =>
    ipcRenderer.send('mcp-delete-credentials', { serverId }),
  startMcpOAuth: (providerId, serverId, scopes) =>
    ipcRenderer.send('mcp-oauth-start', { providerId, serverId, scopes }),

  // ── Scheduled Agents ────────────────────────────────────────────────
  sendScheduledAgent: (data) => ipcRenderer.send('scheduled-agent', data),

  // ── Media files ──────────────────────────────────────────────────────
  scanMediaFiles: () => ipcRenderer.invoke('scan-media-files'),

  // ── Utility ─────────────────────────────────────────────────────────
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  restartBackend: () => ipcRenderer.send('restart-backend'),

  // ── Platform info ───────────────────────────────────────────────────
  platform: process.platform,
});
