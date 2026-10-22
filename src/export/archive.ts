import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

import {
  DEFAULT_ERG_MODE,
  DEFAULT_WORKOUT_SCALE_PCT,
  isErgMode,
  type ErgMode,
  type Ride,
  type RideSample,
  type RideSettings,
} from '../storage/types';
import { buildTcx, tcxFileName } from './tcx';

/**
 * The backup archive: one ZIP doing two jobs.
 *
 * TCX is what a human or Strava reads, but it cannot round-trip a Contour ride — there is
 * nowhere in the schema to put routeId, the frozen settings snapshot or pausedS. So the
 * same ride goes in twice: a TCX per ride under rides/ for anything else to read, and one
 * JSON manifest that import restores from, which makes a round-trip exact rather than
 * approximate.
 *
 *   contour-rides-YYYY-MM-DD.zip
 *     rides/<ride filename>.tcx
 *     contour-rides.json
 *
 * Everything below readArchive treats its input as hostile: the file came off a disk, and
 * may be truncated, corrupt, from a later version, or simply not ours.
 */

export const ARCHIVE_VERSION = 1;
export const MANIFEST_NAME = 'contour-rides.json';
const TCX_DIRECTORY = 'rides/';

export interface ArchiveRecord {
  ride: Ride;
  samples: RideSample[];
}

export interface Manifest {
  version: number;
  exportedAt: string;
  rides: ArchiveRecord[];
}

export type ArchiveReadResult =
  | {
      ok: true;
      records: ArchiveRecord[];
      /** Records that failed validation and were left out. */
      skipped: number;
      /** One line per skipped record, in the order they appeared. */
      reasons: string[];
    }
  | { ok: false; reason: string };

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** contour-rides-YYYY-MM-DD.zip, dated in local time like the single-ride export. */
export function archiveFileName(at: Date = new Date()): string {
  return `contour-rides-${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}.zip`;
}

/**
 * Two rides started in the same minute would otherwise overwrite each other inside the
 * ZIP, because the single-ride name only resolves to the minute.
 */
function uniqueName(taken: Set<string>, name: string): string {
  if (!taken.has(name)) {
    taken.add(name);
    return name;
  }
  const dot = name.lastIndexOf('.');
  const stem = dot === -1 ? name : name.slice(0, dot);
  const extension = dot === -1 ? '' : name.slice(dot);
  for (let n = 2; ; n++) {
    const candidate = `${stem}-${n}${extension}`;
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
  }
}

/** The ZIP's bytes, over a plain ArrayBuffer so they can go straight into a Blob. */
export function buildArchive(
  records: readonly ArchiveRecord[],
  exportedAt: Date = new Date(),
): Uint8Array<ArrayBuffer> {
  const files: Record<string, Uint8Array> = {};
  const taken = new Set<string>();

  for (const record of records) {
    // A ride with an unusable start time still belongs in the manifest, which is what
    // import reads; only its human-readable copy is dropped.
    try {
      const name = uniqueName(taken, tcxFileName(record.ride.startedAt));
      files[`${TCX_DIRECTORY}${name}`] = strToU8(buildTcx(record));
    } catch {
      continue;
    }
  }

  const manifest: Manifest = {
    version: ARCHIVE_VERSION,
    exportedAt: exportedAt.toISOString(),
    rides: records.map(({ ride, samples }) => ({ ride, samples: [...samples] })),
  };
  files[MANIFEST_NAME] = strToU8(JSON.stringify(manifest));

  return zipSync(files);
}

// --- validation ---------------------------------------------------------------

type Shape = Record<string, unknown>;

