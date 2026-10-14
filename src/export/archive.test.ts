import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import type { Ride, RideSample } from '../storage/types';
import {
  ARCHIVE_VERSION,
  MANIFEST_NAME,
  archiveFileName,
  buildArchive,
  readArchive,
  validateRecord,
  type ArchiveRecord,
} from './archive';
import { buildTcx } from './tcx';

function ride(overrides: Partial<Ride> = {}): Ride {
  return {
    id: 'ride-1',
    updatedAt: '2026-09-30T07:10:00.000Z',
    routeId: 'route-7',
    routeName: 'Test Route 2 — Mixed',
    workoutId: null,
    workoutName: null,
    // Local parts, so the TCX file name is the same in any timezone.
    startedAt: new Date(2026, 8, 30, 7, 5).toISOString(),
    elapsedS: 120,
    pausedS: 15,
    distanceM: 1600,
    ascentM: 42,
    avgPowerW: 216.5,
    avgHeartRateBpm: 142.4,
    finished: true,
    settings: {
      trainerDifficulty: 50,
      workoutScalePct: 100,
      ergMode: 'erg',
      ftp: 265,
      hrMax: 190,
      riderMassKg: 75,
      bikeMassKg: 9,
    },
    ...overrides,
  };
}

function sample(overrides: Partial<RideSample> = {}): RideSample {
  return {
    t: 1,
    distanceM: 8,
    speedKmh: 29,
    powerW: 200,
    cadenceRpm: 88,
    heartRateBpm: 139,
    lat: 51.5,
    lon: -1.5,
    eleM: 100,
    ...overrides,
  };
}

function record(overrides: Partial<Ride> = {}): ArchiveRecord {
  return { ride: ride(overrides), samples: [sample({ t: 0 }), sample({ t: 1 })] };
}

function entries(bytes: Uint8Array): Record<string, Uint8Array> {
  return unzipSync(bytes);
}

function manifestOf(bytes: Uint8Array): Record<string, unknown> {
  const raw = entries(bytes)[MANIFEST_NAME];
  if (raw === undefined) throw new Error('no manifest');
  return JSON.parse(strFromU8(raw)) as Record<string, unknown>;
}

/** A manifest built by hand, which is how every corrupt file in the wild arrives. */
function archiveOf(manifest: unknown, name: string = MANIFEST_NAME): Uint8Array {
  return zipSync({ [name]: strToU8(JSON.stringify(manifest)) });
}

function withRides(rides: unknown[]): Uint8Array {
  return archiveOf({ version: ARCHIVE_VERSION, exportedAt: '2026-10-13T00:00:00.000Z', rides });
}

describe('archiveFileName', () => {
  it('names the file contour-rides-YYYY-MM-DD.zip in local time', () => {
    expect(archiveFileName(new Date(2026, 9, 13, 23, 30))).toBe('contour-rides-2026-10-13.zip');
    expect(archiveFileName(new Date(2026, 0, 2, 0, 5))).toBe('contour-rides-2026-01-02.zip');
  });
});

describe('buildArchive', () => {
  it('writes one TCX per ride under rides/ beside the manifest', () => {
    const names = Object.keys(entries(buildArchive([record()]))).sort();
    expect(names).toEqual([MANIFEST_NAME, 'rides/contour-2026-09-30-0705.tcx']);
  });

  it('names the TCX files exactly as the single-ride export does', () => {
    const one = record();
    const files = entries(buildArchive([one]));
    const tcx = files['rides/contour-2026-09-30-0705.tcx'];
    expect(tcx).toBeDefined();
    expect(strFromU8(tcx!)).toBe(buildTcx(one));
  });

  it('de-duplicates two rides that started in the same minute', () => {
    const bytes = buildArchive([
      record({ id: 'a' }),
      record({ id: 'b' }),
      record({ id: 'c' }),
      record({ id: 'd', startedAt: new Date(2026, 8, 30, 8, 0).toISOString() }),
    ]);
    expect(Object.keys(entries(bytes)).sort()).toEqual([
      MANIFEST_NAME,
      'rides/contour-2026-09-30-0705-2.tcx',
      'rides/contour-2026-09-30-0705-3.tcx',
      'rides/contour-2026-09-30-0705.tcx',
      'rides/contour-2026-09-30-0800.tcx',
    ]);
  });

  it('stamps the version and the export time', () => {
    const manifest = manifestOf(buildArchive([record()], new Date('2026-10-13T09:00:00.000Z')));
    expect(manifest.version).toBe(ARCHIVE_VERSION);
    expect(manifest.exportedAt).toBe('2026-10-13T09:00:00.000Z');
  });

  it('keeps a ride the TCX writer cannot name in the manifest, which is what import reads', () => {
    const bytes = buildArchive([record({ startedAt: 'not a date' })]);
    expect(Object.keys(entries(bytes))).toEqual([MANIFEST_NAME]);
    expect((manifestOf(bytes).rides as unknown[]).length).toBe(1);
  });

  it('writes an archive for an empty history rather than failing', () => {
    expect(manifestOf(buildArchive([])).rides).toEqual([]);
  });
});

