import { elevationAt } from './position';
import type { Route } from './types';

/** Settings default: the window the rider is about to ride, not the one just ridden. */
export const DEFAULT_LOOKAHEAD_M = 30;

/**
 * Physical plausibility bound. A GPS elevation spike can produce a nonsense gradient
 * for one tick; nothing rideable exceeds this. It is deliberately NOT the trainer's
 * range — see TRAINER_MAX_GRADE_PERCENT.
 */
export const MAX_GRADE_PERCENT = 30;

/**
 * What the trainer will accept. Real trainers refuse or misbehave beyond roughly this,
 * so the ceiling is applied at the hardware boundary and nowhere else. Clamping the
 * grade the physics sees would make a device limitation change how fast you ride:
 * a 25 % wall would be climbed as if it were 20 %. See docs/adr/0008.
 */
export const TRAINER_MAX_GRADE_PERCENT = 20;

export function clampGrade(gradePercent: number): number {
  return Math.min(MAX_GRADE_PERCENT, Math.max(-MAX_GRADE_PERCENT, gradePercent));
}

/**
 * The grade written to the trainer: the real grade scaled by difficulty, then clamped
 * to what the hardware accepts. Difficulty changes how the hill feels, never how fast
 * the ride moves, so this value must never reach the physics.
 */
export function trainerGrade(routeGradePercent: number, difficultyPercent: number): number {
  const scaled = (routeGradePercent * difficultyPercent) / 100;
  const clamped = Math.min(TRAINER_MAX_GRADE_PERCENT, Math.max(-TRAINER_MAX_GRADE_PERCENT, scaled));
  // A descent at difficulty 0 yields -0, which formats as "-0.0 %".
  return clamped === 0 ? 0 : clamped;
}

/**
 * Grade at a distance: rise over run across a forward window, as a percentage.
 *
 * The window shrinks against the end of the route rather than reading past it,
 * so the last few metres report the real final gradient instead of zero.
 */
export function gradeAt(route: Route, distM: number, lookaheadM = DEFAULT_LOOKAHEAD_M): number {
  if (!Number.isFinite(lookaheadM) || lookaheadM <= 0) {
    throw new Error(`Grade lookahead must be a positive distance, got ${lookaheadM}`);
  }

  const start = Math.max(0, Math.min(distM, route.totalDistanceM));
  const end = Math.min(start + lookaheadM, route.totalDistanceM);
  const run = end - start;

  // Standing at the finish line there is no route left to measure a gradient over.
  if (run <= 0) return 0;

  const rise = elevationAt(route, end) - elevationAt(route, start);
  return clampGrade((rise / run) * 100);
}
