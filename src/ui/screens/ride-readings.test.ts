import { describe, expect, it } from 'vitest';
import { INITIAL_SNAPSHOT, type RideSnapshot } from '../store';
import { rideReadings, type RideReadingsInput } from './ride-readings';
import type { LapProgress } from './ride-view';

function readings(snapshot: Partial<RideSnapshot>, input: Partial<RideReadingsInput> = {}) {
  return rideReadings({
    snapshot: { ...INITIAL_SNAPSHOT, ...snapshot },
    lap: null,
    ftpW: 265,
    hrMaxBpm: 185,
    targetPowerW: null,
    targetHeartRateBpm: null,
    targetMarginPct: 5,
    ...input,
  });
}

const CONNECTED = { trainerState: 'connected', hrmState: 'connected' } as const;

describe('rideReadings', () => {
  it('formats the three primaries with their units and meanings', () => {
    const view = readings({
      ...CONNECTED,
      displayPowerW: 287,
      cadenceRpm: 91,
      heartRateBpm: 158,
    });

    expect(view.power).toMatchObject({
      value: '287',
      unit: 'W',
      figure: '108',
      figureUnit: '% FTP',
    });
    expect(view.cadence).toMatchObject({ value: '91', unit: 'rpm' });
    expect(view.cadence.figure).toBeUndefined();
    expect(view.heartRate).toMatchObject({ value: '158', unit: 'bpm', figure: 'Z4' });
  });

  it('counts the distance against the route, not the ride, so a loop reads as a lap', () => {
    const view = readings({
      distanceM: 54_300,
      routePositionM: 16_100,
      routeTotalDistanceM: 38_200,
      ascentM: 212,
      routeTotalAscentM: 512,
    });

    expect(view.distance).toMatchObject({ value: '16.1', total: '38.2', unit: 'km' });
    expect(view.climbed).toMatchObject({ value: '212', total: '512', unit: 'm' });
  });

  it('mutes what a dropped trainer was reading, and leaves the strap alone', () => {
    const view = readings({
      ...CONNECTED,
      trainerState: 'reconnecting',
      displayPowerW: 287,
      heartRateBpm: 158,
      speedKmh: 31.4,
    });

    expect(view.power.tone).toBe('muted');
    expect(view.cadence.tone).toBe('muted');
    // Speed is solved from the trainer's power, so it goes stale with it.
    expect(view.speed.tone).toBe('muted');
    expect(view.heartRate.tone).toBe('ink');
  });

  it('leaves the meaning off a reading that is absent rather than sinking it to zone 1', () => {
    const view = readings({ displayPowerW: null, heartRateBpm: null });

    expect(view.power.figure).toBeUndefined();
    expect(view.heartRate.figure).toBeUndefined();
    expect(view.powerLadder).toBeNull();
    expect(view.heartRateLadder).toBeNull();
  });

  it('gives the ladders their target band only when something is being asked for', () => {
    expect(readings({ ...CONNECTED, displayPowerW: 240 }).powerLadder?.target).toBeUndefined();
    expect(
      readings({ ...CONNECTED, displayPowerW: 240 }, { targetPowerW: 239 }).powerLadder?.target,
    ).toBeDefined();
  });
});

/**
 * A lap of the mockup's Eccup Loop: 12.0 km round, the rider 4.1 km and 7:05 into lap two
 * of a ride that has run 16.1 km in 27:37 — design/mockups/ride-times.html.
 */
function eccupLap(partial: Partial<LapProgress> = {}): LapProgress {
  return {
    label: 'Lap 2',
    number: 2,
    lengthM: 12_000,
    startM: 12_000,
    elapsedS: 425,
    distanceM: 4100,
    ascentM: 52,
    ...partial,
  };
}

describe('rideReadings on a loop', () => {
  it('reads lap against ride in the first three blocks, the lap naming the first', () => {
    const view = readings(
      { elapsedS: 1657, distanceM: 16_100, routePositionM: 4100, ascentM: 200 },
      { lap: eccupLap() },
    );

    expect(view.elapsed).toMatchObject({ label: 'Lap 2', value: '7:05', total: '27:37' });
    expect(view.distance).toMatchObject({ value: '4.1', total: '16.1', unit: 'km' });
    expect(view.climbed).toMatchObject({ value: '52', total: '200', unit: 'm' });
  });

  it('leaves speed and gradient untouched, and keeps the strip at five blocks', () => {
    const view = readings(
      { ...CONNECTED, speedKmh: 31.4, gradePercent: 6.4, elapsedS: 1657, distanceM: 16_100 },
      { lap: eccupLap() },
    );

    expect(view.speed).toMatchObject({ label: 'Speed', value: '31.4', unit: 'km/h' });
    expect(view.speed.total).toBeUndefined();
    expect(view.gradient).toMatchObject({ label: 'Gradient', value: '6.4', unit: '%' });
    expect(view.gradient.total).toBeUndefined();
  });

  it('reads the same pair through the first lap, where the lap is the ride', () => {
    // Nothing has been ridden twice yet, so both halves of each slash are one figure. The
    // label is the tag rather than a count, exactly as route/loop.ts has it.
    const view = readings(
      { elapsedS: 425, distanceM: 4100, routePositionM: 4100, ascentM: 52 },
      { lap: eccupLap({ label: 'Loop', number: 1, startM: 0 }) },
    );

    expect(view.elapsed).toMatchObject({ label: 'Loop', value: '7:05', total: '7:05' });
    expect(view.distance).toMatchObject({ value: '4.1', total: '4.1' });
    expect(view.climbed).toMatchObject({ value: '52', total: '52' });
  });

  it('resets the lap half and keeps the ride half the moment a line is crossed', () => {
    const before = readings(
      { elapsedS: 1232, distanceM: 11_999, routePositionM: 11_999, ascentM: 199 },
      {
        lap: eccupLap({
          label: 'Loop',
          number: 1,
          startM: 0,
          elapsedS: 1232,
          distanceM: 11_999,
          ascentM: 199,
        }),
      },
    );
    const after = readings(
      { elapsedS: 1233, distanceM: 12_001, routePositionM: 1, ascentM: 200 },
      { lap: eccupLap({ elapsedS: 1, distanceM: 1, ascentM: 0 }) },
    );

    expect(before.elapsed).toMatchObject({ value: '20:32', total: '20:32' });
    expect(before.distance).toMatchObject({ value: '12.0', total: '12.0' });
    // The ride's halves carry on across the line; the lap's start again from nought.
    expect(after.elapsed).toMatchObject({ label: 'Lap 2', value: '0:01', total: '20:33' });
    expect(after.distance).toMatchObject({ value: '0.0', total: '12.0' });
    expect(after.climbed).toMatchObject({ value: '0', total: '200' });
  });
});

describe('rideReadings on a point-to-point route', () => {
  it('keeps Elapsed, distance of total and climbed of total, as before', () => {
    const view = readings({
      elapsedS: 1657,
      distanceM: 16_100,
      routePositionM: 16_100,
      routeTotalDistanceM: 38_200,
      ascentM: 212,
      routeTotalAscentM: 512,
    });

    expect(view.elapsed).toMatchObject({ label: 'Elapsed', value: '27:37' });
    expect(view.elapsed.total).toBeUndefined();
    expect(view.distance).toMatchObject({ value: '16.1', total: '38.2', unit: 'km' });
    expect(view.climbed).toMatchObject({ value: '212', total: '512', unit: 'm' });
  });
});
