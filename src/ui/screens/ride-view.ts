import type { ConnectionState } from '../../ble/types';
import type { RideState } from '../../ride/types';
import { lapLabel, lapNumber, lapStartM } from '../../route/loop';
import { ascentAt, type AscentSeries } from '../../route/profile';
import type { MapZoom } from '../charts/map';
import type { RideSnapshot } from '../store';
import {
  ladderFraction as hrFraction,
  targetBand as hrTargetBand,
  zoneForHeartRate,
} from '../../zones/hr';
import {
  ladderFraction as powerFraction,
  targetBand as powerTargetBand,
  zoneForPower,
} from '../../zones/power';

/**
 * Snapshot-to-ladder derivation for the ride screen. It lives here rather than in the
 * component because "which zone, where is the tick, where is the band" is arithmetic a
 * test should own, and because an absent reading has to stay absent rather than sink to
 * zone 1 — a rider who unclipped must not look like a rider soft-pedalling.
 */
export interface LadderView {
  zone: number;
  marker: number;
  target?: { from: number; to: number };
}

function usable(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

export function powerLadder(
  watts: number | null,
  ftpW: number,
  targetW: number | null,
  marginPct: number,
): LadderView | null {
  if (!usable(watts) || !usable(ftpW) || ftpW <= 0) return null;
  return {
    zone: zoneForPower(watts, ftpW),
    marker: powerFraction(watts, ftpW),
    ...(usable(targetW) && targetW > 0
      ? { target: powerTargetBand(targetW, ftpW, marginPct) }
      : {}),
  };
}

export function heartRateLadder(
  bpm: number | null,
  hrMaxBpm: number,
  targetBpm: number | null,
  marginPct: number,
): LadderView | null {
  if (!usable(bpm) || !usable(hrMaxBpm) || hrMaxBpm <= 0) return null;
  return {
    zone: zoneForHeartRate(bpm, hrMaxBpm),
    marker: hrFraction(bpm, hrMaxBpm),
    ...(usable(targetBpm) && targetBpm > 0
      ? { target: hrTargetBand(targetBpm, hrMaxBpm, marginPct) }
      : {}),
  };
}

/** The "108 % FTP" figure beside the power hero. Null keeps the slot empty. */
export function ftpSharePercent(watts: number | null, ftpW: number): number | null {
  if (!usable(watts) || !usable(ftpW) || ftpW <= 0) return null;
  return (watts / ftpW) * 100;
}

/**
 * design/DESIGN.md > Palette: a stale reading drops to muted as well as showing a dash,
 * so a fault is visible in the data and not only in the alert strip. Anything short of
 * connected is stale — a reconnecting trainer's last number is history, not a reading.
 */
export function readingTone(state: ConnectionState): 'ink' | 'muted' {
  return state === 'connected' ? 'ink' : 'muted';
}

/**
 * The ride screen's one accent control. Choosing a route arms the ride rather than
 * starting it, so a ride with nothing on its clock is started and one that has already
 * run is resumed. The clock decides, not the engine state: a ride paused at 0:00 because
 * the trainer dropped on the start line has still never been started.
 */
export function primaryControlLabel(
  state: RideState,
  elapsedS: number,
): 'Pause' | 'Resume' | 'Start' {
  if (state === 'running') return 'Pause';
  return elapsedS > 0 ? 'Resume' : 'Start';
}

/** Metres are the store's unit; every distance readout on the screen is kilometres. */
export function kilometres(metres: number | null): number | null {
  return usable(metres) ? metres / 1000 : null;
}

/**
 * The lap being ridden, as every reading of it: the word for it, where it started, and
 * how far through it the rider is in all three of the strip's units.
 *
 * One object rather than three derivations, because the ride screen asks for the same lap
 * four times over — the trend strips offset to its start, the secondary strip reads
 * against it, the times list names it, and the header tags it — and a second answer to
 * "which lap is this" is a screen disagreeing with itself about the ride.
 *
 * Null on a route that does not come back to its start. A point-to-point ride has one lap
 * and it is the whole thing, so there is nothing for a lap/ride pair to say.
 */
export interface LapProgress {
  /** `Loop` until the first is complete, `Lap 2` after: route/loop.ts owns the wording. */
  label: string;
  /** 1-based. The first metre of a ride is lap 1. */
  number: number;
  /** The route's length, which on a loop is a lap of it. */
  lengthM: number;
  /** Distance ridden at which this lap began, so a per-lap view can offset to it. */
  startM: number;
  /** Seconds into this lap. */
  elapsedS: number;
  /** Metres into it, which is the rider's position on the route. */
  distanceM: number;
  /** And metres climbed into it. */
  ascentM: number;
}

/**
 * The lap from a snapshot and the route's own ascent series.
 *
 * The clock comes from `lapStartS`, which is the crossing the ghost's gap already resets
 * on — one line, watched once. Clamped at nought because the boundary is recorded at the
 * tick's fractional second while `elapsedS` is published in whole ones, so for up to a
 * second after a crossing the subtraction can come out just below zero.
 *
 * The climb is the route's gain to the rider's position rather than a second accumulation
 * of the ride's. On a loop every lap climbs the same metres by construction — it is the
 * same geometry — and taking it from the route is what makes this lap's figure exact from
 * the first metre rather than needing a reading of the ride banked at the line.
 */
export function lapProgress(snapshot: RideSnapshot, ascent: AscentSeries): LapProgress | null {
  const lengthM = snapshot.routeTotalDistanceM;
  if (!snapshot.routeLoops || lengthM === null || !(lengthM > 0)) return null;
  return {
    label: lapLabel(snapshot.distanceM, lengthM),
    number: lapNumber(snapshot.distanceM, lengthM),
    lengthM,
    startM: lapStartM(snapshot.distanceM, lengthM),
    elapsedS: Math.max(0, snapshot.elapsedS - snapshot.lapStartS),
    distanceM: snapshot.routePositionM,
    ascentM: ascentAt(ascent, snapshot.routePositionM),
  };
}

/**
 * What the map column is showing. design/DESIGN.md > Screen rules, Ride times view: the
 * column swaps to the ranked list of times on this route, and the header icon shows the
 * view you would switch to rather than the one you are on.
 */
export type MapPanel = 'map' | 'times';

/** The profile's two views: the whole route, or the window around the rider. */
export type ProfileZoom = 'route' | 'window';

/**
 * The two zoom toggles, in one place because two arrangements now draw them: the desktop
 * row draws them as a Segmented and a phone as a single icon button that cycles. A label
 * written twice is a label that ends up disagreeing with the chart it names.
 */
export const PROFILE_ZOOMS = [
  { value: 'route', label: 'Route' },
  { value: 'window', label: '5 km' },
] as const satisfies readonly { value: ProfileZoom; label: string }[];

/** 5 km of ground, not of route: see NEAR_WINDOW_M in charts/map.ts. */
export const MAP_ZOOMS = [
  { value: 'route', label: 'Route' },
  { value: 'near', label: '5 km' },
] as const satisfies readonly { value: MapZoom; label: string }[];
