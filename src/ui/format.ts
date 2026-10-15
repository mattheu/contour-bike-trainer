import type { ExpandedStep } from '../workout/expand';
import type { PowerValue, StepPower } from '../workout/types';

/** Em dash for absent, never 0 — a missing reading and a zero reading differ. */
export const ABSENT = '—';

export function num(value: number | null | undefined, digits = 0): string {
  return value === null || value === undefined || Number.isNaN(value)
    ? ABSENT
    : value.toFixed(digits);
}

/** Inter-arrival times read better in milliseconds up to a second, then seconds. */
export function ms(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return ABSENT;
  return value < 1000 ? `${value.toFixed(0)}ms` : `${(value / 1000).toFixed(2)}s`;
}

export function signed(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return ABSENT;
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}`;
}

type Maybe = number | null | undefined;

function isAbsent(value: Maybe): value is null | undefined {
  return value === null || value === undefined || Number.isNaN(value);
}

/**
 * Elapsed time as `1:23:45` under an hour becomes `23:45`. Seconds are floored, so a
 * readout never shows a time the rider has not reached yet.
 */
export function duration(seconds: Maybe): string {
  if (isAbsent(seconds) || !Number.isFinite(seconds) || seconds < 0) return ABSENT;
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}

/** Distance in kilometres, one decimal: "38.2". */
export function distance(km: Maybe, digits = 1): string {
  return isAbsent(km) || !Number.isFinite(km) ? ABSENT : km.toFixed(digits);
}

/** Elevation in whole metres: "512". Climbed metres are never shown as fractions. */
export function elevation(metres: Maybe): string {
  return isAbsent(metres) || !Number.isFinite(metres) ? ABSENT : Math.round(metres).toFixed(0);
}

/** A percentage without its sign fixed on: gradient reads "6.4", FTP share reads "108". */
export function percent(value: Maybe, digits = 1): string {
  return isAbsent(value) || !Number.isFinite(value) ? ABSENT : value.toFixed(digits);
}

/**
 * Seconds for a displayed reading to close ~95 % of the gap to the actual. DESIGN.md: live
 * readings carry no effect, they just count, so the easing is in the value not the paint.
 */
export const SMOOTHING_SECONDS = 3;

/**
 * Exponential ease of a displayed reading toward its actual, called once per frame or
 * sample with the elapsed time since the last call. Absent actual stays absent — a missing
 * reading must not decay toward zero and look like a rider who stopped pedalling.
 *
 * The gradient readout, and only that: power is a trailing mean over the reading series
 * below, because an ease has no window and so nothing to fall out of across a dropout.
 */
export function smoothPower(displayed: Maybe, actual: Maybe, dtSeconds: number): number | null {
  if (isAbsent(actual) || !Number.isFinite(actual)) return null;
  if (isAbsent(displayed) || !Number.isFinite(displayed)) return actual;
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) return displayed;
  const tau = SMOOTHING_SECONDS / 3;
  return displayed + (actual - displayed) * (1 - Math.exp(-dtSeconds / tau));
}

/**
 * The window the displayed power is averaged over. Three seconds is what Garmin and
 * Wahoo head units default to, and on the first hardware ride it took the mean
 * second-to-second change from 14.7 W to 7.4 and the p95 from 50 W to 26.
 */
export const POWER_WINDOW_S = 3;

/** One reading as it arrived. Seconds are monotonic; only differences are meaningful. */
export interface PowerReading {
  t: number;
  w: number;
}

/**
 * The trailing mean of every reading inside the window ending at `nowS`, or null when
 * there is none — which is the whole of the dropout rule, rather than a case bolted on.
 *
 * A reading leaves the window by ageing out, so three seconds of silence empties it and
 * the readout goes to a dash instead of printing a confident number against a trainer
 * that is not there. The same ageing means a trainer coming back after a gap longer than
 * the window finds the window already empty: its first reading stands alone and nothing
 * is averaged across the hole. No warm-up either — one reading is its own mean, so the
 * first second of a ride shows a number rather than withholding one.
 *
 * Pure, and given the series rather than holding it: the arithmetic is the part worth
 * asserting, and a buffer inside a component is not reachable from a test.
 */
export function trailingMeanPower(
  readings: readonly PowerReading[],
  nowS: number,
  windowS: number = POWER_WINDOW_S,
): number | null {
  if (!Number.isFinite(nowS) || !Number.isFinite(windowS) || windowS <= 0) return null;
  const since = nowS - windowS;
  let total = 0;
  let count = 0;
  for (const reading of readings) {
    if (!Number.isFinite(reading.t) || !Number.isFinite(reading.w)) continue;
    // Exclusive at the old end, inclusive at the new: a reading landing exactly now
    // counts, and one exactly a window old has had its turn.
    if (reading.t <= since || reading.t > nowS) continue;
    total += reading.w;
    count += 1;
  }
  return count === 0 ? null : total / count;
}

/**
 * The readings still worth keeping as of `nowS`. The caller's buffer stays bounded by the
 * window rather than by a sample count, so a trainer notifying at 4 Hz and one at 1 Hz
 * both average over the same three seconds.
 */
export function withinPowerWindow(
  readings: readonly PowerReading[],
  nowS: number,
  windowS: number = POWER_WINDOW_S,
): PowerReading[] {
  return readings.filter((reading) => reading.t > nowS - windowS && reading.t <= nowS);
}

/** Trailing zeros are noise on a target: `95`, not `95.0`, and `87.5` when it is. */
function trim(value: number): string {
  return String(Math.round(value * 10) / 10);
}

function powerValue(value: PowerValue): string {
  return value.unit === 'watts' ? `${trim(value.value)} W` : `${trim(value.value)} %`;
}

/**
 * A step's target as the author wrote it: `55 %`, `250 W`, `50 → 75 %`, or `free`.
 *
 * Deliberately not resolved against an FTP. The plan is what was written, the resolved
 * watts are on the power readout next to it, and a percentage is the form the rider
 * recognises their own session in.
 */
export function stepTarget(power: StepPower): string {
  if (power.kind === 'free') return 'free';
  if (power.kind === 'constant') return powerValue(power.value);
  return power.from.unit === power.to.unit
    ? `${trim(power.from.value)} → ${powerValue(power.to)}`
    : `${powerValue(power.from)} → ${powerValue(power.to)}`;
}

/**
 * One line for one step: `5:00 Recovery · 55 %`, or `5:00 · 55 %` where the author named
 * nothing. Shared by the ride screen's next line and the Steps panel, so the two cannot
 * describe the same step differently.
 */
export function stepLabel(step: ExpandedStep): string {
  const head =
    step.name === undefined ? duration(step.durationS) : `${duration(step.durationS)} ${step.name}`;
  return `${head} · ${stepTarget(step.power)}`;
}
