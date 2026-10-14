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
    // One frame lit, then the transition carries it back down.
    const frame = requestAnimationFrame(() => setLit(false));
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return lit ? 'text-ink' : `text-muted ${PULSE_SETTLE}`;
}
