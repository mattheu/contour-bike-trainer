import { elevationAt } from './position';
import type { Route } from './types';

/**
 * Climb detection by drawdown, the same shape of rule a stop-loss uses.
 *
 * Walk a fixed-step elevation series tracking the foot of the current candidate
 * and the highest point since. The candidate closes when elevation falls
 * DESCENT_TOLERANCE_M below that high point; while nothing has risen yet, the
 * foot sinks with the ground. Each closed candidate is then kept only if it is
 * long enough, big enough and steep enough.
 *
 * Chosen over a windowed-grade scan because a climb is defined by how much it
 * gains overall, not by whether any particular 500 m of it is steep: a scan
 * either splits a climb at every false flat or, with enough smoothing, merges a
 * whole rolling valley into one.
 */

/** Resampling step. Short enough to place a summit accurately, long enough to ignore GPS jitter. */
const SAMPLE_STEP_M = 50;

/**
 * A dip smaller than this is a false flat inside one climb, not the end of it.
 * Ten metres is about 150 m of 6 % descent — a real feature, not noise.
 */
const DESCENT_TOLERANCE_M = 10;

/**
 * The three filters that stop rolling terrain reading as a string of climbs.
 * Rolling routes undulate by 10-20 m a time, so a 40 m floor rejects them with
 * margin while still catching the smallest thing a rider would name as a climb.
 * The average-grade floor rejects long shallow drifts, which pass on gain alone.
 */
const MIN_GAIN_M = 40;
const MIN_LENGTH_M = 500;
const MIN_AVERAGE_GRADE_PERCENT = 3;

/**
 * The foot of a candidate lands wherever the ground last stopped falling, which
 * on a route with a flat approach is kilometres before the climb. Walk it
 * forward to where the gradient actually kicks up, measured over a bin-length
 * window so a single flat step inside the climb does not stop the trim.
 * Without this, a 5 km climb after a 4.5 km flat reads as a 9.5 km climb at
 * half its real average gradient, and the chart's tick lands in the wrong place.
 */
const FOOT_TRIM_WINDOW_M = 250;
const FOOT_TRIM_GRADE_PERCENT = 2;

export interface Climb {
  startM: number;
  summitM: number;
  lengthM: number;
  /** The climb's ascent, which is what the chart's "+188 m" tick labels. */
  gainM: number;
  summitEleM: number;
  averageGradePercent: number;
}

export interface ClimbOptions {
  sampleStepM?: number;
  descentToleranceM?: number;
  minGainM?: number;
  minLengthM?: number;
  minAverageGradePercent?: number;
}

export function detectClimbs(route: Route, options: ClimbOptions = {}): Climb[] {
  const {
    sampleStepM = SAMPLE_STEP_M,
    descentToleranceM = DESCENT_TOLERANCE_M,
    minGainM = MIN_GAIN_M,
    minLengthM = MIN_LENGTH_M,
    minAverageGradePercent = MIN_AVERAGE_GRADE_PERCENT,
  } = options;

  if (!Number.isFinite(sampleStepM) || sampleStepM <= 0) {
    throw new Error(`Climb sample step must be a positive distance, got ${sampleStepM}`);
  }
  if (route.totalDistanceM < minLengthM) return [];

  const stepCount = Math.max(1, Math.round(route.totalDistanceM / sampleStepM));
  const step = route.totalDistanceM / stepCount;
  const elevations: number[] = [];
  for (let i = 0; i <= stepCount; i += 1) {
    elevations.push(elevationAt(route, i * step));
  }

  const climbs: Climb[] = [];
  const at = (i: number): number => elevations[i] as number;

  const trimSteps = Math.max(1, Math.round(FOOT_TRIM_WINDOW_M / step));
  // Never trim away ground the filters would accept as climbing in its own right.
  const trimGrade = Math.min(FOOT_TRIM_GRADE_PERCENT, minAverageGradePercent);
  const trimFoot = (footIndex: number, summitIndex: number): number => {
    let foot = footIndex;
    while (foot + trimSteps <= summitIndex) {
      const grade = ((at(foot + trimSteps) - at(foot)) / (trimSteps * step)) * 100;
      if (grade >= trimGrade) break;
      foot += 1;
    }
    return foot;
  };

  const close = (rawFootIndex: number, summitIndex: number): void => {
    const footIndex = trimFoot(rawFootIndex, summitIndex);
    const gainM = at(summitIndex) - at(footIndex);
    const lengthM = (summitIndex - footIndex) * step;
    if (lengthM < minLengthM || gainM < minGainM) return;
    const averageGradePercent = (gainM / lengthM) * 100;
    if (averageGradePercent < minAverageGradePercent) return;
    climbs.push({
      startM: footIndex * step,
      summitM: summitIndex * step,
      lengthM,
      gainM,
      summitEleM: at(summitIndex),
      averageGradePercent,
    });
  };

  let footIndex = 0;
  let summitIndex = 0;
  for (let i = 1; i <= stepCount; i += 1) {
    if (at(i) > at(summitIndex)) {
      summitIndex = i;
    } else if (at(summitIndex) - at(i) >= descentToleranceM) {
      close(footIndex, summitIndex);
      footIndex = i;
      summitIndex = i;
    } else if (summitIndex === footIndex && at(i) < at(footIndex)) {
      // Still descending with nothing climbed yet: the foot follows the ground down.
      footIndex = i;
      summitIndex = i;
    }
  }
  close(footIndex, summitIndex);

  return climbs;
}