describe('round trip', () => {
  it('restores rides and samples exactly, including what TCX cannot carry', () => {
    const records = [
      record({ id: 'a' }),
      { ride: ride({ id: 'b', routeId: null, routeName: null, pausedS: 311 }), samples: [] },
    ];
    const result = readArchive(buildArchive(records));

    expect(result).toMatchObject({ ok: true, skipped: 0, reasons: [] });
    if (!result.ok) throw new Error('unreachable');
    expect(result.records).toEqual(records);
    // The three fields the TCX schema has nowhere to put.
    expect(result.records[1]!.ride.routeId).toBeNull();
    expect(result.records[1]!.ride.pausedS).toBe(311);
    expect(result.records[0]!.ride.settings).toEqual(records[0]!.ride.settings);
  });

  it('restores which workout a ride was, and the scale it was ridden at', () => {
    // Rebuilt field by field on the way in, so a field the rebuild forgets comes back
    // looking like a free ride. TCX has nowhere to put any of this.
    const records = [
      {
        ride: ride({
          routeId: null,
          routeName: null,
          workoutId: 'threshold-2x20',
          workoutName: '2x20 threshold',
          settings: { ...ride().settings, workoutScalePct: 80 },
        }),
        samples: [sample({ t: 0, lat: null, lon: null, eleM: null })],
      },
    ];
    const result = readArchive(buildArchive(records));

    expect(result).toMatchObject({ ok: true, skipped: 0, reasons: [] });
    if (!result.ok) throw new Error('unreachable');
    expect(result.records).toEqual(records);
    expect(result.records[0]!.ride.workoutId).toBe('threshold-2x20');
    expect(result.records[0]!.ride.workoutName).toBe('2x20 threshold');
    expect(result.records[0]!.ride.settings.workoutScalePct).toBe(80);
  });

  it('keeps nulls as nulls rather than turning an absent reading into zero', () => {
    const records = [
      {
        ride: ride({ avgPowerW: null, avgHeartRateBpm: null }),
        samples: [sample({ powerW: null, lat: null, lon: null, eleM: null, heartRateBpm: null })],
      },
    ];
    const result = readArchive(buildArchive(records));
    if (!result.ok) throw new Error('unreachable');
    expect(result.records).toEqual(records);
  });
});

describe('readArchive, on a file that is not ours', () => {
  it('refuses bytes that are not a ZIP at all', () => {
    const result = readArchive(strToU8('this is a text file'));
    expect(result).toEqual({ ok: false, reason: 'it is not a readable ZIP file' });
  });

  it('refuses a truncated archive', () => {
    const whole = buildArchive([record()]);
    const result = readArchive(whole.slice(0, Math.floor(whole.length / 2)));
    expect(result.ok).toBe(false);
  });

  it('says plainly that a ZIP without the manifest holds no Contour data', () => {
    const bytes = zipSync({ 'holiday.jpg': strToU8('not a ride') });
    const result = readArchive(bytes);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.reason).toContain('no Contour data');
    expect(result.reason).toContain(MANIFEST_NAME);
  });

  it('rejects a manifest that is not valid JSON', () => {
    const result = readArchive(zipSync({ [MANIFEST_NAME]: strToU8('{ truncated') }));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.reason).toContain('not valid JSON');
  });

  it('rejects a manifest that is not an object', () => {
    expect(readArchive(archiveOf([1, 2, 3])).ok).toBe(false);
    expect(readArchive(archiveOf('nope')).ok).toBe(false);
  });

  it('refuses a format it does not understand rather than guessing at it', () => {
    const result = readArchive(archiveOf({ version: 2, exportedAt: '', rides: [] }));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.reason).toContain('format 2');
    expect(result.reason).toContain(`format ${ARCHIVE_VERSION}`);
  });

  it('refuses a manifest with no version', () => {
    expect(readArchive(archiveOf({ exportedAt: '', rides: [] })).ok).toBe(false);
  });

  it('refuses a manifest whose rides are not a list', () => {
    const result = readArchive(
      archiveOf({ version: ARCHIVE_VERSION, exportedAt: '', rides: { a: 1 } }),
    );
    expect(result).toEqual({ ok: false, reason: 'it lists no rides' });
  });
});

