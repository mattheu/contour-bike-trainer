/**
 * What a ghost is doing right now: the one value the map, the profile and the key band
 * all read.
 *
 * Everything a renderer could need is settled here — the symbol, the word, the position,
 * the gap and whether the ghost has finished — because the alternative is three screens
 * each deciding separately when a ghost is done, and a map that disagrees with the band
 * beneath it about whether there is still a race on.
 */

import { formatGap } from './gap';
import { distanceAtLapTime, lapTimeAtDistance, type GhostSeries } from './lap';
import { SLOT_ORDER, SLOT_SYMBOL, type GhostSlot, type GhostSymbol } from './slots';

/** What the key band prints in place of a gap once a ghost has finished. */
export const DONE_LABEL = 'done';

/** A ghost ready to race: a slot, the word for it, and the lap it will ride. */
export interface Ghost {
  slot: GhostSlot;
  name: string;
  series: GhostSeries;
}

/** Where the rider is in the lap they are riding — both figures lap-relative, so on a
 * loop they reset at the line and the race starts again with them. */
export interface RiderLap {
  lapS: number;
  lapM: number;
}

/** One ghost, resolved. Nothing here is left for a renderer to work out. */
export interface ActiveGhost {
  slot: GhostSlot;
  symbol: GhostSymbol;
  name: string;
  /**
   * Finished before the rider got here. It parks at the route end, drops its label and
   * leaves the map; the key band keeps the row and shows `DONE_LABEL`.
   */
  done: boolean;
  /** Metres into the lap, for the symbol's position on the map and the profile. */
  distanceM: number;
  /** The rider's deficit in seconds, positive when the ghost is ahead. Null when done:
   * there is no gap to a ghost that is no longer on the road. */
  gapS: number | null;
  /** The same figure as the band prints it, null for the same reason. */
  gapLabel: string | null;
}

/**
 * A ghost against a rider, at one instant.
 *
 * Done is a comparison of lap times rather than of distances, because the rider may
 * never reach the finish: a ghost whose lap took nine minutes is done at nine minutes of
 * the rider's lap whether they are at the line or half a kilometre short of it. Equality
 * is still racing — the ghost crosses on that second, and showing it done beforehand
 * would end the race while the rider can still see it ahead.
 */
export function ghostState(ghost: Ghost, rider: RiderLap): ActiveGhost {
  const done = rider.lapS > ghost.series.durationS;
  const gapS = done ? null : deficit(ghost.series, rider);

  return {
    slot: ghost.slot,
    symbol: SLOT_SYMBOL[ghost.slot],
    name: ghost.name,
    done,
    distanceM: done ? ghost.series.lengthM : distanceAtLapTime(ghost.series, rider.lapS),
    gapS,
    gapLabel: gapS === null ? null : formatGap(gapS),
  };
}

/** The rider's time to this metre, less the ghost's. Positive means the ghost was here
 * first and is up the road. */
function deficit(series: GhostSeries, rider: RiderLap): number | null {
  const gapS = rider.lapS - lapTimeAtDistance(series, rider.lapM);
  return Number.isFinite(gapS) ? gapS : null;
}

/**
 * Every ghost in the race, in the order the key band reads them, which is slot order and
 * not the order they were switched on. The band is a row a rider learns the shape of, so
 * the square is always leftmost whether or not a triangle resolved beside it.
 *
 * Finished ghosts stay in the list. They leave the map, but the band keeps the row and
 * says so — a ghost that vanished from the key would read as one that was never on.
 */
export function activeGhosts(ghosts: readonly Ghost[], rider: RiderLap): ActiveGhost[] {
  return [...ghosts]
    .sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot))
    .map((ghost) => ghostState(ghost, rider));
}
