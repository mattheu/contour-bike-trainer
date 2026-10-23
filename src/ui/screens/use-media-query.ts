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

/**
 * The same phone on its side: four reading slots and one line, to keep height for the
 * profile. The threshold moves to the height because that is the short axis now — the
 * same 560 px, so a phone matches one of the two whichever way it is turned, and a
 * tablet in either orientation matches neither. A desktop window dragged shorter than
 * this gets it too, which is the point: it is the arrangement for a short viewport.
 */
export const PHONE_LANDSCAPE_QUERY = '(max-height: 560px) and (orientation: landscape)';

/**
 * design/DESIGN.md > Screen rules, the Tablet portrait bullet. A tablet held upright gets
 * every chart at once, so the only thing this has to separate it from is a desktop window
 * — hence the `wide` breakpoint as the ceiling: three screens already fold on 1100 px, and
 * above it a portrait monitor is a desktop with a tall window rather than a tablet.
 *
 * No floor, deliberately. The phone's 560 px ceiling is this one's floor and arrangementFor
 * reads the phone queries first, so the overlap is settled by order rather than by a second
 * threshold that would have to be kept in step with the first — and a `min-width: 561px`
 * would leave the half pixel between them matching nothing at all under browser zoom.
 */
export const TABLET_PORTRAIT_QUERY = '(max-width: 1099px) and (orientation: portrait)';

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
