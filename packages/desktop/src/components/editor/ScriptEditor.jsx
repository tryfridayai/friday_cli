import { useState, useEffect, useRef, useCallback } from 'react';
import useStore from '../../store/useStore';

export default function ScriptEditor() {
  const project = useStore((s) => s.editorProject);
  const activeSceneIndex = useStore((s) => s.activeSceneIndex);
  const updateSceneScript = useStore((s) => s.updateSceneScript);

  const scene = project?.scenes?.[activeSceneIndex];
  const [localText, setLocalText] = useState('');
  const timerRef = useRef(null);
  const lastSceneIdRef = useRef(null);

  // Sync local state when scene changes
  useEffect(() => {
    if (scene && scene.id !== lastSceneIdRef.current) {
      setLocalText(scene.script || '');
      lastSceneIdRef.current = scene.id;
    }
  }, [scene]);

  const debouncedSave = useCallback((text) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      updateSceneScript(activeSceneIndex, text);
    }, 500);
  }, [activeSceneIndex, updateSceneScript]);

  // Cleanup timer
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleChange = (e) => {
    const text = e.target.value;
    setLocalText(text);
    debouncedSave(text);
  };

  if (!scene) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted text-sm">
        No scene selected
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-4">
      <h3 className="text-sm font-semibold text-text-primary mb-3 flex-shrink-0">
        {scene.heading || `Scene ${activeSceneIndex + 1}`}
      </h3>
      <textarea
        value={localText}
        onChange={handleChange}
        className="flex-1 w-full resize-none bg-surface-2 rounded-lg p-3 text-sm text-text-primary placeholder-text-muted border border-border-subtle focus:border-accent focus:outline-none transition-colors"
        placeholder="Write your script here..."
        spellCheck={false}
      />
    </div>
  );
}
