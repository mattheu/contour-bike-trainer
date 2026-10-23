import type { RideSample } from '../storage/types';

/**
 * The subset of a Ride the exporter needs. Structural, so a stored Ride satisfies it
 * without export/ having to know what else a Ride carries.
 */
export interface TcxRide {
  startedAt: string; // ISO 8601
  routeName: string | null;
  elapsedS: number;
  distanceM: number;
  avgPowerW: number | null;
  avgHeartRateBpm: number | null;
  /**
   * Where the completed laps ended, in ride seconds. Optional because a ride recorded
   * before the record carried them has none, and because a ride that never completed a
   * route length correctly has none either — both export as the single lap this file
   * has always written.
   */
  lapSplits?: readonly number[];
}

export interface TcxInput {
  ride: TcxRide;
  samples: readonly RideSample[];
}

const TCX_NS = 'http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2';
const ACTIVITY_EXTENSION_NS = 'http://www.garmin.com/xmlschemas/ActivityExtension/v2';
const XSI_NS = 'http://www.w3.org/2001/XMLSchema-instance';

/** TCX Cadence and heart rate Values are unsignedByte; out-of-range makes the file invalid. */
const MAX_BYTE = 254;

/**
 * A route name reaches the file as text. Without this an ampersand in "Fred & Wilma's"
 * produces a document Strava rejects with no useful message.
 */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function fixed(value: number, digits: number): string {
  return value.toFixed(digits);
}

