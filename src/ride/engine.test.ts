import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BikeData, ConnectionState } from '../ble/types';
import { speedFromPower } from '../physics/speed';
import { TRAINER_MAX_GRADE_PERCENT } from '../route/grade';
import type { Route, RoutePoint } from '../route/types';
import type { RideSample } from '../storage/types';
import { createManualClock } from './clock';
import { expandWorkout } from '../workout/expand';
import { parseWorkout } from '../workout/parse';
import { startRun } from '../workout/runner';
import {
  DISCONNECT_GRACE_S,
  MAX_TICK_DT_S,
  RideEngine,
  type EngineSettings,
  type EngineWorkout,
} from './engine';
import { ManualTickSource } from './tick';
import type { EngineTrainer } from './types';
import { climbRoute, diamondLoopRoute, flatRoute } from '../../test/fixtures';

/** A trainer that records what it was told and lets a test push data at the engine. */
class TestTrainer implements EngineTrainer {
  private readonly dataCallbacks = new Set<(d: BikeData) => void>();
  private readonly stateCallbacks = new Set<(s: ConnectionState) => void>();
  readonly grades: number[] = [];
  readonly targets: number[] = [];
  rejectWrites = false;
  rejectTargetWrites = false;

  onData(cb: (d: BikeData) => void): () => void {
    this.dataCallbacks.add(cb);
    return () => this.dataCallbacks.delete(cb);
  }

  onStateChange(cb: (s: ConnectionState) => void): () => void {
    this.stateCallbacks.add(cb);
    return () => this.stateCallbacks.delete(cb);
  }

  async setGrade(percent: number): Promise<void> {
    if (this.rejectWrites) throw new Error('GATT operation failed');
    this.grades.push(percent);
  }

  async setTargetPower(watts: number): Promise<void> {
    if (this.rejectTargetWrites) throw new Error('GATT operation failed');
    this.targets.push(watts);
  }

  emit(d: Partial<BikeData>): void {
    const sample: BikeData = { receivedAt: 0, ...d };
    for (const cb of this.dataCallbacks) cb(sample);
  }

  setState(state: ConnectionState): void {
    for (const cb of this.stateCallbacks) cb(state);
  }
}

/** A route at one constant grade, built rather than parsed so a test can ask for a
 * gradient steeper than any trainer will accept. */
function constantGradeRoute(gradePercent: number, lengthM = 2000, spacingM = 100): Route {
  const points: RoutePoint[] = [];
  for (let d = 0; d <= lengthM; d += spacingM) {
    points.push({
      lat: 51.5 + d * 1e-5,
      lon: -1.5,
      eleM: 100 + (d * gradePercent) / 100,
      distM: d,
    });
  }
  return {
    points,
    totalDistanceM: lengthM,
    totalAscentM: Math.max(0, (lengthM * gradePercent) / 100),
  };
}

/** Continuously changing gradient: what stresses the control point write thresholds.
 * The wavelength sets the gradient amplitude — 12 m over 120 m is roughly +/-10 %. */
function wavyRoute(lengthM = 5000, wavelengthM = 120, spacingM = 50): Route {
  const points: RoutePoint[] = [];
  for (let d = 0; d <= lengthM; d += spacingM) {
    points.push({
      lat: 51.5 + d * 1e-5,
      lon: -1.5,
      eleM: 100 + 12 * Math.sin(d / wavelengthM),
      distM: d,
    });
  }
  return { points, totalDistanceM: lengthM, totalAscentM: 0 };
}

const RIDER = { riderMassKg: 75, bikeMassKg: 9, cda: 0.32, crr: 0.004 };

/** The YAML the rider would have written, so the engine is driven through the real parse. */
function run(yaml: string) {
  return startRun(expandWorkout(parseWorkout(yaml)));
}

function harness(
  route: Route | null,
  overrides: Partial<EngineSettings> = {},
  workout: EngineWorkout | null = null,
) {
  const clock = createManualClock(1_000);
  const ticks = new ManualTickSource();
  const trainer = new TestTrainer();
  const samples: RideSample[] = [];

  const engine = new RideEngine({
    trainer,
    clock,
    tickSource: ticks,
    route,
    settings: { trainerDifficulty: 50, gradeLookaheadM: 30, rider: RIDER, ...overrides },
    workout,
  });
  engine.onSample((s) => samples.push(s));

  const step = (seconds = 1): void => {
    clock.advance(seconds);
    ticks.tick();
  };

  return { engine, clock, trainer, samples, step };
}

