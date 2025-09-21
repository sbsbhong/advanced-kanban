"use client";

import { useEffect, useRef, useState } from "react";

export type ElementRect = Pick<DOMRectReadOnly, "width" | "height">;

export function useElementRect<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [rect, setRect] = useState<ElementRect>({ width: 0, height: 0 });

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const { width, height } = entry.contentRect;
        setRect({ width, height });
      }
    });

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, []);

  return [ref, rect] as const;
}
