import { FakeHeartRateMonitor } from '../ble/fake-hrm';
import { FAKE_SCRIPTS, FakeTrainer, isFakeScript, type FakeScript } from '../ble/fake-trainer';
import { FtmsTrainer } from '../ble/ftms-trainer';
import { WebBluetoothHeartRateMonitor } from '../ble/hrm';
import type { ConnectionState, HeartRateMonitor, Trainer } from '../ble/types';
import { archiveFileName, buildArchive, readArchive } from '../export/archive';
import {
  routeBundleFileName,
  routeGpxFileName,
  workoutBundleFileName,
  workoutFileName,
} from '../export/file-name';
import { buildRouteGpx } from '../export/route-gpx';
import { buildTcx, tcxFileName } from '../export/tcx';
import { bundleWorkoutSources, splitWorkoutDocuments } from '../export/workout-bundle';
import { Recorder } from '../instrument/recorder';
import { TimerProbe, visibilityState, watchVisibility } from '../instrument/probe';
import { summarise } from '../instrument/stats';
import { VisibilityTracker } from '../instrument/verdict';
import { systemClock } from '../ride/clock';
import { RideEngine, type EngineSnapshot } from '../ride/engine';
import { RideRecorder } from '../ride/recorder';
import {
  builtInRouteIds,
  registerRoute,
  seedRoutes,
  storedRouteGeometry,
  type BundledRoute,
} from '../ride/routes';
import { builtInWorkoutIds, seedWorkouts } from '../ride/workouts';
import { planRouteImport, routeGeometryKey } from '../route/import';
import type { Route as RouteGeometry } from '../route/types';
import { TrainerTickSource } from '../ride/tick';
import type { EngineTrainer } from '../ride/types';
import { createStorage, storageKindFromSearch } from '../storage';
import { restoreRides } from '../storage/rides';
import { guestSession, parseSession } from '../storage/session';
import { DEFAULT_SETTINGS } from '../storage/settings';
import {
  DEFAULT_WORKOUT_SCALE_PCT,
  createId,
  type Ride,
  type Route,
  type Session,
  type Settings,
  type Storage,
  type Workout as StoredWorkout,
} from '../storage/types';
import { expandWorkout } from '../workout/expand';
import { planWorkoutImport } from '../workout/import';
import { parseWorkout } from '../workout/parse';
import { DEFAULT_SCALE_PCT, nudgeScalePct, startRun, workoutFtp } from '../workout/runner';
import { smoothPower, stepLabel } from './format';
import type { RiderProfile } from './screens/rider-profile';
import type { DeleteResult } from './screens/ride-delete';
import type { ImportResult } from './screens/rides-import';
import type { RouteImportResult } from './screens/routes-import';
import type { WorkoutImportResult } from './screens/workouts-import';
import {
  NEW_WORKOUT_SOURCE,
  duplicateName,
  duplicateSource,
  type SaveResult,
} from './screens/workout-editor';
import { experimentStore, rideStore, type WorkoutSnapshot } from './store';
import { createWakeLock } from './wake-lock';

/**
 * Everything below the UI is constructed once here, at module scope, and wired to the
 * store. Nothing is created inside a component. This module is the only place that knows
 * a ride involves Bluetooth, storage and a browser at the same time.
 */

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readFakeScript(): { script: FakeScript | null; warning: string | null } {
  const raw = new URLSearchParams(window.location.search).get('fake');
  if (raw === null) return { script: null, warning: null };
  if (isFakeScript(raw)) return { script: raw, warning: null };
  return {
    script: null,
    warning: `Unknown ?fake=${raw}. Valid scripts: ${FAKE_SCRIPTS.join(', ')}. Falling back to a real device.`,
  };
}

const { script, warning } = readFakeScript();

/** What produced the data, for the instrumentation log and the settings panel. */
export const source = script === null ? 'real device' : `fake:${script}`;
export const fakeScript = script;
export const availableScripts = FAKE_SCRIPTS;

/**
 * The phase 1 background experiment, behind ?experiment=1. ADR-0000 is still Proposed
 * and this measurement is what decides the shell, so the plumbing stays. It is gated
 * because the control timer and the summary refresh are two intervals a normal ride has
 * no use for — and an interval running alongside a ride would also stop the probe being
 * a clean control.
 */
export const experimentEnabled =
  new URLSearchParams(window.location.search).get('experiment') === '1';

/**
 * The geometry of a stored route, or null when there is none to be had.
 *
 * Async because the GPX is now in the record rather than in the build, and the repository
 * is async by contract. Null rather than throwing, because every caller is a screen: a
 * route whose source is missing or unreadable is a row without a sparkline and a summary
 * without a profile, not an exception escaping a render.
 */
export async function loadRouteGeometry(routeId: string): Promise<RouteGeometry | null> {
  await ready;
  const result = storedRouteGeometry(await storage.routes.get(routeId));
  return result.status === 'ok' ? result.geometry : null;
}

export const storage: Storage = createStorage();
export const instrumentation = new Recorder({ source });

// The FtmsTrainer handle is kept alongside the interface because the raw packet hook and
// the discovery getters are Web Bluetooth specifics the Trainer interface omits.
function makeTrainer(): { trainer: Trainer; ftms: FtmsTrainer | null; fake: FakeTrainer | null } {
  if (script !== null) {
    const fake = new FakeTrainer(script);
    return { trainer: fake, ftms: null, fake };
  }
  const ftms = new FtmsTrainer();
  return { trainer: ftms, ftms, fake: null };
}

const { trainer, ftms: ftmsTrainer, fake: fakeTrainer } = makeTrainer();

/**
 * Lets an integration test cause a dropout instead of waiting for one.
 *
 * Gated exactly like the seed hook: only with ?storage=memory and only when the trainer
 * is a fake, so it cannot exist in a real session. Waiting out the fake script's
 * wall-clock window would be slow and fragile — the rider now connects from the settings
 * panel and starts when ready, so there is no fixed moment the window lands in.
 */
if (fakeTrainer !== null && storageKindFromSearch(window.location.search) === 'memory') {
  (window as unknown as { __contourFakeTrainer?: unknown }).__contourFakeTrainer = {
    dropout: () => fakeTrainer.forceDropout(),
    reconnect: () => fakeTrainer.forceReconnect(),
  };
}
const hrm: HeartRateMonitor =
  script === null ? new WebBluetoothHeartRateMonitor() : new FakeHeartRateMonitor();

function fault(message: string): void {
  rideStore.update({ alert: { level: 'fault', message } });
}

export function dismissAlert(): void {
  engine?.dismissAlert();
  rideStore.update({ alert: null });
}

