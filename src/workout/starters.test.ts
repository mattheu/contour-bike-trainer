import { describe, expect, it } from 'vitest';
import manifest from '../../workouts/manifest.json';
import { expandWorkout } from './expand';
import { parseWorkout } from './parse';
import { plannedPowerSeries } from './runner';
import { trainingStressScore } from './load';
import type { Workout, WorkoutNode, WorkoutStep } from './types';

/**
 * The starter workouts are the documentation: between them they use every feature of the
 * format, so a rider learns it by reading them. This test is what stops a later format
 * change quietly breaking that — and the coverage assertion is what stops the examples
 * drifting into using only the easy half of the grammar.
 */

const sourceByPath = import.meta.glob('../../workouts/*.yaml', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const sourceByFile = new Map(
  Object.entries(sourceByPath).map(([path, source]) => [
    path.slice(path.lastIndexOf('/') + 1),
    source,
  ]),
);

const FEATURES = [
  'description',
  'ftp',
  'warmup',
  'cooldown',
  'named step',
  'unnamed step',
  'repeat',
  'nested repeat',
  'power as a percentage',
  'power in watts',
  'power free',
  'ramp',
  'ramp mixing forms',
  'cadence as a number',
  'cadence as a range',
  'duration in seconds',
  'duration in minutes',
  'duration in hours and minutes',
  'comments',
] as const;

type Feature = (typeof FEATURES)[number];

function walk(nodes: readonly WorkoutNode[], depth: number, found: Set<Feature>): void {
  for (const node of nodes) {
    if (node.kind === 'repeat') {
      found.add(depth === 0 ? 'repeat' : 'nested repeat');
      walk(node.steps, depth + 1, found);
      continue;
    }
    stepFeatures(node, found);
  }
}

function stepFeatures(step: WorkoutStep, found: Set<Feature>): void {
  found.add(step.name === undefined ? 'unnamed step' : 'named step');
  if (step.cadence) {
    found.add(
      step.cadence.minRpm === step.cadence.maxRpm ? 'cadence as a number' : 'cadence as a range',
    );
  }
  if (step.power.kind === 'free') found.add('power free');
  if (step.power.kind === 'constant') {
    found.add(step.power.value.unit === 'watts' ? 'power in watts' : 'power as a percentage');
  }
  if (step.power.kind === 'ramp') {
    found.add('ramp');
    if (step.power.from.unit !== step.power.to.unit) found.add('ramp mixing forms');
  }
}

function featuresOf(source: string, workout: Workout): Set<Feature> {
  const found = new Set<Feature>();
  if (workout.description) found.add('description');
  if (workout.ftp !== undefined) found.add('ftp');
  if (workout.warmup) {
    found.add('warmup');
    stepFeatures(workout.warmup, found);
  }
  if (workout.cooldown) {
    found.add('cooldown');
    stepFeatures(workout.cooldown, found);
  }
  walk(workout.steps, 0, found);

  // The written form of a duration is lost by the time it is seconds, so read it from the source.
  if (/duration:\s*\d+s\b/.test(source)) found.add('duration in seconds');
  if (/duration:\s*\d+m\b/.test(source)) found.add('duration in minutes');
  if (/duration:\s*\d+h\d+m\b/.test(source)) found.add('duration in hours and minutes');
  if (/^\s*#|\s#\s/m.test(source)) found.add('comments');
  return found;
}

const starters = manifest.workouts.map((entry) => {
  const source = sourceByFile.get(entry.file);
  if (source === undefined) {
    throw new Error(`workouts/manifest.json lists "${entry.file}", but no such file is bundled`);
  }
  return { ...entry, source };
});

describe('workouts/manifest.json', () => {
  it('ships the four starters the spec names', () => {
    expect(manifest.workouts).toHaveLength(4);
    expect(manifest.workouts.map((entry) => entry.id)).toEqual([
      '2x20-threshold',
      '5x3-vo2',
      'endurance-90',
      'openers',
    ]);
  });

  it('declares every bundled file exactly once', () => {
    const declared = manifest.workouts.map((entry) => entry.file).sort();
    expect(declared).toEqual([...sourceByFile.keys()].sort());
    expect(new Set(manifest.workouts.map((entry) => entry.id)).size).toBe(manifest.workouts.length);
  });
});

describe('the starter workouts', () => {
  it.each(starters)('$id parses, expands and scores', ({ source }) => {
    const workout = parseWorkout(source);
    expect(workout.name).not.toBe('');

    const expanded = expandWorkout(workout);
    expect(expanded.steps.length).toBeGreaterThan(1);
    expect(expanded.totalDurationS).toBe(
      expanded.steps.reduce((total, step) => total + step.durationS, 0),
    );

    const ftp = workout.ftp ?? 250;
    const tss = trainingStressScore(
      plannedPowerSeries(expanded.steps, ftp),
      expanded.totalDurationS,
      ftp,
    );
    expect(tss).toBeGreaterThan(20);
    expect(tss).toBeLessThan(200);
  });

  it('uses every feature of the format between them', () => {
    const covered = new Set<Feature>();
    for (const { source } of starters) {
      for (const feature of featuresOf(source, parseWorkout(source))) covered.add(feature);
    }
    expect([...FEATURES].filter((feature) => !covered.has(feature))).toEqual([]);
  });

  it('covers the features each one is there to teach', () => {
    const byId = new Map(
      starters.map(({ id, source }) => [id, featuresOf(source, parseWorkout(source))]),
    );
    expect(byId.get('2x20-threshold')).toContain('cadence as a number');
    expect(byId.get('2x20-threshold')).toContain('ftp');
    expect(byId.get('2x20-threshold')).toContain('unnamed step');
    expect(byId.get('5x3-vo2')).toContain('cadence as a range');
    expect(byId.get('endurance-90')).toContain('power in watts');
    expect(byId.get('endurance-90')).toContain('duration in hours and minutes');
    expect(byId.get('openers')).toContain('nested repeat');
    expect(byId.get('openers')).toContain('power free');
    expect(byId.get('openers')).toContain('ramp mixing forms');
  });
});
