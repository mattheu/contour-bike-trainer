import type { Workout, WorkoutNode, WorkoutStep } from './types';

/**
 * Repeat blocks flattened into the steps actually ridden.
 *
 * This is the one expansion: the runner rides this list and the Steps panel lists it, so
 * the two cannot disagree about what step 4 of 8 is. It is tested here rather than twice
 * in two places that have to match.
 */

/** Warmup and cooldown are named for free, so the panel can label them without the author writing one. */
export const WARMUP_NAME = 'Warmup';
export const COOLDOWN_NAME = 'Cooldown';

export interface ExpandedStep extends WorkoutStep {
  /** Carried into every expansion, so three sweet-spot blocks all read as such. */
  name?: string;
}

export interface ExpandedWorkout {
  steps: ExpandedStep[];
  /** The Steps panel header shows a count and a total: `8 · 63 min`. */
  totalDurationS: number;
}

function flatten(nodes: readonly WorkoutNode[], into: ExpandedStep[]): void {
  for (const node of nodes) {
    if (node.kind === 'step') {
      into.push({ ...node });
      continue;
    }
    for (let pass = 0; pass < node.count; pass += 1) flatten(node.steps, into);
  }
}

export function expandWorkout(workout: Workout): ExpandedWorkout {
  const steps: ExpandedStep[] = [];
  if (workout.warmup) steps.push({ name: WARMUP_NAME, ...workout.warmup });
  flatten(workout.steps, steps);
  if (workout.cooldown) steps.push({ name: COOLDOWN_NAME, ...workout.cooldown });

  return {
    steps,
    totalDurationS: steps.reduce((total, step) => total + step.durationS, 0),
  };
}