// --- instrumentation ----------------------------------------------------------

/**
 * The unparsed packet behind the most recent notification. FtmsTrainer fires the raw
 * callback immediately before onData for the same event, so this is the packet the values
 * below were decoded from — the only thing that tells a codec bug from a trainer quirk.
 */
let lastRawHex: string | null = null;
ftmsTrainer?.onRawPacket((hex) => {
  if (lastRawHex !== null) {
    instrumentation.record('ibd-notification', { hex: lastRawHex, parseFailed: true });
  }
  lastRawHex = hex;
});

// A failure while subscribing must not take the whole app down at module scope.
function wire(subscribe: () => void): void {
  try {
    subscribe();
  } catch (error) {
    fault(errorMessage(error));
  }
}

wire(() => {
  trainer.onData((d) => {
    const hex = lastRawHex ?? undefined;
    lastRawHex = null;
    instrumentation.record('ibd-notification', {
      powerW: d.powerW,
      cadenceRpm: d.cadenceRpm,
      speedKmh: d.speedKmh,
      hex,
    });
    // The HUD shows the trainer's own readings even before a ride starts.
    rideStore.update({
      powerW: d.powerW ?? null,
      cadenceRpm: d.cadenceRpm ?? null,
    });
  });
});

/**
 * Discovery result, republished only when it actually changes: FtmsTrainer hands back
 * the same mutable array every time, and the store keys off identity.
 */
let publishedServices: readonly string[] = [];

function discoveredServices(): readonly string[] {
  const found = ftmsTrainer?.discoveredServices ?? [];
  const same =
    found.length === publishedServices.length &&
    found.every((uuid, i) => uuid === publishedServices[i]);
  if (!same) publishedServices = [...found];
  return publishedServices;
}

wire(() => {
  trainer.onStateChange((state: ConnectionState) => {
    instrumentation.record('connection-state', {
      device: 'trainer',
      state,
      deviceName: ftmsTrainer?.deviceName ?? undefined,
      services: ftmsTrainer?.discoveredServices.join(' ') || undefined,
    });
    // SPEC.md > Decision gate: the trainer speaking FTMS is confirmed on connect, not
    // assumed, so what was paired with and what was found both reach the settings panel.
    rideStore.update({
      trainerState: state,
      trainerDeviceName: ftmsTrainer?.deviceName ?? null,
      trainerServices: discoveredServices(),
    });
  });
});

wire(() => {
  hrm.onData((bpm) => {
    instrumentation.record('hr-notification', { bpm });
    engine?.setHeartRateBpm(bpm);
    rideStore.update({ heartRateBpm: bpm });
  });
});

wire(() => {
  hrm.onStateChange((state: ConnectionState) => {
    instrumentation.record('connection-state', { device: 'hrm', state });
    rideStore.update({ hrmState: state });
    if (state === 'disconnected') {
      engine?.setHeartRateBpm(null);
      rideStore.update({ heartRateBpm: null });
    }
  });
});

// --- the background experiment (ADR-0000) -------------------------------------

/**
 * The experiment's control variable: a plain setInterval that does nothing but record a
 * tick. Comparing its inter-arrival times against the notification stream in a hidden
 * tab is the entire measurement, so nothing else may hang logic off it.
 */
export const probe = new TimerProbe(instrumentation);

/** How long the run spent visible against hidden, which decides whether it counts. */
export const visibility = new VisibilityTracker();

visibility.observe(visibilityState(), performance.now());
experimentStore.update({ visibilityState: visibilityState() });

// Recorded whether or not the experiment is running: a visibility change during an
// ordinary ride is exactly the context a later log needs, and it costs one listener.
watchVisibility(instrumentation, (state) => {
  visibility.observe(state, performance.now());
  experimentStore.update({ visibilityState: state });
  refreshSummary();
});

// Display only, and deliberately outside the measurement: summarising is not part of
// what is being measured, so this interval being throttled when hidden costs nothing.
const SUMMARY_REFRESH_MS = 1000;
let lastSummarisedCount = -1;

function refreshSummary(): void {
  if (instrumentation.totalRecorded === lastSummarisedCount) return;
  lastSummarisedCount = instrumentation.totalRecorded;
  experimentStore.update({
    summary: summarise(instrumentation.events()),
    eventCount: instrumentation.totalRecorded,
    droppedEvents: instrumentation.droppedCount,
    running: probe.running,
  });
}

if (experimentEnabled) setInterval(refreshSummary, SUMMARY_REFRESH_MS);

/** No-op without ?experiment=1, so a normal ride never starts a second interval. */
export function startProbe(): void {
  if (!experimentEnabled) return;
  probe.start();
  experimentStore.update({ running: probe.running });
  refreshSummary();
}

export function stopProbe(): void {
  probe.stop();
  experimentStore.update({ running: probe.running });
  refreshSummary();
}

/** Annotates the log at the moment the operator changed the condition under test. */
export function addMarker(): void {
  instrumentation.record('marker', { at: new Date().toISOString() });
  refreshSummary();
}

export function clearLog(): void {
  instrumentation.clear();
  visibility.reset();
  visibility.observe(visibilityState(), performance.now());
  lastSummarisedCount = -1;
  experimentStore.update({ summary: null, eventCount: 0, droppedEvents: 0 });
}

export function downloadInstrumentationLog(): void {
  download(instrumentation.toBlob(), instrumentation.fileName());
}

if (warning !== null) rideStore.update({ alert: { level: 'warning', message: warning } });

// --- settings and route seeding -----------------------------------------------

/**
 * The Playwright suite's one way into the app's state, and the smallest that works.
 *
 * A route put here before the page boots is registered like a bundled one and picked up
 * by the seeding below, which is what lets an integration test ride a 200 m fixture to
 * completion in about fifteen seconds instead of a 20 km route in half an hour.
 *
 * Gated on ?storage=memory, so it cannot exist in a session backed by the real database:
 * without that flag the payload is ignored whatever is on window.
 */
interface SeedPayload {
  routes?: BundledRoute[];
  /**
   * A signed-in install, which is seeded state like the routes beside it: every spec but
   * the login one is testing what a rider does after the first press, not the press.
   *
   * Only in-memory storage needs it here. Against IndexedDB the session is a localStorage
   * key, which Playwright can write before the page boots without the app's help.
   */
  session?: unknown;
}

/** Null unless a seeded, valid session arrived; written by `ready` before it reads one. */
let seededSession: Session | null = null;

