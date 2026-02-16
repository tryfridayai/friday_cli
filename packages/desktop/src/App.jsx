import { useEffect } from 'react';
import useStore from './store/useStore';
import { applyTheme } from './lib/themes';
import Sidebar from './components/layout/Sidebar';
import HomePage from './components/home/HomePage';
import ChatView from './components/chat/ChatView';
import PreviewPanel from './components/preview/PreviewPanel';
import ResizeHandle from './components/layout/ResizeHandle';
import SettingsModal from './components/settings/SettingsModal';

export default function App() {
  const view = useStore((s) => s.view);
  const theme = useStore((s) => s.theme);
  const showSettings = useStore((s) => s.showSettings);
  const previewOpen = useStore((s) => s.previewOpen);

  // Apply theme
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Wire up backend events
  useEffect(() => {
    if (!window.friday) return;

    const unsubscribe = window.friday.onBackendMessage((msg) => {
      const store = useStore.getState();

      switch (msg.type) {
        case 'ready':
          store.setBackendReady(true);
          store.loadSessions();
          store.loadApiKeys().then(() => {
            // Show API keys modal on first startup if no keys configured
            const keys = useStore.getState().apiKeys;
            const hasAnyKey = Object.values(keys).some((k) => k.configured);
            if (!hasAnyKey) {
              store.setSettingsTab('keys');
              store.setShowSettings(true);
            }
          });
          // Request MCP servers
          window.friday.getMcpServers();
          break;

        case 'session':
          store.setSessionId(msg.session_id);
          break;

        case 'thinking':
          store.setIsThinking(true);
          store.setThinkingText(msg.content || '');
          break;

        case 'thinking_complete':
          store.setIsThinking(false);
          break;

        case 'chunk': {
          const text = msg.text || msg.content || '';
          if (text) {
            store.setIsThinking(false);
            store.appendToLastAssistant(text);
          }
          break;
        }

        case 'tool_use':
          store.setCurrentTool({ toolName: msg.tool_name, toolInput: msg.tool_input });
          store.setIsThinking(false);
          break;

        case 'tool_result': {
          store.setCurrentTool(null);
          // Detect media outputs for preview panel
          const toolName = msg.tool_name || '';
          const result = typeof msg.tool_result === 'string' ? msg.tool_result : JSON.stringify(msg.tool_result || '');
          const fileMatch = result.match(/(?:saved|wrote|created|generated|output).*?(\/[^\s"',]+\.(?:png|jpg|jpeg|gif|webp|svg|mp3|wav|ogg|mp4|webm|mov))/i)
            || result.match(/(\/[^\s"',]+\.(?:png|jpg|jpeg|gif|webp|svg|mp3|wav|ogg|mp4|webm|mov))/i);
          if (fileMatch) {
            const filePath = fileMatch[1];
            const ext = filePath.split('.').pop().toLowerCase();
            const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
            const audioExts = ['mp3', 'wav', 'ogg'];
            const videoExts = ['mp4', 'webm', 'mov'];
            let mediaType = null;
            if (imageExts.includes(ext)) mediaType = 'image';
            else if (audioExts.includes(ext)) mediaType = 'audio';
            else if (videoExts.includes(ext)) mediaType = 'video';
            if (mediaType) {
              store.setPreviewContent({ type: mediaType, url: `friday-media://${filePath}`, alt: filePath });
              store.setPreviewTab('preview');
              store.setPreviewOpen(true);
            }
          }
          // Also detect generate_image / text_to_speech tool names
          if (toolName.includes('generate_image') || toolName.includes('generate_video') || toolName.includes('text_to_speech')) {
            const pathMatch = result.match(/(\/[^\s"',]+\.\w+)/);
            if (pathMatch) {
              const fp = pathMatch[1];
              const ext = fp.split('.').pop().toLowerCase();
              const type = ['mp4', 'webm', 'mov'].includes(ext) ? 'video'
                : ['mp3', 'wav', 'ogg'].includes(ext) ? 'audio' : 'image';
              store.setPreviewContent({ type, url: `friday-media://${fp}`, alt: fp });
              store.setPreviewTab('preview');
              store.setPreviewOpen(true);
            }
          }
          break;
        }

        case 'permission_request':
          store.setPermissionRequest(msg);
          store.setIsThinking(false);
          store.setCurrentTool(null);
          break;

        case 'permission_cancelled':
          if (store.permissionRequest?.permission_id === msg.permission_id) {
            store.setPermissionRequest(null);
          }
          break;

        case 'complete': {
          store.setIsStreaming(false);
          store.setIsThinking(false);
          store.setCurrentTool(null);
          if (msg.cost) store.setLastCost(msg.cost);
          // Scan the last assistant message text for media file paths
          const msgs = useStore.getState().messages;
          const lastMsg = msgs[msgs.length - 1];
          if (lastMsg && lastMsg.role === 'assistant') {
            const mediaMatch = lastMsg.content.match(/(\/[^\s"',`]+\.(?:png|jpg|jpeg|gif|webp|svg|mp3|wav|ogg|mp4|webm|mov))/i);
            if (mediaMatch) {
              const fp = mediaMatch[1];
              const ext = fp.split('.').pop().toLowerCase();
              const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
              const audioExts = ['mp3', 'wav', 'ogg'];
              const videoExts = ['mp4', 'webm', 'mov'];
              let mType = null;
              if (imageExts.includes(ext)) mType = 'image';
              else if (audioExts.includes(ext)) mType = 'audio';
              else if (videoExts.includes(ext)) mType = 'video';
              if (mType) {
                store.setPreviewContent({ type: mType, url: `friday-media://${fp}`, alt: fp });
                store.setPreviewTab('preview');
                store.setPreviewOpen(true);
              }
            }
          }
          break;
        }

        case 'error':
          store.setIsStreaming(false);
          store.setIsThinking(false);
          store.setCurrentTool(null);
          store.addMessage({ role: 'system', content: `Error: ${msg.message}` });
          break;

        case 'info':
          // Silent in UI unless it's important
          break;

        case 'session_reset':
          store.clearMessages();
          store.setSessionId(null);
          store.setView('home');
          break;

        // MCP
        case 'mcp_servers_list':
          store.setMcpServers(msg.servers || []);
          break;

        case 'mcp_credentials_updated':
          // Refresh server list
          if (window.friday) window.friday.getMcpServers();
          break;

        case 'mcp_credentials_deleted':
          if (window.friday) window.friday.getMcpServers();
          break;

        // Scheduled agents
        case 'scheduled_agent:list':
          store.setScheduledAgents(msg.agents || []);
          break;

        case 'scheduled_agent:created':
        case 'scheduled_agent:updated':
        case 'scheduled_agent:deleted':
        case 'scheduled_agent:toggled':
          // Refresh list
          if (window.friday) {
            window.friday.sendToBackend({ type: 'scheduled_agent:list', userId: 'default' });
          }
          break;

        default:
          break;
      }
    });

    return unsubscribe;
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* Sidebar */}
      <Sidebar />

      {/* Main content */}
      <div className="flex flex-1 min-w-0">
        {/* Primary panel */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* macOS title bar spacer */}
          <div className="drag-region h-10 flex-shrink-0 bg-surface-0" />

          {view === 'home' ? <HomePage /> : <ChatView />}
        </div>

        {/* Resize handle + Preview panel */}
        {previewOpen && (
          <>
            <ResizeHandle />
            <PreviewPanel />
          </>
        )}
      </div>

      {/* Settings modal */}
      {showSettings && <SettingsModal />}
    </div>
  );
}
