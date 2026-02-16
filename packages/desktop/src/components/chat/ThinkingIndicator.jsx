import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

const THINKING_PHRASES = [
  'Thinking...',
  'Getting everything together...',
  'Processing your request...',
  'Working on it...',
  'Analyzing...',
  'Putting it all together...',
];

export default function ThinkingIndicator({ text = '' }) {
  const [phraseIndex, setPhraseIndex] = useState(0);

  useEffect(() => {
    if (text) return; // Don't rotate if backend sends specific text
    const interval = setInterval(() => {
      setPhraseIndex((i) => (i + 1) % THINKING_PHRASES.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [text]);

  const displayText = text || THINKING_PHRASES[phraseIndex];

  return (
    <div className="flex items-start gap-3 px-4 py-3 animate-fade-in">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-accent-muted flex items-center justify-center">
        <motion.svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinecap="round"
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
        >
          <circle cx="12" cy="12" r="10" opacity="0.3" />
          <path d="M12 2a10 10 0 0 1 10 10" />
        </motion.svg>
      </div>
      <div className="flex flex-col gap-1 pt-1">
        <motion.p
          key={displayText}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="text-sm text-text-muted"
        >
          {displayText}
        </motion.p>
      </div>
    </div>
  );
}
