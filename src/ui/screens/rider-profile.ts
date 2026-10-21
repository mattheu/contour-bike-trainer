/**
 * The rider's set-once numbers, and the rules that stop one of them breaking a
 * calculation downstream.
 *
 * Three of these are load-bearing in a way the ride settings are not: an ftp of 0 makes
 * zoneForPower divide by zero, a riderMassKg of 0 leaves the physics solver with no
 * bracket to bisect, and a gradeLookaheadM of 0 makes gradeAt throw outright. So parsing
 * and clamping live here as pure functions a test owns, and the screen never decides for
 * itself what is a sensible number.
 *
 * Ranges are deliberately wide: they exist to exclude the impossible, not to argue with
 * an unusual rider. Each bound is justified where it is declared.
 */

import type { Settings } from '../../storage/types';

export type ProfileField =
  'riderMassKg' | 'bikeMassKg' | 'ftp' | 'hrMax' | 'cda' | 'crr' | 'gradeLookaheadM';

/** The subset of Settings this screen owns. Everything else is the ride panel's. */
export type RiderProfile = Pick<Settings, ProfileField>;

export interface FieldSpec {
  key: ProfileField;
  /** Also the accessible name of the input, so it is what a test asks for. */
  label: string;
  unit: string;
  min: number;
  max: number;
  /** What a stored value is rounded to, and how the draft is rendered. */
  decimals: number;
  /** The input's step, so the spinner moves by something useful. */
  step: number;
  /** One line under the field, where the number's consequence is not obvious. */
  hint?: string;
}

/**
 * What the rider feels and sees. Mass drives the physics directly; ftp and hrMax each
 * drive a zone ladder, which is why both say so.
 */
export const PRIMARY_FIELDS: readonly FieldSpec[] = [
  {
    key: 'riderMassKg',
    label: 'Your weight',
    unit: 'kg',
    // Two weights exist and neither knows about the other: FTMS sends the trainer a
    // gradient but no rider mass, so the trainer uses its own stored figure to decide how
    // hard the hill feels while this one decides how fast you go. Out of step, a long
    // climb feels easy while you crawl up it, or the reverse.
    hint: 'Set the same weight in the Wahoo app — it decides how hard hills feel, this decides how fast you go.',
    // Below 30 kg is not someone riding a trainer; above 200 kg is past any bike's
    // load rating. Both ends keep a positive mass in the solver, which is the real job.
    min: 30,
    max: 200,
    decimals: 1,
    step: 0.5,
  },
  {
    key: 'ftp',
    label: 'FTP',
    unit: 'W',
    // 30 W is below a recovery spin, 600 W above any FTP on record. Zero is the one
    // value that must never get through: zoneForPower divides by it.
    min: 30,
    max: 600,
    decimals: 0,
    step: 5,
    hint: 'Sets the power zones.',
  },
  {
    key: 'hrMax',
    label: 'Maximum heart rate',
    unit: 'bpm',
    // 100 bpm is below any adult's maximum; 230 is above the highest credibly recorded.
    min: 100,
    max: 230,
    decimals: 0,
    step: 1,
    hint: 'Sets the heart-rate zones.',
  },
];

/**
 * Aerodynamics, rolling resistance and the grade window. Most riders have never measured
 * any of them and the defaults are reasonable, so they are secondary and optional.
 */
export const ADVANCED_FIELDS: readonly FieldSpec[] = [
  {
    key: 'bikeMassKg',
    label: 'Bike weight',
    unit: 'kg',
    // Advanced because most riders will never touch it and the default is close enough:
    // gravity acts on rider plus bike, so the physics needs the total, but 2 kg out of 89
    // is about 2 % — a minute on a fifty-minute climb. Worth being roughly right, not worth
    // thinking about. Trainers ask only for rider weight, so there is nothing to match.
    hint: '9 kg is a road bike; 11–12 with mudguards.',
    // The UCI floor is 6.8 kg and hill-climb builds go under it; 30 kg covers a heavy
    // e-bike left on the trainer.
    min: 3,
    max: 30,
    decimals: 1,
    step: 0.1,
  },
  {
    key: 'cda',
    label: 'CdA',
    unit: 'm²',
    // 0.15 is a time-trial specialist in a tuck; 0.60 is upright on a hybrid.
    min: 0.15,
    max: 0.6,
    decimals: 3,
    step: 0.005,
  },
  {
    key: 'crr',
    label: 'Crr',
    unit: '',
    // 0.0015 is a track tyre on wood; 0.02 is a knobbly tyre on gravel.
    min: 0.0015,
    max: 0.02,
    decimals: 4,
    step: 0.0005,
  },
  {
    key: 'gradeLookaheadM',
    label: 'Grade lookahead',
    unit: 'm',
    // Must stay above zero or gradeAt throws. Under 5 m elevation noise dominates the
    // rise; over 200 m the window smooths a real ramp away.
    min: 5,
    max: 200,
    decimals: 0,
    step: 5,
  },
];

