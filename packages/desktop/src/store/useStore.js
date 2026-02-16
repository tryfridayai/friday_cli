import { create } from 'zustand';

const useStore = create((set, get) => ({
  // ── View / Navigation ─────────────────────────────────────────────────
  view: 'home', // 'home' | 'chat'
  setView: (view) => set({ view }),

  sidebarTab: 'chat', // 'chat' | 'agents' | 'settings'
  setSidebarTab: (tab) => set({ sidebarTab: tab }),

  // ── Theme ─────────────────────────────────────────────────────────────
  theme: 'light',
  setTheme: (theme) => set({ theme }),

  // ── Backend status ────────────────────────────────────────────────────
  backendReady: false,
  setBackendReady: (ready) => set({ backendReady: ready }),

  // ── Session ───────────────────────────────────────────────────────────
  sessionId: null,
  setSessionId: (id) => set({ sessionId: id }),

  sessions: [],
  setSessions: (sessions) => set({ sessions }),

  // ── Messages ──────────────────────────────────────────────────────────
  messages: [],
  addMessage: (msg) =>
    set((state) => ({ messages: [...state.messages, msg] })),
  clearMessages: () => set({ messages: [] }),

  // Append text to the last assistant message (for streaming chunks)
  appendToLastAssistant: (text) =>
    set((state) => {
      const msgs = [...state.messages];
      const last = msgs[msgs.length - 1];
      if (last && last.role === 'assistant') {
        msgs[msgs.length - 1] = { ...last, content: last.content + text };
      } else {
        msgs.push({ role: 'assistant', content: text });
      }
      return { messages: msgs };
    }),

  // ── Streaming / thinking state ────────────────────────────────────────
  isStreaming: false,
  setIsStreaming: (v) => set({ isStreaming: v }),

  isThinking: false,
  setIsThinking: (v) => set({ isThinking: v }),

  thinkingText: '',
  setThinkingText: (t) => set({ thinkingText: t }),

  // ── Tool use ──────────────────────────────────────────────────────────
  currentTool: null, // { toolName, toolInput }
  setCurrentTool: (tool) => set({ currentTool: tool }),

  // ── Permissions ───────────────────────────────────────────────────────
  permissionRequest: null, // { permission_id, tool_name, tool_input, description }
  setPermissionRequest: (req) => set({ permissionRequest: req }),

  // ── Settings modal ────────────────────────────────────────────────────
  showSettings: false,
  setShowSettings: (v) => set({ showSettings: v }),
  settingsTab: 'apps', // 'apps' | 'keys'
  setSettingsTab: (tab) => set({ settingsTab: tab }),

  // ── API Keys ──────────────────────────────────────────────────────────
  apiKeys: {},
  setApiKeys: (keys) => set({ apiKeys: keys }),

  // ── MCP Servers ───────────────────────────────────────────────────────
  mcpServers: [],
  setMcpServers: (servers) => set({ mcpServers: servers }),

  // ── Scheduled Agents ──────────────────────────────────────────────────
  scheduledAgents: [],
  setScheduledAgents: (agents) => set({ scheduledAgents: agents }),

  // ── Preview panel ─────────────────────────────────────────────────────
  previewOpen: true,
  setPreviewOpen: (v) => set({ previewOpen: v }),
  previewContent: null, // { type: 'image'|'audio'|'video', url, alt }
  setPreviewContent: (content) => set({ previewContent: content }),
  previewTab: 'agents', // 'preview' | 'agents'
  setPreviewTab: (tab) => set({ previewTab: tab }),

  // ── Completion cost ───────────────────────────────────────────────────
  lastCost: null,
  setLastCost: (cost) => set({ lastCost: cost }),

  // ── Actions ───────────────────────────────────────────────────────────
  startNewSession: () => {
    set({
      messages: [],
      sessionId: null,
      isStreaming: false,
      isThinking: false,
      permissionRequest: null,
      currentTool: null,
      lastCost: null,
      view: 'home',
    });
    if (window.friday) window.friday.newSession();
  },

  resumeSession: (id) => {
    set({
      sessionId: id,
      messages: [],
      view: 'chat',
      isStreaming: false,
      isThinking: false,
      permissionRequest: null,
      currentTool: null,
    });
    if (window.friday) window.friday.resumeSession(id);
  },

  sendMessage: (text) => {
    const state = get();
    set({
      view: 'chat',
      isStreaming: true,
      isThinking: true,
      thinkingText: '',
      currentTool: null,
      permissionRequest: null,
      lastCost: null,
    });
    state.addMessage({ role: 'user', content: text });
    if (window.friday) {
      window.friday.sendQuery(text, state.sessionId);
    }
  },

  abortQuery: () => {
    set({ isStreaming: false, isThinking: false, currentTool: null });
    if (window.friday) window.friday.abortQuery();
  },

  // Load sessions from disk
  loadSessions: async () => {
    if (!window.friday) return;
    const sessions = await window.friday.getSessions();
    set({ sessions: sessions || [] });
  },

  // Load API key status
  loadApiKeys: async () => {
    if (!window.friday) return;
    const keys = await window.friday.getApiKeyStatus();
    set({ apiKeys: keys || {} });
  },
}));

export default useStore;
