import { describe, expect, it } from 'vitest';

import type { RideSample } from '../storage/types';
import { MINUS } from './gap';
import { lapSeries, type GhostSeries } from './lap';
import { SLOT_SYMBOL, type GhostSlot } from './slots';
import { activeGhosts, ghostState, type Ghost } from './state';

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

  it('is done once the rider passes the ghost lap time, with no gap and parked at the end', () => {
    const state = ghostState(ghost(), { lapS: LAP_S + 0.5, lapM: 920 });

    expect(state.done).toBe(true);
    expect(state.gapS).toBeNull();
    expect(state.gapLabel).toBeNull();
    expect(state.distanceM).toBe(LAP_M);
  });

  it('is still racing on the second the ghost crosses', () => {
    const state = ghostState(ghost(), { lapS: LAP_S, lapM: 1000 });

    expect(state.done).toBe(false);
    expect(state.gapS).toBeCloseTo(0, 6);
    expect(state.gapLabel).toBe('+0:00');
  });

  it('is done against a rider still short of the line, because time decides it', () => {
    // The rider is 400 m back and will never reach the finish within the ghost's lap.
    const state = ghostState(ghost(), { lapS: 150, lapM: 600 });

    expect(state.done).toBe(true);
    expect(state.distanceM).toBe(LAP_M);
  });

  it('is not done before its own lap, however far ahead it is', () => {
    const state = ghostState(ghost(), { lapS: 5, lapM: 10 });

    expect(state.done).toBe(false);
    expect(state.gapS).toBeCloseTo(4, 6);
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
    expect(states.map((g) => g.done)).toEqual([true, false]);
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
