import type { BikeData, ConnectionState } from '../ble/types';
import { speedFromPower, type RiderParameters } from '../physics/speed';
import { gradeAt, trainerGrade } from '../route/grade';
import { positionAt } from '../route/position';
import type { Route } from '../route/types';
import type { RideSample } from '../storage/types';
import type { ExpandedStep } from '../workout/expand';
import type { CadenceTarget } from '../workout/types';
import {
  clampScalePct,
  DEFAULT_SCALE_PCT,
  skipStep as skipRunStep,
  stateAt,
  type RunnerState,
  type WorkoutRun,
} from '../workout/runner';
import type { AlertState, Clock, EngineTrainer, RideState, TickSource } from './types';

/**
 * SPEC.md > Bluetooth details: at most one control point write a second. One budget for
 * both commands, because there is one control point: a target power and a set of
 * simulation parameters are two writes down the same characteristic.
 */
export const CONTROL_WRITE_INTERVAL_MS = 1000;

/** ...and only when the value has actually moved. Trainers respond badly to spam. */
export const GRADE_EPSILON_PERCENT = 0.1;

/** SPEC.md: keep riding on the last known power for this long, then pause. */
export const DISCONNECT_GRACE_S = 10;

/**
 * A tick that arrives after a long gap — a throttled hidden tab, a laptop lid — must not
 * teleport the rider. Riding the gap on stale power is a worse lie than dropping it.
 */
export const MAX_TICK_DT_S = 5;

const SAMPLE_INTERVAL_S = 1;

export interface EngineSettings {
  /** 0-100. Scales only what is written to the trainer. See ADR-0008. */
  trainerDifficulty: number;
  rider: RiderParameters;
  gradeLookaheadM: number;
}

/**
 * The workout this ride is riding, resolved: the engine is handed a run and an FTP
 * rather than a parsed file, so nothing here has to know about percentages or fallbacks.
 */
export interface EngineWorkout {
  name: string;
  /**
   * The run rather than the workout, because a skip truncates the step that was ridden.
   * The parsed workout is never mutated; the engine replaces this with a new run.
   */
  run: WorkoutRun;
  /** Already resolved against the rider profile by the caller. Must be greater than zero. */
  ftp: number;
  /** 50-150, clamped. Defaults to 100 — the only honest starting point. */
  scalePct?: number;
}

export interface RideEngineOptions {
  trainer: EngineTrainer;
  clock: Clock;
  tickSource: TickSource;
  /**
   * null for a workout ridden without a course: flat throughout, no position on the
   * samples, and no end to reach. A permanent mode, not a phase 3 simplification.
   */
  route: Route | null;
  settings: EngineSettings;
  /**
   * The workout being ridden, or nothing for a free ride. A workout with no route is the
   * ordinary case; laying one over a route works here already, and phase 4 calls it.
   */
  workout?: EngineWorkout | null;
}

/**
 * The runner's state as of this tick, which is what the workout screen is drawn from.
 * Seconds carry their fraction: the UI rounds them, exactly as it floors elapsedS.
 */
export interface EngineWorkoutSnapshot {
  name: string;
  /**
   * The whole expanded workout, which is what the Steps panel lists. The same array for
   * the life of the run — it is static, so a new identity every tick would re-render the
   * panel for nothing — and a new one after a skip, which is a real change to the plan.
   *
   * The run's own steps, not a second expansion: the panel and the runner read one list,
   * so they cannot disagree about what step 4 of 8 is.
   */
  steps: readonly ExpandedStep[];
  /** 0-based into the expanded steps, and stepCount once the run is over. */
  stepIndex: number;
  stepCount: number;
  stepName: string | null;
  /** null on a free step, which has no target to hold. */
  targetW: number | null;
  /**
   * The current step's cadence band, shown to the rider and never written to the
   * trainer. A single value in the file has both ends equal, so there is one shape here
   * rather than two.
   */
  cadence: CadenceTarget | null;
  stepRemainingS: number;
  totalRemainingS: number;
  /** The step after this one, for the panel's next line. Null on the last step. */
  next: ExpandedStep | null;
  /** False on a free step: simulation parameters went to the trainer instead. */
  ergEngaged: boolean;
  scalePct: number;
  finished: boolean;
}

