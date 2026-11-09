/**
 * Trend strip geometry: the two short traces under the primary chart, and the axis that
 * rules the bottom of the block they make with it.
 *
 * design/DESIGN.md > Marks > Trend strips. A strip is a caption band over a trace, drawn
 * on a scale that is fixed rather than fitted, so a flat ride looks flat and the same
 * shape means the same effort on every screen and every session.
 *
 * One module serves both axes the block is drawn over — distance on a ride, time on a
 * workout — because a strip only ever knows x as a number between two bounds. What that
 * number means belongs to the chart above it.
 *
 * Pure, and tested, like every other geometry module here. TrendStrips.tsx draws this and
 * decides nothing.
 */

import { duration } from '../format';
import { distanceTicks } from './elevation';
import { areaPath, polylinePath, type Pt } from './path';

/**
 * The top of the power trace, as a fraction of FTP.
 *
 * **Expected to be tuned.** This is the one number in the strip that is a judgement rather
 * than a measurement, and it is known to be contentious. 110 % is what DESIGN.md asks for:
 * low enough that an endurance ride uses the full depth of the trace instead of crawling
 * along the bottom, which is what the previous 160 % produced. The cost is that a hard
 * effort spends most of its time at or over the ceiling — at FTP 200 the trace tops out at
 * 220 W, and a climb ridden at 223 W sits on the rule for its whole length.
 *
 * That is the trade the design makes on purpose: the strip shows shape, the hero figures
 * carry the watts, and an over-the-top effort reads as a needle rather than rescaling
 * everything under it.
 *
 * **Tuned to 130 %, up from the design's 110 %, on a measured ride rather than a guess.**
 * Two laps of the Koppenberg at FTP 200: the climb held 218-223 W for five and a half
 * minutes a lap, so at 110 % eleven of the ride's thirty-three minutes sat on the rule —
 * the part of the lap the rider cares about was the part the strip stopped resolving. The
 * climb needs about 115 % to sit inside the trace at all and 125-130 % to sit near its top
 * with headroom. At 130 % an endurance ride at 150 W still uses 58 % of the depth, which
 * is the thing 110 % was protecting, and a genuine sprint still needles and pins.
 *
 * Still the dial, and nothing else in the strip moves with it.
 */
export const POWER_CEILING_FRACTION_OF_FTP = 1.3;

/** design/DESIGN.md: heart rate runs 80 to 200 bpm, fixed. */
export const HEART_RATE_FLOOR_BPM = 80;
export const HEART_RATE_CEILING_BPM = 200;

/**
 * How much of a strip is caption band and how much is trace, per breakpoint.
 *
 * Both are constants rather than fractions of a height, because both hold type: the
 * caption is 10 px of tracked caps whatever the screen, and a band computed as a share of
 * the strip would slide the axis onto the words as the strip got shorter. The phones
 * compact by taking a step off each rather than by scaling.
 */
export interface StripMetrics {
  /** The caption band, and so the y the trace starts at. */
  bandPx: number;
  tracePx: number;
  captionPx: number;
}

/** The caption sits this far off the band's floor, which is DESIGN.md's 12 px of clear. */
const CAPTION_BASELINE_PX = 4;

export const DESKTOP_STRIP: StripMetrics = { bandPx: 22, tracePx: 28, captionPx: 10 };
export const PHONE_STRIP: StripMetrics = { bandPx: 16, tracePx: 20, captionPx: 10 };
export const PHONE_LANDSCAPE_STRIP: StripMetrics = { bandPx: 16, tracePx: 18, captionPx: 9 };

/** 50 px on desktop and tablet, 36 in a phone's portrait, 34 turned sideways. */
export function stripHeight(metrics: StripMetrics): number {
  return metrics.bandPx + metrics.tracePx;
}

/** Both strips together: what the block costs under the chart it belongs to. */
export function stripsHeight(metrics: StripMetrics): number {
  return 2 * stripHeight(metrics);
}

/** Fixed order, matching the hero figures left to right. design/DESIGN.md > Trend strips. */
export const STRIP_ORDER = ['power', 'heartRate'] as const;
export type TrendKind = (typeof STRIP_ORDER)[number];

