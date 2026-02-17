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
  previewWidth: 320, // pixels, draggable between 240-640
  setPreviewWidth: (w) => set({ previewWidth: Math.max(240, Math.min(640, w)) }),
  previewContent: null, // { type: 'image'|'audio'|'video', url, alt }
  setPreviewContent: (content) => set({ previewContent: content }),
  previewTab: 'agents', // 'preview' | 'agents'
  setPreviewTab: (tab) => set({ previewTab: tab }),

  // ── Media gallery ──────────────────────────────────────────────────────
  mediaFiles: { images: [], audio: [], video: [] },
  setMediaFiles: (files) => set({ mediaFiles: files }),
  loadMediaFiles: async () => {
    if (!window.friday) return;
    const files = await window.friday.scanMediaFiles();
    set({ mediaFiles: files || { images: [], audio: [], video: [] } });
  },

  // ── Content Editor ───────────────────────────────────────────────────
  editorOpen: false,
  editorProject: null,
  editorProjectPath: null,
  activeSceneIndex: 0,
  isPlaying: false,
  playbackTime: 0,
  contentFiles: [],

  openProject: async (filePath) => {
    if (!window.friday) return;
    const data = await window.friday.readProject(filePath);
    if (data && !data.error) {
      set({
        editorOpen: true,
        editorProject: data,
        editorProjectPath: filePath,
        activeSceneIndex: 0,
        isPlaying: false,
        playbackTime: 0,
        previewOpen: false,
      });
    }
  },

  closeEditor: () => set({
    editorOpen: false,
    editorProject: null,
    editorProjectPath: null,
    activeSceneIndex: 0,
    isPlaying: false,
    playbackTime: 0,
  }),

  updateSceneScript: (index, text) => {
    const state = get();
    if (!state.editorProject) return;
    const scenes = [...state.editorProject.scenes];
    scenes[index] = { ...scenes[index], script: text };
    const updatedProject = { ...state.editorProject, scenes };
    set({ editorProject: updatedProject });
    // Fire-and-forget save to disk
    if (window.friday && state.editorProjectPath) {
      window.friday.saveProject(state.editorProjectPath, updatedProject);
    }
  },

  loadContentFiles: async () => {
    if (!window.friday) return;
    const files = await window.friday.scanContentFiles();
    set({ contentFiles: files || [] });
  },

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
