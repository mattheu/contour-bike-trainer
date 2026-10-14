/**
 * Coggan's training stress score, anchored so that 100 is one hour at FTP.
 *
 * It takes a series of watts and a duration rather than a workout, which is the whole
 * point of it: the same function scores a plan from its targets and a completed ride from
 * its recorded power, so "was that harder than last Tuesday" is one number from one place.
 *
 * Every figure is relative to one FTP, so a ride freezes the FTP it was ridden with and
 * updating the profile never rewrites training history.
 */

/** The series is one sample per second, so the window is thirty samples. */
export const ROLLING_WINDOW_S = 30;

function requireFtp(ftp: number): void {
  if (!Number.isFinite(ftp) || ftp <= 0) {
    throw new RangeError(`ftp must be greater than zero, got ${ftp}`);
  }
}

/**
 * A 30-second rolling average, each average raised to the fourth power, averaged, fourth
 * root. The rolling average barely moves a steady block but does smooth ramps and short
 * intervals, which is why it stays.
 *
 * A null is a second with no target — a free block — and counts as zero rather than being
 * dropped: it contributes nothing to the score while still occupying its time. The first
 * seconds average over the window so far rather than being discarded, so a series shorter
 * than the window still produces a figure instead of nothing.
 */
export function normalisedPower(watts: readonly (number | null)[]): number {
  if (watts.length === 0) return 0;

  let windowSum = 0;
  let quartics = 0;
  for (let i = 0; i < watts.length; i += 1) {
    const value = watts[i];
    windowSum += value === null || value === undefined || !Number.isFinite(value) ? 0 : value;
    if (i >= ROLLING_WINDOW_S) {
      const leaving = watts[i - ROLLING_WINDOW_S];
      windowSum -=
        leaving === null || leaving === undefined || !Number.isFinite(leaving) ? 0 : leaving;
    }
    const span = Math.min(i + 1, ROLLING_WINDOW_S);
    quartics += (windowSum / span) ** 4;
  }
  return (quartics / watts.length) ** 0.25;
}

export function intensityFactor(normalisedPowerW: number, ftp: number): number {
  requireFtp(ftp);
  return normalisedPowerW / ftp;
}

/** `TSS = hours x IF^2 x 100`: linear in duration, quadratic in intensity. */
export function trainingStressScore(
  watts: readonly (number | null)[],
  durationS: number,
  ftp: number,
): number {
  requireFtp(ftp);
  if (!Number.isFinite(durationS) || durationS <= 0) return 0;
  const intensity = intensityFactor(normalisedPower(watts), ftp);
  return (durationS / 3600) * intensity ** 2 * 100;
}