export const STRIP_CAPTION: Record<TrendKind, string> = {
  power: 'Power',
  heartRate: 'Heart rate',
};

/** A reading placed on the block's x-axis: metres on a ride, seconds on a workout. */
export interface TrendSample {
  at: number;
  /** Null where the sensor reported nothing, which breaks the trace rather than zeroing it. */
  value: number | null;
}

export interface TrendStripInput {
  samples: readonly TrendSample[];
  kind: TrendKind;
  /** Read for power and ignored for heart rate, whose scale is absolute. */
  ftpW: number;
  /** The window, shared with the chart above. */
  startAt: number;
  endAt: number;
  width: number;
  metrics: StripMetrics;
}

export interface TrendStripGeometry {
  width: number;
  height: number;
  /** The trace's top edge: the caption band's floor, and where a drop line starts. */
  traceTopY: number;
  /** The strip's bottom rule, which is also the top rule of whatever sits below it. */
  baselineY: number;
  captionY: number;
  /** The reading at the top of the trace. Anything above it needles into the band. */
  ceiling: number;
  floor: number;
  xFor(at: number): number;
  yFor(value: number): number;
  /** One path per run of samples that reported a reading; a dropout breaks the run. */
  linePaths: string[];
  areaPaths: string[];
  /**
   * Whether there is a trace to draw. False leaves the strip in place with its caption and
   * a dash, so a sensor nobody connected never moves the layout.
   *
   * A trace and not a reading: a single sample draws no line, and a strip that is empty
   * with nothing to say would be a sensor the rider cannot tell from a broken one. One
   * reading is also not a trend, which is the only thing this chart claims to show.
   */
  connected: boolean;
}

function scaleFor(kind: TrendKind, ftpW: number): { floor: number; ceiling: number } {
  if (kind === 'heartRate') {
    return { floor: HEART_RATE_FLOOR_BPM, ceiling: HEART_RATE_CEILING_BPM };
  }
  return { floor: 0, ceiling: Math.max(ftpW, 1) * POWER_CEILING_FRACTION_OF_FTP };
}

export function trendStripGeometry(input: TrendStripInput): TrendStripGeometry {
  const { samples, kind, ftpW, startAt, endAt, width, metrics } = input;

  const height = stripHeight(metrics);
  const traceTopY = metrics.bandPx;
  const baselineY = height;
  const { floor, ceiling } = scaleFor(kind, ftpW);
  const span = Math.max(endAt - startAt, 1e-9);
  const perUnit = metrics.tracePx / Math.max(ceiling - floor, 1e-9);

  const xFor = (at: number): number =>
    ((Math.min(Math.max(at, startAt), endAt) - startAt) / span) * width;

  /**
   * The needle. A reading over the ceiling keeps climbing at the same rate through the
   * caption band and stops at the strip's top rule, rather than flattening at the top of
   * the trace: a flat top says "at least this much and the chart gave up", where a spike
   * of a visible length says how far over it went. The rule is where it runs out — on
   * desktop that is 22 px of band on top of 28 px of trace, so a little under twice the
   * ceiling, and a sprint pins there the way DESIGN.md asks it to.
   */
  const yFor = (value: number): number =>
    Math.min(Math.max(baselineY - (value - floor) * perUnit, 0), baselineY);

  const linePaths: string[] = [];
  const areaPaths: string[] = [];
  let connected = false;
  let run: Pt[] = [];
  const flush = (): void => {
    if (run.length >= 2) {
      linePaths.push(polylinePath(run));
      areaPaths.push(areaPath(run, baselineY, false));
      connected = true;
    }
    run = [];
  };
  for (const sample of samples) {
    if (sample.value === null || !Number.isFinite(sample.value) || !Number.isFinite(sample.at)) {
      flush();
      continue;
    }
    if (sample.at < startAt || sample.at > endAt) {
      flush();
      continue;
    }
    run.push({ x: xFor(sample.at), y: yFor(sample.value) });
  }
  flush();

  return {
    width,
    height,
    traceTopY,
    baselineY,
    captionY: metrics.bandPx - CAPTION_BASELINE_PX,
    ceiling,
    floor,
    xFor,
    yFor,
    linePaths,
    areaPaths,
    connected,
  };
}