export const PROFILE_FIELDS: readonly FieldSpec[] = [...PRIMARY_FIELDS, ...ADVANCED_FIELDS];

const BY_KEY = new Map(PROFILE_FIELDS.map((spec) => [spec.key, spec]));

export function fieldSpec(key: ProfileField): FieldSpec {
  const spec = BY_KEY.get(key);
  if (spec === undefined) throw new RangeError(`Unknown profile field: ${key}`);
  return spec;
}

export type ParseFailure = 'empty' | 'not-a-number' | 'below-min' | 'above-max';

export type ParsedField =
  { ok: true; value: number } | { ok: false; reason: ParseFailure; message: string };

/** Trailing noise ("200 w") is a typo, not a unit: only a bare number is accepted. */
const NUMERIC = /^-?(\d+(\.\d*)?|\.\d+)$/;

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** How a bound reads back to the rider, without a trailing ".0" on a whole number. */
export function formatBound(value: number, decimals: number): string {
  return round(value, decimals).toString();
}

/** The value as the input should show it: trailing zeros only where the field has them. */
export function formatValue(key: ProfileField, value: number): string {
  const spec = fieldSpec(key);
  return round(value, spec.decimals).toFixed(spec.decimals);
}

/**
 * One field's draft text, validated. Out of range is rejected rather than silently
 * clamped: clamping mid-keystroke would snap "5" to 30 on the way to typing "55", and a
 * rider who cannot see what was rejected cannot correct it.
 */
export function parseField(key: ProfileField, raw: string): ParsedField {
  const spec = fieldSpec(key);
  const text = raw.trim();
  if (text === '') {
    return { ok: false, reason: 'empty', message: `${spec.label} is required.` };
  }
  if (!NUMERIC.test(text)) {
    return { ok: false, reason: 'not-a-number', message: 'Numbers only.' };
  }
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) {
    return { ok: false, reason: 'not-a-number', message: 'Numbers only.' };
  }
  const value = round(parsed, spec.decimals);
  if (value < spec.min) {
    return {
      ok: false,
      reason: 'below-min',
      message: `Lowest is ${formatBound(spec.min, spec.decimals)}${spec.unit === '' ? '' : ` ${spec.unit}`}.`,
    };
  }
  if (value > spec.max) {
    return {
      ok: false,
      reason: 'above-max',
      message: `Highest is ${formatBound(spec.max, spec.decimals)}${spec.unit === '' ? '' : ` ${spec.unit}`}.`,
    };
  }
  return { ok: true, value };
}

/**
 * A single value forced into range. Used on the way out of storage, never on input.
 *
 * NaN is no answer at all and falls to the minimum, which is always rideable. An infinity
 * still has a direction, so it clamps by magnitude like any other out-of-range number.
 */
export function clampField(key: ProfileField, value: number): number {
  const spec = fieldSpec(key);
  if (Number.isNaN(value)) return round(spec.min, spec.decimals);
  return round(Math.min(spec.max, Math.max(spec.min, value)), spec.decimals);
}

/**
 * What the screen renders from. parseSettings already guarantees finite numbers, but it
 * has no opinion on whether they are rideable — a blob written by an older build, or by
 * hand, can still hold an ftp of 0. Clamping here means the zone previews and the drafts
 * start from a number the rest of the app can survive.
 */
export function clampProfile(profile: RiderProfile): RiderProfile {
  return {
    riderMassKg: clampField('riderMassKg', profile.riderMassKg),
    bikeMassKg: clampField('bikeMassKg', profile.bikeMassKg),
    ftp: clampField('ftp', profile.ftp),
    hrMax: clampField('hrMax', profile.hrMax),
    cda: clampField('cda', profile.cda),
    crr: clampField('crr', profile.crr),
    gradeLookaheadM: clampField('gradeLookaheadM', profile.gradeLookaheadM),
  };
}