function applySeed(): void {
  if (storageKindFromSearch(window.location.search) !== 'memory') return;
  const payload = (window as unknown as { __contourSeed?: SeedPayload }).__contourSeed;
  for (const route of payload?.routes ?? []) registerRoute(route);
  seededSession = parseSession(payload?.session ?? null);
}

applySeed();

/**
 * Which routes and workouts this build supplies, read once after applySeed so a route the
 * Playwright seed hook registered counts exactly as a bundled one does.
 *
 * A set rather than a call per row: the screens take it as a prop and memoise against it,
 * and a fresh Set on every render would invalidate every one of those.
 */
export const builtInRoutes: ReadonlySet<string> = builtInRouteIds();
export const builtInWorkouts: ReadonlySet<string> = builtInWorkoutIds();

let settings: Settings = { ...DEFAULT_SETTINGS };

export function currentSettings(): Readonly<Settings> {
  return settings;
}

/**
 * Whether this install has been started, cached beside the settings and for the same
 * reason: it is read on every render of the gate and it changes once, here.
 */
let session: Session | null = null;

export function currentSession(): Session | null {
  return session;
}

/**
 * What pressing Start does. A guest session until phase 5 has a server to authenticate
 * against, written so the screen is not shown again on this install.
 *
 * A write that fails still lets the rider ride: the record describes the install, and
 * refusing to open the app over it would be the one failure mode worse than asking again
 * next launch.
 */
export async function startGuestSession(): Promise<void> {
  const next = guestSession();
  session = next;
  try {
    await storage.session.put(next);
  } catch (error) {
    fault(`Could not remember this session, so you may be asked again: ${errorMessage(error)}`);
  }
}

/**
 * Start-up work the screens await before reading storage.
 *
 * Both passes run on every boot and neither keeps a marker, because neither needs one: a
 * built-in route or workout cannot be deleted, so an absent record can only be one this
 * install has never written. The markers that used to live in Settings existed solely to
 * tell a deleted record from a new one, and that question no longer arises.
 *
 * The two passes write by different rules, each stated where it is implemented: routes
 * also rewrite what the manifest has changed, workouts never rewrite anything.
 */
export const ready: Promise<void> = (async () => {
  try {
    settings = await storage.settings.get();
    // Seeded first where the suite asked for one, so the read below is the same read a
    // rider's second launch makes rather than a branch of its own.
    if (seededSession !== null) await storage.session.put(seededSession);
    session = await storage.session.get();

    await seedRoutes(storage.routes);
    const seeded = await seedWorkouts(storage.workouts);

    // A starter that will not parse is a bug in a file we shipped, not in anything the
    // rider did — but it is theirs that is missing, so it says so rather than going quiet.
    if (seeded.skipped.length > 0) {
      rideStore.update({
        alert: {
          level: 'warning',
          message: `Some starter workouts could not be loaded. ${seeded.skipped.join(' ')}`,
        },
      });
    }

    rideStore.update({
      trainerDifficulty: settings.trainerDifficulty,
      targetPowerW: settings.targetPowerW,
      targetCadenceRpm: settings.targetCadenceRpm,
      targetHeartRateBpm: settings.targetHeartRateBpm,
    });
  } catch (error) {
    fault(`Could not load your routes or settings: ${errorMessage(error)}`);
  }
})();

// --- control point writes -----------------------------------------------------

/** SPEC.md > Bluetooth details: at most one write a second, and only on a real change.
 * The engine gates the grade to the same rule; this is the shared floor under every
 * writer, including the target power the engine never touches. */
const WRITE_INTERVAL_MS = 1000;
const POWER_EPSILON_W = 1;
const GRADE_EPSILON_PCT = 0.1;

type ControlOp = 'setTargetPower' | 'setGrade';

let desired: { op: ControlOp; value: number } | null = null;
let lastWriteAt = Number.NEGATIVE_INFINITY;
let lastSentOp: ControlOp | null = null;
let lastSentPowerW: number | null = null;
let lastSentGradePct: number | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function changedEnough(op: ControlOp, value: number): boolean {
  // Which command is sent is the control mode, so sending a different one is always a
  // change even when its value is the one it last held: a workout returning to a target
  // it has used before still has to take the trainer back out of simulation.
  if (op !== lastSentOp) return true;
  if (op === 'setTargetPower') {
    return lastSentPowerW === null || Math.abs(value - lastSentPowerW) >= POWER_EPSILON_W;
  }
  return lastSentGradePct === null || Math.abs(value - lastSentGradePct) >= GRADE_EPSILON_PCT;
}

/** Trailing edge: while the throttle is closed the latest value wins. */
function scheduleFlush(): void {
  if (flushTimer !== null) return;
  const wait = Math.max(0, WRITE_INTERVAL_MS - (performance.now() - lastWriteAt));
  if (wait === 0) {
    void flush();
    return;
  }
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, wait);
}

async function flush(): Promise<void> {
  const next = desired;
  desired = null;
  if (next === null) return;

  if (!changedEnough(next.op, next.value)) {
    if (desired !== null) scheduleFlush();
    return;
  }

  lastWriteAt = performance.now();
  lastSentOp = next.op;
  if (next.op === 'setTargetPower') lastSentPowerW = next.value;
  else lastSentGradePct = next.value;

  instrumentation.record('control-write', { op: next.op, value: next.value });

  try {
    if (next.op === 'setTargetPower') await trainer.setTargetPower(next.value);
    else await trainer.setGrade(next.value);
    instrumentation.record('control-response', { op: next.op, value: next.value, ok: true });
  } catch (error) {
    const message = errorMessage(error);
    instrumentation.record('control-response', {
      op: next.op,
      value: next.value,
      ok: false,
      error: message,
    });
    throw error;
  } finally {
    if (desired !== null) scheduleFlush();
  }
}

function queueWrite(op: ControlOp, value: number): void {
  desired = { op, value };
  scheduleFlush();
}

/**
 * The trainer's current connection state, kept here because the interface has no getter
 * for it and the engine is built long after the trainer connected.
 */
let trainerState: ConnectionState = 'disconnected';
wire(() => {
  trainer.onStateChange((state) => {
    trainerState = state;
  });
});

/**
 * What the engine is given in place of the trainer: data and connection state straight
 * through, grade writes via the throttle and the instrumentation log. It cannot reach
 * connect() or setTargetPower() from here, which is the point of the narrower interface.
 */
