import { useState, useRef, useEffect } from 'react';
import useStore from '../../store/useStore';

export default function ChatInput() {
  const [input, setInput] = useState('');
  const textareaRef = useRef(null);
  const sendMessage = useStore((s) => s.sendMessage);
  const isStreaming = useStore((s) => s.isStreaming);
  const abortQuery = useStore((s) => s.abortQuery);
  const backendReady = useStore((s) => s.backendReady);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
  }, [input]);

  // Focus on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput('');
    sendMessage(text);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex-shrink-0 border-t border-border-subtle bg-surface-0 px-4 py-3">
      <div className="relative max-w-4xl mx-auto">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={backendReady ? 'Message Friday...' : 'Starting backend...'}
          disabled={!backendReady}
          rows={1}
          className="w-full resize-none px-4 py-3 pr-12 bg-surface-1 border border-border rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all disabled:opacity-50"
        />

        {isStreaming ? (
          <button
            onClick={abortQuery}
            className="absolute right-3 bottom-3 flex-shrink-0 p-1.5 rounded-lg bg-danger text-white hover:bg-danger/80 transition-colors"
            title="Stop"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || !backendReady}
            className="absolute right-3 bottom-3 flex-shrink-0 p-1.5 rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Send"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