describe('RideEngine', () => {
  describe('the tick', () => {
    it('advances distance by speed x dt from the power the trainer reported', () => {
      const { engine, trainer, step } = harness(flatRoute());
      trainer.emit({ powerW: 200, cadenceRpm: 88 });
      engine.start();

      for (let i = 0; i < 10; i += 1) step(1);

      const expectedM = speedFromPower(200, 0, RIDER) * 10;
      expect(engine.getSnapshot().distanceM).toBeCloseTo(expectedM, 6);
      // 200 W on the flat is 33-34 km/h; ten seconds of it is a bit over 90 m.
      expect(engine.getSnapshot().distanceM).toBeGreaterThan(90);
      expect(engine.getSnapshot().distanceM).toBeLessThan(95);
    });

    it('treats a missing power reading as zero rather than carrying on', () => {
      const { engine, step } = harness(flatRoute());
      engine.start();
      step(5);
      expect(engine.getSnapshot().distanceM).toBe(0);
      expect(engine.getSnapshot().powerW).toBeNull();
    });

    it('keeps the last reading when a packet omits a field', () => {
      const { engine, trainer, step } = harness(flatRoute());
      trainer.emit({ powerW: 210, cadenceRpm: 90 });
      engine.start();
      step(1);
      // Cadence absent from the next packet is a shorter packet, not a stopped rider.
      trainer.emit({ powerW: 215 });
      step(1);

      expect(engine.getSnapshot().powerW).toBe(215);
      expect(engine.getSnapshot().cadenceRpm).toBe(90);
    });

    it('accumulates ascent from the interpolated elevation', () => {
      const { engine, trainer, step } = harness(climbRoute());
      trainer.emit({ powerW: 250 });
      engine.start();
      for (let i = 0; i < 30; i += 1) step(1);

      const snapshot = engine.getSnapshot();
      // A constant 10 % climb: ascent is a tenth of the distance covered.
      expect(snapshot.ascentM).toBeCloseTo(snapshot.distanceM * 0.1, 3);
      expect(snapshot.eleM).toBeCloseTo(100 + snapshot.ascentM, 3);
    });

    it('drops the gap when a tick arrives after a long stall rather than teleporting', () => {
      const { engine, trainer, step } = harness(flatRoute());
      trainer.emit({ powerW: 200 });
      engine.start();

      step(60);

      expect(engine.getSnapshot().elapsedS).toBe(MAX_TICK_DT_S);
    });
  });

  describe('grade, difficulty and the control point (ADR-0008)', () => {
    it('gives the physics the real grade and the trainer the scaled one', () => {
      const route = constantGradeRoute(8);
      const { engine, trainer, step } = harness(route, { trainerDifficulty: 25 });
      trainer.emit({ powerW: 250 });
      engine.start();
      step(1);

      expect(engine.getSnapshot().gradePercent).toBeCloseTo(8, 6);
      expect(engine.getSnapshot().trainerGradePercent).toBeCloseTo(2, 6);
      expect(trainer.grades[0]).toBeCloseTo(2, 6);
    });

    it('covers identical distance at difficulty 0, 50 and 100', () => {
      // The guard ADR-0008 asks for. Feeding the scaled grade to speedFromPower makes
      // distance a function of a UI slider and nothing else fails.
      const distances = [0, 50, 100].map((difficulty) => {
        const { engine, trainer, step } = harness(constantGradeRoute(8), {
          trainerDifficulty: difficulty,
        });
        trainer.emit({ powerW: 250 });
        engine.start();
        for (let i = 0; i < 60; i += 1) step(1);
        return engine.getSnapshot().distanceM;
      });

      expect(distances[0]).toBeGreaterThan(0);
      expect(distances[1]).toBe(distances[0]);
      expect(distances[2]).toBe(distances[0]);
    });

    it('does not let the trainer ceiling reach the grade the physics sees', () => {
      // A 25 % wall: the hardware is clamped to 20 %, the rider still climbs a 25 %.
      const wall = constantGradeRoute(25);
      const { engine, trainer, step } = harness(wall, { trainerDifficulty: 100 });
      trainer.emit({ powerW: 300 });
      engine.start();
      step(1);

      expect(engine.getSnapshot().gradePercent).toBeCloseTo(25, 6);
      expect(trainer.grades[0]).toBe(TRAINER_MAX_GRADE_PERCENT);

      const clampedSpeed = speedFromPower(300, TRAINER_MAX_GRADE_PERCENT, RIDER);
      const realSpeed = speedFromPower(300, 25, RIDER);
      expect(engine.getSnapshot().speedKmh).toBeCloseTo(realSpeed * 3.6, 6);
      expect(engine.getSnapshot().speedKmh).toBeLessThan(clampedSpeed * 3.6);
    });

    it('writes once when the grade has not moved by 0.1 %', () => {
      const { engine, trainer, step } = harness(constantGradeRoute(10));
      trainer.emit({ powerW: 250 });
      engine.start();
      for (let i = 0; i < 30; i += 1) step(1);

      expect(trainer.grades).toEqual([5]);
    });

    it('writes at most once a second however fast the ticks arrive', () => {
      const { engine, trainer, step } = harness(wavyRoute(), { trainerDifficulty: 100 });
      trainer.emit({ powerW: 250 });
      engine.start();
      // Four ticks a second for twenty seconds: a notification-driven tick on a trainer
      // that talks faster than 1 Hz.
      for (let i = 0; i < 80; i += 1) step(0.25);

      expect(trainer.grades.length).toBeGreaterThan(5);
      expect(trainer.grades.length).toBeLessThanOrEqual(21);
    });

    it('follows the difficulty slider mid-ride', () => {
      const { engine, trainer, step } = harness(constantGradeRoute(10), { trainerDifficulty: 100 });
      trainer.emit({ powerW: 250 });
      engine.start();
      step(1);
      expect(trainer.grades).toEqual([10]);

      engine.setTrainerDifficulty(20);
      step(1);

      expect(trainer.grades[trainer.grades.length - 1]).toBeCloseTo(2, 6);
    });

    it('says so when the trainer refuses a write', async () => {
      const { engine, trainer } = harness(constantGradeRoute(6));
      trainer.rejectWrites = true;
      engine.start();
      await Promise.resolve();
      await Promise.resolve();

      expect(engine.getSnapshot().alert).toEqual({
        level: 'warning',
        message: 'Trainer is not accepting gradient changes',
      });
    });
  });

  describe('the state machine', () => {
    it('runs idle to running to paused to running', () => {
      const { engine, trainer, step } = harness(flatRoute());
      expect(engine.getSnapshot().state).toBe('idle');

      trainer.emit({ powerW: 200 });
      engine.start();
      expect(engine.getSnapshot().state).toBe('running');

      step(1);
      const atPause = engine.getSnapshot().distanceM;
      engine.pause();
      expect(engine.getSnapshot().state).toBe('paused');

      step(5);
      expect(engine.getSnapshot().distanceM).toBe(atPause);
      expect(engine.getSnapshot().elapsedS).toBe(1);
      expect(engine.getSnapshot().pausedS).toBe(5);

      engine.resume();
      expect(engine.getSnapshot().state).toBe('running');
      step(1);
      // Resuming carries on from the same distance, not from where a running clock
      // would have put it.
      expect(engine.getSnapshot().distanceM).toBeGreaterThan(atPause);
      expect(engine.getSnapshot().elapsedS).toBe(2);
      expect(engine.getSnapshot().pausedS).toBe(5);
    });

    it('ignores start, pause and resume that do not apply', () => {
      const { engine, step } = harness(flatRoute());
      engine.pause();
      engine.resume();
      expect(engine.getSnapshot().state).toBe('idle');

      engine.start();
      engine.start();
      step(1);
      expect(engine.getSnapshot().elapsedS).toBe(1);
    });

    it('ends on demand, short of the route end', () => {
      const { engine, trainer, step } = harness(flatRoute());
      trainer.emit({ powerW: 200 });
      engine.start();
      step(3);
      engine.end();

      expect(engine.getSnapshot().state).toBe('finished');
      expect(engine.getSnapshot().distanceM).toBeLessThan(flatRoute().totalDistanceM);
    });

    it('finishes at the route end and stops moving', () => {
      const route = flatRoute();
      const { engine, trainer, samples, step } = harness(route);
      trainer.emit({ powerW: 300 });
      engine.start();
      for (let i = 0; i < 200; i += 1) step(1);

      const snapshot = engine.getSnapshot();
      expect(snapshot.state).toBe('finished');
      expect(snapshot.distanceM).toBe(route.totalDistanceM);

      const last = samples[samples.length - 1] as RideSample;
      // The last trackpoint sits on the finish line, not at the second before it.
      expect(last.distanceM).toBe(route.totalDistanceM);
      expect(last.t).toBeGreaterThan(0);

      const elapsedAtFinish = snapshot.elapsedS;
      step(10);
      expect(engine.getSnapshot().elapsedS).toBe(elapsedAtFinish);
    });
  });

  /**
   * SPEC.md > A loop can be ridden round again. Everything here is about one thing:
   * distance ridden and position on the route stop being the same number.
   */
  describe('a route that comes back to where it started', () => {
    /** Rides until the predicate holds, with a cap so a failure is a failed assertion
     * rather than a hung suite. The diamond fixture is 17 km, so a lap is ~1600 ticks. */
    function rideUntil(step: (s?: number) => void, done: () => boolean, maxTicks = 4000): void {
      for (let i = 0; i < maxTicks && !done(); i += 1) step(1);
    }

    it('rolls through the start line onto the next lap instead of finishing', () => {
      const route = diamondLoopRoute();
      const { engine, trainer, step } = harness(route);
      trainer.emit({ powerW: 300 });
      engine.start();
      rideUntil(step, () => engine.getSnapshot().distanceM > route.totalDistanceM + 500);

      const snapshot = engine.getSnapshot();
      expect(snapshot.state).toBe('running');
      // Distance ridden kept accumulating; position on the route went back to the start.
      expect(snapshot.distanceM).toBeGreaterThan(route.totalDistanceM);
      expect(snapshot.routePositionM).toBeCloseTo(snapshot.distanceM - route.totalDistanceM, 6);
      expect(snapshot.routePositionM).toBeLessThan(route.totalDistanceM);
    });

    it('puts the rider back near the start of the route on the second lap', () => {
      const route = diamondLoopRoute();
      const { engine, trainer, samples, step } = harness(route);
      trainer.emit({ powerW: 300 });
      engine.start();
      // The first sample is on the start line; ride round to roughly the same place again.
      const first = samples[0] as RideSample;
      rideUntil(step, () => engine.getSnapshot().distanceM > route.totalDistanceM + 50);

      const snapshot = engine.getSnapshot();
      // Within a tick's travel of where the ride began: the coordinates repeat, which is
      // exactly what a lapped ride looks like on a map and in the exported track.
      expect(snapshot.lat).toBeCloseTo(first.lat ?? 0, 2);
      expect(snapshot.lon).toBeCloseTo(first.lon ?? 0, 2);

      // The samples still carry distance ridden, not position: the export is unchanged.
      const last = samples[samples.length - 1] as RideSample;
      expect(last.distanceM).toBeGreaterThan(route.totalDistanceM);
    });

    it('ends only when the rider ends it', () => {
      const route = diamondLoopRoute();
      const { engine, trainer, step } = harness(route);
      trainer.emit({ powerW: 300 });
      engine.start();
      rideUntil(step, () => engine.getSnapshot().distanceM > route.totalDistanceM + 500);

      // Several laps in and still going: only end() stops it.
      expect(engine.getSnapshot().state).toBe('running');
      engine.end();
      expect(engine.getSnapshot().state).toBe('finished');
    });

    it('leaves a point-to-point route finishing exactly as it did', () => {
      const route = flatRoute();
      const { engine, trainer, step } = harness(route);
      trainer.emit({ powerW: 300 });
      engine.start();
      for (let i = 0; i < 200; i += 1) step(1);

      const snapshot = engine.getSnapshot();
      expect(snapshot.state).toBe('finished');
      expect(snapshot.distanceM).toBe(route.totalDistanceM);
      // Position and distance are the same number where the route does not lap.
      expect(snapshot.routePositionM).toBe(snapshot.distanceM);
    });
  });

  describe('samples', () => {
    it('emits at 1 Hz starting at t = 0', () => {
      const { engine, trainer, samples, step } = harness(flatRoute());
      trainer.emit({ powerW: 200, cadenceRpm: 88 });
      engine.setHeartRateBpm(148);
      engine.start();
      for (let i = 0; i < 10; i += 1) step(1);

      expect(samples.map((s) => s.t)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(samples[5]).toMatchObject({ powerW: 200, cadenceRpm: 88, heartRateBpm: 148 });
      expect(samples[5]?.lat).toBeCloseTo(51.5, 3);
    });

    it('emits one sample a second however often it ticks', () => {
      const { engine, trainer, samples, step } = harness(flatRoute());
      trainer.emit({ powerW: 200 });
      engine.start();
      for (let i = 0; i < 40; i += 1) step(0.25);

      expect(samples.map((s) => s.t)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });

    it('does not sample while paused', () => {
      const { engine, trainer, samples, step } = harness(flatRoute());
      trainer.emit({ powerW: 200 });
      engine.start();
      step(1);
      engine.pause();
      for (let i = 0; i < 10; i += 1) step(1);

      expect(samples.map((s) => s.t)).toEqual([0, 1]);
    });
  });

  describe('disconnects', () => {
    function disconnected() {
      const h = harness(flatRoute());
      h.trainer.setState('connected');
      h.trainer.emit({ powerW: 200 });
      h.engine.start();
      h.step(1);
      h.trainer.setState('reconnecting');
      return h;
    }

    it('keeps riding on the last known power, as a warning', () => {
      const { engine, step } = disconnected();
      const before = engine.getSnapshot().distanceM;

      expect(engine.getSnapshot().alert?.level).toBe('warning');
      for (let i = 0; i < DISCONNECT_GRACE_S - 1; i += 1) step(1);

      expect(engine.getSnapshot().state).toBe('running');
      expect(engine.getSnapshot().distanceM).toBeGreaterThan(before);
      expect(engine.getSnapshot().alert?.level).toBe('warning');
    });

    it('escalates to a fault and pauses after the grace period', () => {
      const { engine, step } = disconnected();
      for (let i = 0; i < DISCONNECT_GRACE_S; i += 1) step(1);

      expect(engine.getSnapshot().state).toBe('paused');
      expect(engine.getSnapshot().alert).toEqual({
        level: 'fault',
        message: 'Trainer disconnected — ride paused',
      });
    });

    it('clears the fault and re-asserts the grade on reconnect', () => {
      const { engine, trainer, step } = disconnected();
      for (let i = 0; i < DISCONNECT_GRACE_S; i += 1) step(1);
      const writesBefore = trainer.grades.length;

      trainer.setState('connected');
      expect(engine.getSnapshot().alert).toEqual({
        level: 'info',
        message: 'Trainer reconnected',
      });

      engine.resume();
      step(1);
      // The trainer dropped whatever grade it was holding, so it is rewritten even
      // though the value has not moved.
      expect(trainer.grades.length).toBe(writesBefore + 1);
    });

    it('clears a fault when it is dismissed', () => {
      const { engine, step } = disconnected();
      for (let i = 0; i < DISCONNECT_GRACE_S; i += 1) step(1);
      expect(engine.getSnapshot().alert?.level).toBe('fault');

      engine.dismissAlert();
      expect(engine.getSnapshot().alert).toBeNull();
    });
  });

  describe('subscription', () => {
    it('publishes a frozen snapshot whose identity changes on every tick', () => {
      const { engine, trainer, step } = harness(flatRoute());
      const listener = vi.fn();
      engine.subscribe(listener);
      trainer.emit({ powerW: 200 });
      engine.start();
      const first = engine.getSnapshot();

      step(1);

      expect(listener).toHaveBeenCalled();
      expect(Object.isFrozen(engine.getSnapshot())).toBe(true);
      expect(engine.getSnapshot()).not.toBe(first);
    });

    it('stops listening to the trainer and the ticks once disposed', () => {
      const clock = createManualClock();
      const ticks = new ManualTickSource();
      const trainer = new TestTrainer();
      const engine = new RideEngine({
        trainer,
        clock,
        tickSource: ticks,
        route: flatRoute(),
        settings: { trainerDifficulty: 50, gradeLookaheadM: 30, rider: RIDER },
      });

      expect(ticks.listenerCount).toBe(1);
      engine.dispose();
      expect(ticks.listenerCount).toBe(0);
    });
  });

  describe('a whole ride', () => {
    let elapsedMs = 0;

    beforeEach(() => {
      elapsedMs = 0;
    });

    it('runs forty minutes of 1 Hz ticks in milliseconds', () => {
      const route = wavyRoute(40_000, 400);
      const { engine, trainer, samples, step } = harness(route, { trainerDifficulty: 60 });
      trainer.emit({ powerW: 220, cadenceRpm: 86 });
      engine.setHeartRateBpm(150);
      engine.start();

      const startedAt = performance.now();
      for (let i = 0; i < 2400; i += 1) step(1);
      elapsedMs = performance.now() - startedAt;

      expect(engine.getSnapshot().elapsedS).toBe(2400);
      expect(samples).toHaveLength(2401);
      expect(engine.getSnapshot().distanceM).toBeGreaterThan(18_000);
      // The property the spec asks for: forty minutes of riding, no real time spent.
      expect(elapsedMs).toBeLessThan(2000);
    });
  });
});

describe('RideEngine with no route', () => {
  it('covers ground from the physics at zero grade', () => {
    const { engine, trainer, step } = harness(null);
    trainer.emit({ powerW: 200, cadenceRpm: 88 });
    engine.start();

    for (let i = 0; i < 10; i += 1) step(1);

    // The same figure the route path produces on the flat: a workout indoors still
    // covers the distance Strava expects rather than describing a ride that went nowhere.
    const expectedM = speedFromPower(200, 0, RIDER) * 10;
    expect(engine.getSnapshot().distanceM).toBeCloseTo(expectedM, 6);
    expect(engine.getSnapshot().speedKmh).toBeCloseTo(speedFromPower(200, 0, RIDER) * 3.6, 6);
  });

  it('holds the gradient at zero and climbs nothing', () => {
    const { engine, trainer, step } = harness(null, { trainerDifficulty: 100 });
    trainer.emit({ powerW: 250 });
    engine.start();
    for (let i = 0; i < 60; i += 1) step(1);

    expect(engine.getSnapshot().gradePercent).toBe(0);
    expect(engine.getSnapshot().ascentM).toBe(0);
    expect(engine.routeTotalDistanceM).toBeNull();
  });

  it('writes nothing to the simulation parameters, whatever the difficulty does', () => {
    const { engine, trainer, step } = harness(null, { trainerDifficulty: 100 });
    trainer.setState('connected');
    trainer.emit({ powerW: 250 });
    engine.start();
    for (let i = 0; i < 30; i += 1) step(1);

    // The slider and a reconnect are the two things that force a re-write on a route.
    engine.setTrainerDifficulty(20);
    trainer.setState('reconnecting');
    trainer.setState('connected');
    for (let i = 0; i < 10; i += 1) step(1);

    expect(trainer.grades).toEqual([]);
    expect(engine.getSnapshot().trainerGradePercent).toBe(0);
    expect(engine.getSnapshot().alert).not.toMatchObject({ level: 'warning' });
  });

  it('samples carry no position or elevation', () => {
    const { engine, trainer, samples, step } = harness(null);
    trainer.emit({ powerW: 200, cadenceRpm: 88 });
    engine.setHeartRateBpm(148);
    engine.start();
    for (let i = 0; i < 5; i += 1) step(1);

    expect(samples.map((s) => s.t)).toEqual([0, 1, 2, 3, 4, 5]);
    for (const sample of samples) {
      // Absent, not zero: tcx.ts omits a null position rather than claiming the equator.
      expect(sample.lat).toBeNull();
      expect(sample.lon).toBeNull();
      expect(sample.eleM).toBeNull();
    }
    expect(samples[3]).toMatchObject({ powerW: 200, cadenceRpm: 88, heartRateBpm: 148 });
    expect(samples[3]?.distanceM).toBeGreaterThan(0);

    const snapshot = engine.getSnapshot();
    expect(snapshot.lat).toBeNull();
    expect(snapshot.lon).toBeNull();
    expect(snapshot.eleM).toBeNull();
  });

  it('runs until the rider ends it, with no finish line to reach', () => {
    const { engine, trainer, samples, step } = harness(null);
    trainer.emit({ powerW: 300 });
    engine.start();
    // Far past the length of any bundled route: there is nothing here to run out.
    for (let i = 0; i < 2400; i += 1) step(1);

    expect(engine.getSnapshot().state).toBe('running');
    expect(engine.getSnapshot().distanceM).toBeGreaterThan(25_000);

    engine.end();
    expect(engine.getSnapshot().state).toBe('finished');
    expect(samples[samples.length - 1]?.t).toBe(2400);
  });

  it('runs forty minutes of 1 Hz ticks in milliseconds', () => {
    const { engine, trainer, samples, step } = harness(null);
    trainer.emit({ powerW: 220, cadenceRpm: 86 });
    engine.setHeartRateBpm(150);
    engine.start();

    const startedAt = performance.now();
    for (let i = 0; i < 2400; i += 1) step(1);
    const elapsedMs = performance.now() - startedAt;

    expect(engine.getSnapshot().elapsedS).toBe(2400);
    expect(samples).toHaveLength(2401);
    expect(elapsedMs).toBeLessThan(2000);
  });
});

describe('RideEngine > elapsedSNow', () => {
  it('extrapolates past the last tick so a display clock does not stutter', () => {
    const { engine, clock, trainer, step } = harness(flatRoute());
    trainer.setState('connected');
    engine.start();
    step(1);

    // Ticks arrive at the trainer's cadence, not the wall clock's. Between them the
    // accumulated value is stale, which is what made the rendered clock advance in
    // ragged steps slightly longer than a second.
    expect(engine.elapsedSNow()).toBeCloseTo(1, 3);
    clock.advance(0.4);
    expect(engine.elapsedSNow()).toBeCloseTo(1.4, 3);
  });

  it('does not drift while paused', () => {
    const { engine, clock, trainer, step } = harness(flatRoute());
    trainer.setState('connected');
    engine.start();
    step(1);
    engine.pause();

    const atPause = engine.elapsedSNow();
    clock.advance(30);
    // A display clock that kept counting through a pause would be worse than a stuttering
    // one: it would disagree with the time actually recorded.
    expect(engine.elapsedSNow()).toBe(atPause);
  });

  it('clamps the extrapolation so a throttled tab cannot leap', () => {
    const { engine, clock, trainer, step } = harness(flatRoute());
    trainer.setState('connected');
    engine.start();
    step(1);

    clock.advance(600);
    expect(engine.elapsedSNow()).toBeCloseTo(1 + MAX_TICK_DT_S, 3);
  });
});

describe('RideEngine riding a workout', () => {
  const STEPS = `
name: Test session
steps:
  - { duration: 10s, power: 200W, name: Effort }
  - { duration: 10s, power: free }
  - { duration: 10s, power: 100W }
`;

  function workout(yaml = STEPS, ftp = 250, scalePct?: number): EngineWorkout {
    return { name: 'Test session', run: run(yaml), ftp, ...(scalePct ? { scalePct } : {}) };
  }

  it('writes target power rather than a gradient while a step has a target', () => {
    const { engine, trainer, step } = harness(null, {}, workout());
    trainer.emit({ powerW: 150 });
    engine.start();
    for (let i = 0; i < 5; i += 1) step(1);

    // Sending the target is the mode switch: there is no separate ERG command.
    expect(trainer.targets).toEqual([200]);
    expect(trainer.grades).toEqual([]);
    expect(engine.getSnapshot().workout?.ergEngaged).toBe(true);
    expect(engine.getSnapshot().workout?.targetW).toBe(200);
  });

  it('sends simulation parameters on a free step, which releases ERG', () => {
    const { engine, trainer, step } = harness(null, {}, workout());
    trainer.emit({ powerW: 150 });
    engine.start();
    for (let i = 0; i < 15; i += 1) step(1);

    // Flat, because there is no route under this ride to take a gradient from.
    expect(trainer.grades).toEqual([0]);
    expect(engine.getSnapshot().workout?.ergEngaged).toBe(false);
    expect(engine.getSnapshot().workout?.targetW).toBeNull();

    // ...and the next targeted step takes the trainer back into ERG.
    for (let i = 0; i < 10; i += 1) step(1);
    expect(trainer.targets).toEqual([200, 100]);
  });

  it('takes the route gradient on a free step when there is a route under it', () => {
    const route = constantGradeRoute(5, 20_000);
    const { engine, trainer, step } = harness(route, { trainerDifficulty: 100 }, workout());
    trainer.emit({ powerW: 250 });
    engine.start();
    for (let i = 0; i < 15; i += 1) step(1);

    expect(trainer.grades[trainer.grades.length - 1]).toBeCloseTo(5, 1);
  });

  it('does not rewrite a target that has not moved', () => {
    const { engine, trainer, step } = harness(null, {}, workout());
    trainer.emit({ powerW: 150 });
    engine.start();
    for (let i = 0; i < 9; i += 1) step(1);

    expect(trainer.targets).toEqual([200]);
  });

  it('follows a ramp at no more than one write a second', () => {
    const ramp = 'name: Ramp\nsteps:\n  - { duration: 10s, ramp: [100W, 200W] }\n';
    const { engine, trainer, step } = harness(null, {}, workout(ramp));
    trainer.emit({ powerW: 150 });
    engine.start();
    for (let i = 0; i < 9; i += 1) step(1);

    expect(trainer.targets.length).toBeLessThanOrEqual(10);
    expect(trainer.targets[0]).toBe(100);
    for (let i = 1; i < trainer.targets.length; i += 1) {
      expect(trainer.targets[i]).toBeGreaterThan(trainer.targets[i - 1] as number);
    }
  });

  it('scales every target by the workout difficulty', () => {
    const percent = 'name: Steady\nftp: 200\nsteps:\n  - { duration: 1m, power: 50% }\n';
    const { engine, trainer, step } = harness(
      null,
      {},
      { ...workout(percent, 200), scalePct: 150 },
    );
    trainer.emit({ powerW: 150 });
    engine.start();
    step(1);

    expect(trainer.targets).toEqual([150]);
    expect(engine.getSnapshot().workout?.scalePct).toBe(150);

    // The control is reached for mid-interval, so the target follows the press.
    engine.setWorkoutScalePct(50);
    step(1);
    expect(trainer.targets).toEqual([150, 50]);
    expect(engine.getSnapshot().workout?.scalePct).toBe(50);
  });

  /**
   * The screen zones and scales everything it draws against this: a workout with its own
   * `ftp:` is ridden at it, so the FTP the targets came from has to travel with them
   * rather than be looked up again from the rider's profile.
   */
  it('publishes the FTP the session is being ridden at', () => {
    const { engine } = harness(null, {}, workout(STEPS, 250));
    expect(engine.getSnapshot().workout?.ftpW).toBe(250);
  });

  it('clamps the difficulty to the ends the control allows', () => {
    const { engine } = harness(null, {}, workout());
    engine.setWorkoutScalePct(400);
    expect(engine.getSnapshot().workout?.scalePct).toBe(150);
    engine.setWorkoutScalePct(0);
    expect(engine.getSnapshot().workout?.scalePct).toBe(50);
  });

  it('truncates the skipped step to what was ridden and shortens the session', () => {
    const { engine, trainer, step } = harness(null, {}, workout());
    trainer.emit({ powerW: 150 });
    engine.start();
    for (let i = 0; i < 4; i += 1) step(1);

    expect(engine.getSnapshot().workout?.totalRemainingS).toBeCloseTo(26, 6);
    engine.skipStep();

    const after = engine.getSnapshot().workout;
    // Six seconds were never ridden, so they are not waiting at the end either.
    expect(after?.totalRemainingS).toBeCloseTo(20, 6);
    expect(after?.stepIndex).toBe(1);
    expect(after?.stepCount).toBe(3);
    expect(after?.ergEngaged).toBe(false);
  });

  it('finishes the workout when the last step is skipped', () => {
    const { engine, trainer, step } = harness(null, {}, workout());
    trainer.emit({ powerW: 150 });
    engine.start();
    for (let i = 0; i < 21; i += 1) step(1);

    engine.skipStep();
    step(1);

    expect(engine.getSnapshot().state).toBe('finished');
  });

  it('finishes when the plan runs out, as a route does at its end', () => {
    const { engine, trainer, samples, step } = harness(null, {}, workout());
    trainer.emit({ powerW: 150 });
    engine.start();
    for (let i = 0; i < 40; i += 1) step(1);

    const snapshot = engine.getSnapshot();
    expect(snapshot.state).toBe('finished');
    expect(snapshot.elapsedS).toBeCloseTo(30, 6);
    expect(samples[samples.length - 1]?.t).toBeCloseTo(30, 6);
  });

  it('names the step and the one after it', () => {
    const { engine, trainer, step } = harness(null, {}, workout());
    trainer.emit({ powerW: 150 });
    engine.start();
    step(1);

    const snapshot = engine.getSnapshot().workout;
    expect(snapshot?.name).toBe('Test session');
    expect(snapshot?.stepName).toBe('Effort');
    expect(snapshot?.stepIndex).toBe(0);
    expect(snapshot?.stepRemainingS).toBeCloseTo(9, 6);
    expect(snapshot?.next?.power).toEqual({ kind: 'free' });
  });

  it('carries the whole expanded plan, by one identity for the life of the run', () => {
    const { engine, trainer, step } = harness(null, {}, workout());
    trainer.emit({ powerW: 150 });
    engine.start();

    const plan = engine.getSnapshot().workout?.steps;
    expect(plan).toHaveLength(3);
    expect(plan?.map((s) => s.durationS)).toEqual([10, 10, 10]);

    for (let i = 0; i < 5; i += 1) step(1);
    // Static under a clock: a new array every tick would re-render the panel for nothing.
    expect(engine.getSnapshot().workout?.steps).toBe(plan);

    engine.skipStep();
    const skipped = engine.getSnapshot().workout?.steps;
    // ...and a skip is a real change to the plan, so the panel does see a new one.
    expect(skipped).not.toBe(plan);
    expect(skipped?.[0]?.durationS).toBe(5);
    expect(plan?.[0]?.durationS).toBe(10);
  });

  it("shows the current step's cadence band, a single value as equal ends", () => {
    const cadences = `
name: Cadence
steps:
  - { duration: 10s, power: 200W, cadence: 90 }
  - { duration: 10s, power: 200W, cadence: [85, 95] }
  - { duration: 10s, power: 200W }
`;
    const { engine, trainer, step } = harness(null, {}, workout(cadences));
    trainer.emit({ powerW: 150 });
    engine.start();
    step(1);
    expect(engine.getSnapshot().workout?.cadence).toEqual({ minRpm: 90, maxRpm: 90 });

    for (let i = 0; i < 10; i += 1) step(1);
    expect(engine.getSnapshot().workout?.cadence).toEqual({ minRpm: 85, maxRpm: 95 });

    for (let i = 0; i < 10; i += 1) step(1);
    // Absent, not a guessed band: the trainer holds power and the legs choose the gear.
    expect(engine.getSnapshot().workout?.cadence).toBeNull();
  });

  it('says nothing about a workout on a ride that has none', () => {
    const { engine } = harness(flatRoute());
    expect(engine.getSnapshot().workout).toBeNull();
    // Skipping and scaling are no-ops rather than errors: the controls are simply absent.
    engine.skipStep();
    engine.setWorkoutScalePct(80);
    expect(engine.getSnapshot().workout).toBeNull();
  });

  it('says so when the trainer refuses a target', async () => {
    const { engine, trainer } = harness(null, {}, workout());
    trainer.rejectTargetWrites = true;
    engine.start();
    await Promise.resolve();
    await Promise.resolve();

    expect(engine.getSnapshot().alert).toEqual({
      level: 'warning',
      message: 'Trainer is not accepting power targets',
    });
  });

  /**
   * ADR-0008, in the one place it is easiest to break: the workout changes what the rider
   * is asked to do, never how fast the app thinks they went. Speed comes from the power
   * the trainer reported and the real grade, so two scales must cover the same ground.
   */
  it('covers identical distance whatever the difficulty is set to', () => {
    const ride = (scalePct: number) => {
      const percent = 'name: Steady\nftp: 250\nsteps:\n  - { duration: 2m, power: 90% }\n';
      const { engine, trainer, step } = harness(null, {}, workout(percent, 250, scalePct));
      trainer.emit({ powerW: 220 });
      engine.start();
      for (let i = 0; i < 100; i += 1) step(1);
      return engine.getSnapshot();
    };

    const easy = ride(50);
    const hard = ride(150);

    expect(hard.distanceM).toBe(easy.distanceM);
    expect(hard.speedKmh).toBe(easy.speedKmh);
    // ...and the targets really did differ, so the test is not passing by doing nothing.
    expect(hard.workout?.targetW).toBe(338);
    expect(easy.workout?.targetW).toBe(113);
  });

  /**
   * SPEC.md > ERG is optional. ERG off is the free step's path extended over the whole
   * session, so what proves it is what reached the trainer: simulation parameters, and no
   * target, whatever the plan asks for.
   */
  describe('with ERG off', () => {
    it('is ERG by default, which is what the app did before the control existed', () => {
      const { engine } = harness(null, {}, workout());
      expect(engine.getSnapshot().workout?.ergMode).toBe('erg');
    });

    it('sends no target power for the whole session, free step or not', () => {
      const { engine, trainer, step } = harness(null, {}, { ...workout(), ergMode: 'manual' });
      trainer.emit({ powerW: 150 });
      engine.start();
      // Past the first targeted step, through the free block and into the second target.
      for (let i = 0; i < 25; i += 1) step(1);

      expect(trainer.targets).toEqual([]);
      // Flat, and written once: the road a routeless session simulates.
      expect(trainer.grades).toEqual([0]);
      expect(engine.getSnapshot().workout?.ergEngaged).toBe(false);
      // The target is still there to be shown and ridden at. Only who holds it changed.
      expect(engine.getSnapshot().workout?.targetW).toBe(100);
    });

    it('releases the trainer the moment it is switched off, mid-step', () => {
      const { engine, trainer, step } = harness(null, {}, workout());
      trainer.emit({ powerW: 150 });
      engine.start();
      step(1);
      expect(trainer.targets).toEqual([200]);

      engine.setErgMode('manual');

      // No further tick: the switch is a statement about how the rider wants to ride now,
      // and a trainer still holding 200 W for the rest of the block would contradict it.
      expect(trainer.grades).toEqual([0]);
      expect(engine.getSnapshot().workout?.ergMode).toBe('manual');
      expect(engine.getSnapshot().workout?.ergEngaged).toBe(false);
      expect(engine.getSnapshot().workout?.targetW).toBe(200);
    });

    it('holds the target again the moment it is switched back on, mid-step', () => {
      const { engine, trainer, step } = harness(null, {}, workout());
      trainer.emit({ powerW: 150 });
      engine.start();
      step(1);
      engine.setErgMode('manual');
      step(1);
      engine.setErgMode('erg');

      // The throttle compares the last value of one command, and the mode changes which
      // command is sent — so the same 200 W has to go down the wire again.
      expect(trainer.targets).toEqual([200, 200]);
      expect(engine.getSnapshot().workout?.ergEngaged).toBe(true);
    });

    it('leaves trainer difficulty inert rather than turning it into the resistance', () => {
      const { engine, trainer, step } = harness(
        null,
        { trainerDifficulty: 100 },
        { ...workout(), ergMode: 'manual' },
      );
      trainer.emit({ powerW: 150 });
      engine.start();
      for (let i = 0; i < 5; i += 1) step(1);

      engine.setTrainerDifficulty(0);
      step(1);
      engine.setTrainerDifficulty(100);
      step(1);

      // ADR-0008: the slider scales a route gradient, and this session has no route. Every
      // write is still the flat road, so the slider cannot change how fast the rider moves.
      expect([...new Set(trainer.grades)]).toEqual([0]);
      expect(trainer.targets).toEqual([]);
    });

    it('ignores the mode on a ride with no workout, which holds no target anyway', () => {
      const { engine, trainer, step } = harness(flatRoute());
      trainer.emit({ powerW: 200 });
      engine.start();
      step(1);
      engine.setErgMode('manual');

      expect(engine.getSnapshot().workout).toBeNull();
      expect(trainer.targets).toEqual([]);
    });
  });
});
