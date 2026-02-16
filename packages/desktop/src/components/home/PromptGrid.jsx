import { motion } from 'framer-motion';
import { promptSuggestions } from './promptData';

const icons = {
  image: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  ),
  mic: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  ),
  video: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m22 8-6 4 6 4V8Z" />
      <rect x="1" y="5" width="15" height="14" rx="2" />
    </svg>
  ),
  wand: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 4-1 1 4 4 1-1a2.83 2.83 0 1 0-4-4Z" />
      <path d="m14 5-9.7 9.7a1 1 0 0 0 0 1.4l2.6 2.6a1 1 0 0 0 1.4 0L18 9" />
      <path d="m5 8-2 .5.5-2L5 5l2-.5-.5 2Z" />
      <path d="m19 14 2-.5-.5 2-1.5 1.5-2 .5.5-2Z" />
    </svg>
  ),
};

export default function PromptGrid({ onSelect, filter }) {
  const items = filter && filter !== 'all'
    ? promptSuggestions.filter((item) => item.category === filter)
    : promptSuggestions;

  return (
    <div className="grid grid-cols-2 gap-3 max-w-xl mx-auto">
      {items.map((item, i) => (
        <motion.button
          key={item.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 + i * 0.05 }}
          onClick={() => onSelect(item.prompt)}
          className="text-left p-4 rounded-xl bg-surface-1 border border-border-subtle hover:border-border hover:bg-surface-2 transition-all group"
        >
          <div className="mb-2 text-text-secondary group-hover:text-accent transition-colors">
            {icons[item.icon]}
          </div>
          <div className="font-medium text-sm text-text-primary group-hover:text-accent transition-colors">
            {item.title}
          </div>
          <div className="text-xs text-text-muted mt-0.5">
            {item.description}
          </div>
        </motion.button>
      ))}
    </div>
  );
}
