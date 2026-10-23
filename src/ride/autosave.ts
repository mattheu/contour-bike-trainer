import {
  DEFAULT_ERG_MODE,
  DEFAULT_WORKOUT_SCALE_PCT,
  type Session,
  type Storage,
} from '../storage/types';
import type { EngineSnapshot } from './engine';
import type { RideRecorder } from './recorder';

/**
 * Ride seconds between checkpoints, and the whole trade in one number: a crash loses at
 * most this much riding, and every interval costs one write of the ride so far. Thirty
 * seconds is a loss a rider shrugs at, where five would be six times the writes to save
 * twenty-five seconds nobody would miss.
 */
export const CHECKPOINT_INTERVAL_S = 30;

/** Only what autosave touches, so a test can hand it three repositories and nothing else. */
export type AutosaveStorage = Pick<Storage, 'rides' | 'rideSamples' | 'session'>;

/** What a Ride needs from the engine that its own samples cannot tell it. */
export type RideProgress = Pick<EngineSnapshot, 'pausedS' | 'workout'>;

/**
 * The one path a ride reaches storage by, taken by the checkpoints and by the final save
 * alike. Shared rather than written twice: a checkpoint that built its records even
 * slightly differently would leave a crashed ride the history renders unlike the one the
 * rider would have ended up with, and the difference would only ever show after a crash.
 */
export async function writeRide(
  storage: AutosaveStorage,
  recorder: RideRecorder,
  progress: RideProgress,
): Promise<string> {
  const { ride, samples } = recorder.build({
    pausedS: progress.pausedS,
    // Taken from the engine as it stands rather than from what the ride started with: the
    // rider settled somewhere, and that is what the session was.
    workoutScalePct: progress.workout?.scalePct ?? DEFAULT_WORKOUT_SCALE_PCT,
    // Likewise, and for the same reason: the mode is switchable mid-ride.
    ergMode: progress.workout?.ergMode ?? DEFAULT_ERG_MODE,
  });

  await storage.rides.put(ride);
  await storage.rideSamples.put(samples);
  return ride.id;
}

/**
 * Sets or clears the marker saying a ride is part-written, which is the only thing that
 * tells a ride the rider ended from one a crash cut short — both are ordinary rides in
 * the history. It rides on the session record because that is where this install's own
 * state lives; Settings is the rider's and follows them elsewhere.
 *
 * Returns what was written, so a caller holding a cached session stays in step. Null
 * where there is no session to mark: a ride is only reachable from behind the login
 * screen, so that is a case which does not arise rather than one to recover from.
 */
export async function setLiveRide(
  sessions: AutosaveStorage['session'],
  rideId: string | null,
): Promise<Session | null> {
  const current = await sessions.get();
  if (current === null) return null;

  // Copied and amended rather than rebuilt from the two fields it knows about: a session
  // that grows a third would otherwise be quietly stripped of it every time a ride ends.
  const next: Session = { ...current };
  if (rideId === null) delete next.liveRideId;
  else next.liveRideId = rideId;

  await sessions.put(next);
  return next;
}

export interface RideCheckpointerOptions {
  storage: AutosaveStorage;
  recorder: RideRecorder;
  /** Read when a checkpoint is actually due, so a skipped one costs nothing. */
  progress: () => RideProgress;
  /**
   * A checkpoint that failed. Non-fatal by definition — the rider is on the bike and can
   * do nothing about it — so this reports rather than interrupts.
   */
  onFailure: (error: unknown) => void;
}

/**
 * Writes the ride as it is being ridden, so a crash, a closed tab or a flat battery costs
 * the last few seconds rather than the whole session.
 *
 * A checkpoint is the finished ride's own records written early: same ids, same shapes,
 * same build path. What a crash leaves behind is therefore a genuine ride truncated at
 * its last checkpoint — there is no partial-ride type, and nothing to repair on the way
 * back in.
 *
 * Driven by the sample clock rather than a wall-clock timer. A paused ride has produced
 * no new samples, so it has nothing to write, and a timer would spend the break rewriting
 * the same array.
 */
export class RideCheckpointer {
  private readonly options: RideCheckpointerOptions;
  private dueAtS = CHECKPOINT_INTERVAL_S;
  private writing = false;
  private wrote = false;
  private marked = false;

  constructor(options: RideCheckpointerOptions) {
    this.options = options;
  }

  /** Whether any of this ride has reached storage, which is what a discard has to undo. */
  get written(): boolean {
    return this.wrote;
  }

  /**
   * Call once per sample with that sample's ride time. Returns at once: the write runs on
   * its own and can neither block the sample stream nor reject into it.
   */
  onSample(tS: number): void {
    // Skipped rather than queued while one is in flight. The write already running holds
    // all but a second or two of what the one behind it would say, and the next sample
    // asks again — a queue would only turn a slow store into a growing backlog.
    if (this.writing || tS < this.dueAtS) return;
    this.dueAtS = tS + CHECKPOINT_INTERVAL_S;
    this.writing = true;
    void this.write();
  }

  private async write(): Promise<void> {
    try {
      // Known limit: each checkpoint rewrites the whole sample array, so write volume
      // grows with the square of ride length — about 120 writes of a growing array over
      // an hour, noticeably heavier across five. Acceptable at the lengths people ride
      // indoors. Chunked appends, a record per interval stitched together on read, is the
      // fix if it ever bites.
      const rideId = await writeRide(
        this.options.storage,
        this.options.recorder,
        this.options.progress(),
      );
      this.wrote = true;

      // Only once a checkpoint has actually landed: before that there is no part-written
      // ride for a crash to leave behind.
      if (!this.marked) {
        await setLiveRide(this.options.storage.session, rideId);
        this.marked = true;
      }
    } catch (error) {
      this.options.onFailure(error);
    } finally {
      this.writing = false;
    }
  }
}
