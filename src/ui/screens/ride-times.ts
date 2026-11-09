import { formatGap } from '../../ghost/gap';
import type { GhostSymbol } from '../../ghost/slots';
import type { ActiveGhost } from '../../ghost/state';
import { duration } from '../format';
import type { LapProgress } from './ride-view';

/**
 * The times view's ranking: every lap of this session and every ghost, fastest first.
 *
 * Ordered by time and labelled by lap number, which are deliberately not the same thing.
 * It is a leaderboard — the lap number is the row's identity rather than its position —
 * so there is no sort control on it: a list you could re-sort by lap would stop being a
 * ranking of anything. design/DESIGN.md > Screen rules, Ride times view.
 *
 * Pure over what it is handed, so "who is fastest" is a question a test owns rather than
 * a panel. The panel draws rows and decides nothing.
 */

export interface TimeRow {
  /** Stable across ticks, so a row keeps its identity as the ranking reorders. */
  key: string;
  /** 1-based, by time. */
  rank: number;
  /** The ghost's shape, or null for a lap of this session — which carries a blank of the
   * same width instead, so the names line up down the column. */
  symbol: GhostSymbol | null;
  /** `Lap 2`, or the ghost's slot name. */
  name: string;
  /** The gap to the fastest time, or null on the fastest row and on the lap in progress,
   * which has no finished time to be a gap from. */
  gap: string | null;
  /** The finished time, or on the lap in progress its live elapsed. */
  time: string;
  /** The lap being ridden: the current-step row's treatment, and `· now` after its name. */
  current: boolean;
}

/** The lap in progress, which the ranking places by where its pace projects it. */
export interface CurrentLap {
  number: number;
  elapsedS: number;
  distanceM: number;
  lengthM: number;
}

export interface TimesInput {
  /** This session's completed laps in order, in seconds — src/ride/metrics.ts lapSplits. */
  laps: readonly number[];
  ghosts: readonly ActiveGhost[];
  /** Null on a point-to-point route, where the list holds ghosts only. */
  current: CurrentLap | null;
}

/**
 * Where the lap in progress is heading, at the pace it has ridden so far.
 *
 * The ranking needs somewhere to put a lap that has no time yet, and the honest place is
 * where it is going rather than top (an empty lap is not winning) or bottom (a lap half a
 * minute up on the record is not last). Infinity before the first metre: a lap with no
 * ground behind it has no pace to project and so no claim on a rank, which sorts it to the
 * end without a special case.
 */
export function projectedLapS(current: CurrentLap): number {
  if (!(current.distanceM > 0) || !(current.lengthM > 0)) return Infinity;
  return current.elapsedS * (current.lengthM / current.distanceM);
}

interface Entry {
  key: string;
  symbol: GhostSymbol | null;
  name: string;
  /** The time the row shows, or null where it has none to show a gap from. */
  timeS: number | null;
  /** What it is ranked on, which for the lap in progress is its projection. */
  sortS: number;
  current: boolean;
}

/**
 * The rows, ranked.
 *
 * Ghosts are listed ahead of this session's laps before the sort, which is what decides a
 * tie: src/ghost/resolve.ts holds a record until it is beaten rather than until it is
 * equalled, and a lap that merely matched the time should not take the row above it.
 *
 * A ghost whose ride stopped short carries no time — see ActiveGhost.lapTimeS — and is
 * left out. It is still out on the road and still in the key band; what it has not got is
 * a comparable time, and a leaderboard is nothing but comparable times.
 */
export function timeRows(input: TimesInput): TimeRow[] {
  const entries: Entry[] = [];

  for (const ghost of input.ghosts) {
    if (ghost.lapTimeS === null) continue;
    entries.push({
      key: `ghost-${ghost.slot}`,
      symbol: ghost.symbol,
      name: ghost.name,
      timeS: ghost.lapTimeS,
      sortS: ghost.lapTimeS,
      current: false,
    });
  }

  input.laps.forEach((durationS, index) => {
    if (!Number.isFinite(durationS) || durationS <= 0) return;
    entries.push({
      key: `lap-${String(index + 1)}`,
      symbol: null,
      name: `Lap ${String(index + 1)}`,
      timeS: durationS,
      sortS: durationS,
      current: false,
    });
  });

  if (input.current !== null) {
    entries.push({
      key: `lap-${String(input.current.number)}`,
      symbol: null,
      name: `Lap ${String(input.current.number)}`,
      timeS: input.current.elapsedS,
      sortS: projectedLapS(input.current),
      current: true,
    });
  }

  // Stable, so the tie order above is the order that survives. Array.prototype.sort has
  // been stable by specification since ES2019.
  entries.sort((a, b) => a.sortS - b.sortS);

  // The gap is to the best finished time, never to the projection: "gaps to best" is a
  // statement about times that have been ridden, and a column measured against a figure
  // that moves every second would have every row in it moving with it.
  const best = entries.reduce<number | null>(
    (fastest, entry) =>
      entry.current || entry.timeS === null
        ? fastest
        : fastest === null || entry.timeS < fastest
          ? entry.timeS
          : fastest,
    null,
  );

  return entries.map((entry, index) => ({
    key: entry.key,
    rank: index + 1,
    symbol: entry.symbol,
    name: entry.name,
    gap:
      entry.current || entry.timeS === null || best === null || entry.timeS === best
        ? null
        : formatGap(entry.timeS - best),
    time: duration(entry.timeS),
    current: entry.current,
  }));
}

/**
 * The muted line under the list: `Lap 2 of this session · gaps to best`.
 *
 * It says what the column of figures is and what the column beside it is measured against,
 * which between them are the two things a ranking cannot show on its own. On a
 * point-to-point route there is no lap of this session to name and the line says the one
 * thing left that is true.
 */
export function timesNote(lap: LapProgress | null): string {
  const gaps = 'gaps to best';
  if (lap === null) return gaps;
  return `Lap ${String(lap.number)} of this session · ${gaps}`;
}
