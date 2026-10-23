/**
 * The four ghost slots and the symbol each one owns.
 *
 * The symbol belongs to the slot and never to the ride filling it, which is the whole
 * reason several ghosts can share a screen with no legend on the map: a square is Best
 * today and Best next winter, so a rider learns four shapes once rather than reading a
 * key every lap.
 *
 * None of the four implies an order. A star was tried for Best and dropped: it reads as
 * a ranking, which makes the other three look like lesser versions of it when they
 * answer different questions. DESIGN.md > Ghosts.
 *
 * The fifth symbol, a semicircle on a flat base, is a friend's ride. It is deliberately
 * absent here rather than stubbed: nothing shares rides yet, and a member of this union that no code path
 * can produce is a slot the renderer has to handle and the resolver has to skip.
 */

/** Geometry only. The renderer owns fill, stroke colour and opacity; the design gives
 * all four the same muted hollow treatment, so none of that varies per slot. */
export interface GhostSymbol {
  /** The shape, for a renderer that wants to name what it is drawing. */
  shape: 'square' | 'triangle' | 'diamond' | 'pentagon';
  /** SVG path data, drawn on a 14 × 14 box with its origin top-left. */
  d: string;
}

/** The box every symbol path above is drawn on. A viewBox, not a rendered size. */
export const SYMBOL_BOX = 14;

/**
 * The stroke the paths were drawn against, exported because it is geometry and not
 * decoration: the points sit inset from the box by half of it, so a symbol drawn at a
 * different weight bleeds past the edges the map and the key band lay out to.
 */
export const SYMBOL_STROKE_WIDTH = 1.25;

export type GhostSlot = 'best' | 'year' | 'last' | 'chosen';

/** The order the key band reads, left to right: the three resolved slots, then the
 * picked ride. Exported so the band and the map cannot disagree about it. */
export const SLOT_ORDER: readonly GhostSlot[] = ['best', 'year', 'last', 'chosen'];

/**
 * Taken verbatim from the key band in design/mockups/ride.html, including its decimals.
 * The square is a `<rect>` there; it is expressed as a path here so all four are one
 * kind of thing and a renderer draws them with one element.
 */
export const SLOT_SYMBOL: Record<GhostSlot, GhostSymbol> = {
  best: { shape: 'square', d: 'M2.0,2.0 L12.0,2.0 L12.0,12.0 L2.0,12.0 Z' },
  year: { shape: 'triangle', d: 'M7.0,1.2 L12.5,11.2 L1.5,11.2 Z' },
  // A square turned 45 degrees: both diagonals are 12, so it reads as a square on its
  // point rather than a lozenge. The earlier path was 11 wide and 13 tall.
  last: { shape: 'diamond', d: 'M7.0,1.0 L13.0,7.0 L7.0,13.0 L1.0,7.0 Z' },
  // Regular, point up, circumradius 6 on the same 14 box.
  chosen: { shape: 'pentagon', d: 'M7.0,1.0 L12.7,5.1 L10.5,11.9 L3.5,11.9 L1.3,5.1 Z' },
};

/** What the key band prints for the three slots resolved from history. The picked slot
 * has no fixed word: it is named after the ride the rider chose. */
const FIXED_NAME: Record<Exclude<GhostSlot, 'chosen'>, string> = {
  best: 'Best',
  year: 'Year',
  last: 'Last',
};

/**
 * And what the ride settings panel calls them, which is longer because it has the room
 * and is naming a rule rather than labelling a figure: "Year" beside a gap is read off a
 * symbol the rider already knows, but a checkbox has to say what it switches on.
 */
export const SLOT_DESCRIPTION: Record<GhostSlot, string> = {
  best: 'Best',
  year: 'Best this year',
  last: 'Most recent',
  chosen: 'Picked ride',
};

// Spelled out rather than taken from Intl for the reason the rides list gives: en-GB
// abbreviates September to "Sept" and the mockup uses "Sep". Duplicated rather than
// imported, because that list lives in a screen module and a domain module must not
// reach up into one.
const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** "29 Sep", in the rider's own timezone: the day they rode it, not the day UTC had. */
export function shortDate(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  return `${String(at.getDate())} ${MONTHS_SHORT[at.getMonth()] ?? ''}`.trim();
}

/** "21 Sep 2025", for the settings panel, which names a ride rather than a day's riding
 * and so has to say which year's September it means. */
export function longDate(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  return `${String(at.getDate())} ${MONTHS_SHORT[at.getMonth()] ?? ''} ${String(at.getFullYear())}`;
}

/**
 * The word beside the symbol. `startedAt` is only read for the picked slot, and is asked
 * for unconditionally so every call site names the ride it is drawing — a slot named
 * without one would be a ghost nobody can say the date of.
 */
export function slotName(slot: GhostSlot, startedAt: string): string {
  return slot === 'chosen' ? shortDate(startedAt) : FIXED_NAME[slot];
}