const engineTrainer: EngineTrainer = {
  onData: (cb) => trainer.onData(cb),
  /**
   * The current state is replayed to every new subscriber. Without it the engine — built
   * at startRide, by which time the trainer has been connected for a while — never sees
   * a live trainer, so a mid-ride dropout reads as a device that was never there: no
   * warning, no grace period, no automatic pause. Nothing fails visibly, which is why it
   * survived until an integration test rode a dropout end to end.
   */
  onStateChange: (cb) => {
    const off = trainer.onStateChange(cb);
    cb(trainerState);
    return off;
  },
  setGrade: async (percent) => queueWrite('setGrade', percent),
  setTargetPower: async (watts) => queueWrite('setTargetPower', watts),
};

// Created once. It holds no subscription until an engine subscribes to it.
const tickSource = new TrainerTickSource(engineTrainer, systemClock);

// --- connection ---------------------------------------------------------------

export async function connectTrainer(): Promise<void> {
  rideStore.update({ alert: null });
  try {
    await trainer.connect();
  } catch (error) {
    fault(errorMessage(error));
  }
}

export async function disconnectTrainer(): Promise<void> {
  try {
    await trainer.disconnect();
  } catch (error) {
    fault(errorMessage(error));
  }
}

export async function connectHrm(): Promise<void> {
  rideStore.update({ alert: null });
  try {
    await hrm.connect();
  } catch (error) {
    fault(errorMessage(error));
  }
}

export async function disconnectHrm(): Promise<void> {
  try {
    await hrm.disconnect();
  } catch (error) {
    fault(errorMessage(error));
  }
}

// --- the ride -----------------------------------------------------------------

let engine: RideEngine | null = null;
let recorder: RideRecorder | null = null;

/** Riding means not touching the machine for an hour, so the display would otherwise
 * sleep mid-climb. Held only while actually running — a paused ride should be allowed
 * to sleep, and a hidden tab releases it by specification anyway. */
const wakeLock = createWakeLock();
let engineOff: (() => void)[] = [];

/**
 * Render-only clock refresh.
 *
 * Elapsed time is accumulated on the notification tick and the recorded ride never
 * depends on this interval. It exists because the tick arrives at the trainer's cadence
 * — around 1.005 s for the fake, and whatever a real trainer chooses — so a clock
 * refreshed only on ticks advances in ragged steps. Polling ten times a second and
 * publishing whole seconds keeps the displayed boundary within 100 ms of the truth while
 * the store's change gate still limits React to one render per second.
 *
 * A timer here is safe precisely because it is not load-bearing: if Chrome throttles it
 * in a hidden tab, nobody is reading the clock, and the ride's timing is unaffected.
 */
const DISPLAY_REFRESH_MS = 100;
setInterval(() => {
  if (engine === null) return;
  rideStore.update({ elapsedS: Math.floor(engine.elapsedSNow()) });
}, DISPLAY_REFRESH_MS);
let saved: Promise<string | null> | null = null;

// Display smoothing lives here rather than in the engine: the trainer gets the raw
// grade, the rider gets one that does not twitch. DESIGN.md > Motion.
let displayPowerW: number | null = null;
let displayGradePercent: number | null = null;
let lastBridgeAtMs = 0;

/**
 * The workout panel's state, republished only when it actually changes.
 *
 * The engine rebuilds its snapshot every tick and the store keys off identity, so without
 * this a countdown rounded to whole seconds would still hand React a new object several
 * times a second. Same arrangement as discoveredServices above, for the same reason.
 */
let publishedWorkout: WorkoutSnapshot | null = null;

function sameWorkout(a: WorkoutSnapshot, b: WorkoutSnapshot): boolean {
  return (Object.keys(a) as (keyof WorkoutSnapshot)[]).every((key) => a[key] === b[key]);
}

/** Seconds round up, because a countdown that shows 0:00 while the step is still running
 * is a clock that lies for its last second. */
function workoutSnapshot(state: EngineSnapshot['workout']): WorkoutSnapshot | null {
  if (state === null) {
    publishedWorkout = null;
    return null;
  }
  const next: WorkoutSnapshot = {
    name: state.name,
    // The engine's own array, so identity holds until a skip replaces it.
    steps: state.steps,
    stepIndex: state.stepIndex,
    stepCount: state.stepCount,
    stepName: state.stepName,
    targetW: state.targetW,
    cadence: state.cadence,
    stepRemainingS: Math.ceil(state.stepRemainingS),
    totalRemainingS: Math.ceil(state.totalRemainingS),
    nextLabel: state.next === null ? null : stepLabel(state.next),
    ergEngaged: state.ergEngaged,
    scalePct: state.scalePct,
    ftpW: state.ftpW,
  };
  if (publishedWorkout !== null && sameWorkout(publishedWorkout, next)) return publishedWorkout;
  publishedWorkout = next;
  return next;
}

function bridge(snapshot: EngineSnapshot): void {
  const now = performance.now();
  const dt = lastBridgeAtMs === 0 ? 0 : (now - lastBridgeAtMs) / 1000;
  lastBridgeAtMs = now;

  displayPowerW = smoothPower(displayPowerW, snapshot.powerW, dt);
  displayGradePercent = smoothPower(displayGradePercent, snapshot.gradePercent, dt);

  wakeLock.setActive(snapshot.state === 'running');

  rideStore.update({
    state: snapshot.state,
    alert: snapshot.alert,
    // Whole seconds: the store suppresses a republish when a value is unchanged, so
    // flooring here means React renders the clock once a second rather than every tick.
    elapsedS: Math.floor(snapshot.elapsedS),
    pausedS: snapshot.pausedS,
    distanceM: snapshot.distanceM,
    ascentM: snapshot.ascentM,
    gradePercent: displayGradePercent,
    speedKmh: snapshot.speedKmh,
    powerW: snapshot.powerW,
    displayPowerW,
    cadenceRpm: snapshot.cadenceRpm,
    heartRateBpm: snapshot.heartRateBpm,
    avgPowerW: recorder?.avgPowerW ?? null,
    workout: workoutSnapshot(snapshot.workout),
  });

  if (snapshot.state === 'finished') void saveRide();
}

function teardown(): void {
  for (const off of engineOff) off();
  engineOff = [];
  engine?.dispose();
  engine = null;
}

/**
 * The workout difficulty in force, held here rather than in Settings: it is reached for
 * during a session and belongs to that session, which is why a Ride freezes it. It resets
 * to 100 when a workout starts, so a hard day's 80 % is not silently inherited by the next.
 */
let workoutScalePct = DEFAULT_SCALE_PCT;

function engineSettings() {
  return {
    trainerDifficulty: settings.trainerDifficulty,
    gradeLookaheadM: settings.gradeLookaheadM,
    rider: {
      riderMassKg: settings.riderMassKg,
      bikeMassKg: settings.bikeMassKg,
      cda: settings.cda,
      crr: settings.crr,
    },
  };
}

