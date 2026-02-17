import { useMemo } from 'react';
import useStore from '../../store/useStore';

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

// Distinct colors for scene segments
const SEGMENT_COLORS = [
  'bg-accent',
  'bg-blue-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-purple-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-orange-500',
];

export default function TimelineBar() {
  const project = useStore((s) => s.editorProject);
  const activeSceneIndex = useStore((s) => s.activeSceneIndex);
  const isPlaying = useStore((s) => s.isPlaying);
  const playbackTime = useStore((s) => s.playbackTime);

  const scenes = project?.scenes || [];

  // Compute scene offsets and total duration
  const { sceneOffsets, totalDuration } = useMemo(() => {
    const offsets = [];
    let total = 0;
    for (const scene of scenes) {
      offsets.push(total);
      total += scene.duration || 10;
    }
    return { sceneOffsets: offsets, totalDuration: total };
  }, [scenes]);

  const currentGlobalTime = (sceneOffsets[activeSceneIndex] || 0) + playbackTime;
  const currentSceneDuration = scenes[activeSceneIndex]?.duration || 10;

  const handlePrev = () => {
    const newIndex = Math.max(0, activeSceneIndex - 1);
    useStore.setState({ activeSceneIndex: newIndex, playbackTime: 0, isPlaying: false });
  };

  const handleNext = () => {
    const newIndex = Math.min(scenes.length - 1, activeSceneIndex + 1);
    useStore.setState({ activeSceneIndex: newIndex, playbackTime: 0, isPlaying: false });
  };

  const handlePlayPause = () => {
    useStore.setState({ isPlaying: !isPlaying });
  };

  const handleSegmentClick = (index) => {
    useStore.setState({ activeSceneIndex: index, playbackTime: 0, isPlaying: false });
  };

  return (
    <div className="flex-shrink-0 border-t border-border-subtle bg-surface-1 px-4 py-2">
      <div className="flex items-center gap-3">
        {/* Controls */}
        <div className="flex items-center gap-1">
          {/* Prev */}
          <button
            onClick={handlePrev}
            disabled={activeSceneIndex === 0}
            className="p-1.5 rounded hover:bg-surface-2 text-text-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Previous scene"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
            </svg>
          </button>

          {/* Play/Pause */}
          <button
            onClick={handlePlayPause}
            className="p-1.5 rounded hover:bg-surface-2 text-text-secondary transition-colors"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          {/* Next */}
          <button
            onClick={handleNext}
            disabled={activeSceneIndex === scenes.length - 1}
            className="p-1.5 rounded hover:bg-surface-2 text-text-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Next scene"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
            </svg>
          </button>
        </div>

        {/* Time display */}
        <span className="text-xs text-text-muted font-mono tabular-nums whitespace-nowrap">
          {formatTime(currentGlobalTime)} / {formatTime(totalDuration)}
        </span>

        {/* Progress bar with scene segments */}
        <div className="flex-1 flex h-3 rounded-full overflow-hidden bg-surface-3 cursor-pointer">
          {scenes.map((scene, i) => {
            const duration = scene.duration || 10;
            const widthPercent = totalDuration > 0 ? (duration / totalDuration) * 100 : 0;
            const isActive = i === activeSceneIndex;
            const fillPercent = isActive && duration > 0
              ? Math.min(100, (playbackTime / duration) * 100)
              : i < activeSceneIndex ? 100 : 0;
            const color = SEGMENT_COLORS[i % SEGMENT_COLORS.length];

            return (
              <div
                key={scene.id}
                onClick={() => handleSegmentClick(i)}
                className={`relative h-full transition-opacity ${
                  i > 0 ? 'border-l border-surface-0' : ''
                } ${isActive ? 'opacity-100' : 'opacity-60 hover:opacity-80'}`}
                style={{ width: `${widthPercent}%` }}
                title={`${scene.heading || `Scene ${i + 1}`} (${formatTime(duration)})`}
              >
                <div
                  className={`absolute inset-y-0 left-0 ${color} transition-all`}
                  style={{ width: `${fillPercent}%` }}
                />
              </div>
            );
          })}
        </div>

        {/* Scene indicator */}
        <span className="text-xs text-text-muted whitespace-nowrap">
          {activeSceneIndex + 1}/{scenes.length}
        </span>
      </div>
    </div>
  );
}
