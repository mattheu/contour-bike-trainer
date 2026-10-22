/**
 * The ghost model attached to a ride in progress.
 *
 * Everything below this file is pure and asserted against fixed histories. This is the
 * one piece that has to deal with a ride happening: a clock, a growing sample stream, and
 * storage reads that cannot be allowed anywhere near either.
 */

import { lapSplits } from '../ride/metrics';
import { lapNumber, lapPositionM } from '../route/loop';
import type { Ride, RideSample, Storage } from '../storage/types';
import { candidateLaps, lapSeries, type GhostLap, type GhostSeries } from './lap';
import { resolveGhosts, sameLap, type HistorySlot } from './resolve';
import { SLOT_ORDER, slotName, type GhostSlot } from './slots';
import { activeGhosts, type ActiveGhost, type Ghost, type RiderLap } from './state';

/** Only what a tracker touches, so a test can hand it two repositories and nothing else. */
export type GhostStorage = Pick<Storage, 'rides' | 'rideSamples'>;

/** Which ghosts the rider wants on the road. */
export interface GhostSelection {
  best: boolean;
  year: boolean;
  last: boolean;
  /**
   * The ride the picked slot is racing, chosen from the rides list. Session-scoped where
   * the other three persist: it is a decision about this ride, not a preference.
   */
  chosenRideId: string | null;
}

/** The live ride, as the candidate pool needs to see it. */
export interface LiveLapsInput {
  rideId: string;
  /** Epoch ms of the ride's start, so a lap can be placed in the rolling Year window. */
  startedAtMs: number;
  /** Splits as the recorder's own samples give them, not as storage has them. */
  splits: readonly number[];
}

/**
 * The live ride's completed laps, built from the series the recorder is holding.
 *
 * The arithmetic deliberately mirrors candidateLaps: a lap's completion instant is the
 * ride's start plus the splits so far. It is repeated here rather than shared because the
 * ride in progress is not a `Ride` record — it becomes one at a checkpoint, and waiting
 * for that is exactly what this exists to avoid.
 */
export function liveLaps(input: LiveLapsInput): GhostLap[] {
  const laps: GhostLap[] = [];
  let intoRideS = 0;
  input.splits.forEach((durationS, lapIndex) => {
    if (!Number.isFinite(durationS) || durationS <= 0) return;
    intoRideS += durationS;
    laps.push({
      rideId: input.rideId,
      lapIndex,
      durationS,
      completedAtMs: input.startedAtMs + intoRideS * 1000,
    });
  });
  return laps;
}

/**
 * Every lap that could fill a slot right now: the history, plus what the rider has just
 * ridden.
 *
 * The live ride is dropped from the stored side and added back from the recorder. It is
 * already in storage — autosave put it there — but only as of its last checkpoint, up to
 * thirty seconds behind. Reading it from storage would mean a lap you finished thirty
 * seconds ago is not yet raceable, which is the half-minute in which you would most want
 * to race it.
 */
export function candidatePool(input: {
  stored: readonly Ride[];
  routeId: string;
  live: LiveLapsInput;
}): GhostLap[] {
  const history = candidateLaps(
    input.stored.filter((ride) => ride.id !== input.live.rideId),
    input.routeId,
  );
  return [...history, ...liveLaps(input.live)];
}

export interface GhostTrackerOptions {
  storage: GhostStorage;
  /** The route under the wheels. Laps of any other route are not candidates. */
  routeId: string;
  /** The ride in progress, by the id the recorder will store it under. */
  rideId: string;
  startedAt: string;
  /**
   * The length the engine is riding, which is the length the recorder splits laps
   * against. Null where the ride has no route, and then there are no ghosts.
   */
  routeLengthM: number | null;
  loops: boolean;
  /** The recorder's series, read rather than copied: a ghost of one of this ride's own
   * laps is a slice of it, and there is nothing to load. */
  samples: () => readonly RideSample[];
  /** The real clock, in epoch ms, for the Year slot's rolling window. */
  now: () => number;
  selection: GhostSelection;
  /**
   * A ghost that could not be loaded. Reported and dropped, never shown: the rider is on
   * the bike, and an alert strip mid-climb about a ride they cannot race helps nobody.
   * Same bargain src/ride/autosave.ts strikes with a failed checkpoint.
   */
  onFailure: (error: unknown) => void;
}