/**
 * Frozen now: changing your FTP later must not re-zone a ride already ridden. ADR-0017.
 *
 * The FTP is the session's, not the profile's — a workout that declares its own is ridden
 * at it, so that is the FTP this ride was ridden with and the one the summary must zone it
 * against. The caller names it; a ride with no workout has only the profile's.
 */
function frozenSettings(ftp: number = settings.ftp) {
  return {
    trainerDifficulty: settings.trainerDifficulty,
    workoutScalePct,
    ftp,
    hrMax: settings.hrMax,
    riderMassKg: settings.riderMassKg,
    bikeMassKg: settings.bikeMassKg,
  };
}

/** Everything a new ride resets, whether it has a route under it or a workout in it. */
function armRide(next: RideEngine): void {
  saved = null;
  displayPowerW = null;
  displayGradePercent = null;
  lastBridgeAtMs = 0;
  publishedWorkout = null;

  // The recorder owns the 1 Hz series; publishing a copy of it per second is what lets
  // the power strip read the real samples rather than rebuild them from snapshots.
  engineOff.push(
    next.onSample((sample) => {
      recorder?.add(sample);
      if (recorder !== null) rideStore.update({ samples: [...recorder.samples] });
    }),
  );
  engineOff.push(next.subscribe(bridge));
  engine = next;
}

export async function startRide(routeId: string): Promise<void> {
  await ready;
  teardown();
  // A ride with no workout is ridden at full scale, which is the only honest default.
  workoutScalePct = DEFAULT_SCALE_PCT;

  let stored: Route | undefined;
  let geometry: RouteGeometry;
  try {
    stored = await storage.routes.get(routeId);
    const read = storedRouteGeometry(stored);
    if (read.status !== 'ok') {
      fault(`That route cannot be ridden: ${read.reason}.`);
      return;
    }
    geometry = read.geometry;
  } catch (error) {
    fault(`Could not load that route: ${errorMessage(error)}`);
    return;
  }

  const next = new RideEngine({
    trainer: engineTrainer,
    clock: systemClock,
    tickSource,
    route: geometry,
    settings: engineSettings(),
  });

  recorder = new RideRecorder({
    routeId,
    routeName: stored?.name ?? null,
    startedAt: new Date().toISOString(),
    settings: frozenSettings(),
  });

  armRide(next);

  rideStore.update({
    routeId,
    routeName: stored?.name ?? null,
    // Published rather than re-read by the screen. The geometry is parsed once, here,
    // where loading it is already async, and the ride screen is handed the same object
    // the engine is riding instead of waiting on a second read of its own.
    routeGeometry: geometry,
    routeTotalDistanceM: geometry.totalDistanceM,
    routeTotalAscentM: geometry.totalAscentM,
    samples: [],
    savedRideId: null,
  });

  next.setHeartRateBpm(rideStore.getSnapshot().heartRateBpm);

  // Armed, not running: the rider lands on the ride screen with the charts drawn and the
  // clock at zero, and presses Start when they are on the bike. Publishing the engine's
  // own idle snapshot clears the last ride's numbers out of the store.
  bridge(next.getSnapshot());
}

/**
 * A workout with no route, which is the ordinary way to ride one: no geometry to load, no
 * total distance to ride towards, and the physics running at zero grade so the session
 * still covers ground. Laying a workout over a route works in the engine already and
 * arrives as its own entry point in phase 4.
 */
export async function startWorkout(workoutId: string): Promise<void> {
  await ready;
  teardown();
  workoutScalePct = DEFAULT_SCALE_PCT;

  let stored;
  let run;
  let ftp: number;
  let name: string;
  try {
    stored = await storage.workouts.get(workoutId);
    if (stored === undefined) throw new Error(`no workout with id "${workoutId}"`);
    const parsed = parseWorkout(stored.source);
    // The workout's own FTP where it has one, the rider profile's where it does not. One
    // number for the session: the engine rides it, the screen draws against it, and the
    // ride freezes it.
    ftp = workoutFtp(parsed, settings.ftp);
    name = parsed.name;
    run = startRun(expandWorkout(parsed));
  } catch (error) {
    fault(`Could not load that workout: ${errorMessage(error)}`);
    return;
  }

  const next = new RideEngine({
    trainer: engineTrainer,
    clock: systemClock,
    tickSource,
    route: null,
    settings: engineSettings(),
    workout: { name, run, ftp, scalePct: workoutScalePct },
  });

  recorder = new RideRecorder({
    routeId: null,
    routeName: null,
    workoutId,
    workoutName: name,
    startedAt: new Date().toISOString(),
    settings: frozenSettings(ftp),
  });

  armRide(next);

  rideStore.update({
    routeId: null,
    routeName: null,
    routeGeometry: null,
    routeTotalDistanceM: null,
    routeTotalAscentM: null,
    samples: [],
    savedRideId: null,
  });

  next.setHeartRateBpm(rideStore.getSnapshot().heartRateBpm);
  bridge(next.getSnapshot());
}

/** Ends the current step and starts the next, shortening the session to what was ridden. */
export function skipStep(): void {
  engine?.skipStep();
}

/** One press of the difficulty control: delta is presses, 5 % each, clamped 50-150. */
export function nudgeWorkoutScale(delta: number): void {
  workoutScalePct = nudgeScalePct(workoutScalePct, delta);
  engine?.setWorkoutScalePct(workoutScalePct);
}

/** Starts an armed ride. Idempotent: the engine ignores a start it has already had. */
export function beginRide(): void {
  engine?.start();
}

export function pauseRide(): void {
  engine?.pause();
}

export function resumeRide(): void {
  engine?.resume();
}

/** Ends the ride and returns the stored ride's id, so the screen can offer its export. */
/**
 * Three outcomes, not two. `null` used to mean "the save failed", and a ride that was
 * never started would have been saved as an empty one — so the rider gets a summary of
 * nothing, and their history fills with rides that did not happen.
 */
export type EndRideOutcome =
  { status: 'saved'; rideId: string } | { status: 'discarded' } | { status: 'failed' };

export async function endRide(): Promise<EndRideOutcome> {
  if (nothingRecorded()) {
    engine?.end();
    return { status: 'discarded' };
  }
  engine?.end();
  const rideId = await saveRide();
  return rideId === null ? { status: 'failed' } : { status: 'saved', rideId };
}

/**
 * Picking a route and pressing End without starting, or starting and ending inside a
 * tick. Either way nothing happened, so there is nothing worth keeping — and a zero-length
 * ride in the history is noise the rider then has to delete.
 */
