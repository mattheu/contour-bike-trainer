import { COLOUR_SHIFT } from './motion';

/**
 * DESIGN.md > Controls, in one place. Every pressable thing in the app — a Button, an
 * IconButton, a Segmented option, the Dismiss in an alert — is built from these, so a
 * call site picks a tone and nothing else. Nothing here is repeated in a screen.
 */

/**
 * Accent is the one action a screen exists for, one per screen. Ink is selected, or the
 * single committing action in a panel. Grey is everything else.
 */
export type ControlTone = 'accent' | 'ink' | 'grey';

/**
 * The 1 px box, square, transparent at rest. `relative` so the z values below apply: they
 * only matter inside a group, where neighbours share an edge and one border is painted
 * over the other.
 */
const BASE = [
  'relative border font-sans tracking-[0.08em] uppercase',
  COLOUR_SHIFT,
  'focus-visible:outline-ink focus-visible:outline-2 focus-visible:outline-offset-2',
  'disabled:cursor-not-allowed disabled:opacity-40',
].join(' ');

/**
 * Pressable, and with a fill to lose: the rest state every tone shares. Exported for the
 * one control DESIGN.md colours outside the three tones — Retry on a fault strip, which
 * is ground on amber — so it still gets the box, the focus ring and the colour change.
 */
export const CONTROL_BOX = `${BASE} cursor-pointer bg-transparent`;

/**
 * Hover is the strongest state on the screen: a solid box with a ground label, saying
 * "about to act". It lifts above both neighbours so pointing at a quiet button still
 * shows its whole box rather than three sides of it. `enabled:` keeps it off a disabled
 * control, which has no hover at all.
 */
const HOVER_INK =
  'enabled:hover:bg-ink enabled:hover:text-ground enabled:hover:border-ink enabled:hover:z-[3]';
const HOVER_ACCENT =
  'enabled:hover:bg-accent enabled:hover:text-ground enabled:hover:border-accent enabled:hover:z-[3]';

/**
 * A coloured member sits above a grey neighbour so it keeps all four of its own borders:
 * an accent box with one hairline edge reads as three-quarters of a box, not as emphasis.
 */
export const TONE: Record<ControlTone, string> = {
  grey: `${CONTROL_BOX} z-[1] border-hairline text-muted ${HOVER_INK}`,
  ink: `${CONTROL_BOX} z-[2] border-ink text-ink ${HOVER_INK}`,
  accent: `${CONTROL_BOX} z-[2] border-accent text-accent ${HOVER_ACCENT}`,
};

/** An icon button is a grey box with an ink glyph, and hovers like any other grey box. */
export const ICON = `${CONTROL_BOX} z-[1] border-hairline text-ink ${HOVER_INK}`;

/**
 * Already chosen. A faint fill means "current" where a solid one means "about to act", so
 * there is no hover to go to and the pointer says so.
 */
export const SELECTED = `${BASE} z-[2] cursor-default border-ink text-ink bg-ink/10`;

/** 48 px tall on desktop and tablet, 44 on phones. */
export const CONTROL_SIZE = 'text-label min-h-[44px] min-w-[44px] sm:min-h-[48px] sm:min-w-[48px]';

/**
 * The one gap allowed between controls that are not in a group: 16 px on desktop, 12 px
 * on phones. DESIGN.md allows no distance between the two.
 */
export const CONTROL_GAP = 'gap-[12px] sm:gap-[16px]';