function isShape(value: unknown): value is Shape {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function finiteOrNull(value: unknown): value is number | null {
  return value === null || finite(value);
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

function textOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

const SAMPLE_NUMBERS = ['t', 'distanceM'] as const;
const SAMPLE_OPTIONALS = [
  'speedKmh',
  'powerW',
  'cadenceRpm',
  'heartRateBpm',
  'lat',
  'lon',
  'eleM',
] as const;
const SETTINGS_NUMBERS = [
  'trainerDifficulty',
  'ftp',
  'hrMax',
  'riderMassKg',
  'bikeMassKg',
] as const;
const RIDE_NUMBERS = ['elapsedS', 'pausedS', 'distanceM', 'ascentM'] as const;

/** The reason, or null when the value is a usable sample. */
function sampleProblem(value: unknown): string | null {
  if (!isShape(value)) return 'a sample is not an object';
  for (const key of SAMPLE_NUMBERS) {
    if (!finite(value[key])) return `a sample has no usable ${key}`;
  }
  for (const key of SAMPLE_OPTIONALS) {
    if (!finiteOrNull(value[key])) return `a sample has an unusable ${key}`;
  }
  return null;
}

/**
 * A field added after the archive format was first written. The manifest carries a
 * version, so an absent value means the file predates the field — older, not broken —
 * and it defaults. A value of the wrong type is a corrupt record and still skips it.
 * Every field added from here should follow this rule rather than rediscover it.
 */
function absentOr(value: unknown, usable: (v: unknown) => boolean): boolean {
  return value === undefined || usable(value);
}

function settingsProblem(value: unknown): string | null {
  if (!isShape(value)) return 'its settings are missing';
  for (const key of SETTINGS_NUMBERS) {
    if (!finite(value[key])) return `its settings have no usable ${key}`;
  }
  if (!absentOr(value.workoutScalePct, finite)) {
    return 'its settings have no usable workoutScalePct';
  }
  if (!absentOr(value.ergMode, isErgMode)) return 'its settings have no usable ergMode';
  return null;
}

function rideProblem(value: unknown): string | null {
  if (!isShape(value)) return 'it is not a ride';
  if (!text(value.id)) return 'it has no id';
  if (!text(value.startedAt) || Number.isNaN(new Date(value.startedAt).getTime())) {
    return 'its start time is unreadable';
  }
  if (typeof value.updatedAt !== 'string') return 'it has no updatedAt';
  if (!textOrNull(value.routeId)) return 'its routeId is neither text nor null';
  if (!textOrNull(value.routeName)) return 'its routeName is neither text nor null';
  if (!absentOr(value.workoutId, textOrNull)) return 'its workoutId is neither text nor null';
  if (!absentOr(value.workoutName, textOrNull)) {
    return 'its workoutName is neither text nor null';
  }
  for (const key of RIDE_NUMBERS) {
    if (!finite(value[key])) return `it has no usable ${key}`;
  }
  if (!finiteOrNull(value.avgPowerW)) return 'its avgPowerW is unusable';
  if (!finiteOrNull(value.avgHeartRateBpm)) return 'its avgHeartRateBpm is unusable';
  return settingsProblem(value.settings);
}

/**
 * One record in, one record or one reason out. Validated field by field rather than
 * cast: a Ride missing its settings would otherwise reach storage and break every screen
 * that reads the frozen FTP, long after the import that let it in.
 */
export function validateRecord(value: unknown): { record: ArchiveRecord } | { reason: string } {
  if (!isShape(value)) return { reason: 'the record is not an object' };

  const problem = rideProblem(value.ride);
  if (problem !== null) return { reason: problem };
  if (!Array.isArray(value.samples)) return { reason: 'its samples are missing' };

  for (const sample of value.samples) {
    const bad = sampleProblem(sample);
    if (bad !== null) return { reason: bad };
  }

  // Narrowed by the checks above; the shape is now known good.
  const ride = value.ride as Shape;
  const settings = ride.settings as Shape;

  return {
    record: {
      ride: {
        id: ride.id as string,
        updatedAt: ride.updatedAt as string,
        routeId: ride.routeId as string | null,
        routeName: ride.routeName as string | null,
        // Absent in an archive written before the field existed: no workout, which is
        // what such a ride was.
        workoutId: (ride.workoutId ?? null) as string | null,
        workoutName: (ride.workoutName ?? null) as string | null,
        startedAt: ride.startedAt as string,
        elapsedS: ride.elapsedS as number,
        pausedS: ride.pausedS as number,
        distanceM: ride.distanceM as number,
        ascentM: ride.ascentM as number,
        avgPowerW: ride.avgPowerW as number | null,
        avgHeartRateBpm: ride.avgHeartRateBpm as number | null,
        // An archive written while Ride carried a `finished` flag has one here. It is
        // read by nothing now, so it is dropped rather than migrated: the record is
        // rebuilt field by field, which is what lets an older file in without a check.
        settings: {
          trainerDifficulty: settings.trainerDifficulty as number,
          // Likewise: a ride recorded before the scale existed was ridden at full targets.
          workoutScalePct: (settings.workoutScalePct ?? DEFAULT_WORKOUT_SCALE_PCT) as number,
          // And one recorded before ERG could be turned off was ridden with it on.
          ergMode: (settings.ergMode ?? DEFAULT_ERG_MODE) as ErgMode,
          ftp: settings.ftp as number,
          hrMax: settings.hrMax as number,
          riderMassKg: settings.riderMassKg as number,
          bikeMassKg: settings.bikeMassKg as number,
        } satisfies RideSettings,
      } satisfies Ride,
      samples: (value.samples as Shape[]).map((sample) => ({
        t: sample.t as number,
        distanceM: sample.distanceM as number,
        speedKmh: sample.speedKmh as number | null,
        powerW: sample.powerW as number | null,
        cadenceRpm: sample.cadenceRpm as number | null,
        heartRateBpm: sample.heartRateBpm as number | null,
        lat: sample.lat as number | null,
        lon: sample.lon as number | null,
        eleM: sample.eleM as number | null,
      })),
    },
  };
}

/**
 * Reads an archive back. A bad record is skipped and counted rather than aborting the
 * import: one unreadable ride in a backup of two hundred must not cost the other 199.
 * Only a file that cannot be opened at all, or that holds no Contour data, fails outright.
 */
export function readArchive(bytes: Uint8Array): ArchiveReadResult {
  let manifestBytes: Uint8Array | undefined;
  try {
    manifestBytes = unzipSync(bytes)[MANIFEST_NAME];
  } catch {
    return { ok: false, reason: 'it is not a readable ZIP file' };
  }
  if (manifestBytes === undefined) {
    return { ok: false, reason: `it holds no Contour data (no ${MANIFEST_NAME})` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(strFromU8(manifestBytes));
  } catch {
    return { ok: false, reason: `its ${MANIFEST_NAME} is not valid JSON` };
  }

  if (!isShape(parsed)) return { ok: false, reason: `its ${MANIFEST_NAME} is not an object` };
  if (parsed.version !== ARCHIVE_VERSION) {
    return {
      ok: false,
      reason: `it was written in format ${JSON.stringify(parsed.version)}, and this version of Contour reads format ${ARCHIVE_VERSION}`,
    };
  }
  if (!Array.isArray(parsed.rides)) return { ok: false, reason: 'it lists no rides' };

  const records: ArchiveRecord[] = [];
  const reasons: string[] = [];
  parsed.rides.forEach((entry, index) => {
    const result = validateRecord(entry);
    if ('record' in result) records.push(result.record);
    else reasons.push(`Ride ${index + 1} was skipped because ${result.reason}.`);
  });

  return { ok: true, records, skipped: reasons.length, reasons };
}
