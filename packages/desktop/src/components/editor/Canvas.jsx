import { useRef, useEffect } from 'react';
import useStore from '../../store/useStore';

export default function Canvas() {
  const project = useStore((s) => s.editorProject);
  const activeSceneIndex = useStore((s) => s.activeSceneIndex);
  const isPlaying = useStore((s) => s.isPlaying);

  const scene = project?.scenes?.[activeSceneIndex];
  const videoRef = useRef(null);

  // Play/pause video when isPlaying changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [isPlaying]);

  // Report currentTime to store via timeupdate
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => {
      const store = useStore.getState();
      if (store.isPlaying) {
        useStore.setState({ playbackTime: video.currentTime });
      }
    };

    const onEnded = () => {
      useStore.setState({ isPlaying: false, playbackTime: 0 });
    };

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('ended', onEnded);
    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('ended', onEnded);
    };
  }, [activeSceneIndex]);

  // Reset video on scene change
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.currentTime = 0;
      video.pause();
    }
  }, [activeSceneIndex]);

  if (!scene) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted text-sm">
        No scene selected
      </div>
    );
  }

  const hasVideo = !!scene.video;
  const hasImage = !!scene.image;

  if (hasVideo) {
    return (
      <div className="h-full flex items-center justify-center bg-black p-4">
        <video
          ref={videoRef}
          src={`friday-media://${scene.video}`}
          className="max-w-full max-h-full rounded"
          playsInline
        />
      </div>
    );
  }

  if (hasImage) {
    return (
      <div className="h-full flex items-center justify-center bg-surface-2 p-4">
        <img
          src={`friday-media://${scene.image}`}
          alt={scene.heading || 'Scene'}
          className="max-w-full max-h-full rounded object-contain"
        />
      </div>
    );
  }

  return (
    <div className="h-full flex items-center justify-center bg-surface-2">
      <div className="text-center text-text-muted">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3 opacity-40">
          <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
          <line x1="7" y1="2" x2="7" y2="22" />
          <line x1="17" y1="2" x2="17" y2="22" />
          <line x1="2" y1="12" x2="22" y2="12" />
        </svg>
        <p className="text-sm">No media for this scene</p>
        <p className="text-xs mt-1 opacity-60">Add image or video paths to the project JSON</p>
      </div>
    </div>
  );
}
