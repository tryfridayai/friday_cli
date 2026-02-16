import { motion } from 'framer-motion';
import { promptSuggestions } from './promptData';

export default function PromptGrid({ onSelect }) {
  return (
    <div className="grid grid-cols-2 gap-3 max-w-xl mx-auto">
      {promptSuggestions.map((item, i) => (
        <motion.button
          key={item.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 + i * 0.05 }}
          onClick={() => onSelect(item.prompt)}
          className="text-left p-4 rounded-xl bg-surface-1 border border-border-subtle hover:border-border hover:bg-surface-2 transition-all group"
        >
          <div className="text-lg mb-1">{item.emoji}</div>
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
