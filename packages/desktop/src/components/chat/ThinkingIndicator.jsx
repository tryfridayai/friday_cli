import { motion } from 'framer-motion';

export default function ThinkingIndicator({ text = '' }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3 animate-fade-in">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-accent-muted flex items-center justify-center">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
      </div>
      <div className="flex flex-col gap-1 pt-1">
        {text ? (
          <p className="text-sm text-text-secondary italic">{text}</p>
        ) : (
          <div className="flex items-center gap-1">
            <span className="text-sm text-text-muted">Thinking</span>
            <span className="flex gap-0.5">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="w-1 h-1 rounded-full bg-accent"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                />
              ))}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