/**
 * The ride recorder's series, narrowed to what the two strips read. Structurally what the
 * store publishes, so a screen hands its samples straight over.
 */
export interface TrendRideSample {
  t: number;
  distanceM: number;
  powerW: number | null;
  heartRateBpm: number | null;
}

export interface TrendSamples {
  power: TrendSample[];
  heartRate: TrendSample[];
}

/**
 * The window the power trace is averaged over before it is drawn.
 *
 * Measured on the author's second hardware ride, which was ERG for the first half and
 * manual for the second: second-to-second power change went from a mean of 3.4 W (p95 12)
 * under ERG to 17.6 W (p95 68, max 293) under manual, and the raw line read as a hedge
 * rather than a trace. Five seconds takes the manual half to a mean of 5.4 W and a p95 of
 * 27 — about what ERG produces with no smoothing at all.
 *
 * Longer than the hero's three seconds on purpose, because the two are read differently.
 * The hero is a number the rider reacts to, so its lag is the cost of every correction they
 * make. Nobody reads a watt value off a 28 px trace: it answers "how steady was that
 * block", which lag does not change.
 *
 * Power only. Heart rate moves at the pace of the body and has nothing to smooth.
 *
 * For drawing, and for nothing else: the series handed in is the recorder's own, which is
 * what gets stored, exported and scored, and it is read here and never written.
 */
export const TRACE_WINDOW_S = 5;

/**
 * The samples' power as the trace draws it: every reading replaced by the trailing mean of
 * the readings inside `windowS` ending at it.
 *
 * Absence survives exactly — a second the trainer did not report comes back null, so the
 * trace breaks where it always broke rather than being bridged by a mean. Readings age out
 * of the window by time and not by count, so a gap longer than the window empties it and
 * nothing is averaged across the hole.
 *
 * Trailing, not centred: a centred mean would draw the line ahead of where the rider
 * actually was, and the last half-window would need a different rule from the rest.
 *
 * One pass with a sliding sum. The block is redrawn every second as the series grows, so
 * an hour of riding has to cost an hour of samples and not their square. Assumes samples in
 * time order, which the recorder's 1 Hz series is.
 */
export function smoothPower(
  samples: readonly TrendRideSample[],
  windowS: number = TRACE_WINDOW_S,
): (number | null)[] {
  const readingOf = (sample: TrendRideSample): number | null =>
    !Number.isFinite(sample.t) || sample.powerW === null || !Number.isFinite(sample.powerW)
      ? null
      : sample.powerW;

  if (!Number.isFinite(windowS) || windowS <= 0) return samples.map(readingOf);

  // Values, not the sample objects: the output is built from these and must not be able to
  // feed a smoothed watt back into the window it was averaged from.
  const readings: { t: number; w: number }[] = [];
  for (const sample of samples) {
    const w = readingOf(sample);
    if (w !== null) readings.push({ t: sample.t, w });
  }

  let head = 0;
  let tail = 0;
  let total = 0;
  return samples.map((sample) => {
    const w = readingOf(sample);
    if (w === null) return null;
    // Exclusive at the old end, inclusive at the new: a reading landing exactly now counts,
    // and one exactly a window old has had its turn.
    while (head < readings.length) {
      const next = readings[head] as { t: number; w: number };
      if (next.t > sample.t) break;
      total += next.w;
      head += 1;
    }
    const since = sample.t - windowS;
    while (tail < head) {
      const oldest = readings[tail] as { t: number; w: number };
      if (oldest.t > since) break;
      total -= oldest.w;
      tail += 1;
    }
    const count = head - tail;
    return count === 0 ? w : total / count;
  });
}

/**
 * A recorded series as the two strips read it, placed on the ride's distance axis.
 *
 * `fromM` is where the axis begins in ride distance, which is zero everywhere except a
 * lapped ride: a sample carries how far the rider had gone, the axis is the route, and on a
 * second lap those stop being the same number. Samples before it are the previous lap and
 * are dropped rather than folded back over this one.
 */
