import { useState } from 'react';
import { appFilters } from './promptData';

export default function AppChips() {
  const [active, setActive] = useState('all');

  return (
    <div className="flex gap-2 justify-center mb-6">
      {appFilters.map((filter) => (
        <button
          key={filter.id}
          onClick={() => setActive(filter.id)}
          className={`
            px-3 py-1 rounded-full text-xs font-medium transition-all
            ${active === filter.id
              ? 'bg-accent text-white'
              : 'bg-surface-2 text-text-secondary hover:text-text-primary hover:bg-surface-3'
            }
          `}
        >
          {filter.label}
        </button>
      ))}
    </div>
  );
}
