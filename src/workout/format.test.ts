import { describe, expect, it } from 'vitest';
import formatTest from '../../manual-tests/format-test.yaml?raw';
import { expandWorkout } from './expand';
import { parseWorkout } from './parse';
import { plannedPowerSeries } from './runner';
import { trainingStressScore } from './load';
import type { Workout, WorkoutNode, WorkoutStep } from './types';

/**
 * One file that uses every part of the workout format, and the test that holds it to that.
 *
 * It shipped as a starter until the app stopped carrying test content in a rider's list —
 * fifteen minutes of grammar demonstration is not a training session. It lives in
 * manual-tests/ now, where it is material a person pastes into the editor to ride the whole
 * format against real hardware, and this test is what stops it rotting between those rides.
 *
 * What it guards is unchanged: a format change that nothing exercises is a format change
 * that breaks quietly. The feature list below is the grammar written out, and the coverage
 * assertion fails the moment the parser grows a form the file does not use — which is the
 * prompt to add it there rather than to discover it from a rider's parse error.
 *
 * `1h30m` is the one form deliberately absent: no step in a sane session runs ninety
 * minutes. It is covered by the editor's format reference instead, whose snippets are
 * parsed by src/ui/screens/workout-reference.test.ts.
 */

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
  if (/^\s*#|\s#\s/m.test(source)) found.add('comments');
  return found;
}

describe('the format test workout', () => {
  const workout = parseWorkout(formatTest);

  it('uses every feature of the format', () => {
    const covered = featuresOf(formatTest, workout);
    expect([...FEATURES].filter((feature) => !covered.has(feature))).toEqual([]);
  });

  it('declares its own FTP, which is what makes it useful to the chart tests', () => {
    // plan-chart.test.ts pins a bug that only appears when a workout's FTP and the
    // profile's differ, so dropping this would silently stop that testing anything.
    expect(workout.ftp).toBe(250);
  });

  it('expands to fifteen minutes of flattened steps', () => {
    const expanded = expandWorkout(workout);
    expect(expanded.totalDurationS).toBe(900);
    expect(expanded.steps).toHaveLength(18);
    expect(expanded.totalDurationS).toBe(
      expanded.steps.reduce((total, step) => total + step.durationS, 0),
    );
  });

  it('scores, so the whole grammar survives being turned into a series of watts', () => {
    // The free block and the mixed ramp are the two that could plausibly produce a null
    // or a NaN here rather than a number of watts.
    const expanded = expandWorkout(workout);
    const ftp = workout.ftp ?? 250;
    const series = plannedPowerSeries(expanded.steps, ftp);
    expect(series).toHaveLength(expanded.totalDurationS);
    expect(series.every((watts) => watts === null || Number.isFinite(watts))).toBe(true);

    const tss = trainingStressScore(series, expanded.totalDurationS, ftp);
    expect(tss).toBeGreaterThan(0);
    expect(Number.isFinite(tss)).toBe(true);
  });
});
