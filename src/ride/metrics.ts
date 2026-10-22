import { lapNumber } from '../route/loop';
import type { Repository, Ride, RideSample, RideSamples } from '../storage/types';
import { trainingStressScore } from '../workout/load';

/**
 * The two figures a Ride carries that cannot be read back off the record itself: both
 * need the 1 Hz series, which lives in its own record precisely so the history list does
 * not drag it about. They are computed once, on the write path every ride takes, so a
 * crashed ride and an ended one carry the same fields.
 */

/**
 * When the samples straddle a lap boundary, the second the rider actually crossed it.
 *
 * Interpolated between the two samples rather than rounded to the nearer of them. At
 * 1 Hz, snapping costs up to a second on every lap, and a second is the same order as
 * the differences a lap split exists to show — a ghost built on snapped splits would be
 * showing the sample clock, not the riding.
 */
function crossingS(samples: readonly RideSample[], index: number, boundaryM: number): number {
  const crossed = samples[index];
  if (crossed === undefined) return 0;
  const before = samples[index - 1];
  // Nothing to interpolate from: the series starts at or beyond the line.
  if (before === undefined) return crossed.t;
  const span = crossed.distanceM - before.distanceM;
  if (span <= 0) return crossed.t;
  return before.t + ((boundaryM - before.distanceM) / span) * (crossed.t - before.t);
}

/**
 * How long each completed route length took, in ride seconds, in order.
 *
 * The length is the route's, so a ride with none — a free ride, a workout — has nothing
 * to complete and gets an empty array rather than a wrong one. Same answer where the
 * length is unknown: a split measured against a guess is worse than no split at all.
 */
export function lapSplits(samples: readonly RideSample[], routeLengthM: number | null): number[] {
  const last = samples[samples.length - 1];
  if (routeLengthM === null || !(routeLengthM > 0) || last === undefined) return [];

  // lapNumber counts the lap being ridden, so one fewer have been finished.
  const completed = lapNumber(last.distanceM, routeLengthM) - 1;
  if (completed < 1) return [];

  const splits: number[] = [];
  let previousS = 0;
  let index = 0;
  for (let lap = 1; lap <= completed; lap += 1) {
    const boundaryM = lap * routeLengthM;
    while (index < samples.length && (samples[index]?.distanceM ?? 0) < boundaryM) index += 1;
    const atS = crossingS(samples, index, boundaryM);
    splits.push(atS - previousS);
    previousS = atS;
  }
  return splits;
}

/**
 * The ride's training stress against the FTP it was frozen at, scored by the same
 * function that scores a workout plan — so "was that harder than last Tuesday" compares
 * one number from one place.
 *
 * Null where there was no power to score, exactly as avgPowerW is null: a trainer that
 * reported nothing is not a rider who did nothing. Null too where the frozen FTP is
 * unusable, which only a record from somewhere else can be; the score would divide by it.
 *
 * One decimal, like the averages beside it on the record: the figure is read as whole
 * points, and storing more precision than it has invites someone to believe it.
 */
export function rideTss(
  samples: readonly RideSample[],
  elapsedS: number,
  ftp: number,
): number | null {
  if (!Number.isFinite(ftp) || ftp <= 0) return null;
  if (!samples.some((sample) => sample.powerW !== null)) return null;
  const score = trainingStressScore(
    samples.map((sample) => sample.powerW),
    elapsedS,
    ftp,
  );
  return Math.round(score * 10) / 10;
}

/** A ride written before these fields existed, which is what the database actually holds. */
type EarlierRide = Omit<Ride, 'tss' | 'lapSplits'> & Partial<Pick<Ride, 'tss' | 'lapSplits'>>;

export interface BackfillResult {
  /** Ids filled in, because they predate the fields. */
  written: string[];
  /** Ids already carrying both, left alone. */
  unchanged: string[];
}

/**
 * Fills the two derived fields in on rides written before they existed, on boot, beside
 * seedRoutes and seedWorkouts.
 *
 * TSS is filled exactly rather than approximately: every ride still has its samples and
 * the FTP it was frozen at, so the figure computed now is the figure the ride would have
 * been written with. That is what makes a backfill the right answer here and not merely
 * a convenient one.
 *
 * Lap splits are not computed, only set to empty. Loops shipped days before this field,
 * so there are no lapped rides in anybody's history to recover, and an empty array is
 * already the honest reading of a ride nobody timed laps on. Deliberate, not an omission
 * waiting to be finished off.
 *
 * Idempotent, and by the presence of the fields rather than their values: a ride scored
 * null because it recorded no power has been visited, and booting again must not rewrite
 * it. Rewriting would churn updatedAt, which a later sync layer reads as a genuine edit.
 */
export async function backfillRides(
  rides: Repository<Ride>,
  rideSamples: Repository<RideSamples>,
): Promise<BackfillResult> {
  const result: BackfillResult = { written: [], unchanged: [] };

  for (const ride of await rides.list()) {
    const stored: EarlierRide = ride;
    if (stored.tss !== undefined && stored.lapSplits !== undefined) {
      result.unchanged.push(ride.id);
      continue;
    }

    const samples = (await rideSamples.get(ride.id))?.samples ?? [];
    await rides.put({
      ...ride,
      tss: stored.tss ?? rideTss(samples, ride.elapsedS, ride.settings.ftp),
      lapSplits: stored.lapSplits ?? [],
    });
    result.written.push(ride.id);
  }

  return result;
}
