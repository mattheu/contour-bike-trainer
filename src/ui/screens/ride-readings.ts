import { distance, duration, elevation, num, percent } from '../format';
import type { RideSnapshot } from '../store';
import {
  ftpSharePercent,
  heartRateLadder,
  kilometres,
  powerLadder,
  readingTone,
  type LadderView,
} from './ride-view';

/**
 * Every number the ride screen shows, formatted once.
 *
 * The screen now draws one of several arrangements — desktop, and a phone's three — and
 * they differ in where a reading sits and how big it is, never in what it says. Deriving
 * it here is what keeps them layout: a second arrangement formatting its own distance is
 * how two rows of the same screen end up disagreeing about how far you have ridden.
 */

export interface Reading {
  label: string;
  /** Already formatted, dash included where the reading is absent. */
  value: string;
  unit?: string;
  /** The "/ 38.2" half of a distance or climbed reading. */
  total?: string;
  /** The meaning beside the figure: "108" of "108 % FTP", or "Z4". */
  figure?: string;
  figureUnit?: string;
  /** design/DESIGN.md > Palette: a stale reading is muted as well as dashed. */
  tone: 'ink' | 'muted';
  /** A handle for the integration tests. A Tailwind class is not a contract. */
  testId: string;
}

export interface RideReadings {
  power: Reading;
  cadence: Reading;
  heartRate: Reading;
  elapsed: Reading;
  distance: Reading;
  climbed: Reading;
  speed: Reading;
  gradient: Reading;
  /** Drawn where there is room for them: desktop and tablet, not a phone. */
  powerLadder: LadderView | null;
  heartRateLadder: LadderView | null;
}

export interface RideReadingsInput {
  snapshot: RideSnapshot;
  ftpW: number;
  hrMaxBpm: number;
  targetPowerW: number | null;
  targetHeartRateBpm: number | null;
  targetMarginPct: number;
}

export function rideReadings(input: RideReadingsInput): RideReadings {
  const { snapshot, ftpW, hrMaxBpm, targetPowerW, targetHeartRateBpm, targetMarginPct } = input;

  // The trainer's readings go stale together when it drops; heart rate follows the
  // strap, which can fail on its own. Speed is solved from power, so it is only as live
  // as the trainer that produced it.
  const trainer = readingTone(snapshot.trainerState);
  const heart = readingTone(snapshot.hrmState);

  // The hero, the ladder and the ladder's band all read the one smoothed figure the
  // store publishes, and so does the FTP share beside it: a hero and a ladder
  // disagreeing about the same instant is what the smoothing is for.
  const power = powerLadder(snapshot.displayPowerW, ftpW, targetPowerW, targetMarginPct);
  const heartRate = heartRateLadder(
    snapshot.heartRateBpm,
    hrMaxBpm,
    targetHeartRateBpm,
    targetMarginPct,
  );
  const share = ftpSharePercent(snapshot.displayPowerW, ftpW);

  return {
    power: {
      label: 'Power',
      value: num(snapshot.displayPowerW),
      unit: 'W',
      tone: trainer,
      testId: 'ride-power',
      ...(share === null ? {} : { figure: percent(share, 0), figureUnit: '% FTP' }),
    },
    cadence: {
      label: 'Cadence',
      value: num(snapshot.cadenceRpm),
      unit: 'rpm',
      tone: trainer,
      testId: 'ride-cadence',
    },
    heartRate: {
      label: 'Heart rate',
      value: num(snapshot.heartRateBpm),
      unit: 'bpm',
      tone: heart,
      testId: 'ride-heart-rate',
      ...(heartRate === null ? {} : { figure: `Z${String(heartRate.zone)}` }),
    },
    elapsed: {
      label: 'Elapsed',
      value: duration(snapshot.elapsedS),
      tone: 'ink',
      testId: 'ride-elapsed',
    },
    // Position on the route over the route's length, which on a loop is the lap's
    // progress rather than the ride's: "distance of total" has no meaning when the total
    // is however long you choose to keep going. The lap it belongs to is named once, in
    // the header.
    distance: {
      label: 'Distance',
      value: distance(kilometres(snapshot.routePositionM)),
      total: distance(kilometres(snapshot.routeTotalDistanceM)),
      unit: 'km',
      tone: 'ink',
      testId: 'ride-distance',
    },
    climbed: {
      label: 'Climbed',
      value: elevation(snapshot.ascentM),
      total: elevation(snapshot.routeTotalAscentM),
      unit: 'm',
      tone: 'ink',
      testId: 'ride-climbed',
    },
    speed: {
      label: 'Speed',
      value: distance(snapshot.speedKmh),
      unit: 'km/h',
      tone: trainer,
      testId: 'ride-speed',
    },
    gradient: {
      label: 'Gradient',
      value: percent(snapshot.gradePercent),
      unit: '%',
      tone: 'ink',
      testId: 'ride-gradient',
    },
    powerLadder: power,
    heartRateLadder: heartRate,
  };
}
