import { CascadingRideRepository } from '../rides';
import { createMemoryKeyValueStore, StoredSettingsRepository } from '../settings';
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

/**
 * Clones in both directions. Without it a caller holds a reference into the store and
 * can mutate it by accident — a bug class that would never show up against IndexedDB,
 * which serialises on the way in, and so would only surface after the phase 5 swap.
 * Records are plain JSON by contract, so structuredClone always succeeds.
 */
function copy<T>(value: T): T {
  return structuredClone(value);
}

export class MemoryRepository<T extends StoredRecord> implements Repository<T> {
  private readonly items = new Map<string, T>();

  async list(): Promise<T[]> {
    return [...this.items.values()].map(copy);
  }

  async get(id: string): Promise<T | undefined> {
    const item = this.items.get(id);
    return item === undefined ? undefined : copy(item);
  }

  async put(item: T): Promise<void> {
    this.items.set(item.id, stampUpdatedAt(copy(item)));
  }

  async delete(id: string): Promise<void> {
    this.items.delete(id);
  }
}

/** Used by Vitest and, from phase 2's integration tests, seeded by Playwright. */
export class MemoryStorage implements Storage {
  readonly routes = new MemoryRepository<Route>();
  readonly rideSamples = new MemoryRepository<RideSamples>();
  readonly rides: Repository<Ride> = new CascadingRideRepository(
    new MemoryRepository<Ride>(),
    this.rideSamples,
  );
  readonly workouts = new MemoryRepository<Workout>();
  readonly settings: SettingsRepository = new StoredSettingsRepository(createMemoryKeyValueStore());
}

export function createMemoryStorage(): Storage {
  return new MemoryStorage();
}
