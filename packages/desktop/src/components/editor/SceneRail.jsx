import useStore from '../../store/useStore';

export default function SceneRail() {
  const project = useStore((s) => s.editorProject);
  const activeSceneIndex = useStore((s) => s.activeSceneIndex);

  if (!project || !project.scenes) return null;

  const handleClick = (index) => {
    useStore.setState({ activeSceneIndex: index, playbackTime: 0, isPlaying: false });
  };

  return (
    <div className="w-20 flex-shrink-0 border-r border-border-subtle bg-surface-1 overflow-y-auto">
      {project.scenes.map((scene, i) => {
        const isActive = i === activeSceneIndex;
        return (
          <button
            key={scene.id}
            onClick={() => handleClick(i)}
            className={`w-full p-2 text-left transition-colors border-l-2 ${
              isActive
                ? 'border-l-accent bg-accent-muted/30'
                : 'border-l-transparent hover:bg-surface-2'
            }`}
          >
            {/* Thumbnail or scene number */}
            <div className={`w-full aspect-video rounded flex items-center justify-center text-xs font-bold mb-1 ${
              isActive ? 'bg-accent text-white' : 'bg-surface-3 text-text-muted'
            }`}>
              {scene.image ? (
                <img
                  src={`friday-media://${scene.image}`}
                  alt={`Scene ${i + 1}`}
                  className="w-full h-full object-cover rounded"
                />
              ) : (
                <span>{i + 1}</span>
              )}
            </div>
            {/* Heading */}
            <div className={`text-[10px] leading-tight truncate ${
              isActive ? 'text-accent font-medium' : 'text-text-muted'
            }`}>
              {scene.heading || `Scene ${i + 1}`}
            </div>
          </button>
        );
      })}
    </div>
  );
}