function byte(value: number): string {
  return String(Math.min(MAX_BYTE, Math.max(0, Math.round(value))));
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * contour-YYYY-MM-DD-HHmm.tcx in the rider's own local time, because that is the clock
 * they rode by and the one they will look for the file under.
 */
export function tcxFileName(startedAt: string | Date): string {
  const at = startedAt instanceof Date ? startedAt : new Date(startedAt);
  if (Number.isNaN(at.getTime())) {
    throw new Error(`Cannot name a TCX file from an invalid date: ${String(startedAt)}`);
  }
  const date = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
  const time = `${pad(at.getHours())}${pad(at.getMinutes())}`;
  return `contour-${date}-${time}.tcx`;
}

function trackpoint(sample: RideSample, startMs: number, indent: string): string {
  const lines: string[] = [];
  lines.push(`${indent}<Trackpoint>`);
  lines.push(`${indent}  <Time>${new Date(startMs + sample.t * 1000).toISOString()}</Time>`);

  // Absent is omitted, never written as zero: a dropped GPS point and the equator are
  // not the same claim, and nor are a silent power meter and a coasting rider.
  if (sample.lat !== null && sample.lon !== null) {
    lines.push(`${indent}  <Position>`);
    lines.push(`${indent}    <LatitudeDegrees>${fixed(sample.lat, 7)}</LatitudeDegrees>`);
    lines.push(`${indent}    <LongitudeDegrees>${fixed(sample.lon, 7)}</LongitudeDegrees>`);
    lines.push(`${indent}  </Position>`);
  }
  if (sample.eleM !== null) {
    lines.push(`${indent}  <AltitudeMeters>${fixed(sample.eleM, 1)}</AltitudeMeters>`);
  }
  lines.push(`${indent}  <DistanceMeters>${fixed(sample.distanceM, 1)}</DistanceMeters>`);
  if (sample.heartRateBpm !== null) {
    lines.push(
      `${indent}  <HeartRateBpm><Value>${byte(sample.heartRateBpm)}</Value></HeartRateBpm>`,
    );
  }
  if (sample.cadenceRpm !== null) {
    lines.push(`${indent}  <Cadence>${byte(sample.cadenceRpm)}</Cadence>`);
  }
  if (sample.powerW !== null) {
    lines.push(`${indent}  <Extensions>`);
    lines.push(`${indent}    <ns3:TPX>`);
    lines.push(`${indent}      <ns3:Watts>${String(Math.round(sample.powerW))}</ns3:Watts>`);
    lines.push(`${indent}    </ns3:TPX>`);
    lines.push(`${indent}  </Extensions>`);
  }
  lines.push(`${indent}</Trackpoint>`);
  return lines.join('\n');
}

/**
 * One lap of the exported activity: the window of ride time it covers, the trackpoints
 * inside it and the figures that describe it.
 */
interface TcxLap {
  /** Ride seconds at which the lap began, which is what StartTime is stamped from. */
  startS: number;
  totalTimeS: number;
  distanceM: number;
  /** `Distance` for a lap the route's own length ended, `Manual` for one the rider did. */
  trigger: 'Distance' | 'Manual';
  samples: readonly RideSample[];
  avgPowerW: number | null;
  avgHeartRateBpm: number | null;
}

function average(values: readonly (number | null)[]): number | null {
  const known = values.filter((value): value is number => value !== null);
  if (known.length === 0) return null;
  return known.reduce((sum, value) => sum + value, 0) / known.length;
}

/**
 * How far the rider had gone at a given second, interpolated between the samples either
 * side of it rather than snapped to one — the same arithmetic that found the crossing in
 * the first place, so a lap's distance comes back out as the route's own length.
 */
function distanceAtS(samples: readonly RideSample[], tS: number): number {
  let previous: RideSample | undefined;
  for (const sample of samples) {
    if (sample.t >= tS) {
      if (previous === undefined) return sample.distanceM;
      const span = sample.t - previous.t;
      if (span <= 0) return sample.distanceM;
      const fraction = (tS - previous.t) / span;
      return previous.distanceM + fraction * (sample.distanceM - previous.distanceM);
    }
    previous = sample;
  }
  return previous?.distanceM ?? 0;
}

/**
 * The ride cut into the laps the file will carry, from the splits already on the record
 * rather than from a second reading of the samples — so the file and the history cannot
 * disagree about where a lap ended.
 *
 * A ride with no splits is one lap covering the whole ride, which is what this exporter
 * has always written and the right answer for a ride that never completed a length. Its
 * figures are the record's own, because the record is the ride's own summary; a lap has
 * no record, so a lap's figures come from its trackpoints.
 *
 * Anything ridden after the last crossing becomes a closing `Manual` lap. Dropping those
 * trackpoints would make the file say the rider stopped on the line, which they did not.
 */
function lapsOf(ride: TcxRide, samples: readonly RideSample[]): TcxLap[] {
  const splits = ride.lapSplits ?? [];
  const laps: TcxLap[] = [];

  let index = 0;
  const upTo = (endS: number | null): readonly RideSample[] => {
    const taken: RideSample[] = [];
    while (index < samples.length) {
      const sample = samples[index];
      if (sample === undefined || (endS !== null && sample.t > endS)) break;
      taken.push(sample);
      index += 1;
    }
    return taken;
  };

  let startS = 0;
  let startM = 0;
  for (const split of splits) {
    const endS = startS + split;
    const endM = distanceAtS(samples, endS);
    const lapSamples = upTo(endS);
    laps.push({
      startS,
      totalTimeS: split,
      distanceM: Math.max(0, endM - startM),
      trigger: 'Distance',
      samples: lapSamples,
      avgPowerW: average(lapSamples.map((s) => s.powerW)),
      avgHeartRateBpm: average(lapSamples.map((s) => s.heartRateBpm)),
    });
    startS = endS;
    startM = endM;
  }

  const rest = upTo(null);
  if (laps.length === 0) {
    laps.push({
      startS: 0,
      totalTimeS: ride.elapsedS,
      distanceM: ride.distanceM,
      trigger: 'Manual',
      samples: rest,
      avgPowerW: ride.avgPowerW,
      avgHeartRateBpm: ride.avgHeartRateBpm,
    });
  } else if (rest.length > 0) {
    laps.push({
      startS,
      totalTimeS: Math.max(0, ride.elapsedS - startS),
      distanceM: Math.max(0, ride.distanceM - startM),
      trigger: 'Manual',
      samples: rest,
      avgPowerW: average(rest.map((s) => s.powerW)),
      avgHeartRateBpm: average(rest.map((s) => s.heartRateBpm)),
    });
  }

  return laps;
}

/** Element order follows the schema sequence: a reordered Lap is rejected on upload. */
function lapXml(lap: TcxLap, startMs: number): string[] {
  const speeds = lap.samples.map((s) => s.speedKmh).filter((s): s is number => s !== null);
  const maximumSpeedMs = speeds.length > 0 ? Math.max(...speeds) / 3.6 : null;

  const lines: string[] = [];
  lines.push(`      <Lap StartTime="${new Date(startMs + lap.startS * 1000).toISOString()}">`);
  lines.push(`        <TotalTimeSeconds>${fixed(lap.totalTimeS, 1)}</TotalTimeSeconds>`);
  lines.push(`        <DistanceMeters>${fixed(lap.distanceM, 1)}</DistanceMeters>`);
  if (maximumSpeedMs !== null) {
    lines.push(`        <MaximumSpeed>${fixed(maximumSpeedMs, 3)}</MaximumSpeed>`);
  }
  // Required by the schema and not measured: a made-up figure would be worse than nought.
  lines.push('        <Calories>0</Calories>');
  if (lap.avgHeartRateBpm !== null) {
    lines.push(
      `        <AverageHeartRateBpm><Value>${byte(lap.avgHeartRateBpm)}</Value></AverageHeartRateBpm>`,
    );
  }
  lines.push('        <Intensity>Active</Intensity>');
  lines.push(`        <TriggerMethod>${lap.trigger}</TriggerMethod>`);
  lines.push('        <Track>');
  for (const sample of lap.samples) lines.push(trackpoint(sample, startMs, '          '));
  lines.push('        </Track>');
  if (lap.avgPowerW !== null) {
    lines.push('        <Extensions>');
    lines.push('          <ns3:LX>');
    lines.push(`            <ns3:AvgWatts>${String(Math.round(lap.avgPowerW))}</ns3:AvgWatts>`);
    lines.push('          </ns3:LX>');
    lines.push('        </Extensions>');
  }
  lines.push('      </Lap>');
  return lines;
}

/**
 * Samples to a TCX document. Element order follows the schema sequence rather than
 * convenience: TCX is validated on upload and a reordered Lap is rejected outright.
 *
 * One Lap per completed lap of the route, which is how Strava draws splits. Before this
 * every ride was a single Manual lap, so a ten-lap loop arrived as one long effort with
 * the ten times it was actually ridden in nowhere at all.
 */
export function buildTcx({ ride, samples }: TcxInput): string {
  const started = new Date(ride.startedAt);
  if (Number.isNaN(started.getTime())) {
    throw new Error(`Cannot export a TCX for an invalid start time: ${ride.startedAt}`);
  }
  const startMs = started.getTime();
  const startIso = started.toISOString();

  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    `<TrainingCenterDatabase xmlns="${TCX_NS}" xmlns:ns3="${ACTIVITY_EXTENSION_NS}" xmlns:xsi="${XSI_NS}">`,
  );
  lines.push('  <Activities>');
  lines.push('    <Activity Sport="Biking">');
  lines.push(`      <Id>${startIso}</Id>`);
  for (const lap of lapsOf(ride, samples)) lines.push(...lapXml(lap, startMs));
  if (ride.routeName !== null && ride.routeName !== '') {
    lines.push(`      <Notes>${escapeXml(ride.routeName)}</Notes>`);
  }
  lines.push('    </Activity>');
  lines.push('  </Activities>');
  lines.push('</TrainingCenterDatabase>');

  return `${lines.join('\n')}\n`;
}
