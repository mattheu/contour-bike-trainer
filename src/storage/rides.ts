import type { Repository, Ride, RideSample, RideSamples } from './types';

/**
 * Deleting a ride has to take its samples with it, and nothing above the storage layer
 * should have to remember that. Shared by both implementations so the behaviour cannot
 * drift between them — or from whatever phase 5's server does.
 */
export class CascadingRideRepository implements Repository<Ride> {
  constructor(
    private readonly rides: Repository<Ride>,
    private readonly samples: Repository<RideSamples>,
  ) {}

  list(): Promise<Ride[]> {
    return this.rides.list();
  }

  get(id: string): Promise<Ride | undefined> {
    return this.rides.get(id);
  }

  put(item: Ride): Promise<void> {
    return this.rides.put(item);
  }

  async delete(id: string): Promise<void> {
    // The ride goes first: a failure between the two leaves orphaned samples, which are
    // wasted bytes, rather than a ride in the history that opens to an empty chart.
    await this.rides.delete(id);
    await this.samples.delete(id);
  }
}

export interface RestorableRide {
  ride: Ride;
  samples: readonly RideSample[];
}

export interface RestoreOutcome {
  restored: number;
  /** Already in the history, and therefore left exactly as it was. */
  skippedExisting: number;
}

/**
 * Writes rides from a backup into storage.
 *
 * Idempotent by id, and a ride already in the history is skipped rather than overwritten:
 * a restore is a safety net, not an authority. The copy on this machine may have been
 * ridden further, renamed or corrected since the backup was taken, and silently replacing
 * it would destroy the newer of the two.
 */
export async function restoreRides(
  storage: { rides: Repository<Ride>; rideSamples: Repository<RideSamples> },
  records: readonly RestorableRide[],
): Promise<RestoreOutcome> {
  let restored = 0;
  let skippedExisting = 0;

  for (const { ride, samples } of records) {
    if ((await storage.rides.get(ride.id)) !== undefined) {
      skippedExisting += 1;
      continue;
    }
    await storage.rides.put(ride);
    // Keyed by the ride's id, never an id of its own: the samples record has no identity
    // apart from the ride it belongs to.
    await storage.rideSamples.put({
      id: ride.id,
      updatedAt: ride.updatedAt,
      samples: [...samples],
    });
    restored += 1;
  }

  return { restored, skippedExisting };
}
