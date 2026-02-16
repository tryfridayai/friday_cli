import { useEffect } from 'react';
import useStore from '../../store/useStore';
import AgentCard from './AgentCard';

export default function AgentsPanel() {
  const agents = useStore((s) => s.scheduledAgents);

  useEffect(() => {
    if (window.friday) {
      window.friday.sendScheduledAgent({ type: 'scheduled_agent:list', userId: 'default' });
    }
  }, []);

  const handleToggle = (agentId, status) => {
    if (window.friday) {
      window.friday.sendScheduledAgent({
        type: 'scheduled_agent:toggle',
        userId: 'default',
        agentId,
        status,
      });
    }
  };

  const handleTrigger = (agentId) => {
    if (window.friday) {
      window.friday.sendScheduledAgent({
        type: 'scheduled_agent:trigger',
        agentId,
      });
    }
  };

  const handleDelete = (agentId) => {
    if (window.friday) {
      window.friday.sendScheduledAgent({
        type: 'scheduled_agent:delete',
        userId: 'default',
        agentId,
      });
    }
  };

  return (
    <div className="p-4">
      <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
        Scheduled Agents
      </h3>

      {agents.length === 0 ? (
        <div className="text-center py-8 text-text-muted text-sm">
          <p>No scheduled agents yet.</p>
          <p className="text-xs mt-1">Ask Friday to create one in chat.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onToggle={handleToggle}
              onTrigger={handleTrigger}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
