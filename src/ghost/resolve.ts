/**
 * Which lap fills each of the three slots resolved from history.
 *
 * Pure over the laps it is handed, and told what "now" is rather than reading a clock:
 * the rolling window below is the only time-dependent thing in the ghost model, and a
 * function that asks the machine what time it is cannot be asserted against a history.
 */

import type { GhostLap } from './lap';

/**
 * The Year slot is the last 365 days, rolling, and deliberately not the calendar year —
 * the name is the band's, not the rule's.
 *
 * What the slot is for is saying where your form is now when your all-time best is three
 * winters old. Form is a rolling thing, so a window that empties every 1 January would
 * spend the first weeks of each year resolving to nothing, or to whatever the rider
 * happened to do on a cold Sunday, and say less about their form the longer it ran.
 *
 * A lap exactly 365 days old is inside it: the boundary has to fall somewhere, and
 * letting the anniversary ride count is the reading that drops a lap one day later
 * rather than one day early.
 */
export const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/** The slots a history fills. The picked slot is filled by an action, not resolved. */
export type HistorySlot = 'best' | 'year' | 'last';

/** Null where nothing can fill the slot. Nothing falls through: a triangle on a lap that
 * is not the best of the year would spend the symbol's meaning to avoid an empty row. */
export type ResolvedGhosts = Record<HistorySlot, GhostLap | null>;

/** Two references to one lap, which is the join the dedupe rules are written against. */
export function sameLap(a: GhostLap | null, b: GhostLap | null): boolean {
  if (a === null || b === null) return false;
  return a.rideId === b.rideId && a.lapIndex === b.lapIndex;
}

/** Ties go to the lap that got there first: a record is held until it is beaten, not
 * until it is equalled. */
function fastest(laps: readonly GhostLap[]): GhostLap | null {
  let best: GhostLap | null = null;
  for (const lap of laps) {
    if (best === null) best = lap;
    else if (lap.durationS < best.durationS) best = lap;
    else if (lap.durationS === best.durationS && lap.completedAtMs < best.completedAtMs) best = lap;
  }
  return best;
}

function mostRecent(laps: readonly GhostLap[]): GhostLap | null {
  let last: GhostLap | null = null;
  for (const lap of laps) {
    if (last === null || lap.completedAtMs > last.completedAtMs) last = lap;
  }
  return last;
}

/**
 * Best, Year and Last over one route's laps.
 *
 * No lap fills two slots, and the order they are settled in is the order of their claims:
 * Best is the strongest statement a lap can make, so it keeps the lap and Year takes the
 * next fastest inside its window; Last is a fact about the calendar rather than a reward,
 * so it yields to both and shows the next most recent lap instead.
 *
 * Where there is no second lap to fall to, the slot stays empty. Three symbols on three
 * laps is the point of the thing — a rider who has ridden a route once sees one ghost.
 */
export function resolveGhosts(laps: readonly GhostLap[], nowMs: number): ResolvedGhosts {
  const best = fastest(laps);

  const since = nowMs - YEAR_MS;
  const year = fastest(laps.filter((lap) => lap.completedAtMs >= since && !sameLap(lap, best)));

  const last = mostRecent(laps.filter((lap) => !sameLap(lap, best) && !sameLap(lap, year)));

  return { best, year, last };
}
