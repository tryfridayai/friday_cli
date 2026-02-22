import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import useStore from '../../store/useStore';

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function HistoryPanel() {
  const [search, setSearch] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const sessions = useStore((s) => s.sessions);
  const loadSessions = useStore((s) => s.loadSessions);
  const resumeSession = useStore((s) => s.resumeSession);
  const setHistoryOpen = useStore((s) => s.setHistoryOpen);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const filtered = sessions.filter((s) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const title = (s.title || `Session ${s.id?.slice(0, 8)}`).toLowerCase();
    return title.includes(q);
  });

  const handleDelete = async (e, sessionId) => {
    e.stopPropagation();
    if (deleteConfirm === sessionId) {
      if (window.friday) {
        await window.friday.deleteSession(sessionId);
        loadSessions();
      }
      setDeleteConfirm(null);
    } else {
      setDeleteConfirm(sessionId);
    }
  };

  return (
    <motion.div
      className="flex-shrink-0 bg-surface-1 border-r border-border-subtle flex flex-col"
      style={{ width: 300 }}
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 300, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      {/* Title bar spacer */}
      <div className="drag-region h-10 flex-shrink-0" />

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
        <h2 className="text-sm font-semibold text-text-primary">History</h2>
        <button
          onClick={() => setHistoryOpen(false)}
          className="text-text-muted hover:text-text-secondary p-1 rounded transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search sessions..."
          className="w-full px-3 py-1.5 text-sm bg-surface-2 border border-border-subtle rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
        />
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {filtered.length === 0 ? (
          <div className="text-center text-text-muted text-xs py-8">
            {sessions.length === 0 ? 'No sessions yet' : 'No matching sessions'}
          </div>
        ) : (
          <div className="space-y-0.5">
            {filtered.map((session) => (
              <button
                key={session.id}
                onClick={() => resumeSession(session.id)}
                className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-surface-2 transition-all group relative"
              >
                <div className="text-sm text-text-primary truncate pr-7 group-hover:text-accent transition-colors">
                  {session.title || `Session ${session.id?.slice(0, 8)}`}
                </div>
                <div className="text-xs text-text-muted mt-0.5">
                  {formatDate(session.updatedAt)}
                  {session.messageCount ? ` \u00b7 ${session.messageCount} msgs` : ''}
                </div>
                {/* Delete button */}
                <span
                  onClick={(e) => handleDelete(e, session.id)}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded transition-all cursor-pointer ${
                    deleteConfirm === session.id
                      ? 'text-red-500 opacity-100'
                      : 'text-text-muted opacity-0 group-hover:opacity-100 hover:text-red-500'
                  }`}
                  title={deleteConfirm === session.id ? 'Click again to confirm' : 'Delete session'}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                  </svg>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
