/**
 * Which arrangement a screen draws, for every screen that has more than one.
 *
 * The ride screen and the workout screen both pick in JavaScript rather than hiding one
 * with CSS, and both face the same three-way choice. Shared rather than written twice:
 * two copies of a rule about mutually exclusive queries is one copy that still answers
 * `desktop` on a phone after the other was fixed.
 */

/** The arrangements that exist. Tablet portrait joins them later. */
export type ArrangementName = 'phone-portrait' | 'phone-landscape' | 'desktop';

/**
 * Which one a set of matched queries asks for.
 *
 * Here rather than as a ternary in a render so a test can hold it to the rule: the two
 * phone queries are written to be mutually exclusive, and this is where that assumption
 * is stated — portrait first, so a browser that somehow matched both still gets one
 * arrangement rather than a different one on each render.
 */
export function arrangementFor(matches: {
  phonePortrait: boolean;
  phoneLandscape: boolean;
}): ArrangementName {
  if (matches.phonePortrait) return 'phone-portrait';
  if (matches.phoneLandscape) return 'phone-landscape';
  return 'desktop';
}
