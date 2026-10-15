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
 * Samples to a TCX document. Element order follows the schema sequence rather than
 * convenience: TCX is validated on upload and a reordered Lap is rejected outright.
 */
export function buildTcx({ ride, samples }: TcxInput): string {
  const started = new Date(ride.startedAt);
  if (Number.isNaN(started.getTime())) {
    throw new Error(`Cannot export a TCX for an invalid start time: ${ride.startedAt}`);
  }
  const startMs = started.getTime();
  const startIso = started.toISOString();

  const speeds = samples.map((s) => s.speedKmh).filter((s): s is number => s !== null);
  const maximumSpeedMs = speeds.length > 0 ? Math.max(...speeds) / 3.6 : null;

  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    `<TrainingCenterDatabase xmlns="${TCX_NS}" xmlns:ns3="${ACTIVITY_EXTENSION_NS}" xmlns:xsi="${XSI_NS}">`,
  );
  lines.push('  <Activities>');
  lines.push('    <Activity Sport="Biking">');
  lines.push(`      <Id>${startIso}</Id>`);
  lines.push(`      <Lap StartTime="${startIso}">`);
  lines.push(`        <TotalTimeSeconds>${fixed(ride.elapsedS, 1)}</TotalTimeSeconds>`);
  lines.push(`        <DistanceMeters>${fixed(ride.distanceM, 1)}</DistanceMeters>`);
  if (maximumSpeedMs !== null) {
    lines.push(`        <MaximumSpeed>${fixed(maximumSpeedMs, 3)}</MaximumSpeed>`);
  }
  // Required by the schema and not measured: a made-up figure would be worse than nought.
  lines.push('        <Calories>0</Calories>');
  if (ride.avgHeartRateBpm !== null) {
    lines.push(
      `        <AverageHeartRateBpm><Value>${byte(ride.avgHeartRateBpm)}</Value></AverageHeartRateBpm>`,
    );
  }
  lines.push('        <Intensity>Active</Intensity>');
  lines.push('        <TriggerMethod>Manual</TriggerMethod>');
  lines.push('        <Track>');
  for (const sample of samples) lines.push(trackpoint(sample, startMs, '          '));
  lines.push('        </Track>');
  if (ride.avgPowerW !== null) {
    lines.push('        <Extensions>');
    lines.push('          <ns3:LX>');
    lines.push(`            <ns3:AvgWatts>${String(Math.round(ride.avgPowerW))}</ns3:AvgWatts>`);
    lines.push('          </ns3:LX>');
    lines.push('        </Extensions>');
  }
  lines.push('      </Lap>');
  if (ride.routeName !== null && ride.routeName !== '') {
    lines.push(`      <Notes>${escapeXml(ride.routeName)}</Notes>`);
  }
  lines.push('    </Activity>');
  lines.push('  </Activities>');
  lines.push('</TrainingCenterDatabase>');

  return `${lines.join('\n')}\n`;
}