/** Shared, so a ride with no ghosts republishes nothing on this key. */
const NO_GHOSTS: readonly ActiveGhost[] = Object.freeze([]);

/** The three a history fills, in the order the key band reads them. */
const HISTORY_SLOTS: readonly HistorySlot[] = ['best', 'year', 'last'];

/**
 * Holds the race together for the length of a ride: which lap fills each slot, the series
 * behind them, and where the rider is in their own lap.
 *
 * Slots are re-resolved when the rider crosses a line and at no other time on the clock.
 * Swapping a ghost mid-lap would step the gap by a difference the rider did not ride —
 * the figure would move because the ghost changed, which is the one thing a race readout
 * must never do. Flipping a slot on or off is different: that is the rider asking, and it
 * takes effect at once.
 */
export class GhostTracker {
  private readonly options: GhostTrackerOptions;
  private selection: GhostSelection;
  /** The history for this route, read once: nothing else writes a ride during one. */
  private stored: readonly Ride[] = [];
  /** The lap each slot is racing, and the series once it has loaded. Separate, because a
   * slot is assigned the moment it resolves and filled whenever the read lands. */
  private assigned = new Map<GhostSlot, GhostLap>();
  private loaded = new Map<GhostSlot, Ghost>();

  /** The lap the rider is on, and the ride second it began at. */
  private lap = 1;
  private lapStartS = 0;
  /** Laps the recorded series has finished, which is the re-resolution gate. */
  private recorded = 0;

  constructor(options: GhostTrackerOptions) {
    this.options = options;
    this.selection = options.selection;
  }

  /**
   * Reads the history and puts the first ghosts on the road. Awaited by nothing on the
   * ride path: a ride starts whether or not its ghosts have arrived yet.
   */
  async start(): Promise<void> {
    try {
      const all = await this.options.storage.rides.list();
      this.stored = all.filter((ride) => ride.routeId === this.options.routeId);
    } catch (error) {
      this.options.onFailure(error);
    }
    this.resolve();
  }

  /** The rider changed their mind. Takes effect now rather than at the next line. */
  setSelection(selection: GhostSelection): void {
    this.selection = selection;
    this.resolve();
  }

  /**
   * One tick's worth. Returns the same array identity while nothing is racing, so a ride
   * with every slot off never republishes a snapshot on account of its ghosts.
   */
  update(progress: { elapsedS: number; distanceM: number }): readonly ActiveGhost[] {
    this.watchLine(progress);
    if (this.loaded.size === 0) return NO_GHOSTS;
    return activeGhosts([...this.loaded.values()], this.riderLap(progress));
  }

  /**
   * Where the rider is in the lap they are riding. Both figures lap-relative, which on a
   * point-to-point route is the ride itself: there is one lap and it is the whole thing.
   */
  private riderLap(progress: { elapsedS: number; distanceM: number }): RiderLap {
    const lengthM = this.options.routeLengthM;
    if (!this.options.loops || lengthM === null || !(lengthM > 0)) {
      return { lapS: progress.elapsedS, lapM: progress.distanceM };
    }
    return {
      lapS: progress.elapsedS - this.lapStartS,
      lapM: lapPositionM(progress.distanceM, lengthM),
    };
  }

  /**
   * Two crossings, watched separately because they answer different questions.
   *
   * The rider's lap clock restarts the moment the engine says they are round, because
   * that is the instant their race against the next ghost begins. Re-resolution waits for
   * the sample that crossed the line to reach the recorder, because until it does
   * lapSplits cannot see the lap just ridden — resolving early would leave it out of the
   * pool until the *next* line, which is the whole bug this ordering exists to avoid.
   */
  private watchLine(progress: { elapsedS: number; distanceM: number }): void {
    const lengthM = this.options.routeLengthM;
    if (this.options.loops && lengthM !== null && lengthM > 0) {
      const lap = lapNumber(progress.distanceM, lengthM);
      if (lap > this.lap) {
        this.lap = lap;
        this.lapStartS = progress.elapsedS;
      }
    }

    const recorded = this.recordedLaps();
    if (recorded === this.recorded) return;
    this.recorded = recorded;
    this.resolve();
  }

