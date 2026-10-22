import type { RideSample } from '../../storage/types';
import type { Route, RoutePoint } from '../../route/types';
import { INITIAL_SNAPSHOT, type RideSnapshot } from '../store';
import type { DevicesView, Targets } from './RideSettings';

/**
 * The ride the How it works previews are drawn from.
 *
 * Invented rather than loaded. A preview that fetched a bundled route would make an
 * onboarding screen wait on storage, and a rider who has not signed in has no rides to
 * show anyway — so this is a plausible climb with no I/O behind it, built once at module
 * load and shared by both previews.
 *
 * Everything here is deterministic: no clock, no RNG. Two previews drawn from the same
 * numbers is the point, and a screenshot of this screen should not change between runs.
 */

/** Ditchling Beacon, which is the route the mockups name. Only the map ever reads it. */
const ORIGIN = { lat: 50.8862, lon: -0.1106 };
const DEG_PER_M_LAT = 1 / 111320;

const POINT_COUNT = 320;
/** Long enough to look like a route at 360 px wide, short enough to project cheaply. */
const GROUND_LENGTH_M = 8200;

function toLatLon(eastM: number, northM: number): { lat: number; lon: number } {
  return {
    lat: ORIGIN.lat + northM * DEG_PER_M_LAT,
    lon: ORIGIN.lon + (eastM * DEG_PER_M_LAT) / Math.cos(ORIGIN.lat * (Math.PI / 180)),
  };
}

/**
 * A shallow S of ground track under a rolling climb, with distM accumulated from the
 * track itself rather than assumed — the profile and the map have to agree about how far
 * along the rider is, and the one way to guarantee that is to measure one from the other.
 */
function buildDemoRoute(): Route {
  const points: RoutePoint[] = [];
  let distM = 0;
  let ascentM = 0;
  let previous: { eastM: number; northM: number; eleM: number } | null = null;

  for (let i = 0; i < POINT_COUNT; i += 1) {
    const u = i / (POINT_COUNT - 1);
    const eastM = u * GROUND_LENGTH_M * 0.82;
    const northM = Math.sin(u * Math.PI * 1.7) * 1100;
    // A rolling first third that steepens into the climb, which is the shape the gradient
    // bands and the summit tick exist to draw.
    const eleM = 62 + 240 * u ** 1.7 + 11 * Math.sin(u * Math.PI * 7);

    if (previous !== null) {
      distM += Math.hypot(eastM - previous.eastM, northM - previous.northM);
      ascentM += Math.max(0, eleM - previous.eleM);
    }
    points.push({ ...toLatLon(eastM, northM), eleM, distM });
    previous = { eastM, northM, eleM };
  }

  return {
    points,
    totalDistanceM: points[points.length - 1]?.distM ?? 0,
    totalAscentM: ascentM,
  };
}

export const DEMO_ROUTE: Route = buildDemoRoute();

/** Two thirds in: far enough that the ridden hatch and the power strip have a story. */
const RIDDEN_FRACTION = 0.64;
const DEMO_DISTANCE_M = DEMO_ROUTE.totalDistanceM * RIDDEN_FRACTION;
const DEMO_ELAPSED_S = 1452;

/**
 * The strip's own 1 Hz series, thinned to one sample every ten seconds. The strip reads
 * shape rather than values, and 1452 samples is 1452 objects an onboarding screen has no
 * use for.
 */
function buildDemoSamples(): RideSample[] {
  const samples: RideSample[] = [];
  for (let t = 0; t <= DEMO_ELAPSED_S; t += 10) {
    const u = t / DEMO_ELAPSED_S;
    samples.push({
      t,
      distanceM: DEMO_DISTANCE_M * u,
      speedKmh: null,
      // Steady tempo with the surges the gradient asks for, so the zone washes differ.
      powerW: Math.round(236 + 54 * Math.sin(u * Math.PI * 5) + 26 * Math.sin(u * Math.PI * 17)),
      cadenceRpm: null,
      heartRateBpm: null,
      lat: null,
      lon: null,
      eleM: null,
    });
  }
  return samples;
}

/** The readings in the mockup, on a trainer and a strap that are both connected. */
export const DEMO_SNAPSHOT: RideSnapshot = {
  ...INITIAL_SNAPSHOT,
  trainerState: 'connected',
  hrmState: 'connected',
  trainerDeviceName: 'KICKR CORE 1A2B',
  powerW: 291,
  displayPowerW: 287,
  cadenceRpm: 91,
  heartRateBpm: 158,
  speedKmh: 31.4,
  state: 'running',
  elapsedS: DEMO_ELAPSED_S,
  distanceM: DEMO_DISTANCE_M,
  ascentM: Math.round(DEMO_ROUTE.totalAscentM * RIDDEN_FRACTION),
  gradePercent: 6.4,
  avgPowerW: 241,
  routeName: 'Ditchling Beacon Loop',
  routeGeometry: DEMO_ROUTE,
  routeTotalDistanceM: DEMO_ROUTE.totalDistanceM,
  routeTotalAscentM: DEMO_ROUTE.totalAscentM,
  samples: buildDemoSamples(),
};

export const DEMO_FTP_W = 240;
export const DEMO_HR_MAX_BPM = 186;
export const DEMO_TARGET_MARGIN_PCT = 5;
export const DEMO_TARGETS: Targets = { powerW: null, cadenceRpm: null, heartRateBpm: null };

/** Nothing in a preview can be pressed, so every handler here is the same nothing. */
const noop = (): void => undefined;

/**
 * The same ride before anything is paired, which is the state the Connect preview is a
 * picture of. Its own snapshot rather than the one above with the panel laid over it: a
 * screen reading 287 W behind a panel saying "Not connected" is a state the app cannot be
 * in, and a preview that shows one teaches the wrong thing before the rider has started.
 */
export const DEMO_UNPAIRED_SNAPSHOT: RideSnapshot = {
  ...DEMO_SNAPSHOT,
  trainerState: 'disconnected',
  hrmState: 'disconnected',
  trainerDeviceName: null,
  powerW: null,
  displayPowerW: null,
  cadenceRpm: null,
  heartRateBpm: null,
  speedKmh: null,
  state: 'idle',
  elapsedS: 0,
  distanceM: 0,
  ascentM: 0,
  gradePercent: null,
  avgPowerW: null,
  samples: [],
};

/**
 * The devices section as the rider meets it on step 2: nothing paired yet, which is what
 * the sentences beside this preview describe.
 */
export const DEMO_DEVICES: DevicesView = {
  source: 'Bluetooth',
  trainerState: 'disconnected',
  trainerDeviceName: null,
  trainerServices: [],
  powerW: null,
  hrmState: 'disconnected',
  heartRateBpm: null,
  onConnectTrainer: noop,
  onDisconnectTrainer: noop,
  onConnectHrm: noop,
  onDisconnectHrm: noop,
};

export const DEMO_RIDE_HANDLERS = {
  onTargetsChange: noop,
  onPauseToggle: noop,
  onEnd: noop,
  onDifficultyChange: noop,
  onDismissAlert: noop,
  onRetryTrainer: noop,
  onConnectTrainer: noop,
  onDisconnectTrainer: noop,
  onConnectHrm: noop,
  onDisconnectHrm: noop,
};
