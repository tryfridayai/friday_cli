import { motion } from 'framer-motion';
import MarkdownRenderer from './MarkdownRenderer';

export default function MessageBubble({ message }) {
  const { role, content } = message;

  if (role === 'user') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-end px-4 py-1.5"
      >
        <div className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-br-md bg-accent text-white text-sm">
          {content}
        </div>
      </motion.div>
    );
  }

  if (role === 'system') {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="px-4 py-1.5"
      >
        <div className="text-xs text-danger bg-danger/10 px-3 py-2 rounded-lg">
          {content}
        </div>
      </motion.div>
    );
  }

  // Assistant
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-3 px-4 py-1.5"
    >
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-accent-muted flex items-center justify-center mt-0.5">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="var(--accent)">
          <rect x="4" y="2" width="5" height="20" rx="2" />
          <rect x="15" y="2" width="5" height="20" rx="2" />
        </svg>
      </div>
      <div className="min-w-0 flex-1 max-w-[85%]">
        <MarkdownRenderer content={content} />
      </div>
    </motion.div>
  );
}
