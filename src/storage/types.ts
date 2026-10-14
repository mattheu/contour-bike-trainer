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
  finished: boolean; // reached the route end
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