export interface EngineSnapshot {
  state: RideState;
  /**
   * True when the ride reached its own end — the route ran out, or the workout did.
   * Never true for a free ride with no route: there is nothing to reach.
   */
  finished: boolean;
  elapsedS: number;
  pausedS: number;
  distanceM: number;
  ascentM: number;
  /** The REAL route grade, or zero with no route. Never the value written to the trainer. */
  gradePercent: number;
  /** What was last written to the control point: scaled by difficulty, hardware-clamped. */
  trainerGradePercent: number;
  speedKmh: number;
  powerW: number | null;
  cadenceRpm: number | null;
  heartRateBpm: number | null;
  lat: number | null;
  lon: number | null;
  eleM: number | null;
  alert: AlertState | null;
  /** Null for a ride with no workout. */
  workout: EngineWorkoutSnapshot | null;
}

const DISCONNECT_WARNING: AlertState = {
  level: 'warning',
  message: 'Trainer disconnected — riding on the last known power',
};

const DISCONNECT_FAULT: AlertState = {
  level: 'fault',
  message: 'Trainer disconnected — ride paused',
};

/** What a sample and a snapshot carry where there is no course to place them on. */
const NO_POSITION = Object.freeze({ lat: null, lon: null, eleM: null });

const RECONNECTED_INFO: AlertState = { level: 'info', message: 'Trainer reconnected' };

const WRITE_FAILED_WARNING: AlertState = {
  level: 'warning',
  message: 'Trainer is not accepting gradient changes',
};

const TARGET_WRITE_FAILED_WARNING: AlertState = {
  level: 'warning',
  message: 'Trainer is not accepting power targets',
};

function isLive(state: ConnectionState): boolean {
  return state === 'connected';
}

/**
 * The ride. Plain TypeScript: no DOM, no Bluetooth, no React, no timers of its own.
 * Everything that moves — time, ticks, the trainer — arrives by injection, which is what
 * lets a test ride a whole route in a loop.
 */
export class RideEngine {
  private readonly trainer: EngineTrainer;
  private readonly clock: Clock;
  private readonly route: Route | null;
  private settings: EngineSettings;
  /** Replaced rather than mutated on a skip, so the parsed workout is never touched. */
  private workout: { name: string; ftp: number; run: WorkoutRun } | null = null;
  private workoutScalePct = DEFAULT_SCALE_PCT;

  private readonly unsubscribes: (() => void)[] = [];
  private readonly listeners = new Set<(s: EngineSnapshot) => void>();
  private readonly sampleListeners = new Set<(s: RideSample) => void>();

  private state: RideState = 'idle';
  private finished = false;
  private elapsedS = 0;
  private pausedS = 0;
  private distanceM = 0;
  private ascentM = 0;
  private gradePercent = 0;
  private trainerGradePercent = 0;
  private speedKmh = 0;
  private alert: AlertState | null = null;

  private powerW: number | null = null;
  private cadenceRpm: number | null = null;
  private heartRateBpm: number | null = null;

  private lastTickAtMs = 0;
  private lastSampleT = -1;
  private lastEleM: number | null = null;
  private lastWrittenGradePercent: number | null = null;
  private lastWrittenTargetW: number | null = null;
  private lastControlWriteAtMs = Number.NEGATIVE_INFINITY;

  private trainerState: ConnectionState = 'disconnected';
  private disconnectedAtMs: number | null = null;

  private published: Readonly<EngineSnapshot>;

  constructor(options: RideEngineOptions) {
    this.trainer = options.trainer;
    this.clock = options.clock;
    this.route = options.route;
    this.settings = options.settings;
    const workout = options.workout ?? null;
    if (workout !== null) {
      this.workout = { name: workout.name, ftp: workout.ftp, run: workout.run };
      this.workoutScalePct = clampScalePct(workout.scalePct ?? DEFAULT_SCALE_PCT);
    }
    this.published = Object.freeze(this.build());

    this.unsubscribes.push(this.trainer.onData((d: BikeData) => this.onData(d)));
    this.unsubscribes.push(this.trainer.onStateChange((s) => this.onStateChange(s)));
    this.unsubscribes.push(options.tickSource.subscribe(() => this.tick()));
  }

  // --- subscription ------------------------------------------------------------

