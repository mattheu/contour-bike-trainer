import { useCallback, useMemo, useSyncExternalStore } from 'react';

/**
 * Whether a CSS media query matches, as React state.
 *
 * The ride screen picks an arrangement in JavaScript rather than drawing two and hiding
 * one with CSS. Its charts are imperatively-updated SVGs held by refs: a hidden second
 * set would still be built, still be handed every tick, and still hold handles the
 * screen would have to keep straight — all to draw nothing. So the query has to reach
 * the render, not only the stylesheet.
 *
 * Shaped like use-element-width's hooks: a measurement of the environment, returned as a
 * value, with the subscription kept out of the component.
 */

/**
 * design/DESIGN.md > Screen rules. A phone in portrait: one column of readings over one
 * chart. 560 px rather than Tailwind's 640 px `sm`, so a small tablet held upright gets
 * the tablet arrangement it is designed for rather than a phone's.
 */
export const PHONE_PORTRAIT_QUERY = '(max-width: 560px) and (orientation: portrait)';

export function useMediaQuery(query: string): boolean {
  const list = useMemo(
    () => (typeof globalThis.matchMedia === 'function' ? globalThis.matchMedia(query) : null),
    [query],
  );

  const subscribe = useCallback(
    (onChange: () => void) => {
      list?.addEventListener('change', onChange);
      return () => list?.removeEventListener('change', onChange);
    },
    [list],
  );

  // False where there is no matchMedia at all, which is the desktop arrangement: the
  // wider one is the safer thing to render blind, because it is the one that measures
  // its own row and copes with whatever width it turns out to have.
  return useSyncExternalStore(
    subscribe,
    () => list?.matches ?? false,
    () => false,
  );
}
