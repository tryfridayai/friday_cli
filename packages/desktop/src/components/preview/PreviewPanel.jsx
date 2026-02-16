import useStore from '../../store/useStore';
import MediaViewer from './MediaViewer';
import AgentsPanel from '../agents/AgentsPanel';

export default function PreviewPanel() {
  const previewTab = useStore((s) => s.previewTab);
  const setPreviewTab = useStore((s) => s.setPreviewTab);
  const previewContent = useStore((s) => s.previewContent);
  const setPreviewOpen = useStore((s) => s.setPreviewOpen);

  return (
    <div className="w-80 flex-shrink-0 bg-surface-1 border-l border-border-subtle flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
        <div className="flex gap-1">
          {['preview', 'agents'].map((tab) => (
            <button
              key={tab}
              onClick={() => setPreviewTab(tab)}
              className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors ${
                previewTab === tab
                  ? 'bg-accent-muted text-accent'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <button
          onClick={() => setPreviewOpen(false)}
          className="text-text-muted hover:text-text-secondary p-1"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {previewTab === 'preview' ? (
          <MediaViewer content={previewContent} />
        ) : (
          <AgentsPanel />
        )}
      </div>
    </div>
  );
}