export function trendSamplesByDistance(
  samples: readonly TrendRideSample[],
  fromM = 0,
): TrendSamples {
  const smoothed = smoothPower(samples);
  const power: TrendSample[] = [];
  const heartRate: TrendSample[] = [];
  samples.forEach((sample, index) => {
    if (sample.distanceM < fromM) return;
    const at = sample.distanceM - fromM;
    power.push({ at, value: smoothed[index] ?? null });
    heartRate.push({ at, value: sample.heartRateBpm });
  });
  return { power, heartRate };
}

/** The same series on a workout's time axis, which is the clock the runner rides. */
export function trendSamplesByTime(samples: readonly TrendRideSample[]): TrendSamples {
  const smoothed = smoothPower(samples);
  const power: TrendSample[] = [];
  const heartRate: TrendSample[] = [];
  samples.forEach((sample, index) => {
    power.push({ at: sample.t, value: smoothed[index] ?? null });
    heartRate.push({ at: sample.t, value: sample.heartRateBpm });
  });
  return { power, heartRate };
}

/**
 * The axis under the block.
 *
 * It belongs to the strips rather than to the chart above them because it rules the bottom
 * of all three: on a ride the km ticks have come off the profile's baseline to get here,
 * and on a workout the minute figures have come off the plan's.
 */
export type StripAxisKind = 'distance' | 'time' | 'none';

export interface StripTick {
  x: number;
  /** Ticks alternate 8 px and 4 px under the baseline, as every mockup draws them. */
  long: boolean;
  /**
   * The figure under the tick, or null where it carries none. The distance axis carries
   * none at all: the profile above still prints the route's total inside its own box.
   */
  label: string | null;
}

export interface StripAxis {
  ticks: StripTick[];
  /** `63 min`, bottom right, on the time axis only. */
  totalLabel: string | null;
}

/**
 * Tick spacings, smallest first. A twelve-second plan and a three-hour one both have to
 * land on a figure a rider reads without counting, so the ladder runs from a second to an
 * hour rather than dividing the session into a fixed number of parts.
 */
const TICK_STEPS_S = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];

/** Beyond this the axis is a comb. 63 minutes at 5-minute ticks is 13, which is the mockup. */
const MAX_TICKS = 24;

/** Every third tick carries a figure; every sixth is drawn long, as design/mockups/workout.html has it. */
const LABEL_EVERY = 3;
const LONG_EVERY = 6;

/** Room kept clear at the right so the last tick figure never collides with the total. */
const TOTAL_LABEL_CLEARANCE = 52;

function tickStepFor(totalS: number): number {
  const last = TICK_STEPS_S[TICK_STEPS_S.length - 1] as number;
  return TICK_STEPS_S.find((step) => totalS / step <= MAX_TICKS) ?? last;
}

/** Minutes read as bare figures once the ticks are minutes apart; below that, a clock. */
function tickLabel(seconds: number, stepS: number): string {
  return stepS >= 60 ? String(Math.round(seconds / 60)) : duration(seconds);
}

export function timeTotalLabel(totalS: number): string {
  return totalS >= 60 ? `${String(Math.round(totalS / 60))} min` : duration(totalS);
}

const EMPTY_AXIS: StripAxis = { ticks: [], totalLabel: null };

export function stripAxis(input: {
  kind: StripAxisKind;
  startAt: number;
  endAt: number;
  width: number;
}): StripAxis {
  const { kind, startAt, endAt, width } = input;
  if (kind === 'none') return EMPTY_AXIS;

  if (kind === 'distance') {
    return {
      ticks: distanceTicks({ startM: startAt, endM: endAt, width }).map((tick) => ({
        x: tick.x,
        long: tick.long,
        label: null,
      })),
      totalLabel: null,
    };
  }

  const totalS = Math.max(endAt - startAt, 0);
  if (totalS <= 0) return EMPTY_AXIS;
  const stepS = tickStepFor(totalS);
  const ticks: StripTick[] = [];
  for (let index = 0, at = 0; at <= totalS; index += 1, at += stepS) {
    const x = (at / totalS) * width;
    const labelled = index > 0 && index % LABEL_EVERY === 0 && x <= width - TOTAL_LABEL_CLEARANCE;
    ticks.push({
      x,
      long: index % LONG_EVERY === 0,
      label: labelled ? tickLabel(at, stepS) : null,
    });
  }
  return { ticks, totalLabel: timeTotalLabel(totalS) };
}
