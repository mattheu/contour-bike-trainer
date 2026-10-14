import { describe, expect, it } from 'vitest';
import { rideAtRisk, type GuardedRide } from './ride-guard';

const RIDE: GuardedRide = { state: 'running', sampleCount: 30, savedRideId: null };

describe('rideAtRisk', () => {
  it('guards a ride that is running with something recorded', () => {
    expect(rideAtRisk(RIDE)).toBe(true);
  });

  it('guards a paused ride, which is still only in memory', () => {
    expect(rideAtRisk({ ...RIDE, state: 'paused' })).toBe(true);
  });

  it('guards a finished ride whose save failed', () => {
    expect(rideAtRisk({ ...RIDE, state: 'finished' })).toBe(true);
  });

  it('leaves an armed ride alone', () => {
    expect(rideAtRisk({ ...RIDE, state: 'idle' })).toBe(false);
    expect(rideAtRisk({ state: 'idle', sampleCount: 0, savedRideId: null })).toBe(false);
  });

  it('leaves a ride that is in storage alone', () => {
    expect(rideAtRisk({ ...RIDE, savedRideId: 'ride-1' })).toBe(false);
    expect(rideAtRisk({ ...RIDE, state: 'finished', savedRideId: 'ride-1' })).toBe(false);
  });

  it('leaves a ride with nothing recorded alone', () => {
    // Started and reloaded before the first sample, and the discard path, which ends a
    // ride that recorded nothing and so never gets an id.
    expect(rideAtRisk({ ...RIDE, sampleCount: 0 })).toBe(false);
    expect(rideAtRisk({ state: 'finished', sampleCount: 0, savedRideId: null })).toBe(false);
  });
});