function nothingRecorded(): boolean {
  const snapshot = engine?.getSnapshot();
  if (snapshot === undefined) return true;
  return snapshot.elapsedS <= 0;
}

/**
 * Once per ride, whether the rider pressed End or the route simply ran out. Both paths
 * publish the id: a finish nobody asked for still has to say which ride it saved, or the
 * summary is left guessing and guesses wrong the moment two rides finish close together.
 */
function saveRide(): Promise<string | null> {
  saved ??= persistRide().then((id) => {
    if (id !== null) rideStore.update({ savedRideId: id });
    return id;
  });
  return saved;
}

async function persistRide(): Promise<string | null> {
  const active = engine;
  const activeRecorder = recorder;
  if (active === null || activeRecorder === null) return null;

  const snapshot = active.getSnapshot();
  const { ride, samples } = activeRecorder.build({
    pausedS: snapshot.pausedS,
    finished: snapshot.finished,
    // Taken from the engine as the ride ended rather than from what it started with: the
    // rider settled somewhere, and that is what the session was.
    workoutScalePct: snapshot.workout?.scalePct ?? DEFAULT_WORKOUT_SCALE_PCT,
  });

  try {
    await storage.rides.put(ride);
    await storage.rideSamples.put(samples);
  } catch (error) {
    fault(`Could not save that ride: ${errorMessage(error)}`);
    return null;
  }
  return ride.id;
}

// --- settings actions ---------------------------------------------------------

export async function setTrainerDifficulty(percent: number): Promise<void> {
  const value = Math.round(Math.min(100, Math.max(0, percent)));
  settings = { ...settings, trainerDifficulty: value };
  rideStore.update({ trainerDifficulty: value });
  engine?.setTrainerDifficulty(value);
  await storage.settings.put({ trainerDifficulty: value });
}

/**
 * The rider profile: the set-once numbers, written one valid field at a time.
 *
 * Deliberately narrower than Settings. Nothing here touches a ride in progress — the
 * screen is only reachable from the list screens, and a Ride has already frozen the FTP,
 * hrMax and masses it was recorded with, so a new profile re-zones nothing in the history.
 * The next ride built by startRide reads these values fresh.
 *
 * Validation is src/ui/screens/rider-profile.ts and belongs to the caller: this writes
 * what it is given, exactly as the target setters do.
 */
export async function updateRiderProfile(patch: Partial<RiderProfile>): Promise<void> {
  settings = { ...settings, ...patch };
  await storage.settings.put(patch);
}

/**
 * The three targets the ladders read. Each persists, so a target survives a reload
 * instead of living in component state that the settings panel only appeared to save.
 * Power is the one the trainer is told about; cadence and heart rate are the rider's
 * own business and the trainer has no opcode for either.
 */
export async function setTargetPowerW(watts: number | null): Promise<void> {
  if (settings.targetPowerW === watts) return;
  settings = { ...settings, targetPowerW: watts };
  rideStore.update({ targetPowerW: watts });
  if (watts !== null) queueWrite('setTargetPower', watts);
  await storage.settings.put({ targetPowerW: watts });
}

export async function setTargetCadenceRpm(rpm: number | null): Promise<void> {
  if (settings.targetCadenceRpm === rpm) return;
  settings = { ...settings, targetCadenceRpm: rpm };
  rideStore.update({ targetCadenceRpm: rpm });
  await storage.settings.put({ targetCadenceRpm: rpm });
}

export async function setTargetHeartRateBpm(bpm: number | null): Promise<void> {
  if (settings.targetHeartRateBpm === bpm) return;
  settings = { ...settings, targetHeartRateBpm: bpm };
  rideStore.update({ targetHeartRateBpm: bpm });
  await storage.settings.put({ targetHeartRateBpm: bpm });
}

// --- the workouts library -----------------------------------------------------

/**
 * The library, source and all. The list screen derives every column but the name from
 * the YAML, so the record it needs is the whole record — there is no lighter projection
 * to fetch, and storage offers no queries beyond list and get by design.
 */
export async function listWorkouts(): Promise<StoredWorkout[]> {
  await ready;
  return storage.workouts.list();
}

/**
 * What a built-in record is told when something asks to change or remove it. The screens
 * offer neither control at all, so this is the belt to that braces: a guard here holds
 * for every caller, including one written after whoever reads this has moved on.
 */
const BUILT_IN_REFUSAL = 'it came with this install';

/**
 * Writes the text the rider wrote, with the name and description read back out of it.
 *
 * Refuses a starter the build supplies, as deleteWorkout does. Seeding rewrites a record
 * that differs from its bundled file, so a save that got past here would read as working
 * and be undone on the next boot. The editor opens a starter read-only and offers
 * Duplicate instead, which is how a starter becomes something to change.
 *
 * Parsing here is not a second validation — the editor has already asked that question
 * and shown the rider where the answer was — it is how the two denormalised fields are
 * filled. They exist so a source that stops parsing still has a name to appear under in
 * the list, which is what lets a broken workout be found and fixed.
 */
export async function saveWorkout(workoutId: string, source: string): Promise<SaveResult> {
  await ready;
  if (builtInWorkouts.has(workoutId)) return { status: 'failed', reason: BUILT_IN_REFUSAL };
  try {
    const parsed = parseWorkout(source);
    await storage.workouts.put({
      id: workoutId,
      // Stamped by the repository on write, as every other record is.
      updatedAt: '',
      name: parsed.name,
      ...(parsed.description === undefined ? {} : { description: parsed.description }),
      source,
    });
    return { status: 'saved' };
  } catch (error) {
    return { status: 'failed', reason: errorMessage(error) };
  }
}

/**
 * A new workout on the starting template, written before the editor opens on it.
 *
 * Stored immediately rather than held as a draft, so the editor only ever edits a record
 * that exists: a draft would need its own unsaved state, its own way back and its own
 * answer to what happens when the rider reloads. An abandoned one is a row with a delete
 * control beside it, which is the ordinary way to get rid of a workout anyway.
 */
export async function createWorkout(): Promise<string | null> {
  await ready;
  const id = createId();
  const result = await saveWorkout(id, NEW_WORKOUT_SOURCE);
  if (result.status === 'failed') {
    fault(`Could not create that workout: ${result.reason}`);
    return null;
  }
  return id;
}

/**
 * A copy of a workout, as a workout of the rider's own: the source exactly as written,
 * under a name no row in the library has yet, with a minted id that no manifest entry
 * claims. Written before the editor opens on it, as createWorkout writes its template.
 *
 * This is how a starter becomes a starting point. A starter cannot be changed, so without
 * a copy to take, "sweet spot but ten minutes" means retyping it from the screen.
 */