  subscribe = (listener: (s: EngineSnapshot) => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  onSample = (listener: (s: RideSample) => void): (() => void) => {
    this.sampleListeners.add(listener);
    return () => {
      this.sampleListeners.delete(listener);
    };
  };

  getSnapshot = (): Readonly<EngineSnapshot> => this.published;

  dispose(): void {
    for (const off of this.unsubscribes) off();
    this.unsubscribes.length = 0;
    this.listeners.clear();
    this.sampleListeners.clear();
  }

  // --- controls ----------------------------------------------------------------

  start(): void {
    if (this.state !== 'idle') return;
    this.state = 'running';
    this.lastTickAtMs = this.clock.now();
    this.gradePercent = this.gradeHere(0);
    this.lastEleM = this.currentPosition().eleM;
    this.writeControl(this.lastTickAtMs);
    this.emitSample(0);
    this.publish();
  }

  pause(): void {
    if (this.state !== 'running') return;
    this.state = 'paused';
    this.lastTickAtMs = this.clock.now();
    this.publish();
  }

  resume(): void {
    if (this.state !== 'paused') return;
    this.state = 'running';
    this.lastTickAtMs = this.clock.now();
    // A rider who resumes has dealt with whatever paused them.
    if (this.alert?.level === 'fault' && isLive(this.trainerState)) this.alert = null;
    this.publish();
  }

  /** Ends the ride deliberately. finished stays false: the route was not completed. */
  end(): void {
    if (this.state === 'idle' || this.state === 'finished') return;
    this.sampleFinal();
    this.state = 'finished';
    this.publish();
  }

  setTrainerDifficulty(percent: number): void {
    this.settings = { ...this.settings, trainerDifficulty: percent };
    // Apply at once rather than waiting for the next threshold crossing: the slider is
    // dragged mid-climb and the resistance has to follow the hand.
    this.lastWrittenGradePercent = null;
    if (this.state === 'running') this.writeControl(this.clock.now());
    this.publish();
  }

  /**
   * Ends the current step where it stands, per runner.skipStep: the step keeps what was
   * ridden and the session shortens to match. Skipping the last step runs the clock past
   * the total, which finishes the workout on the next tick.
   */
  skipStep(): void {
    if (this.workout === null) return;
    if (this.state !== 'running' && this.state !== 'paused') return;
    this.workout = { ...this.workout, run: skipRunStep(this.workout.run, this.elapsedS) };
    // The next step's target applies now, so the change gate must not suppress it.
    this.lastWrittenTargetW = null;
    this.lastWrittenGradePercent = null;
    if (this.state === 'running') this.writeControl(this.clock.now());
    this.publish();
  }

  /**
   * The difficulty control in the ride header, 50-150. Nothing to do with
   * trainerDifficulty: that changes how a hill feels, this changes the work itself.
   */
  setWorkoutScalePct(percent: number): void {
    const next = clampScalePct(percent);
    if (next === this.workoutScalePct) return;
    this.workoutScalePct = next;
    // Reached for in the third minute of an interval: the target follows the press
    // rather than waiting for the ramp to move it.
    this.lastWrittenTargetW = null;
    if (this.state === 'running') this.writeControl(this.clock.now());
    this.publish();
  }

  setRiderParameters(rider: RiderParameters): void {
    this.settings = { ...this.settings, rider };
  }

  setHeartRateBpm(bpm: number | null): void {
    if (this.heartRateBpm === bpm) return;
    this.heartRateBpm = bpm;
    this.publish();
  }

  dismissAlert(): void {
    if (this.alert === null) return;
    this.alert = null;
    this.publish();
  }

  /** null with no route: there is no total to ride towards. */
  get routeTotalDistanceM(): number | null {
    return this.route?.totalDistanceM ?? null;
  }

  // --- inputs ------------------------------------------------------------------

  private onData(d: BikeData): void {
    // Undefined means the packet omitted the field, not that the rider stopped; keep the
    // last reading rather than flickering the HUD to a dash between notifications.
    if (d.powerW !== undefined) this.powerW = d.powerW;
    if (d.cadenceRpm !== undefined) this.cadenceRpm = d.cadenceRpm;
  }

  private onStateChange(next: ConnectionState): void {
    const wasLive = isLive(this.trainerState);
    this.trainerState = next;

    if (isLive(next)) {
      // A re-write is due whatever the threshold says: a trainer that dropped the link
      // has also dropped the grade, or the target, it was holding.
      this.lastWrittenGradePercent = null;
      this.lastWrittenTargetW = null;
      if (this.disconnectedAtMs !== null) {
        this.disconnectedAtMs = null;
        // The disconnect alert is resolved, whichever level it had reached.
        this.alert = null;
        this.setAlert(RECONNECTED_INFO);
      }
      this.publish();
      return;
    }

    if (wasLive) {
      this.disconnectedAtMs = this.clock.now();
      if (this.state === 'running' || this.state === 'paused') this.setAlert(DISCONNECT_WARNING);
    }
    this.publish();
  }

  // --- the tick ----------------------------------------------------------------

  private tick(): void {
    if (this.state === 'idle' || this.state === 'finished') return;

    const now = this.clock.now();
    const dt = Math.min(MAX_TICK_DT_S, Math.max(0, (now - this.lastTickAtMs) / 1000));
    this.lastTickAtMs = now;

    if (this.state === 'paused') {
      this.pausedS += dt;
      this.publish();
      return;
    }

    // Ride on the last known power through the grace period, then stop rather than
    // record minutes of fiction against a trainer that is not there.
    if (this.disconnectedAtMs !== null) {
      if ((now - this.disconnectedAtMs) / 1000 >= DISCONNECT_GRACE_S) {
        this.state = 'paused';
        this.setAlert(DISCONNECT_FAULT);
        this.publish();
        return;
      }
    }

    this.elapsedS += dt;

    // ADR-0008: the REAL grade goes to the physics. The scaled one goes to the trainer
    // and nowhere else. Feeding trainerGradePercent in here makes distance a function of
    // a UI slider, and nothing visibly fails.
    this.gradePercent = this.gradeHere(this.distanceM);
    const speedMs = speedFromPower(this.powerW ?? 0, this.gradePercent, this.settings.rider);
    this.speedKmh = speedMs * 3.6;

    // With no course the distance is unbounded: the physics still runs, at zero grade,
    // so an indoor session covers ground the way a trainer and a head unit report it.
    const travelled = this.distanceM + speedMs * dt;
    this.distanceM =
      this.route === null ? travelled : Math.min(this.route.totalDistanceM, travelled);

    const eleM = this.currentPosition().eleM;
    if (eleM !== null) {
      if (this.lastEleM !== null && eleM > this.lastEleM) this.ascentM += eleM - this.lastEleM;
      this.lastEleM = eleM;
    }

    this.writeControl(now);

    // No route is no finish line. The ride ends when the rider ends it.
    if (this.route !== null && this.distanceM >= this.route.totalDistanceM) {
      this.sampleFinal();
      this.finished = true;
      this.state = 'finished';
      this.publish();
      return;
    }

    // A workout that has run out is this ride's end, exactly as the route end is for a
    // route — and skipping the last step reaches it by the same door.
    if (this.workout !== null && this.elapsedS >= this.workout.run.totalDurationS) {
      this.sampleFinal();
      this.finished = true;
      this.state = 'finished';
      this.publish();
      return;
    }

    this.sampleIfDue();
    this.publish();
  }

  /**
   * Which of the two commands goes out, which is also the mode switch: a step with a
   * target drives ERG, and a free step sends simulation parameters, which releases it.
   */
  private writeControl(nowMs: number): void {
    const target = this.runnerState()?.targetW ?? null;
    if (target === null) this.writeGrade(nowMs);
    else this.writeTargetPower(target, nowMs);
  }

  /**
   * At most once a second, and only once the value has moved by the threshold. The
   * order matters: a grade that has not moved must not reset the once-a-second budget.
   */
  private writeGrade(nowMs: number): void {
    // ADR-0008's scaled grade exists for the control point and nowhere else, so with no
    // gradient to scale there is nothing to send — unless a workout is running, where a
    // free step has to send simulation parameters to release ERG, and flat is zero.
    if (this.route === null && this.workout === null) return;

    const next =
      this.route === null ? 0 : trainerGrade(this.gradePercent, this.settings.trainerDifficulty);
    if (
      this.lastWrittenGradePercent !== null &&
      Math.abs(next - this.lastWrittenGradePercent) < GRADE_EPSILON_PERCENT
    ) {
      return;
    }
    if (nowMs - this.lastControlWriteAtMs < CONTROL_WRITE_INTERVAL_MS) return;

    this.lastWrittenGradePercent = next;
    // Simulation parameters took the trainer out of ERG, so the next targeted step has
    // to send its target again whatever the throttle thought it was holding.
    this.lastWrittenTargetW = null;
    this.lastControlWriteAtMs = nowMs;
    this.trainerGradePercent = next;
    void this.trainer.setGrade(next).catch(() => {
      // Say so rather than swallowing it: a trainer refusing writes is a ride whose
      // resistance has silently stopped following the road.
      this.setAlert(WRITE_FAILED_WARNING);
      this.publish();
    });
  }

  /** The same two rules as the grade: once a second, and only when it has moved. */
  private writeTargetPower(watts: number, nowMs: number): void {
    if (this.lastWrittenTargetW === watts) return;
    if (nowMs - this.lastControlWriteAtMs < CONTROL_WRITE_INTERVAL_MS) return;

    this.lastWrittenTargetW = watts;
    // Writing a target is the switch into ERG, so whatever gradient the trainer was
    // holding is gone and the next free step must send it again.
    this.lastWrittenGradePercent = null;
    this.lastControlWriteAtMs = nowMs;
    void this.trainer.setTargetPower(watts).catch(() => {
      this.setAlert(TARGET_WRITE_FAILED_WARNING);
      this.publish();
    });
  }

  // --- samples and publishing ---------------------------------------------------

  private sampleIfDue(): void {
    const t = Math.floor(this.elapsedS / SAMPLE_INTERVAL_S) * SAMPLE_INTERVAL_S;
    if (t > this.lastSampleT) this.emitSample(t);
  }

  /** The last trackpoint sits at the finish line, not at the second before it. */
  private sampleFinal(): void {
    const t = Math.round(this.elapsedS * 1000) / 1000;
    if (t > this.lastSampleT) this.emitSample(t);
  }

  private emitSample(t: number): void {
    const position = this.currentPosition();
    const sample: RideSample = {
      t,
      distanceM: this.distanceM,
      speedKmh: this.speedKmh,
      powerW: this.powerW,
      cadenceRpm: this.cadenceRpm,
      heartRateBpm: this.heartRateBpm,
      lat: position.lat,
      lon: position.lon,
      eleM: position.eleM,
    };
    this.lastSampleT = t;
    for (const listener of [...this.sampleListeners]) listener(sample);
  }

  /** The real grade here, or zero where there is no course under the ride. */
  private gradeHere(distanceM: number): number {
    if (this.route === null) return 0;
    return gradeAt(this.route, distanceM, this.settings.gradeLookaheadM);
  }

  /**
   * Nulls rather than zeros with no route: the equator at sea level is a claim, and
   * src/export/tcx.ts omits an absent position instead of writing one.
   */
  private currentPosition(): { lat: number | null; lon: number | null; eleM: number | null } {
    if (this.route === null) return NO_POSITION;
    return positionAt(this.route, this.distanceM);
  }

  /** The runner's read of the clock, or null for a ride with no workout. */
  private runnerState(): RunnerState | null {
    if (this.workout === null) return null;
    return stateAt(this.workout.run, this.elapsedS, this.workout.ftp, this.workoutScalePct);
  }

  private buildWorkout(): EngineWorkoutSnapshot | null {
    const state = this.runnerState();
    if (this.workout === null || state === null) return null;
    return {
      name: this.workout.name,
      steps: this.workout.run.steps,
      stepIndex: state.stepIndex,
      stepCount: this.workout.run.steps.length,
      stepName: state.step?.name ?? null,
      targetW: state.targetW,
      cadence: state.step?.cadence ?? null,
      stepRemainingS: Math.max(0, state.remainingS),
      totalRemainingS: Math.max(0, this.workout.run.totalDurationS - this.elapsedS),
      next: state.next,
      ergEngaged: state.erg,
      scalePct: this.workoutScalePct,
      finished: state.finished,
    };
  }

  /** Fault outranks warning outranks info; a passing note must not bury a dead trainer. */
  private setAlert(next: AlertState): void {
    const rank = { info: 0, warning: 1, fault: 2 };
    if (this.alert !== null && rank[this.alert.level] > rank[next.level]) return;
    this.alert = next;
  }

  /**
   * Elapsed time as of now, not as of the last tick.
   *
   * The tick comes from the trainer's notifications, so the accumulated value is only
   * refreshed at whatever cadence the trainer happens to use — a displayed clock reading
   * it directly advances in ragged steps slightly longer than a second. Recording still
   * uses the accumulated value; this exists so rendering can be smoother than the tick
   * without the ride's timing depending on a timer.
   */
  elapsedSNow(): number {
    if (this.state !== 'running') return this.elapsedS;
    const since = (this.clock.now() - this.lastTickAtMs) / 1000;
    return this.elapsedS + Math.min(MAX_TICK_DT_S, Math.max(0, since));
  }

  private build(): EngineSnapshot {
    const position = this.state === 'idle' ? null : this.currentPosition();
    return {
      state: this.state,
      finished: this.finished,
      elapsedS: this.elapsedS,
      pausedS: this.pausedS,
      distanceM: this.distanceM,
      ascentM: this.ascentM,
      gradePercent: this.gradePercent,
      trainerGradePercent: this.trainerGradePercent,
      speedKmh: this.speedKmh,
      powerW: this.powerW,
      cadenceRpm: this.cadenceRpm,
      heartRateBpm: this.heartRateBpm,
      lat: position?.lat ?? null,
      lon: position?.lon ?? null,
      eleM: position?.eleM ?? null,
      alert: this.alert,
      workout: this.buildWorkout(),
    };
  }

  private publish(): void {
    this.published = Object.freeze(this.build());
    for (const listener of [...this.listeners]) listener(this.published);
  }
}
