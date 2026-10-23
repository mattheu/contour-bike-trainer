import { describe, expect, it } from 'vitest';
import { INITIAL_SNAPSHOT, type RideSnapshot } from '../store';
import { rideReadings, type RideReadingsInput } from './ride-readings';

function readings(snapshot: Partial<RideSnapshot>, input: Partial<RideReadingsInput> = {}) {
  return rideReadings({
    snapshot: { ...INITIAL_SNAPSHOT, ...snapshot },
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
