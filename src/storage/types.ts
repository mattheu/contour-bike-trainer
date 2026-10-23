/**
 * The storage contract. Phase 2 implements it over IndexedDB, phase 5 over HTTP, and
 * nothing above this layer changes when it moves. Five rules keep that swap cheap and
 * all five are expensive to retrofit, so they are enforced here rather than by habit:
 *
 * - every method is async, even where an implementation resolves immediately;
 * - ids are client-generated, never an autoincrement key;
 * - updatedAt is set on every write, so a sync layer has a conflict signal;
 * - records are plain JSON-serialisable objects — no classes, Dates, Blobs or nodes;
 * - no queries beyond list and get by id. Filtering and sorting happen in memory.
 */

export interface Repository<T extends StoredRecord> {
  list(): Promise<T[]>;
  get(id: string): Promise<T | undefined>;
  put(item: T): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface StoredRecord {
  id: string; // client-generated UUID, never an autoincrement key
  updatedAt: string; // ISO 8601, set on every write
}

export interface Storage {
  routes: Repository<Route>;
  rides: Repository<Ride>;
  /** Keyed by ride id. Deleting a Ride deletes its samples too. */
  rideSamples: Repository<RideSamples>;
  workouts: Repository<Workout>;
  settings: SettingsRepository;
  session: SessionRepository;
}

/**
 * The one exception to client-generated UUIDs: a bundled route's id is the id written in
 * routes/manifest.json. It is what joins this record to the GPX in the build, and what
 * every ride already recorded against the route refers to, so a fresh UUID per install
 * would orphan both. Once a ride references an id, that id must never change — renaming
 * the GPX file is fine, editing its manifest id is not.
 */
export interface Route extends StoredRecord {
  name: string;
  region?: string; // routes list shows this
  description?: string;
  /**
   * The GPX text this route is. ADR-0014's rule applied to routes: the source is the
   * record, and the points, the gradients and the map are computed from it on read —
   * nothing stores a parsed track. It is also what makes a route importable: a record
   * that carries its own file does not need one in the build.
   *
   * Optional only because a record written before this field existed has none. Boot
   * reseeds those out of the bundle, because a record with no GPX differs from its
   * manifest entry; see seedRoutes in src/ride/routes.ts, and storedRouteGeometry for
   * what a record no manifest entry claims looks like on the list.
   */
  gpx?: string;
  /**
   * Which file in the build this came from, where it came from one at all. Provenance
   * now, not a join: nothing loads geometry through it, and an imported route has none.
   * It survives because it is the provenance a downloaded GPX is named from, and because
   * a route's file may be renamed in the build without its id changing — which is the one
   * direction routes/manifest.json allows.
   */
  file?: string;
  totalDistanceM: number;
  totalAscentM: number;
}

/** One second of a ride. */
export interface RideSample {
  t: number; // seconds from ride start, clock-paused-aware
  distanceM: number;
  speedKmh: number | null;
  powerW: number | null;
  cadenceRpm: number | null;
  heartRateBpm: number | null;
  lat: number | null;
  lon: number | null;
  eleM: number | null;
}

/** A ride with no workout was ridden at full scale, which is the only honest default. */
export const DEFAULT_WORKOUT_SCALE_PCT = 100;

/**
 * Which way a workout was ridden: `erg` with the trainer holding the target, `manual`
 * with the rider holding it against simulation parameters. SPEC.md > ERG is optional.
 *
 * Not Settings.controlMode, which is a rider preference and nothing to do with a session.
 */
export type ErgMode = 'erg' | 'manual';

/** ERG on: what the app did before the control existed, and what every stored ride
 * written before this field was. */
export const DEFAULT_ERG_MODE: ErgMode = 'erg';

export function isErgMode(value: unknown): value is ErgMode {
  return value === 'erg' || value === 'manual';
}

/**
 * The settings that produced the ride, frozen at the time it was ridden. Without ftp and
 * hrMax here, raising your FTP silently re-zones every ride already in the history; without
 * the masses and the difficulty, two rides of the same route are not comparable.
 */
export interface RideSettings {
  trainerDifficulty: number;
  /**
   * The workout scale the session was ridden at, 100 when there was no workout. Nothing
   * to do with trainerDifficulty, which it sits beside: that changes how a hill feels,
   * this changes the work itself. Without it two rides of one workout are not comparable.
   */
  workoutScalePct: number;
  /**
   * Which way the session was ridden, for the same reason the scale is here: a session
   * the trainer held and one the rider held are not the same session, and without it two
   * rides of one workout are not comparable. `erg` where there was no workout, which had
   * no target for anything to hold.
   */
  ergMode: ErgMode;
  ftp: number;
  hrMax: number;
  riderMassKg: number;
  bikeMassKg: number;
}

/**
 * Aggregates only. They are stored rather than recomputed because the history list
 * renders them, and the samples live in their own record because a list of rides would
 * otherwise drag thousands of samples per ride across the wire to render six rows.
 */
export interface Ride extends StoredRecord {
  routeId: string | null; // null for a free ride
  routeName: string | null; // denormalised: the route may be gone
  workoutId: string | null; // null for a ride with no workout
  workoutName: string | null; // denormalised, for the same reason routeName is
  startedAt: string; // ISO
  elapsedS: number; // moving time, pause excluded
  pausedS: number; // elapsedS + pausedS is wall-clock time on the bike
  distanceM: number;
  ascentM: number;
  avgPowerW: number | null;
  avgHeartRateBpm: number | null;
  /**
   * Coggan's training stress score for the power actually recorded, against the FTP in
   * settings below. Null where the ride recorded no power at all, exactly as avgPowerW
   * is: nought would be a claim that the rider did no work.
   *
   * Stored rather than computed on read for the same reason every aggregate here is —
   * it needs the samples, and the history list does not load them.
   */
  tss: number | null;
  /**
   * How long each completed route length took, in ride seconds, in the order they were
   * ridden. Ten entries for ten laps of a loop, one for a point-to-point ridden to its
   * finish, none for a ride that never got round once — which is the whole of what says
   * a ride is not eligible to be anybody's best, and why there is no flag beside it.
   *
   * The rule that keeps it an array rather than a number: store the expensive derivation
   * and derive the cheap one from it. Splitting a ride into laps needs the 1 Hz series,
   * which is a separate record the rides list deliberately does not load; taking the
   * smallest of a dozen numbers needs nothing. A stored `bestLapS` would also throw away
   * the index, and the index is the point — racing your best lap means replaying *that*
   * lap's samples, which a scalar cannot tell you where to find.
   *
   * Not backfilled, and deliberately so rather than by oversight: loops shipped days
   * before this field, so there is no history of lapped rides to recover. Rides written
   * before it read as empty, which is the correct answer for them.
   */
  lapSplits: number[];
  /**
   * No `finished` flag. It recorded whether the route ran out under the rider, and the
   * only thing that ever read it was a `· ended early` label on the summary — a binary
   * standing in for a comparison the screen never showed. The summary draws distance
   * against the route's own length instead, which says how far short rather than only
   * that it was short, and a loop has no completion for a flag to get wrong. An archive
   * written while the field existed still imports; the value is simply dropped.
   */
  settings: RideSettings;
}

/** The 1 Hz series for one ride, fetched only when a ride is actually opened. */
export interface RideSamples extends StoredRecord {
  id: string; // the Ride's id, not an id of its own
  samples: RideSample[];
}

/**
 * The YAML the rider wrote, not a parsed tree: comments and layout survive a round trip
 * through the editor, and every consumer parses the source with the one pure function in
 * src/workout/parse.ts. The name and description are denormalised out of that source so a
 * list of workouts renders without parsing every one of them.
 *
 * Length and TSS are deliberately absent. They are a pure function of the source and the
 * rider's FTP, so storing them would be storing an answer that goes stale the day the
 * profile changes.
 */
export interface Workout extends StoredRecord {
  name: string;
  description?: string;
  source: string;
}

export type ControlMode = 'erg' | 'simulation';
export type Units = 'metric' | 'imperial';

/** Rider preferences, and nothing else: no install state lives here. Seeding needs none,
 * because a built-in record cannot be deleted and so absent means never seen. */
export interface Settings {
  controlMode: ControlMode;
  trainerDifficulty: number;
  riderMassKg: number;
  bikeMassKg: number;
  ftp: number;
  hrMax: number;
  targetPowerW: number | null;
  targetCadenceRpm: number | null;
  targetHeartRateBpm: number | null;
  targetMarginPct: number;
  cda: number;
  crr: number;
  gradeLookaheadM: number;
  units: Units;
  /**
   * Which of the three ghosts resolved from your own history ride with you: Best, Best
   * this year, Most recent. A preference rather than session state, so a rider who races
   * their best lap does so on every route until they say otherwise. The picked slot is
   * deliberately absent — it names one ride, which is a decision about one ride.
   */
  ghostBest: boolean;
  ghostYear: boolean;
  ghostLast: boolean;
}

/**
 * Settings are one small blob, not a collection, so they get their own shape rather
 * than a Repository. Async for the same reason everything else is.
 */
export interface SettingsRepository {
  get(): Promise<Settings>;
  /** Merges over what is stored; a slider moved mid-ride writes one key. */
  put(patch: Partial<Settings>): Promise<void>;
}

/** Phase 5 adds `'account'`; until there is a server to authenticate against, every
 * session is a guest's. */
export type SessionMode = 'guest';

/**
 * Who is using this install, and since when. Deliberately not a key in Settings: those
 * describe the rider and follow them to the next install, this describes this install
 * and is what the login screen asks about. Phase 5 adds `token` and `expiresAt` beside
 * these two rather than replacing them.
 */
export interface Session {
  mode: SessionMode;
  startedAt: string; // ISO 8601
  /**
   * The ride autosave is part-way through writing, absent when none is. Set when a ride's
   * first checkpoint lands and cleared when it is saved or discarded, so a launch that
   * finds it set is one the previous launch did not survive — the ride is already in the
   * history, truncated at its last checkpoint.
   *
   * Here rather than in Settings for the same reason mode and startedAt are: this is
   * state belonging to the install, not a preference belonging to the rider.
   */
  liveRideId?: string;
}

/**
 * One record or none, so it gets its own shape rather than a Repository, exactly as
 * Settings does. `null` is the whole question the login screen asks.
 */
export interface SessionRepository {
  get(): Promise<Session | null>;
  put(session: Session): Promise<void>;
}

/** The only place ids are minted. No uuid package: this is built into browsers and Node. */
export function createId(): string {
  return crypto.randomUUID();
}

/**
 * Stamped by the repository rather than the caller, so the rule holds for every write
 * through every implementation instead of depending on each call site remembering.
 */
export function stampUpdatedAt<T extends StoredRecord>(item: T): T {
  return { ...item, updatedAt: new Date().toISOString() };
}
