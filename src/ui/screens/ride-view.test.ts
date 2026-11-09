import { describe, expect, it } from 'vitest';
import type { AscentSeries } from '../../route/profile';
import { INITIAL_SNAPSHOT, type RideSnapshot } from '../store';
import {
  ftpSharePercent,
  heartRateLadder,
  kilometres,
  lapProgress,
  powerLadder,
  primaryControlLabel,
  readingTone,
} from './ride-view';

describe('powerLadder', () => {
  it('is null for an absent reading, so a dropped trainer never reads as zone 1', () => {
    expect(powerLadder(null, 200, null, 5)).toBeNull();
  });

  it('lights the zone the watts fall in and places the tick inside it', () => {
    const view = powerLadder(200, 200, null, 5);
    // Threshold runs 90-105 % of FTP, so 200 W at FTP 200 is zone 4, two thirds along it.
    expect(view?.zone).toBe(4);
    expect(view?.marker).toBeCloseTo((3 + 20 / 30) / 6, 6);
  });

  it('adds a target band only when a target is set', () => {
    expect(powerLadder(200, 200, null, 5)?.target).toBeUndefined();
    const banded = powerLadder(200, 200, 240, 5);
    expect(banded?.target?.from).toBeLessThan(banded!.target!.to);
  });

  it('refuses a non-positive FTP rather than dividing by it', () => {
    expect(powerLadder(200, 0, null, 5)).toBeNull();
  });
});

describe('heartRateLadder', () => {
  it('is null without a strap', () => {
    expect(heartRateLadder(null, 190, null, 5)).toBeNull();
  });

  it('puts 158 bpm at hrMax 190 in zone 4, as the mockup shows', () => {
    expect(heartRateLadder(158, 190, null, 5)?.zone).toBe(4);
  });
});

describe('ftpSharePercent', () => {
  it('reports the share of FTP the rider is holding', () => {
    expect(ftpSharePercent(287, 265)).toBeCloseTo(108.3, 1);
  });

  it('stays null when either half is missing', () => {
    expect(ftpSharePercent(null, 265)).toBeNull();
    expect(ftpSharePercent(287, 0)).toBeNull();
  });
});

describe('kilometres', () => {
  it('converts metres and passes absence through', () => {
    expect(kilometres(16_100)).toBe(16.1);
    expect(kilometres(null)).toBeNull();
  });
});

describe('readingTone', () => {
  it('stays ink while the device is connected', () => {
    expect(readingTone('connected')).toBe('ink');
  });

  it('drops to muted the moment the device is anything else', () => {
    // design/DESIGN.md: the fault shows in the data, not only in the alert strip.
    expect(readingTone('disconnected')).toBe('muted');
    expect(readingTone('reconnecting')).toBe('muted');
    expect(readingTone('connecting')).toBe('muted');
  });
});

describe('primaryControlLabel', () => {
  it('reads Start on a ride that has not moved yet', () => {
    // Choosing a route only arms the ride: nothing runs until the rider says so.
    expect(primaryControlLabel('idle', 0)).toBe('Start');
    expect(primaryControlLabel('paused', 0)).toBe('Start');
  });

  it('reads Pause while the ride is running', () => {
    expect(primaryControlLabel('running', 0)).toBe('Pause');
    expect(primaryControlLabel('running', 412)).toBe('Pause');
  });

  it('reads Resume once time is on the clock', () => {
    expect(primaryControlLabel('paused', 1)).toBe('Resume');
    expect(primaryControlLabel('finished', 412)).toBe('Resume');
  });
});

/**
 * A 12 km lap that climbs 200 m, all of it in the first six: so 4.1 km round is 52 m of it
 * at the rate the straight segment between the two points gives.
 */
const ECCUP: AscentSeries = {
  points: [
    { distM: 0, ascentM: 0 },
    { distM: 6000, ascentM: 200 },
    { distM: 12_000, ascentM: 200 },
  ],
  totalM: 200,
};

function snapshot(partial: Partial<RideSnapshot>): RideSnapshot {
  return { ...INITIAL_SNAPSHOT, routeLoops: true, routeTotalDistanceM: 12_000, ...partial };
}

describe('lapProgress', () => {
  it('is null on a route that does not come back to its start', () => {
    expect(lapProgress(snapshot({ routeLoops: false, distanceM: 16_100 }), ECCUP)).toBeNull();
  });

  it('is null where the route has no length to lap', () => {
    expect(lapProgress(snapshot({ routeTotalDistanceM: null }), ECCUP)).toBeNull();
  });

  it('reads the lap from the line the ghost clock already reset on', () => {
    const lap = lapProgress(
      snapshot({ elapsedS: 1657, lapStartS: 1232, distanceM: 16_100, routePositionM: 4100 }),
      ECCUP,
    );

    expect(lap).toMatchObject({ label: 'Lap 2', number: 2, startM: 12_000, elapsedS: 425 });
    expect(lap?.distanceM).toBe(4100);
    // The route's own gain to that position, not a second accumulation of the ride's.
    expect(lap?.ascentM).toBeCloseTo((4100 / 6000) * 200, 6);
  });

  it('reads the first lap as the ride itself, under the plain tag', () => {
    const lap = lapProgress(
      snapshot({ elapsedS: 425, distanceM: 4100, routePositionM: 4100 }),
      ECCUP,
    );

    expect(lap).toMatchObject({ label: 'Loop', number: 1, startM: 0, elapsedS: 425 });
  });

  it('never reads a lap clock below nought in the second after a crossing', () => {
    // The line is recorded at the tick's fractional second while elapsedS is published in
    // whole ones, so the subtraction can land just under zero — and a dash on the lap
    // clock every time round would be the one reading that is simply wrong.
    const lap = lapProgress(
      snapshot({ elapsedS: 1232, lapStartS: 1232.4, distanceM: 12_001, routePositionM: 1 }),
      ECCUP,
    );

    expect(lap?.elapsedS).toBe(0);
  });
});
