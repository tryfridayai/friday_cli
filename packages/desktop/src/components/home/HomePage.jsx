import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import useStore from '../../store/useStore';
import FridayLogo from '../ui/FridayLogo';
import PromptGrid from './PromptGrid';
import AppChips from './AppChips';

export default function HomePage() {
  const [input, setInput] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const sendMessage = useStore((s) => s.sendMessage);
  const sessions = useStore((s) => s.sessions);
  const resumeSession = useStore((s) => s.resumeSession);
  const loadSessions = useStore((s) => s.loadSessions);
  const backendReady = useStore((s) => s.backendReady);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput('');
    sendMessage(text);
  };

  const handlePromptSelect = (prompt) => {
    setInput(prompt);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 overflow-y-auto">
      <div className="max-w-2xl w-full">
        {/* Hero */}
        <motion.div
          className="text-center mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex justify-center mb-4">
            <FridayLogo size={48} />
          </div>
          <h1 className="text-2xl font-bold mb-2">Friday AI: Studio</h1>
          <p className="text-text-secondary text-sm">
            Create images, voice, and video with AI.
          </p>
          {!backendReady && (
            <p className="text-text-muted text-xs mt-2 animate-pulse">
              Starting backend...
            </p>
          )}
        </motion.div>

        {/* Input */}
        <motion.form
          onSubmit={handleSubmit}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-8"
        >
          <div className="relative">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e); } }}
              placeholder="Ask Friday anything..."
              disabled={!backendReady}
              rows={4}
              className="w-full resize-none px-5 py-4 pr-12 bg-surface-1 border border-border rounded-2xl text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all disabled:opacity-50"
              autoFocus
            />
            <button
              type="submit"
              disabled={!input.trim() || !backendReady}
              className="absolute right-3 bottom-3 p-2 rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </motion.form>

        {/* App filters */}
        <AppChips active={activeFilter} onSelect={setActiveFilter} />

        {/* Prompt suggestions */}
        <PromptGrid onSelect={handlePromptSelect} filter={activeFilter} />

        {/* Recent sessions */}
        {sessions.length > 0 && (
          <motion.div
            className="mt-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
              Recent conversations
            </h3>
            <div className="space-y-1">
              {sessions.slice(0, 5).map((session) => (
                <button
                  key={session.id}
                  onClick={() => resumeSession(session.id)}
                  className="w-full text-left px-4 py-2.5 rounded-lg bg-surface-1 hover:bg-surface-2 border border-transparent hover:border-border-subtle transition-all group"
                >
                  <div className="text-sm text-text-primary truncate group-hover:text-accent transition-colors">
                    {session.title || `Session ${session.id?.slice(0, 8)}`}
                  </div>
                  <div className="text-xs text-text-muted mt-0.5">
                    {session.updatedAt
                      ? new Date(session.updatedAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : ''}
                    {session.messageCount ? ` \u00b7 ${session.messageCount} messages` : ''}
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
