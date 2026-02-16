import { useCallback, useEffect, useRef, useState } from 'react';

export default function ResizeHandle() {
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);

  const onMouseDown = useCallback((e) => {
    setDragging(true);
    startX.current = e.clientX;
    e.preventDefault();
  }, []);

  useEffect(() => {
    if (!dragging) return;

    const onMouseMove = (e) => {
      // The parent handles the actual resize via flex-basis or width
      // For now this is a visual affordance; full resize can be added later
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
