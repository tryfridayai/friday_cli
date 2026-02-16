import { useCallback, useEffect, useRef, useState } from 'react';
import useStore from '../../store/useStore';

export default function ResizeHandle() {
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const onMouseDown = useCallback((e) => {
    setDragging(true);
    startX.current = e.clientX;
    startWidth.current = useStore.getState().previewWidth;
    e.preventDefault();
  }, []);

  useEffect(() => {
    if (!dragging) return;

    const onMouseMove = (e) => {
      // Dragging left → panel gets wider (deltaX is negative)
      const delta = startX.current - e.clientX;
      useStore.getState().setPreviewWidth(startWidth.current + delta);
      document.body.style.cursor = 'col-resize';
    };

    const onMouseUp = () => {
      setDragging(false);
      document.body.style.cursor = '';
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
    };
  }, [dragging]);

  return (
    <div
      onMouseDown={onMouseDown}
      className={`
        w-1 flex-shrink-0 cursor-col-resize transition-colors
        ${dragging ? 'bg-accent' : 'bg-border-subtle hover:bg-border'}
      `}
    />
  );
}
