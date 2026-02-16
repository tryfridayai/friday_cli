export default function AgentCard({ agent, onToggle, onTrigger, onDelete }) {
  const isActive = agent.status === 'active';
  const schedule = agent.schedule?.humanReadable || agent.schedule?.cron || 'No schedule';

  return (
    <div className="p-3 rounded-xl bg-surface-2 border border-border-subtle">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <h4 className="text-sm font-medium truncate">{agent.name}</h4>
          <p className="text-xs text-text-muted truncate mt-0.5">{agent.goal || 'No description'}</p>
        </div>
        <div
          className={`flex-shrink-0 w-2 h-2 rounded-full mt-1.5 ${
            isActive ? 'bg-success' : 'bg-text-muted'
          }`}
          title={isActive ? 'Active' : 'Paused'}
        />
      </div>

      <div className="text-xs text-text-muted mb-2">
        {schedule}
      </div>

      <div className="flex gap-1.5">
        <button
          onClick={() => onToggle(agent.id, isActive ? 'paused' : 'active')}
          className="px-2 py-1 rounded-md text-xs bg-surface-3 text-text-secondary hover:text-text-primary transition-colors"
        >
          {isActive ? 'Pause' : 'Resume'}
        </button>
        <button
          onClick={() => onTrigger(agent.id)}
          className="px-2 py-1 rounded-md text-xs bg-accent-muted text-accent hover:bg-accent/20 transition-colors"
        >
          Run Now
        </button>
        <button
          onClick={() => onDelete(agent.id)}
          className="px-2 py-1 rounded-md text-xs text-danger hover:bg-danger/10 transition-colors ml-auto"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
