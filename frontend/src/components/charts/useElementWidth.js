import { useEffect, useRef, useState } from 'react';

/** Ancho actual de un elemento (ResizeObserver): los gráficos SVG se redibujan al cambiar el layout. */
export default function useElementWidth(initial = 600) {
  const ref = useRef(null);
  const [width, setWidth] = useState(initial);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}
