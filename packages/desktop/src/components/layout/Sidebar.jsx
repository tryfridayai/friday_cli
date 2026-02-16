import useStore from '../../store/useStore';
import FridayLogo from '../ui/FridayLogo';

const iconChat = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
  </svg>
);

const iconHistory = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const iconAgents = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <path d="M8 21h8" />
    <path d="M12 17v4" />
  </svg>
);

const iconSettings = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
  </svg>
);

const iconPlus = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

function SidebarButton({ icon, label, active, onClick, className = '' }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`
        no-drag w-10 h-10 flex items-center justify-center rounded-lg transition-all
        ${active
          ? 'bg-accent-muted text-accent'
          : 'text-text-muted hover:text-text-secondary hover:bg-surface-2'
        }
        ${className}
      `}
    >
      {icon}
    </button>
  );
}

export default function Sidebar() {
  const view = useStore((s) => s.view);
  const setShowSettings = useStore((s) => s.setShowSettings);
  const startNewSession = useStore((s) => s.startNewSession);
  const previewOpen = useStore((s) => s.previewOpen);
  const setPreviewOpen = useStore((s) => s.setPreviewOpen);
  const setPreviewTab = useStore((s) => s.setPreviewTab);

  return (
    <div className="drag-region w-14 flex-shrink-0 bg-surface-1 border-r border-border-subtle flex flex-col items-center py-3 gap-1">
      {/* Logo area — sits in title bar drag region */}
      <div className="mb-3 mt-5">
        <FridayLogo size={28} />
      </div>

      {/* New chat */}
      <SidebarButton
        icon={iconPlus}
        label="New Chat"
        onClick={startNewSession}
      />

      {/* Chat */}
      <SidebarButton
        icon={iconChat}
        label="Chat"
        active={view === 'chat'}
        onClick={() => useStore.setState({ view: 'chat' })}
      />

      {/* History — opens the home page which shows sessions */}
      <SidebarButton
        icon={iconHistory}
        label="History"
        active={view === 'home'}
        onClick={() => useStore.setState({ view: 'home' })}
      />

      {/* Agents */}
      <SidebarButton
        icon={iconAgents}
        label="Agents"
        active={previewOpen}
        onClick={() => {
          setPreviewOpen(!previewOpen);
          setPreviewTab('agents');
        }}
      />

      {/* Spacer */}
      <div className="flex-1" />

      {/* Settings */}
      <SidebarButton
        icon={iconSettings}
        label="Settings"
        onClick={() => setShowSettings(true)}
        className="mb-2"
      />
    </div>
  );
}
