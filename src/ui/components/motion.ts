import { useEffect, useRef, useState } from 'react';

/**
 * design/DESIGN.md: one ease-out curve everywhere, no spring or overshoot. Slide, swipe
 * and colour pulse only — never pop, lift, blur, scale or shadow.
 */
export const EASE = 'cubic-bezier(.2,.7,.2,1)';
export const DURATION_MS = 300;
export const PULSE_MS = 600;

/** Slides use transform, which composites; reduced motion turns the slide into a cut. */
export const SLIDE =
  'transition-transform duration-300 ease-[cubic-bezier(.2,.7,.2,1)] motion-reduce:transition-none';

/**
 * DESIGN.md > Controls: the only motion on a control is a 0.3 s colour change — hover,
 * focus and tone all cross-fade, nothing moves.
 */
export const COLOUR_SHIFT =
  'transition-colors duration-300 ease-[cubic-bezier(.2,.7,.2,1)] motion-reduce:transition-none';

/** A colour pulse says "this changed" without moving anything. */
export const PULSE_SETTLE =
  'transition-colors duration-[600ms] ease-[cubic-bezier(.2,.7,.2,1)] motion-reduce:transition-none';

/**
 * Whether the rider has asked for less motion. Read at the moment a pulse would start
 * rather than subscribed to, because a pulse decides once — when the thing it marks
 * changes — and has nothing to do between times.
 */
function reducedMotion(): boolean {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/**
 * Cut to ink when `value` changes, then settle back to muted over 0.6 s. Returns the
 * colour classes to spread onto the element; the first render never pulses.
 */
export function usePulse(value: unknown): string {
  const [lit, setLit] = useState(false);
  const seen = useRef(true);

  useEffect(() => {
    if (seen.current) {
      seen.current = false;
      return;
    }
    setLit(true);
    // Two frames, not one. A single frame requested from this effect is the frame React
    // flushes the un-lit state in, so the browser paints muted on both sides of it: the
    // pulse never reaches the screen, and there is no colour change for the settle to run
    // from either. The second frame is the one that gets painted ink.
    let settle = 0;
    const painted = requestAnimationFrame(() => {
      settle = requestAnimationFrame(() => setLit(false));
    });
    return () => {
      cancelAnimationFrame(painted);
      cancelAnimationFrame(settle);
    };
  }, [value]);

  // Reduced motion withholds the pulse itself, not only the settle PULSE_SETTLE already
  // cuts: a lit frame with no settle behind it is ink on screen and then a snap back,
  // which is a flicker and precisely what was asked for less of. Held here rather than in
  // the effect so the lit state stays one unconditional step — and because every caller
  // has to make its change legible from the resting state anyway. A pulse announces a
  // change that is already visible; it never carries one on its own.
  return lit && !reducedMotion() ? 'text-ink' : `text-muted ${PULSE_SETTLE}`;
}
