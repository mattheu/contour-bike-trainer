/**
 * The parsed shape of a workout file. The stored record keeps the YAML source, not this —
 * so a round trip through the editor returns the file the rider wrote, comments and all,
 * and every consumer parses that text with the one pure function in parse.ts.
 */

/** A power value written as a percentage of FTP or as watts. Resolved against an FTP, never before. */
export type PowerValue = { unit: 'ftpPercent'; value: number } | { unit: 'watts'; value: number };

/**
 * `free` is a control-mode change rather than a step type: the step still has a duration
 * and a name, it simply has no target, so ERG releases for its length.
 */
export type StepPower =
  | { kind: 'constant'; value: PowerValue }
  | { kind: 'ramp'; from: PowerValue; to: PowerValue }
  | { kind: 'free' };

/** A target shown to the rider, never written to the trainer. A single number has equal bounds. */
export interface CadenceTarget {
  minRpm: number;
  maxRpm: number;
}

export interface WorkoutStep {
  kind: 'step';
  durationS: number;
  power: StepPower;
  cadence?: CadenceTarget;
  /** What the Steps panel shows. Absent means the panel shows the target alone. */
  name?: string;
}

/** A count and its own steps, which may themselves repeat. */
export interface RepeatBlock {
  kind: 'repeat';
  count: number;
  steps: WorkoutNode[];
}

export type WorkoutNode = WorkoutStep | RepeatBlock;

export interface Workout {
  name: string;
  description?: string;
  /** Falls back to the rider profile when absent, so it is optional here too. */
  ftp?: number;
  /** Ordinary steps with their own keys, so they come first and last whatever the file does. */
  warmup?: WorkoutStep;
  cooldown?: WorkoutStep;
  steps: WorkoutNode[];
}
