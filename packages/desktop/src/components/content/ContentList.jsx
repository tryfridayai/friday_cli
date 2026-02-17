import { useEffect } from 'react';
import useStore from '../../store/useStore';

function relativeTime(ms) {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function ContentList() {
  const contentFiles = useStore((s) => s.contentFiles);
  const loadContentFiles = useStore((s) => s.loadContentFiles);
  const openProject = useStore((s) => s.openProject);

  useEffect(() => {
    loadContentFiles();
  }, [loadContentFiles]);

  const handleCreateDemo = async () => {
    if (!window.friday) return;
    await window.friday.createDemoProject();
    loadContentFiles();
  };

  return (
    <div className="p-3 flex flex-col gap-2">
      {/* Header with create button */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-text-muted uppercase tracking-wider">Projects</span>
        <button
          onClick={handleCreateDemo}
          title="Create demo project"
          className="w-6 h-6 flex items-center justify-center rounded text-text-muted hover:text-accent hover:bg-accent-muted transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      {contentFiles.length === 0 ? (
        <div className="text-center py-8 text-text-muted text-sm">
          <p>No projects yet</p>
          <p className="text-xs mt-1">Click + to create a demo project</p>
        </div>
      ) : (
        contentFiles.map((file) => (
          <button
            key={file.path}
            onClick={() => openProject(file.path)}
            className="w-full text-left p-3 rounded-lg bg-surface-2 hover:bg-surface-3 transition-colors group"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-medium text-text-primary truncate">{file.title}</div>
                <div className="text-xs text-text-muted mt-0.5">
                  {file.sceneCount} scene{file.sceneCount !== 1 ? 's' : ''}
                </div>
              </div>
              <span className="text-xs text-text-muted whitespace-nowrap flex-shrink-0">
                {relativeTime(file.modified)}
              </span>
            </div>
          </button>
        ))
      )}
    </div>
  );
}
