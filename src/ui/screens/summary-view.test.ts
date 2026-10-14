import { describe, expect, it } from 'vitest';
import type { RideSample } from '../../storage/types';
import { powerSamplesFrom } from './summary-view';

function sample(patch: Partial<RideSample>): RideSample {
  return {
    t: 0,
    distanceM: 0,
    speedKmh: 30,
    powerW: 200,
    cadenceRpm: 90,
    heartRateBpm: 150,
    lat: null,
    lon: null,
    eleM: null,
    ...patch,
  };
}

describe('powerSamplesFrom', () => {
  it('keeps distance and watts in the order they were ridden', () => {
    expect(
      powerSamplesFrom([
        sample({ distanceM: 0, powerW: 180 }),
        sample({ distanceM: 8, powerW: 210 }),
      ]),
    ).toEqual([
      { distM: 0, watts: 180 },
      { distM: 8, watts: 210 },
    ]);
  });

  it('drops the seconds with no power rather than shading them as zero', () => {
    expect(
      powerSamplesFrom([sample({ powerW: null }), sample({ distanceM: 8, powerW: 210 })]),
    ).toEqual([{ distM: 8, watts: 210 }]);
  });

  it('survives an empty ride', () => {
    expect(powerSamplesFrom([])).toEqual([]);
  });
});