export async function duplicateWorkout(workoutId: string): Promise<string | null> {
  await ready;
  const original = await storage.workouts.get(workoutId);
  if (original === undefined) {
    fault('That workout is no longer in the library, so there is nothing to copy.');
    return null;
  }
  const taken = (await storage.workouts.list()).map((workout) => workout.name);
  const copy = duplicateSource(original.source, duplicateName(original.name, taken));
  const id = createId();
  const result = await saveWorkout(id, copy);
  if (result.status === 'failed') {
    fault(`Could not copy that workout: ${result.reason}`);
    return null;
  }
  return id;
}

/**
 * Removes this install's record of a route. Nothing cascades, by design and not by
 * omission: a ride carries its own frozen routeId and routeName, and the GPX itself is in
 * the build rather than in the database, so the history and the geometry both survive.
 * A ride on a removed route still opens, still draws its profile and still exports.
 *
 * Refuses a route the build supplies. Seeding would write it straight back on the next
 * boot, so a delete that got past here would read as working and silently undo itself.
 */
export async function deleteRoute(routeId: string): Promise<DeleteResult> {
  await ready;
  if (builtInRoutes.has(routeId)) return { status: 'failed', reason: BUILT_IN_REFUSAL };
  try {
    await storage.routes.delete(routeId);
    return { status: 'done' };
  } catch (error) {
    return { status: 'failed', reason: errorMessage(error) };
  }
}

/**
 * No cascade: a workout is one record, and the rides that reference it keep their own
 * frozen workoutId and workoutName, so deleting it rewrites no history.
 *
 * Refuses a starter the build supplies, for the same reason deleteRoute does, and the
 * same reason saveWorkout does: it is the build's record rather than the rider's.
 */
export async function deleteWorkout(workoutId: string): Promise<DeleteResult> {
  await ready;
  if (builtInWorkouts.has(workoutId)) return { status: 'failed', reason: BUILT_IN_REFUSAL };
  try {
    await storage.workouts.delete(workoutId);
    return { status: 'done' };
  } catch (error) {
    return { status: 'failed', reason: errorMessage(error) };
  }
}

// --- export -------------------------------------------------------------------

