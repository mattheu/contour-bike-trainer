import type { ConnectionState } from '../ble/types';
import type { ActiveGhost } from '../ghost/state';
import type { VisibilityState } from '../instrument/probe';
import type { Summary } from '../instrument/stats';
import type { AlertState, RideState } from '../ride/types';
import type { Route as RouteGeometry } from '../route/types';
import type { ErgMode, RideSample } from '../storage/types';
import type { ExpandedStep } from '../workout/expand';
import type { CadenceTarget } from '../workout/types';

export type { AlertState, AlertLevel, RideState } from '../ride/types';

/**
 * The workout being ridden, or null when there is none. Built from the engine's own
 * runner state, so the screen never works out what step it is on for itself.
 *
 * Seconds are whole, as elapsedS is: the store republishes only on a real change, so
 * rounding here is what keeps the countdown to one render a second rather than one a tick.
 */
export interface WorkoutSnapshot {
  name: string;
  /**
   * Every step the session will ride, which is what the Steps panel lists. Built once at
   * ride start and held by identity for the life of the run — it never changes under a
   * clock, so the change gate never republishes on it — and replaced after a skip, which
   * genuinely shortens the plan.
   */
  steps: readonly ExpandedStep[];
  /** 0-based into the expanded steps, and stepCount once the workout has run out. */
  stepIndex: number;
  stepCount: number;
  stepName: string | null;
  /** null on a free step, which has no target to hold. */
  targetW: number | null;
  /** The current step's band. A single value in the file has both ends equal. */
  cadence: CadenceTarget | null;
  stepRemainingS: number;
  totalRemainingS: number;
  /** `5:00 recovery · 55 %`. Null on the last step. */
  nextLabel: string | null;
  /** False on a free step, and false throughout with ERG off. */
  ergEngaged: boolean;
  /** Which way this session is being ridden: the header control's value. */
  ergMode: ErgMode;
  scalePct: number;
  /**
   * The FTP this session is ridden at: the workout's own where it declares one, the
   * rider's where it does not. On the snapshot because it belongs to the session rather
   * than to the profile — the screen reads it from here instead of Settings, so the plan,
   * the zones and the target band are all drawn against the FTP the targets came from.
   */
  ftpW: number;
}

export interface RideSnapshot {
  trainerState: ConnectionState;
  hrmState: ConnectionState;
  /** What the chooser said it paired with. Null on a fake trainer and before pairing. */
  trainerDeviceName: string | null;
  /** GATT services actually discovered, so the phase 1 gate can confirm FTMS rather
   * than assume it. Empty on a fake trainer and before pairing. */
  trainerServices: readonly string[];
  alert: AlertState | null;

  // null, never 0: absent and zero are different readings.
  powerW: number | null;
  /** ~3 s smoothed. design/DESIGN.md: live readings just count, so the ease is in the value. */
  displayPowerW: number | null;
  cadenceRpm: number | null;
  heartRateBpm: number | null;
  speedKmh: number | null;

  state: RideState;
  /** Moving time: the clock stops while paused. */
  elapsedS: number;
  /** Wall-clock time spent paused. elapsedS + pausedS is the time on the bike. */
  pausedS: number;
  /** How far the rider has ridden. On a loop it keeps accumulating past the route's
   * own length, because that is what a second lap is. */
  distanceM: number;
  /**
   * Where that puts them on the route, which on a loop is distance modulo the route's
   * length. The same number as distanceM on a point-to-point route and on a ride with no
   * route; different the moment a loop rolls through its start line.
   *
   * The charts and the distance reading take this one, because all of them are asking
   * where the rider is rather than how far they have gone.
   */
  routePositionM: number;
  ascentM: number;
  /** The real route grade, display-smoothed. The engine writes the raw value to the
   * trainer; a 30 m lookahead twitches too much to read as a number. */
  gradePercent: number | null;
  avgPowerW: number | null;

  routeId: string | null;
  routeName: string | null;
  /**
   * The points the engine is riding, published at ride start rather than looked up by id
   * on the screen. A route's GPX lives in its record now, so reading it is async and a
   * component cannot await in render; this is the one object both sides already share,
   * and the geometry the engine was handed is the honest answer to "what is being
   * ridden" anyway. Held by identity for the life of the run, so it never republishes.
   */
  routeGeometry: RouteGeometry | null;
  routeTotalDistanceM: number | null;
  routeTotalAscentM: number | null;
  /**
   * Whether the route being ridden comes back to where it started, from the one geometry
   * check in src/route/loop.ts. Published with the geometry at ride start rather than
   * re-derived per render: the screen's lap counter and the engine's decision not to stop
   * at the start line have to be the same answer.
   */
  routeLoops: boolean;