describe('readArchive, on records that fail validation', () => {
  it('skips the bad record and keeps the rest', () => {
    const result = readArchive(
      withRides([record({ id: 'a' }), { ride: { id: 'b' } }, record({ id: 'c' })]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.records.map((r) => r.ride.id)).toEqual(['a', 'c']);
    expect(result.skipped).toBe(1);
    expect(result.reasons).toEqual(['Ride 2 was skipped because its start time is unreadable.']);
  });

  it('counts every skipped record', () => {
    const result = readArchive(withRides([null, 'a ride', { ride: null, samples: [] }]));
    if (!result.ok) throw new Error('unreachable');
    expect(result.records).toEqual([]);
    expect(result.skipped).toBe(3);
    expect(result.reasons).toHaveLength(3);
  });

  it('accepts an archive whose records are all unreadable rather than failing outright', () => {
    const result = readArchive(withRides([{}]));
    expect(result.ok).toBe(true);
  });
});

describe('readArchive, on an archive written before the workout fields existed', () => {
  /** The manifest a previous version wrote: same format version, three fields short. */
  function legacyRide(): Record<string, unknown> {
    const older: Record<string, unknown> = { ...ride() };
    const settings: Record<string, unknown> = { ...ride().settings };
    delete older.workoutId;
    delete older.workoutName;
    delete settings.workoutScalePct;
    delete settings.ergMode;
    older.settings = settings;
    return older;
  }

  it('imports it cleanly rather than losing the whole backup to a missing field', () => {
    const result = readArchive(withRides([{ ride: legacyRide(), samples: [sample({ t: 0 })] }]));

    expect(result).toMatchObject({ ok: true, skipped: 0, reasons: [] });
    if (!result.ok) throw new Error('unreachable');
    expect(result.records).toHaveLength(1);
  });

  it('reads an older ride as what it was: no workout, ridden at full targets', () => {
    const result = readArchive(withRides([{ ride: legacyRide(), samples: [] }]));
    if (!result.ok) throw new Error('unreachable');

    const restored = result.records[0]!.ride;
    expect(restored.workoutId).toBeNull();
    expect(restored.workoutName).toBeNull();
    expect(restored.settings.workoutScalePct).toBe(100);
    // ERG could not be turned off when this was written, so it was ridden with it on.
    expect(restored.settings.ergMode).toBe('erg');
    // Everything the older format did carry is untouched by the defaulting.
    expect(restored).toMatchObject({ id: 'ride-1', routeId: 'route-7', pausedS: 15 });
  });
});

describe('validateRecord', () => {
  function reasonFor(value: unknown): string {
    const result = validateRecord(value);
    if ('record' in result) throw new Error(`expected a reason, got a record`);
    return result.reason;
  }

  it('accepts a well-formed record', () => {
    const one = record();
    expect(validateRecord(JSON.parse(JSON.stringify(one)))).toEqual({ record: one });
  });

  it('ignores fields it does not know about rather than carrying them into storage', () => {
    const result = validateRecord({ ...record(), extra: 'junk' });
    if (!('record' in result)) throw new Error('unreachable');
    expect(Object.keys(result.record).sort()).toEqual(['ride', 'samples']);
    expect(result.record.ride).not.toHaveProperty('extra');
  });

  it('rejects anything that is not an object', () => {
    expect(reasonFor(null)).toBe('the record is not an object');
    expect(reasonFor([])).toBe('the record is not an object');
    expect(reasonFor(42)).toBe('the record is not an object');
  });

  it('rejects a ride with no id, because the id is what makes import idempotent', () => {
    expect(reasonFor({ ride: { ...ride(), id: '' }, samples: [] })).toBe('it has no id');
    expect(reasonFor({ ride: { ...ride(), id: 7 }, samples: [] })).toBe('it has no id');
  });

  it('rejects a start time nothing can read', () => {
    expect(reasonFor({ ride: { ...ride(), startedAt: 'last Tuesday' }, samples: [] })).toContain(
      'start time',
    );
  });

  it('rejects numbers that are missing, null or not finite', () => {
    expect(reasonFor({ ride: { ...ride(), elapsedS: null }, samples: [] })).toContain('elapsedS');
    expect(reasonFor({ ride: { ...ride(), distanceM: '1600' }, samples: [] })).toContain(
      'distanceM',
    );
    expect(reasonFor({ ride: { ...ride(), pausedS: Infinity }, samples: [] })).toContain('pausedS');
    expect(reasonFor({ ride: { ...ride(), ascentM: NaN }, samples: [] })).toContain('ascentM');
  });

  it('allows the readings that are genuinely optional to be null, but not anything else', () => {
    expect(validateRecord({ ride: ride({ avgPowerW: null }), samples: [] })).toHaveProperty(
      'record',
    );
    expect(reasonFor({ ride: { ...ride(), avgPowerW: 'lots' }, samples: [] })).toContain(
      'avgPowerW',
    );
  });

  it('rejects a ride that does not say whether it finished', () => {
    expect(reasonFor({ ride: { ...ride(), finished: 'yes' }, samples: [] })).toContain('finished');
  });

  it('rejects a routeId or routeName that is neither text nor null', () => {
    expect(reasonFor({ ride: { ...ride(), routeId: 7 }, samples: [] })).toContain('routeId');
    expect(reasonFor({ ride: { ...ride(), routeName: {} }, samples: [] })).toContain('routeName');
  });

  it('rejects a workoutId or workoutName that is present and neither text nor null', () => {
    expect(reasonFor({ ride: { ...ride(), workoutId: 7 }, samples: [] })).toContain('workoutId');
    expect(reasonFor({ ride: { ...ride(), workoutName: {} }, samples: [] })).toContain(
      'workoutName',
    );
  });

  it('rejects a workout scale of the wrong type, which is a corrupt record', () => {
    expect(
      reasonFor({
        ride: { ...ride(), settings: { ...ride().settings, workoutScalePct: '80%' } },
        samples: [],
      }),
    ).toContain('workoutScalePct');
  });

  it('rejects an ERG mode that is not one of the two, which is a corrupt record', () => {
    expect(
      reasonFor({
        ride: { ...ride(), settings: { ...ride().settings, ergMode: 'resistance' } },
        samples: [],
      }),
    ).toContain('ergMode');
  });

  it('rejects a ride without its frozen settings, which every screen reads', () => {
    const noSettings: Record<string, unknown> = { ...ride() };
    delete noSettings.settings;
    expect(reasonFor({ ride: noSettings, samples: [] })).toBe('its settings are missing');
    expect(
      reasonFor({ ride: { ...ride(), settings: { ...ride().settings, ftp: null } }, samples: [] }),
    ).toContain('ftp');
  });

  it('rejects a record whose samples are missing or not a list', () => {
    expect(reasonFor({ ride: ride() })).toBe('its samples are missing');
    expect(reasonFor({ ride: ride(), samples: { 0: sample() } })).toBe('its samples are missing');
  });

  it('rejects the whole record when one sample is unusable, rather than losing it silently', () => {
    expect(reasonFor({ ride: ride(), samples: [sample(), null] })).toBe(
      'a sample is not an object',
    );
    expect(reasonFor({ ride: ride(), samples: [{ ...sample(), t: '3' }] })).toContain('t');
    expect(reasonFor({ ride: ride(), samples: [{ ...sample(), distanceM: undefined }] })).toContain(
      'distanceM',
    );
    expect(reasonFor({ ride: ride(), samples: [{ ...sample(), lat: 'north' }] })).toContain('lat');
    expect(reasonFor({ ride: ride(), samples: [{ ...sample(), powerW: NaN }] })).toContain(
      'powerW',
    );
  });

  it('accepts a ride with no samples at all', () => {
    expect(validateRecord({ ride: ride(), samples: [] })).toEqual({
      record: { ride: ride(), samples: [] },
    });
  });
});
