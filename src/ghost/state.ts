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

/**
 * How a ghost's race ended, or that it has not.
 *
 * Two end states and not one, because they mean opposite things. A ghost that reached the
 * end of the route length beat you to it; a ghost whose ride stopped part way round gave
 * up where it is standing. Collapsing them would print `done` over a ride that did not
 * finish, which is the one reading that is simply untrue.
 */
export type GhostEnd = 'racing' | 'finished' | 'stopped';

/** What the key band prints in place of a gap once a ghost has finished. */
export const DONE_LABEL = 'done';

/**
 * And in place of a gap for a ghost whose ride stopped short.
 *
 * Deliberately not `done`: that word is the finished ghost's, and it says the race was
 * run. This one says what actually happened — the ride ended there — which is also the
 * only thing that explains the symbol sitting half way up a climb.
 */
export const STOPPED_LABEL = 'stopped';

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
   * Racing, or how it ended. A ghost that finished parks at the route end and leaves the
   * map; one that stopped marks the metre its ride reached and fades there. Neither
   * carries a gap, and the key band keeps both rows rather than dropping them.
   */
  end: GhostEnd;
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
  const over = rider.lapS > ghost.series.durationS;
  // Which of the two ends it is was settled when the series was built, not here: the
  // clock only says the ghost has stopped moving, never why.
  const end: GhostEnd = !over ? 'racing' : ghost.series.finished ? 'finished' : 'stopped';
  const gapS = over ? null : deficit(ghost.series, rider);

  return {
    slot: ghost.slot,
    symbol: SLOT_SYMBOL[ghost.slot],
    name: ghost.name,
    end,
    // Where it got to, which for a finished ghost is the route end and for a stopped one
    // is the metre its ride reached.
    distanceM: over ? ghost.series.lengthM : distanceAtLapTime(ghost.series, rider.lapS),
    gapS,
    gapLabel: gapS === null ? null : formatGap(gapS),
  };
}

/**
 * The one figure the key band prints for a ghost: its gap while it is racing, and the
 * word for how it ended once it is not.
 *
 * Here rather than in the band, so the two end states cannot be told apart on one screen
 * and run together on another.
 */
export function bandLabel(ghost: ActiveGhost): string {
  if (ghost.gapLabel !== null) return ghost.gapLabel;
  return ghost.end === 'finished' ? DONE_LABEL : STOPPED_LABEL;
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
 * Ended ghosts stay in the list. The band keeps the row and says how it ended — a ghost
 * that vanished from the key would read as one that was never switched on.
 */
export function activeGhosts(ghosts: readonly Ghost[], rider: RiderLap): ActiveGhost[] {
  return [...ghosts]
    .sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot))
    .map((ghost) => ghostState(ghost, rider));
}
