import { motion } from 'framer-motion';
import useStore from '../../store/useStore';

function humanizeToolName(toolName) {
  if (!toolName) return 'use a tool';
  const parts = toolName.split('__');
  const action = parts[parts.length - 1];
  const friendly = {
    read_file: 'Read File',
    write_file: 'Write File',
    edit_file: 'Edit File',
    execute_command: 'Run Command',
    bash: 'Run Command',
    create_directory: 'Create Directory',
    search_files: 'Search Files',
    generate_image: 'Generate Image',
    generate_video: 'Generate Video',
    text_to_speech: 'Text to Speech',
    WebSearch: 'Web Search',
    WebFetch: 'Fetch Web Page',
  };
  return friendly[action] || action.replace(/_/g, ' ');
}

export default function PermissionCard() {
  const request = useStore((s) => s.permissionRequest);
  if (!request) return null;

  const respond = (approved) => {
    if (window.friday) {
      window.friday.sendPermissionResponse(request.permission_id, approved);
    }
    const store = useStore.getState();
    store.setPermissionRequest(null);
    if (approved) {
      store.setIsStreaming(true);
      store.setIsThinking(true);
      store.setThinkingText('');
    }
  };

  const toolLabel = humanizeToolName(request.tool_name);
  const entries = request.tool_input ? Object.entries(request.tool_input).slice(0, 4) : [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-4 my-2 p-4 rounded-xl bg-surface-2 border border-warning/30"
    >
      <div className="flex items-center gap-2 mb-2">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="2" strokeLinecap="round">
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
        <span className="text-sm font-semibold text-warning">
          Permission needed: {toolLabel}
        </span>
      </div>

      {entries.length > 0 && (
        <div className="space-y-1 mb-3">
          {entries.map(([key, val]) => {
            const value = typeof val === 'string' ? val : JSON.stringify(val);
            const display = value.length > 100 ? value.slice(0, 97) + '...' : value;
            return (
              <div key={key} className="text-xs text-text-muted font-mono">
                <span className="text-text-secondary">{key}:</span> {display}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => respond(true)}
          className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-hover transition-colors"
        >
          Allow
        </button>
        <button
          onClick={() => respond(true)}
          className="px-3 py-1.5 rounded-lg bg-surface-3 text-text-secondary text-xs font-medium hover:bg-surface-2 transition-colors"
        >
          Allow for session
        </button>
        <button
          onClick={() => respond(false)}
          className="px-3 py-1.5 rounded-lg bg-surface-3 text-danger text-xs font-medium hover:bg-danger/10 transition-colors"
        >
          Deny
        </button>
      </div>
    </motion.div>
  );
}
