import useStore from '../../store/useStore';
import SceneRail from './SceneRail';
import ScriptEditor from './ScriptEditor';
import Canvas from './Canvas';
import TimelineBar from './TimelineBar';

export default function EditorPanel() {
  const project = useStore((s) => s.editorProject);
  const closeEditor = useStore((s) => s.closeEditor);

  if (!project) return null;

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-surface-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border-subtle bg-surface-1">
        {/* macOS title bar spacer */}
        <div className="drag-region absolute inset-0 h-10" />
        <div className="relative z-10 flex items-center gap-2 mt-5">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-accent flex-shrink-0">
            <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
            <line x1="7" y1="2" x2="7" y2="22" />
            <line x1="17" y1="2" x2="17" y2="22" />
            <line x1="2" y1="12" x2="22" y2="12" />
          </svg>
          <h2 className="text-sm font-semibold text-text-primary truncate">{project.title}</h2>
        </div>
        <button
          onClick={closeEditor}
          className="relative z-10 mt-5 text-text-muted hover:text-text-secondary p-1 rounded hover:bg-surface-2 transition-colors"
          title="Close editor"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Main editor area */}
      <div className="flex-1 flex min-h-0">
        {/* Scene Rail */}
        <SceneRail />

        {/* Script Editor */}
        <div className="flex-[45] min-w-0 border-r border-border-subtle">
          <ScriptEditor />
        </div>

        {/* Canvas */}
        <div className="flex-[55] min-w-0">
          <Canvas />
        </div>
      </div>

      {/* Timeline Bar */}
      <TimelineBar />
    </div>
  );
}
