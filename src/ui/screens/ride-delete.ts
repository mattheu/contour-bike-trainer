import type { AlertLevel } from '../components/Alert';
import type { ListScreen } from './Nav';

/**
 * Deleting a ride is unrecoverable: there is no backend, no undo, and the samples
 * underneath it cannot be reconstructed from the aggregates. So it takes two presses, and
 * the state between them lives here rather than in a component — which ride is armed, what
 * a press does to it, what clears it, and the words the rider reads either way.
 */

/** The ride awaiting its second press, or null. One at a time, across the whole list. */
export type Armed = string | null;

export interface PressOutcome {
  armed: Armed;
  /** Set only by the second press on the same ride; null means "still deciding". */
  deleted: string | null;
}

/**
 * First press arms, second press on the same ride deletes. Pressing a different ride
 * moves the confirmation there rather than leaving two rows armed — two armed rows is
 * two questions on screen and no way to tell which one the next press answers.
 */
export function pressDelete(armed: Armed, rideId: string): PressOutcome {
  return armed === rideId ? { armed: null, deleted: rideId } : { armed: rideId, deleted: null };
}

export function isArmed(armed: Armed, rideId: string): boolean {
  return armed === rideId;
}

/** The way out: the Keep control, and anything else that abandons the question. */
export function cancelDelete(): Armed {
  return null;
}

/**
 * Drops an armed ride that is no longer on screen. A filter change can hide the row the
 * question was asked about, and an id that survives that would silently re-arm the row
 * when the filter came back.
 */
export function retainArmed(armed: Armed, visibleIds: readonly string[]): Armed {
  return armed !== null && visibleIds.includes(armed) ? armed : null;
}

/**
 * How the summary was reached. The operation is identical — the same cascade, the same
 * two presses — but the act is not, so the wording and the way back differ.
 */
export type DeleteOrigin = 'finished' | 'history';

export interface DeleteWording {
  /** The resting control. */
  action: string;
  /** The line beside the armed pair. */
  prompt: string;
  /** The armed control that actually deletes. */
  confirm: string;
  /** The escape, always worded rather than implied by clicking elsewhere. */
  cancel: string;
}

const WORDING: Record<DeleteOrigin, DeleteWording> = {
  // A ride the rider was on a moment ago: the false start, the accidental two minutes.
  // They know exactly what they are throwing away, so the confirm asks rather than warns.
  // Back to whichever list they came from, because what they want next is something to
  // ride, not their history. See returnToAfterDelete.
  finished: {
    action: 'Discard ride',
    prompt: 'Discard?',
    confirm: 'Discard',
    cancel: 'Keep',
  },
  // A ride from months ago, remembered only as the figures on its row. Say plainly that
  // this is permanent, once, and leave it there.
  history: {
    action: 'Delete ride',
    prompt: "Sure? Can't be undone",
    confirm: 'Delete',
    cancel: 'Keep',
  },
};

export function deleteWording(origin: DeleteOrigin): DeleteWording {
  return WORDING[origin];
}

export type DeleteResult = { status: 'done' } | { status: 'failed'; reason: string };

/**
 * The one line the rider gets. A delete that worked is passing news — the row is gone and
 * they can see that — so it clears itself; a delete that failed left a ride they believe
 * is gone in the history, which is the kind of thing that has to be read.
 */
export function deleteAlert(
  result: DeleteResult,
  title: string,
): { level: AlertLevel; message: string } {
  return result.status === 'failed'
    ? { level: 'fault', message: `That ride could not be deleted: ${result.reason}` }
    : { level: 'info', message: `${title} deleted.` };
}

/**
 * Where to go once the ride is gone.
 *
 * Not a field on the wording, because it is not a property of why the rider is deleting:
 * a ride they just abandoned belongs back at the list they started it from, and a workout
 * ride was started from the workouts list. Sending them to the routes would be offering a
 * route to someone who was doing a plan.
 */
export function returnToAfterDelete(origin: DeleteOrigin, wasWorkout: boolean): ListScreen {
  if (origin === 'history') return 'rides';
  return wasWorkout ? 'workouts' : 'routes';
}
