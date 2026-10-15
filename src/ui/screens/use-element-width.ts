import { useLayoutEffect, useState, type RefObject } from 'react';

/**
 * The content width of an element, in CSS pixels, null until it has been measured.
 *
 * useLayoutEffect rather than useEffect so the first measurement lands before paint: the
 * charts are re-projected to this number, and a frame drawn at the fallback width and
 * then redrawn at the real one is a visible flinch on every route you open.
 *
 * The observed element must carry no padding of its own — getBoundingClientRect is a
 * border box and ResizeObserver's contentRect is not, so a padded element would report
 * two different widths and the charts would jump by the padding on first resize.
 */
export function useElementWidth(ref: RefObject<HTMLElement | null>): number | null {
  const [width, setWidth] = useState<number | null>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    if (node === null) return;

    // Only on a real change: a resize that rounds to the same pixel must not re-run
    // every geometry in the row.
    const measure = (next: number): void => {
      const rounded = Math.round(next);
      setWidth((current) => (current === rounded ? current : rounded));
    };

    measure(node.getBoundingClientRect().width);

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry !== undefined) measure(entry.contentRect.width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);

  return width;
}

/**
 * The content height of an element, in CSS pixels, null until measured.
 *
 * Same contract as the width: useLayoutEffect so the first measurement lands before
 * paint, and only on a real pixel change. The observed element must carry no vertical
 * padding, for the reason the width hook gives about border boxes.
 */
export function useElementHeight(ref: RefObject<HTMLElement | null>): number | null {
  const [height, setHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    if (node === null) return;

    const measure = (next: number): void => {
      const rounded = Math.round(next);
      setHeight((current) => (current === rounded ? current : rounded));
    };

    measure(node.getBoundingClientRect().height);

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry !== undefined) measure(entry.contentRect.height);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);

  return height;
}
