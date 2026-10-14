import { describe, expect, it } from 'vitest';
import {
  createMemoryKeyValueStore,
  DEFAULT_SETTINGS,
  parseSettings,
  SETTINGS_KEY,
  StoredSettingsRepository,
  type KeyValueStore,
} from './settings';

function withStored(value: string): KeyValueStore {
  const store = createMemoryKeyValueStore();
  store.setItem(SETTINGS_KEY, value);
  return store;
}

describe('DEFAULT_SETTINGS', () => {
  it('matches the table in the spec', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      controlMode: 'simulation',
      trainerDifficulty: 50,
      riderMassKg: 75,
      bikeMassKg: 9,
      ftp: 200,
      hrMax: 190,
      targetPowerW: null,
      targetCadenceRpm: null,
      targetHeartRateBpm: null,
      targetMarginPct: 5,
      cda: 0.32,
      crr: 0.004,
      gradeLookaheadM: 30,
      units: 'metric',
    });
  });
});

describe('parseSettings', () => {
  it('falls back to the defaults for nothing stored', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('fills in every missing key', () => {
    expect(parseSettings({ ftp: 265 })).toEqual({ ...DEFAULT_SETTINGS, ftp: 265 });
  });

  it('ignores keys it does not recognise', () => {
    const parsed = parseSettings({ ftp: 265, ghostRideId: 'abc', units: 'metric' });
    expect(parsed).toEqual({ ...DEFAULT_SETTINGS, ftp: 265 });
    expect('ghostRideId' in parsed).toBe(false);
  });

  it('defaults a known key whose stored value is the wrong type', () => {
    expect(parseSettings({ ftp: '265', hrMax: null, units: 'furlongs' })).toEqual(DEFAULT_SETTINGS);
  });

  it('defaults a number that is not finite', () => {
    expect(parseSettings({ riderMassKg: Number.POSITIVE_INFINITY }).riderMassKg).toBe(75);
  });

  it('keeps an explicit null on a nullable target', () => {
    expect(parseSettings({ targetPowerW: null }).targetPowerW).toBeNull();
  });

  it('keeps a number on a nullable target', () => {
    expect(parseSettings({ targetPowerW: 240 }).targetPowerW).toBe(240);
  });

  it('accepts both control modes and both unit systems', () => {
    expect(parseSettings({ controlMode: 'erg' }).controlMode).toBe('erg');
    expect(parseSettings({ units: 'imperial' }).units).toBe('imperial');
  });

  it('survives a stored value that is not an object at all', () => {
    expect(parseSettings('nonsense')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(42)).toEqual(DEFAULT_SETTINGS);
  });
});

describe('StoredSettingsRepository', () => {
  it('returns the defaults before anything has been saved', async () => {
    const settings = new StoredSettingsRepository(createMemoryKeyValueStore());
    expect(await settings.get()).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips a patch', async () => {
    const settings = new StoredSettingsRepository(createMemoryKeyValueStore());
    await settings.put({ trainerDifficulty: 70 });

    expect((await settings.get()).trainerDifficulty).toBe(70);
  });

  it('merges a patch over what is already stored', async () => {
    const settings = new StoredSettingsRepository(createMemoryKeyValueStore());
    await settings.put({ ftp: 265 });
    await settings.put({ hrMax: 185 });

    expect(await settings.get()).toEqual({ ...DEFAULT_SETTINGS, ftp: 265, hrMax: 185 });
  });

  it('writes a complete blob, so the next build reads real values not gaps', async () => {
    const store = createMemoryKeyValueStore();
    await new StoredSettingsRepository(store).put({ ftp: 265 });

    expect(JSON.parse(store.getItem(SETTINGS_KEY) ?? 'null')).toEqual({
      ...DEFAULT_SETTINGS,
      ftp: 265,
    });
  });

  it('can set a nullable target back to null', async () => {
    const settings = new StoredSettingsRepository(createMemoryKeyValueStore());
    await settings.put({ targetPowerW: 240 });
    await settings.put({ targetPowerW: null });

    expect((await settings.get()).targetPowerW).toBeNull();
  });

  it('drops an unknown key from a patch', async () => {
    const store = createMemoryKeyValueStore();
    const settings = new StoredSettingsRepository(store);
    await settings.put({ ghost: true } as never);

    expect(JSON.parse(store.getItem(SETTINGS_KEY) ?? 'null')).toEqual(DEFAULT_SETTINGS);
  });

  it('reads an old blob that predates a setting', async () => {
    const settings = new StoredSettingsRepository(withStored('{"ftp":265,"riderMassKg":80}'));
    expect(await settings.get()).toEqual({ ...DEFAULT_SETTINGS, ftp: 265, riderMassKg: 80 });
  });

  it('falls back to the defaults rather than throwing on a corrupt blob', async () => {
    const settings = new StoredSettingsRepository(withStored('{not json'));
    expect(await settings.get()).toEqual(DEFAULT_SETTINGS);
  });

  it('repairs a corrupt blob on the next write', async () => {
    const store = withStored('{not json');
    const settings = new StoredSettingsRepository(store);
    await settings.put({ ftp: 265 });

    expect((await settings.get()).ftp).toBe(265);
  });

  it('keeps separate keys apart', async () => {
    const store = createMemoryKeyValueStore();
    const a = new StoredSettingsRepository(store, 'contour.settings.a');
    const b = new StoredSettingsRepository(store, 'contour.settings.b');
    await a.put({ ftp: 265 });

    expect((await b.get()).ftp).toBe(200);
  });
});