  /** How many laps the recorded series has finished, by the count lapSplits itself uses.
   * Read off the last sample so a tick costs no walk of a growing array. */
  private recordedLaps(): number {
    const lengthM = this.options.routeLengthM;
    if (lengthM === null || !(lengthM > 0)) return 0;
    const samples = this.options.samples();
    const last = samples[samples.length - 1];
    if (last === undefined) return 0;
    return lapNumber(last.distanceM, lengthM) - 1;
  }

  private resolve(): void {
    const lengthM = this.options.routeLengthM;
    const splits = lengthM === null ? [] : lapSplits(this.options.samples(), lengthM);
    const pool = candidatePool({
      stored: this.stored,
      routeId: this.options.routeId,
      live: {
        rideId: this.options.rideId,
        startedAtMs: Date.parse(this.options.startedAt),
        splits,
      },
    });

    const history = resolveGhosts(pool, this.options.now());
    const wanted = new Map<GhostSlot, GhostLap>();
    for (const slot of HISTORY_SLOTS) {
      const lap = history[slot];
      if (this.selection[slot] && lap !== null) wanted.set(slot, lap);
    }
    const chosen = this.chosenLap();
    if (chosen !== null) wanted.set('chosen', chosen);

    for (const slot of SLOT_ORDER) {
      const next = wanted.get(slot) ?? null;
      const held = this.assigned.get(slot) ?? null;
      if (sameLap(next, held)) continue;
      this.assigned.delete(slot);
      // A slot whose lap has changed stops being that ghost at once rather than racing on
      // under a new name until its series arrives.
      this.loaded.delete(slot);
      if (next === null) continue;
      this.assigned.set(slot, next);
      void this.load(slot, next);
    }
  }

  /**
   * The picked slot's lap: the fastest the chosen ride got round in.
   *
   * A ride that never completed a length has no lap to race and fills nothing — the gap
   * is a comparison of times to the same metre, and a ghost that stopped half way round
   * would freeze its figure there and call it a race.
   */
  private chosenLap(): GhostLap | null {
    const rideId = this.selection.chosenRideId;
    if (rideId === null) return null;
    const ride = this.stored.find((stored) => stored.id === rideId);
    if (ride === undefined) return null;
    let best: GhostLap | null = null;
    for (const lap of candidateLaps([ride], this.options.routeId)) {
      if (best === null || lap.durationS < best.durationS) best = lap;
    }
    return best;
  }

  private async load(slot: GhostSlot, lap: GhostLap): Promise<void> {
    try {
      const series = await this.series(lap);
      // The slot may have resolved again while the read was out; the answer to a question
      // nobody is asking any more is dropped rather than installed.
      if (series === null || !sameLap(this.assigned.get(slot) ?? null, lap)) return;
      this.loaded.set(slot, { slot, name: this.name(slot, lap), series });
    } catch (error) {
      this.options.onFailure(error);
    }
  }

  private name(slot: GhostSlot, lap: GhostLap): string {
    const ride = this.stored.find((stored) => stored.id === lap.rideId);
    return slotName(slot, ride?.startedAt ?? this.options.startedAt);
  }

  /**
   * A lap's series. The route's length is the one being ridden rather than the one the
   * ghost's own ride recorded, because the ghost has to be laid over the road under the
   * rider's wheels or the two are not racing the same thing.
   */
  private async series(lap: GhostLap): Promise<GhostSeries | null> {
    const lengthM = this.options.routeLengthM;
    if (lengthM === null) return null;

    if (lap.rideId === this.options.rideId) {
      const samples = this.options.samples();
      return lapSeries(samples, lapSplits(samples, lengthM), lap.lapIndex, lengthM);
    }

    const [ride, record] = await Promise.all([
      this.options.storage.rides.get(lap.rideId),
      this.options.storage.rideSamples.get(lap.rideId),
    ]);
    if (ride === undefined || record === undefined) return null;
    return lapSeries(record.samples, ride.lapSplits, lap.lapIndex, lengthM);
  }
}