  trainerDifficulty: number;
  targetPowerW: number | null;
  targetCadenceRpm: number | null;
  targetHeartRateBpm: number | null;

  workout: WorkoutSnapshot | null;

  /** The recorder's own 1 Hz series, republished as it grows. The power strip reads it
   * rather than rebuilding a series from these snapshots. */
  samples: readonly RideSample[];
  /**
   * Every ghost in the race, resolved for this instant: position, gap and whether it has
   * finished. A live reading like the gradient, recomputed per tick rather than left for
   * three renderers to work out separately — the profile, the map and the key band have
   * to agree about where a ghost is and whether the race is still on.
   */
  ghosts: readonly ActiveGhost[];
  /** The id the ride was stored under, whether the rider ended it or the route ran out.
   * Null until the save lands, so the summary never has to guess which ride it wants. */
  savedRideId: string | null;
}

const INITIAL: RideSnapshot = {
  trainerState: 'disconnected',
  hrmState: 'disconnected',
  trainerDeviceName: null,
  trainerServices: [],
  alert: null,

  powerW: null,
  displayPowerW: null,
  cadenceRpm: null,
  heartRateBpm: null,
  speedKmh: null,

  state: 'idle',
  elapsedS: 0,
  pausedS: 0,
  distanceM: 0,
  routePositionM: 0,
  ascentM: 0,
  gradePercent: null,
  avgPowerW: null,

  routeId: null,
  routeName: null,
  routeGeometry: null,
  routeTotalDistanceM: null,
  routeTotalAscentM: null,
  routeLoops: false,

  trainerDifficulty: 50,
  targetPowerW: null,
  targetCadenceRpm: null,
  targetHeartRateBpm: null,

  workout: null,

  samples: [],
  ghosts: [],
  savedRideId: null,
};

export const INITIAL_SNAPSHOT: Readonly<RideSnapshot> = Object.freeze({ ...INITIAL });

/**
 * Plain TypeScript observable. No React import: the engine side writes, React
 * subscribes through useSyncExternalStore and nothing else.
 *
 * CRITICAL: getSnapshot must return a STABLE reference whose identity changes only
 * when the data changes. Updates mutate a private draft and then publish a new
 * frozen object; building a fresh object inside getSnapshot would make
 * useSyncExternalStore loop forever and hang the app. subscribe and getSnapshot are
 * bound arrow properties for the same reason — a fresh subscribe identity on each
 * render makes React resubscribe every commit.
 *
 * One implementation rather than one per store: the rule above is the whole reason
 * this class exists, and a second copy of it is a second copy to get wrong.
 */
class Store<T extends object> {
  private draft: T;
  private published: Readonly<T>;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly initial: T) {
    this.draft = { ...initial };
    this.published = Object.freeze({ ...initial });
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): Readonly<T> => this.published;

  /** Publishes only if something actually changed, so identity tracks the data. */
  update(patch: Partial<T>): void {
    let changed = false;
    for (const key of Object.keys(patch) as (keyof T)[]) {
      const value = patch[key];
      if (value === undefined || Object.is(this.draft[key], value)) continue;
      // Object.assign keeps each key paired with its own value type; an indexed
      // write would need a cast that throws the checking away.
      Object.assign(this.draft, { [key]: value });
      changed = true;
    }
    if (!changed) return;

    this.published = Object.freeze({ ...this.draft });
    for (const listener of this.listeners) listener();
  }

  reset(): void {
    this.draft = { ...this.initial };
    this.published = Object.freeze({ ...this.draft });
    for (const listener of this.listeners) listener();
  }
}

export class RideStore extends Store<RideSnapshot> {
  constructor() {
    super(INITIAL);
  }
}

export const rideStore = new RideStore();

/**
 * The phase 1 background experiment's live state, kept out of RideSnapshot because it
 * has nothing to do with riding and the diagnostic screen is the only thing that reads
 * it. ADR-0000 is still Proposed: this measurement is what decides the shell, so the
 * plumbing stays wired even though nothing on the ride path touches it.
 */
export interface ExperimentSnapshot {
  /** Whether the control timer is ticking. False unless ?experiment=1. */
  running: boolean;
  visibilityState: VisibilityState;
  eventCount: number;
  /** Non-zero invalidates a run: the ring buffer dropped events it never recorded. */
  droppedEvents: number;
  summary: Summary | null;
}

const INITIAL_EXPERIMENT: ExperimentSnapshot = {
  running: false,
  visibilityState: 'visible',
  eventCount: 0,
  droppedEvents: 0,
  summary: null,
};

export class ExperimentStore extends Store<ExperimentSnapshot> {
  constructor() {
    super(INITIAL_EXPERIMENT);
  }
}

export const experimentStore = new ExperimentStore();