function download(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

/** Works for the ride just finished and for any entry in the history: both read the
 * same two records, so there is one export path rather than two. */
export async function exportRideTcx(rideId: string): Promise<void> {
  const ride: Ride | undefined = await storage.rides.get(rideId);
  if (ride === undefined) {
    fault('That ride is no longer in the history, so there is nothing to export.');
    return;
  }
  const stored = await storage.rideSamples.get(rideId);
  const xml = buildTcx({ ride, samples: stored?.samples ?? [] });
  download(
    new Blob([xml], { type: 'application/vnd.garmin.tcx+xml' }),
    tcxFileName(ride.startedAt),
  );
}

/**
 * Removes a ride and the samples underneath it.
 *
 * Through storage.rides, which is a CascadingRideRepository in both implementations, so
 * the second record goes with the first and nothing above this line has to remember that
 * a ride is two records. Deliberately not two deletes side by side: that is the version
 * that drifts the day a third record joins a ride.
 */
export async function deleteRide(rideId: string): Promise<DeleteResult> {
  try {
    await storage.rides.delete(rideId);
    return { status: 'done' };
  } catch (error) {
    return { status: 'failed', reason: errorMessage(error) };
  }
}

/**
 * Every ride and its samples as one ZIP. Thin on purpose: the archive's shape belongs to
 * src/export/archive.ts and the records belong to storage, so this reads, builds and
 * hands the bytes to the browser.
 */
export async function exportAllRides(): Promise<void> {
  const rides = await storage.rides.list();
  const records = await Promise.all(
    rides.map(async (ride) => ({
      ride,
      samples: (await storage.rideSamples.get(ride.id))?.samples ?? [],
    })),
  );
  download(new Blob([buildArchive(records)], { type: 'application/zip' }), archiveFileName());
}

/**
 * Restores an archive the rider picked off disk. Nothing here throws: a file chosen in a
 * file picker is untrusted input, and the rider gets a sentence either way.
 */
/**
 * Generous enough for thousands of rides — one ride is roughly 46 kB across its TCX and
 * its manifest entry. The point is not a zip bomb, which would be the rider's own file on
 * their own machine: it is that picking the wrong file should say so rather than freeze
 * the tab while `unzipSync` works through a few hundred megabytes in memory.
 */
const MAX_IMPORT_BYTES = 128 * 1024 * 1024;

export async function importRides(file: File): Promise<ImportResult> {
  if (file.size > MAX_IMPORT_BYTES) {
    const mb = Math.round(file.size / (1024 * 1024));
    return {
      status: 'failed',
      reason: `that file is ${String(mb)} MB, larger than Contour will read — is it a rides archive?`,
    };
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch (error) {
    return { status: 'failed', reason: errorMessage(error) };
  }

  const read = readArchive(bytes);
  if (!read.ok) return { status: 'failed', reason: read.reason };

  try {
    const { restored, skippedExisting } = await restoreRides(storage, read.records);
    return {
      status: 'done',
      restored,
      skippedExisting,
      skippedInvalid: read.skipped,
      reasons: read.reasons,
    };
  } catch (error) {
    return { status: 'failed', reason: errorMessage(error) };
  }
}

/**
 * One route's GPX, handed back exactly as the record holds it.
 *
 * Nothing is generated and nothing is read out of the build: the bytes are on the record,
 * which is the whole of this change — a route the rider imported downloads the same way a
 * bundled one does, because by the time either is stored there is no difference between
 * them.
 */
export async function exportRouteGpx(routeId: string): Promise<void> {
  await ready;
  const stored = await storage.routes.get(routeId);
  if (stored === undefined) {
    fault('That route is no longer in the list, so there is nothing to download.');
    return;
  }
  if (stored.gpx === undefined || stored.gpx.trim() === '') {
    fault(`This install has no GPX for ${stored.name}, so there is nothing to download.`);
    return;
  }
  download(new Blob([stored.gpx], { type: 'application/gpx+xml' }), routeGpxFileName(stored.name));
}

/**
 * Every route as one GPX file, each its own <trk>.
 *
 * In the order the list shows them, as the workout bundle is, so the file reads the way
 * the screen does. A route with no readable source is left out rather than aborting the
 * download — it has nothing to contribute and the boot alert has already named it.
 */
export async function exportAllRoutes(): Promise<void> {
  await ready;
  const routes = await storage.routes.list();
  const ordered = [...routes].sort((a, b) => a.name.localeCompare(b.name));

  const tracks = ordered.flatMap((route) => {
    const read = storedRouteGeometry(route);
    return read.status === 'ok' ? [{ name: route.name, points: read.geometry.points }] : [];
  });

  download(
    new Blob([buildRouteGpx(tracks)], { type: 'application/gpx+xml' }),
    routeBundleFileName(),
  );
}

/**
 * A GPX is text, and a long real route is a few hundred kilobytes of it. The ceiling is
 * here to make picking the wrong file say so rather than to express a view on route
 * length — the same job it does on the workout bundle.
 */
const MAX_ROUTE_IMPORT_BYTES = 64 * 1024 * 1024;

/**
 * Every stored route's geometry key, for planRouteImport to match an incoming track
 * against.
 *
 * The whole list, built-ins included: the likeliest duplicate of all is a route the build
 * already ships. A record whose GPX will not parse contributes nothing — it has no
 * geometry to compare, and the boot alert has already named it.
 */
async function storedRouteKeys(): Promise<string[]> {
  const stored = await storage.routes.list();
  return stored.flatMap((route) => {
    const read = storedRouteGeometry(route);
    return read.status === 'ok' ? [routeGeometryKey(read.geometry)] : [];
  });
}

/**
 * Imports a GPX the rider picked off disk.
 *
 * Every track the rider does not already have becomes a new route with a new id. A GPX
 * carries no ids to match on, so sameness is geometry rather than identity: a track whose
 * points match a stored route's, to the metre, is skipped and counted. Skipped rather
 * than overwritten, because a route is not editable — the stored copy is the same route,
 * and rewriting it would churn an id that rides reference.
 *
 * The reading is planRouteImport, which is pure and tested; this writes what it returns.
 * Nothing throws: a file chosen in a picker is untrusted input and the rider gets a
 * sentence either way. A file that will not parse writes nothing at all.
 */
export async function importRoutes(file: File): Promise<RouteImportResult> {
  if (file.size > MAX_ROUTE_IMPORT_BYTES) {
    const mb = Math.round(file.size / (1024 * 1024));
    return {
      status: 'failed',
      reason: `that file is ${String(mb)} MB, larger than Contour will read — is it a GPX?`,
    };
  }

  let text: string;
  try {
    text = await file.text();
  } catch (error) {
    return { status: 'failed', reason: errorMessage(error) };
  }

  await ready;
  let plan;
  try {
    plan = planRouteImport(text, file.name, await storedRouteKeys());
  } catch (error) {
    return { status: 'failed', reason: errorMessage(error) };
  }
  if (plan.status === 'failed') return plan;

  try {
    for (const route of plan.routes) {
      // updatedAt is stamped by the repository on write.
      await storage.routes.put({ id: createId(), updatedAt: '', ...route });
    }
  } catch (error) {
    return { status: 'failed', reason: errorMessage(error) };
  }

  return {
    status: 'done',
    imported: plan.routes.length,
    skippedExisting: plan.duplicates,
    skippedInvalid: plan.reasons.length,
    reasons: plan.reasons,
  };
}

/**
 * One workout's YAML, byte for byte as the rider wrote it.
 *
 * ADR-0014 is why there is nothing to build here: the record holds the source text, so
 * the download is that string. Re-emitting it through a serialiser would strip the
 * comments and layout the ADR exists to keep.
 */
export async function exportWorkoutYaml(workoutId: string): Promise<void> {
  await ready;
  const workout = await storage.workouts.get(workoutId);
  if (workout === undefined) {
    fault('That workout is no longer in the library, so there is nothing to download.');
    return;
  }
  download(new Blob([workout.source], { type: 'application/yaml' }), workoutFileName(workout.name));
}

/**
 * The whole library as one multi-document YAML file.
 *
 * In the order the list shows them, so the file reads the way the screen does rather than
 * in whatever order the repository happens to return.
 */
export async function exportAllWorkouts(): Promise<void> {
  await ready;
  const workouts = await storage.workouts.list();
  const ordered = [...workouts].sort((a, b) => a.name.localeCompare(b.name));
  download(
    new Blob([bundleWorkoutSources(ordered.map((workout) => workout.source))], {
      type: 'application/yaml',
    }),
    workoutBundleFileName(),
  );
}

/**
 * A YAML bundle is text a person can hand-edit, so it stays small. The ceiling is here to
 * make picking the wrong file say so rather than to express a view on library size.
 */
const MAX_WORKOUT_IMPORT_BYTES = 8 * 1024 * 1024;

/**
 * Imports a YAML bundle the rider picked off disk.
 *
 * Every document the rider does not already have becomes a new workout with a new id. The
 * file carries no ids to match on — it is a bundle of workouts, not an app archive — but
 * ADR-0014 makes the source text the record, so a document whose text is already in the
 * library is skipped and counted. Skipped rather than overwritten: nothing here can touch
 * a workout the rider has edited, which is the property worth having.
 *
 * A document that will not parse is counted and named rather than aborting the rest, the
 * way readArchive treats a bad record and bundledWorkouts a bad starter. Nothing throws:
 * a file chosen in a picker is untrusted input and the rider gets a sentence either way.
 */
export async function importWorkouts(file: File): Promise<WorkoutImportResult> {
  if (file.size > MAX_WORKOUT_IMPORT_BYTES) {
    const mb = Math.round(file.size / (1024 * 1024));
    return {
      status: 'failed',
      reason: `that file is ${String(mb)} MB, larger than Contour will read — is it a workout file?`,
    };
  }

  let text: string;
  try {
    text = await file.text();
  } catch (error) {
    return { status: 'failed', reason: errorMessage(error) };
  }

  await ready;
  let plan;
  try {
    const stored = await storage.workouts.list();
    plan = planWorkoutImport(
      splitWorkoutDocuments(text),
      stored.map((workout) => workout.source),
    );
  } catch (error) {
    return { status: 'failed', reason: errorMessage(error) };
  }

  let imported = 0;
  const reasons: string[] = [];

  for (const document of plan.documents) {
    // saveWorkout is the one path that writes a workout, and it parses on the way in to
    // fill the name and description. A document that will not parse fails there, which is
    // also what keeps an unreadable one out of the library.
    const result = await saveWorkout(createId(), document.source);
    if (result.status === 'saved') imported += 1;
    else reasons.push(`Document ${String(document.index)} was skipped because ${result.reason}`);
  }

  return {
    status: 'done',
    imported,
    skippedExisting: plan.duplicates,
    skippedInvalid: reasons.length,
    reasons,
  };
}
