/**
 * The gap: how far up the road the ghost is, in seconds of the rider's deficit.
 *
 * Positive means the ghost is ahead. It is a time question and not a distance one — when
 * did the ghost reach the metre you are on, against when did you — because seconds are
 * what a rider races in and what a split is read in afterwards.
 */

/** A true minus, U+2212, not a hyphen. It is the same width as the plus in a mono face,
 * so a gap counting down does not shuffle the figures beside it. DESIGN.md > Ghosts. */
export const MINUS = '−';

/**
 * `+0:18`, `${MINUS}0:12`, `+0:00`. Always signed, including at nought: an unsigned
 * figure in a column of signed ones reads as a different kind of number rather than as
 * level pegging.
 *
 * Minutes are not capped at 59 and never roll into an hour. A ghost twelve minutes up
 * the road is `+12:00`, which stays a gap; `0:12:00` would be a duration, and the band
 * already carries one of those.
 *
 * Rounded to the second, and signed from the rounded figure — half a second behind reads
 * `+0:00` rather than a minus beside a nought.
 */
export function formatGap(gapS: number): string {
  const whole = Math.round(gapS);
  const sign = whole < 0 ? MINUS : '+';
  const magnitude = Math.abs(whole);
  const minutes = Math.floor(magnitude / 60);
  const seconds = magnitude % 60;
  return `${sign}${String(minutes)}:${String(seconds).padStart(2, '0')}`;
}
