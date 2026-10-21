import type { ErgMode } from '../storage/types';

/**
 * What goes down the control point, which is also the mode switch: there is one
 * characteristic and two commands — a target to hold, which puts the trainer into ERG,
 * and simulation parameters, which release it. SPEC.md > ERG is optional.
 */
export type ControlWrite = { kind: 'target'; watts: number } | { kind: 'simulation' };

const SIMULATION: ControlWrite = Object.freeze({ kind: 'simulation' });

/**
 * ERG off is a free step extended over the whole session: whatever the plan asks for, the
 * trainer is handed simulation parameters and the rider holds the target with gears and
 * cadence. The target itself is untouched — still shown, still scaled, still what the
 * session is judged against; only who holds it changes.
 */
export function controlWrite(mode: ErgMode, targetW: number | null): ControlWrite {
  if (mode === 'manual' || targetW === null) return SIMULATION;
  return { kind: 'target', watts: targetW };
}
