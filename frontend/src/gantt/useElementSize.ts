import { useCallback, useLayoutEffect, useState } from "react";

export interface ElementSize {
  width: number;
  height: number;
}

export function useElementSize<T extends HTMLElement>() {
  const [element, setElement] = useState<T | null>(null);
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });
  const ref = useCallback((node: T | null) => setElement(node), []);

  useLayoutEffect(() => {
    if (!element) return;

    const update = (width: number, height: number) => {
      if (width <= 0 || height <= 0) return;
      setSize((current) => (
        current.width === width && current.height === height ? current : { width, height }
      ));
    };

    const initial = element.getBoundingClientRect();
    update(initial.width, initial.height);
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(([entry]) => {
      if (entry) update(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  return { ref, size };
}
