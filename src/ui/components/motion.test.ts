import { describe, expect, it } from 'vitest';
import { COLOUR_SHIFT, FADE, PULSE_SETTLE, SLIDE, SLIDE_SIZE, pulseTone } from './motion';

/**
 * design/DESIGN.md > Motion: "Under `prefers-reduced-motion`, slides become cuts." The
 * rule has to hold for every treatment the app owns and not only the ones that happened to
 * remember it, so this asserts it of the whole vocabulary — a new one added without the
 * escape hatch fails here rather than on somebody's machine.
 *
 * A cut, note, not an absence: every one of these carries its value in the class or the
 * style either way, so turning the transition off leaves the new state on screen.
 */
describe('the motion vocabulary', () => {
  const EVERY = { COLOUR_SHIFT, FADE, PULSE_SETTLE, SLIDE, SLIDE_SIZE };

  it('lets every treatment cut under prefers-reduced-motion', () => {
    for (const [name, classes] of Object.entries(EVERY)) {
      expect(classes, name).toContain('motion-reduce:transition-none');
    }
  });

  /** "Duration about 0.3 s, never more than 0.5 s" — and the colour pulse's own 0.6 s
   *  settle, which DESIGN.md names separately and is the one figure above the ceiling. */
  it('keeps to the one ease-out curve, with no spring or overshoot', () => {
    for (const [name, classes] of Object.entries(EVERY)) {
      expect(classes, name).toContain('ease-[cubic-bezier(.2,.7,.2,1)]');
    }
  });
});

/**
 * The flash's two halves are separate so that one change can announce itself in more than
 * one way; this is the half that is type. Its resting value has to be the muted the
 * element would otherwise be written as, or every element carrying it would shift colour
 * the moment it was given a flash it never fires.
 */
describe('pulseTone', () => {
  it('cuts to ink while lit, with no transition to smear the cut', () => {
    expect(pulseTone(true)).toBe('text-ink');
  });

  it('rests at muted, and settles back to it rather than snapping', () => {
    expect(pulseTone(false)).toContain('text-muted');
    expect(pulseTone(false)).toContain(PULSE_SETTLE);
  });
});
