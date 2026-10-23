/**
 * Which arrangement a screen draws, for every screen that has more than one.
 *
 * The ride screen and the workout screen both pick in JavaScript rather than hiding one
 * with CSS, and both face the same choice. Shared rather than written twice: two copies
 * of a rule about overlapping queries is one copy that still answers `desktop` on a phone
 * after the other was fixed.
 */

/** The arrangements that exist. Not every screen draws all four — see each screen's map. */
export type ArrangementName = 'phone-portrait' | 'phone-landscape' | 'tablet-portrait' | 'desktop';

/**
 * Which one a set of matched queries asks for.
 *
 * Here rather than as a ternary in a render so a test can hold it to the rule, and the
 * order is the rule: the two phone queries are mutually exclusive, but the tablet's has no
 * floor of its own and so covers every phone in portrait as well. Narrowest first, which
 * is what makes that safe — a phone is answered before the tablet query is ever read.
 */
export function arrangementFor(matches: {
  phonePortrait: boolean;
  phoneLandscape: boolean;
  tabletPortrait: boolean;
}): ArrangementName {
  if (matches.phonePortrait) return 'phone-portrait';
  if (matches.phoneLandscape) return 'phone-landscape';
  if (matches.tabletPortrait) return 'tablet-portrait';
  return 'desktop';
}
