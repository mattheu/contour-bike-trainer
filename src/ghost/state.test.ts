import { describe, expect, it } from 'vitest';

import type { RideSample } from '../storage/types';
import { MINUS } from './gap';
import { lapSeries, rideSeries, type GhostSeries } from './lap';
import { SLOT_SYMBOL, type GhostSlot } from './slots';
import {
  DONE_LABEL,
  STOPPED_LABEL,
  activeGhosts,
  bandLabel,
  ghostState,
  type Ghost,
} from './state';

const LAP_M = 1000;
const LAP_S = 100;

function sample(t: number, distanceM: number): RideSample {
  return {
    t,
    distanceM,
    speedKmh: 36,
    powerW: 200,
    cadenceRpm: 88,
    heartRateBpm: 140,
    lat: null,
    lon: null,
    eleM: null,
  };
}

/** A lap at a steady 10 m/s: 1 000 m in 100 s, so a metre is a tenth of a second. */
function steadyLap(durationS = LAP_S): GhostSeries {
  const samples: RideSample[] = [];
  for (let t = 0; t <= durationS; t += 1) samples.push(sample(t, (t / durationS) * LAP_M));
  const series = lapSeries(samples, [durationS], 0, LAP_M);
  if (series === null) throw new Error('fixture did not slice');
  return series;
}

/** A ride that set off at the same 10 m/s and stopped at 600 m, 60 s in. */
function stoppedRide(): GhostSeries {
  const samples: RideSample[] = [];
  for (let t = 0; t <= 60; t += 1) samples.push(sample(t, t * 10));
  const series = rideSeries(samples, LAP_M);
  if (series === null) throw new Error('fixture did not slice');
  return series;
}

function ghost(slot: GhostSlot = 'best', series: GhostSeries = steadyLap()): Ghost {
  return { slot, name: 'Best', series };
}

describe('ghostState', () => {
  it('reads a ghost up the road as a positive gap', () => {
    // The ghost reached 400 m at 40 s; the rider gets there at 50.
    const state = ghostState(ghost(), { lapS: 50, lapM: 400 });

    expect(state.gapS).toBeCloseTo(10, 6);
    expect(state.gapLabel).toBe('+0:10');
  });

  it('reads a rider up the road as a negative gap, with a true minus', () => {
    const state = ghostState(ghost(), { lapS: 40, lapM: 500 });

    expect(state.gapS).toBeCloseTo(-10, 6);
    expect(state.gapLabel).toBe(`${MINUS}0:10`);
  });

  it('puts the ghost where it was at the rider lap time, interpolated', () => {
    expect(ghostState(ghost(), { lapS: 50.5, lapM: 500 }).distanceM).toBeCloseTo(505, 6);
  });

  it('carries the slot symbol so the renderer looks nothing up', () => {
    const state = ghostState(ghost('year'), { lapS: 10, lapM: 100 });

    expect(state.symbol).toEqual(SLOT_SYMBOL.year);
    expect(state.slot).toBe('year');
  });

  it('finishes once the rider passes the ghost lap time, with no gap and parked at the end', () => {
    const state = ghostState(ghost(), { lapS: LAP_S + 0.5, lapM: 920 });

    expect(state.end).toBe('finished');
    expect(state.gapS).toBeNull();
    expect(state.gapLabel).toBeNull();
    expect(state.distanceM).toBe(LAP_M);
    expect(bandLabel(state)).toBe(DONE_LABEL);
  });

  it('is still racing on the second the ghost crosses', () => {
    const state = ghostState(ghost(), { lapS: LAP_S, lapM: 1000 });

    expect(state.end).toBe('racing');
    expect(state.gapS).toBeCloseTo(0, 6);
    expect(state.gapLabel).toBe('+0:00');
    expect(bandLabel(state)).toBe('+0:00');
  });

  it('finishes against a rider still short of the line, because time decides it', () => {
    // The rider is 400 m back and will never reach the finish within the ghost's lap.
    const state = ghostState(ghost(), { lapS: 150, lapM: 600 });

    expect(state.end).toBe('finished');
    expect(state.distanceM).toBe(LAP_M);
  });

  it('is racing before its own lap is up, however far ahead it is', () => {
    const state = ghostState(ghost(), { lapS: 5, lapM: 10 });

    expect(state.end).toBe('racing');
    expect(state.gapS).toBeCloseTo(4, 6);
  });

  it('races a ride that stopped short, right up to where it stopped', () => {
    const state = ghostState(ghost('chosen', stoppedRide()), { lapS: 50, lapM: 400 });

    expect(state.end).toBe('racing');
    expect(state.distanceM).toBeCloseTo(500, 6);
    expect(state.gapS).toBeCloseTo(10, 6);
  });

  it('stops where that ride stopped, and says so rather than saying done', () => {
    const state = ghostState(ghost('chosen', stoppedRide()), { lapS: 70, lapM: 800 });

    expect(state.end).toBe('stopped');
    expect(state.distanceM).toBe(600);
    expect(state.gapS).toBeNull();
    // Not DONE_LABEL: the ride never reached the end, so there is nothing it is done with.
    expect(bandLabel(state)).toBe(STOPPED_LABEL);
    expect(STOPPED_LABEL).not.toBe(DONE_LABEL);
  });
});

describe('activeGhosts', () => {
  it('reads in slot order, whatever order the ghosts were switched on in', () => {
    const ghosts: Ghost[] = [
      { slot: 'chosen', name: '29 Sep', series: steadyLap() },
      { slot: 'last', name: 'Last', series: steadyLap() },
      { slot: 'best', name: 'Best', series: steadyLap() },
    ];

    expect(activeGhosts(ghosts, { lapS: 10, lapM: 100 }).map((g) => g.slot)).toEqual([
      'best',
      'last',
      'chosen',
    ]);
  });

  it('keeps a finished ghost in the key, saying it is done', () => {
    const ghosts: Ghost[] = [
      { slot: 'best', name: 'Best', series: steadyLap(80) },
      { slot: 'last', name: 'Last', series: steadyLap(120) },
    ];
    const states = activeGhosts(ghosts, { lapS: 90, lapM: 900 });

    expect(states).toHaveLength(2);
    expect(states.map((g) => g.end)).toEqual(['finished', 'racing']);
    expect(states[0]?.gapLabel).toBeNull();
    expect(states[1]?.gapLabel).not.toBeNull();
  });

  it('leaves the ghosts it was given alone', () => {
    const ghosts: Ghost[] = [
      { slot: 'last', name: 'Last', series: steadyLap() },
      { slot: 'best', name: 'Best', series: steadyLap() },
    ];
    activeGhosts(ghosts, { lapS: 10, lapM: 100 });

    expect(ghosts.map((g) => g.slot)).toEqual(['last', 'best']);
  });
});
