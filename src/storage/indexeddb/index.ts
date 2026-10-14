import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { CascadingRideRepository } from '../rides';
import { createLocalSettingsRepository } from '../settings';
import { stampUpdatedAt } from '../types';
import type {
  StoredRecord,
  Repository,
  Ride,
  RideSamples,
  Route,
  SettingsRepository,
  Storage,
  Workout,
} from '../types';

export const DB_NAME = 'contour';
export const DB_VERSION = 1;

interface ContourSchema extends DBSchema {
  routes: { key: string; value: Route };
  rides: { key: string; value: Ride };
  // Its own store, so listing rides for the history never reads a sample.
  rideSamples: { key: string; value: RideSamples };
  workouts: { key: string; value: Workout };
}

// Spelled out rather than derived: DBSchema carries a string index signature, so
// keyof it widens to string and loses the per-store value types.
type StoreName = 'routes' | 'rides' | 'rideSamples' | 'workouts';

const STORES: StoreName[] = ['routes', 'rides', 'rideSamples', 'workouts'];

export function openContourDb(): Promise<IDBPDatabase<ContourSchema>> {
  return openDB<ContourSchema>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      // One block per version, never edited once shipped: a browser can arrive from any
      // earlier version and has to run every step between.
      if (oldVersion < 1) {
        for (const name of STORES) db.createObjectStore(name, { keyPath: 'id' });
      }
    },
  });
}

class IndexedDbRepository<T extends StoredRecord> implements Repository<T> {
  constructor(
    private readonly db: Promise<IDBPDatabase<ContourSchema>>,
    private readonly store: StoreName,
  ) {}

  async list(): Promise<T[]> {
    // The store name is only known at runtime, so idb resolves its value type to the
    // union of all three; the constructor call sites are what pin T to the right one.
    return (await (await this.db).getAll(this.store)) as unknown as T[];
  }

  async get(id: string): Promise<T | undefined> {
    return (await (await this.db).get(this.store, id)) as unknown as T | undefined;
  }

  async put(item: T): Promise<void> {
    const stamped = stampUpdatedAt(item) as unknown as ContourSchema[StoreName]['value'];
    await (await this.db).put(this.store, stamped);
  }

  async delete(id: string): Promise<void> {
    await (await this.db).delete(this.store, id);
  }
}

/**
 * The real phase 2 implementation. The connection opens lazily and is shared: opening
 * per call would serialise every read behind its own upgrade check.
 */
export class IndexedDbStorage implements Storage {
  private readonly db = openContourDb();

  readonly routes: Repository<Route> = new IndexedDbRepository<Route>(this.db, 'routes');
  readonly rideSamples: Repository<RideSamples> = new IndexedDbRepository<RideSamples>(
    this.db,
    'rideSamples',
  );
  readonly rides: Repository<Ride> = new CascadingRideRepository(
    new IndexedDbRepository<Ride>(this.db, 'rides'),
    this.rideSamples,
  );
  readonly workouts: Repository<Workout> = new IndexedDbRepository<Workout>(this.db, 'workouts');
  // Settings stay in localStorage: a handful of scalars, read on every tick.
  readonly settings: SettingsRepository = createLocalSettingsRepository();
}

export function createIndexedDbStorage(): Storage {
  return new IndexedDbStorage();
}
