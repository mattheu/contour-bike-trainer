import type { ControlMode, Settings, SettingsRepository, Units } from './types';

export const SETTINGS_KEY = 'contour.settings';

/** Where this document says "default", it means this table. */
export const DEFAULT_SETTINGS: Settings = {
  // False, and a blob written before these existed has no key for them, so it parses as
  // false too. That is the safe direction: an install that has already booted is read as
  // unseeded and seeds once more on the first boot after this change — which writes
  // nothing, because every record is already there and present means left alone.
  routesSeeded: false,
  workoutsSeeded: false,
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
};

const CONTROL_MODES: ControlMode[] = ['erg', 'simulation'];
const UNITS: Units[] = ['metric', 'imperial'];

/** The subset of the Web Storage API this needs, so it is constructible in Vitest. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

type Reader = (value: unknown) => unknown;

function num(value: unknown): unknown {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function nullableNum(value: unknown): unknown {
  if (value === null) return null;
  return num(value);
}

function bool(value: unknown): unknown {
  return typeof value === 'boolean' ? value : undefined;
}

function oneOf<T extends string>(allowed: T[]): Reader {
  return (value) => (typeof value === 'string' && allowed.includes(value as T) ? value : undefined);
}

/**
 * A reader per key. A key with no reader is unknown and dropped; a value that fails its
 * reader falls back to the default. Between them an old — or hand-edited — blob can
 * never break a new build, which matters because these are read on every ride.
 */
const READERS: { [K in keyof Settings]: Reader } = {
  routesSeeded: bool,
  workoutsSeeded: bool,
  controlMode: oneOf(CONTROL_MODES),
  trainerDifficulty: num,
  riderMassKg: num,
  bikeMassKg: num,
  ftp: num,
  hrMax: num,
  targetPowerW: nullableNum,
  targetCadenceRpm: nullableNum,
  targetHeartRateBpm: nullableNum,
  targetMarginPct: num,
  cda: num,
  crr: num,
  gradeLookaheadM: num,
  units: oneOf(UNITS),
};

const KEYS = Object.keys(READERS) as (keyof Settings)[];

/** Pure: takes whatever was stored and returns a complete, valid Settings. */
export function parseSettings(raw: unknown): Settings {
  if (raw === null || typeof raw !== 'object') return { ...DEFAULT_SETTINGS };
  const stored = raw as Record<string, unknown>;
  const out = { ...DEFAULT_SETTINGS };
  for (const key of KEYS) {
    if (!(key in stored)) continue;
    const value = READERS[key](stored[key]);
    if (value === undefined) continue;
    // The reader has already proved the value fits the key.
    (out as Record<string, unknown>)[key] = value;
  }
  return out;
}

/** Drops keys the caller invented, so a patch cannot smuggle rubbish into the blob. */
function pickKnown(patch: Partial<Settings>): Partial<Settings> {
  const out: Record<string, unknown> = {};
  for (const key of KEYS) {
    if (key in patch) out[key] = patch[key];
  }
  return out as Partial<Settings>;
}

/**
 * One JSON blob under one key. Settings are a handful of scalars read on every tick;
 * putting them in IndexedDB would buy nothing and cost a transaction.
 */
export class StoredSettingsRepository implements SettingsRepository {
  constructor(
    private readonly store: KeyValueStore,
    private readonly key: string = SETTINGS_KEY,
  ) {}

  async get(): Promise<Settings> {
    return parseSettings(this.read());
  }

  async put(patch: Partial<Settings>): Promise<void> {
    const next = { ...parseSettings(this.read()), ...pickKnown(patch) };
    this.store.setItem(this.key, JSON.stringify(next));
  }

  private read(): unknown {
    const raw = this.store.getItem(this.key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw);
    } catch {
      // Corrupt blob: the defaults are a better ride than a crash on start-up.
      return null;
    }
  }
}

/** Backs the in-memory storage, and lets Vitest exercise the same class. */
export function createMemoryKeyValueStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
  };
}

export function createLocalSettingsRepository(): SettingsRepository {
  return new StoredSettingsRepository(localStorage);
}
