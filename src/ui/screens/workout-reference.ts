/**
 * The format reference beside the editor, as data rather than as markup.
 *
 * A hand-written format reference drifts from the parser within two changes and then
 * actively misleads — worse than no help at all, because the rider trusts it. So every
 * YAML fragment here is a string this module owns and workout-reference.test.ts feeds to
 * parseWorkout: a snippet that stops parsing fails the suite rather than reaching the
 * glass. The kinds below exist for that test — a fragment is only YAML in context, so
 * each one says what has to be built around it.
 *
 * It is read-only on purpose. Nothing here inserts into the textarea: YAML is
 * indentation-sensitive and a snippet dropped at the wrong depth is a parse error, which
 * is a worse outcome than copying two words by hand.
 *
 * docs/writing-a-workout.md is the long form. This is what you need without leaving the
 * screen, and deliberately stops short of it.
 */

/** A key of a step, named so the test can supply whatever else that step still needs. */
export type StepKey = 'duration' | 'power' | 'ramp' | 'cadence' | 'name';

/** A top-level key, named for the same reason. */
export type WorkoutKey = 'name' | 'description' | 'ftp' | 'warmup' | 'steps' | 'cooldown';

export type Snippet =
  /** A whole file, which parses as it stands. */
  | { readonly kind: 'workout'; readonly code: string }
  /** One top-level key and its value. */
  | { readonly kind: 'workoutKey'; readonly key: WorkoutKey; readonly code: string }
  /** One key inside a step, written as it appears in the braces. */
  | { readonly kind: 'stepKey'; readonly key: StepKey; readonly code: string }
  /** One item of a steps list, leading dash included. */
  | { readonly kind: 'stepsItem'; readonly code: string };

export interface ReferenceEntry {
  readonly snippet: Snippet;
  /** What it is, in one line. Left out where the fragment says everything. */
  readonly detail?: string;
}

export interface ReferenceSection {
  readonly heading: string;
  /** The rule the whole section is under, where there is one. */
  readonly note?: string;
  readonly entries: readonly ReferenceEntry[];
}

const REQUIRED_KEYS: ReferenceSection = {
  heading: 'Required',
  entries: [
    {
      snippet: { kind: 'workoutKey', key: 'name', code: 'name: 2x20 threshold' },
      detail: 'What the list and the ride screen call it.',
    },
    {
      snippet: {
        kind: 'workoutKey',
        key: 'steps',
        code: 'steps:\n  - { duration: 20m, power: 95% }',
      },
      detail: 'The body: steps and repeats, in order.',
    },
  ],
};

const OPTIONAL_KEYS: ReferenceSection = {
  heading: 'Optional',
  note: 'Any other key is an error rather than something ignored, here and inside a step — a key that is quietly dropped is a workout that quietly does something else.',
  entries: [
    {
      snippet: {
        kind: 'workoutKey',
        key: 'description',
        code: 'description: Two long blocks at threshold.',
      },
      detail: 'A line of prose, shown on the row.',
    },
    {
      snippet: { kind: 'workoutKey', key: 'ftp', code: 'ftp: 250' },
      detail: 'Ride this against a fixed FTP instead of the one in your profile.',
    },
    {
      snippet: {
        kind: 'workoutKey',
        key: 'warmup',
        code: 'warmup: { duration: 10m, ramp: [50%, 70%] }',
      },
      detail: 'One step, always ridden first. Written like any other.',
    },
    {
      snippet: {
        kind: 'workoutKey',
        key: 'cooldown',
        code: 'cooldown: { duration: 10m, power: 50% }',
      },
      detail: 'One step, always ridden last.',
    },
  ],
};

const DURATION: ReferenceSection = {
  heading: 'Duration',
  note: 'Hours, minutes and seconds in that order, any of them left out. Up to four hours.',
  entries: [
    { snippet: { kind: 'stepKey', key: 'duration', code: 'duration: 90s' } },
    { snippet: { kind: 'stepKey', key: 'duration', code: 'duration: 10m' } },
    { snippet: { kind: 'stepKey', key: 'duration', code: 'duration: 1h30m' } },
  ],
};

const POWER: ReferenceSection = {
  heading: 'Power',
  note: 'A step holds exactly one of these.',
  entries: [
    {
      snippet: { kind: 'stepKey', key: 'power', code: 'power: 95%' },
      detail: 'A percentage of FTP, resolved when you ride it.',
    },
    {
      snippet: { kind: 'stepKey', key: 'power', code: 'power: 250W' },
      detail: 'Watts, fixed whatever your FTP says.',
    },
    {
      snippet: { kind: 'stepKey', key: 'power', code: 'power: free' },
      detail: 'No target at all: ERG releases for the length of the step.',
    },
    {
      snippet: { kind: 'stepKey', key: 'ramp', code: 'ramp: [50%, 75%]' },
      detail:
        'Instead of power, when the target moves across the step. The ends may mix percentages and watts; neither may be free.',
    },
  ],
};

const CADENCE: ReferenceSection = {
  heading: 'Cadence',
  note: 'Shown to you, never written to the trainer: resistance does not change when you drift off it.',
  entries: [
    { snippet: { kind: 'stepKey', key: 'cadence', code: 'cadence: 90' } },
    { snippet: { kind: 'stepKey', key: 'cadence', code: 'cadence: [85, 95]' } },
  ],
};

const NAME: ReferenceSection = {
  heading: 'Name',
  entries: [
    {
      snippet: { kind: 'stepKey', key: 'name', code: 'name: Threshold' },
      detail:
        'What the Steps panel shows. Leave it out when the target already says everything there is to say.',
    },
  ],
};

const REPEATS: ReferenceSection = {
  heading: 'Repeats',
  note: 'A repeat holds its own steps, and those may be repeats in turn.',
  entries: [
    {
      snippet: {
        kind: 'stepsItem',
        code: `- repeat: 3
  steps:
    - { duration: 3m, power: 115%, name: VO2 }
    - { duration: 3m, power: 50% }`,
      },
    },
  ],
};

const EXAMPLE: ReferenceSection = {
  heading: 'All together',
  entries: [
    {
      snippet: {
        kind: 'workout',
        code: `name: 2x20 threshold
description: Two long blocks at threshold.
ftp: 250

warmup: { duration: 10m, ramp: [50%, 70%] }

steps:
  - repeat: 2
    steps:
      - { duration: 20m, power: 95% }
      - { duration: 5m, power: 55% }
  - { duration: 3m, power: free, name: Sprint }

cooldown: { duration: 10m, power: 50% }`,
      },
    },
  ],
};

export const WORKOUT_REFERENCE: readonly ReferenceSection[] = [
  REQUIRED_KEYS,
  OPTIONAL_KEYS,
  DURATION,
  POWER,
  CADENCE,
  NAME,
  REPEATS,
  EXAMPLE,
];
