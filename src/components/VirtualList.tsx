import { useEffect, useRef, useState, type ReactNode } from 'react';

export function VirtualList<T>({
  items,
  itemHeight,
  renderItem,
  keyFor,
  overscan = 6,
  className = '',
}: {
  items: T[];
  itemHeight: number;
  renderItem: (item: T, index: number) => ReactNode;
  keyFor: (item: T, index: number) => string;
  overscan?: number;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState({ start: 0, end: Math.min(items.length, 18) });

  useEffect(() => {
    let frame = 0;
    const compute = () => {
      frame = 0;
      const element = containerRef.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const absoluteTop = rect.top + window.scrollY;
      const viewTop = window.scrollY - absoluteTop;
      const viewport = window.innerHeight;
      const start = Math.max(0, Math.floor(viewTop / itemHeight) - overscan);
      const end = Math.min(items.length, Math.ceil((viewTop + viewport) / itemHeight) + overscan);
      setRange((previous) => {
        const nextStart = Math.min(start, Math.max(0, items.length - 1));
        const nextEnd = Math.max(nextStart + 1, end);
        if (previous.start === nextStart && previous.end === nextEnd) return previous;
        return { start: nextStart, end: nextEnd };
      });
    };
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(compute);
    };
    compute();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [items.length, itemHeight, overscan]);

  const start = Math.min(range.start, Math.max(0, items.length - 1));
  const end = Math.min(range.end, items.length);
  const visible = items.slice(start, end);

  return (
    <div ref={containerRef} className={`relative ${className}`} style={{ height: items.length * itemHeight }}>
      {visible.map((item, offset) => {
        const index = start + offset;
        return (
          <div
            key={keyFor(item, index)}
            style={{ position: 'absolute', top: 0, insetInline: 0, transform: `translateY(${index * itemHeight}px)`, height: itemHeight }}
          >
            {renderItem(item, index)}
          </div>
        );
      })}
    </div>
  );
}
