import { describe, expect, it } from 'vitest';
import { gradeAt } from '../../route/grade';
import { speedFromPower } from '../../physics/speed';
import { DEFAULT_SETTINGS } from '../../storage/settings';
import { zoneForHeartRate } from '../../zones/hr';
import { zoneForPower } from '../../zones/power';
import {
  ADVANCED_FIELDS,
  PRIMARY_FIELDS,
  PROFILE_FIELDS,
  clampField,
  clampProfile,
  fieldSpec,
  formatBound,
  formatValue,
  parseField,
  type ProfileField,
  type RiderProfile,
} from './rider-profile';

const DEFAULTS: RiderProfile = {
  riderMassKg: DEFAULT_SETTINGS.riderMassKg,
  bikeMassKg: DEFAULT_SETTINGS.bikeMassKg,
  ftp: DEFAULT_SETTINGS.ftp,
  hrMax: DEFAULT_SETTINGS.hrMax,
  cda: DEFAULT_SETTINGS.cda,
  crr: DEFAULT_SETTINGS.crr,
  gradeLookaheadM: DEFAULT_SETTINGS.gradeLookaheadM,
};

const KEYS = PROFILE_FIELDS.map((spec) => spec.key);

describe('the field table', () => {
  it('covers the seven profile settings once each, in two groups', () => {
    // Bike weight sits in the advanced group: the physics needs rider plus bike, but the
    // default is close enough that most riders never touch it, and no trainer asks for it.
    expect(KEYS).toEqual([
      'riderMassKg',
      'ftp',
      'hrMax',
      'bikeMassKg',
      'cda',
      'crr',
      'gradeLookaheadM',
    ]);
    expect(new Set(KEYS).size).toBe(KEYS.length);
    expect(PRIMARY_FIELDS.length + ADVANCED_FIELDS.length).toBe(PROFILE_FIELDS.length);
  });

  it("keeps the ride panel's own settings out: no difficulty, targets or units", () => {
    expect(KEYS).not.toContain('trainerDifficulty');
    expect(KEYS).not.toContain('targetPowerW');
    expect(KEYS).not.toContain('units');
    expect(KEYS).not.toContain('controlMode');
  });

  it('says what FTP and max heart rate are for, because the number is otherwise abstract', () => {
    expect(fieldSpec('ftp').hint).toMatch(/power zones/i);
    expect(fieldSpec('hrMax').hint).toMatch(/heart-rate zones/i);
  });

  it('has every default inside its own range, or the screen opens in an error state', () => {
    for (const spec of PROFILE_FIELDS) {
      const value = DEFAULTS[spec.key];
      expect(value).toBeGreaterThanOrEqual(spec.min);
      expect(value).toBeLessThanOrEqual(spec.max);
    }
  });

  it('rejects a key it has never heard of rather than guessing a range', () => {
    expect(() => fieldSpec('nonsense' as ProfileField)).toThrow(RangeError);
  });
});

describe('parseField', () => {
  it('accepts a number inside the range', () => {
    expect(parseField('ftp', '250')).toEqual({ ok: true, value: 250 });
    expect(parseField('riderMassKg', '82.5')).toEqual({ ok: true, value: 82.5 });
  });

  it('tolerates the whitespace a paste leaves behind', () => {
    expect(parseField('ftp', '  250  ')).toEqual({ ok: true, value: 250 });
  });

  it('rounds to the precision the field actually stores', () => {
    expect(parseField('ftp', '250.7')).toEqual({ ok: true, value: 251 });
    expect(parseField('crr', '0.004123')).toEqual({ ok: true, value: 0.0041 });
  });

  it('treats an empty field as unanswered, not as zero', () => {
    const result = parseField('ftp', '   ');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('empty');
  });

  it('rejects text, a lone sign, and a number with a unit stuck to it', () => {
    for (const raw of ['abc', '-', '200w', '1e3', '12,5', 'NaN', 'Infinity']) {
      const result = parseField('ftp', raw);
      expect(result.ok, raw).toBe(false);
      if (!result.ok) expect(result.reason).toBe('not-a-number');
    }
  });

  it('rejects the zero that would divide by zero in zoneForPower', () => {
    const result = parseField('ftp', '0');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('below-min');
  });

  it('rejects the zero mass that would leave the physics solver no bracket', () => {
    expect(parseField('riderMassKg', '0').ok).toBe(false);
    expect(parseField('bikeMassKg', '0').ok).toBe(false);
  });

  it('rejects the zero lookahead that makes gradeAt throw', () => {
    expect(parseField('gradeLookaheadM', '0').ok).toBe(false);
    expect(() => gradeAt({ points: [], totalDistanceM: 0, totalAscentM: 0 }, 0, 0)).toThrow();
  });

  it('rejects a negative value on every field', () => {
    for (const key of KEYS) {
      const result = parseField(key, '-1');
      expect(result.ok, key).toBe(false);
      if (!result.ok) expect(result.reason).toBe('below-min');
    }
  });

  it('names the bound it rejected against, so the rider can correct it', () => {
    const low = parseField('hrMax', '40');
    expect(low.ok).toBe(false);
    if (!low.ok) expect(low.message).toBe('Lowest is 100 bpm.');

    const high = parseField('hrMax', '400');
    expect(high.ok).toBe(false);
    if (!high.ok) expect(high.message).toBe('Highest is 230 bpm.');
  });

  it('leaves the unit off a field that has none', () => {
    const result = parseField('crr', '9');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe('Highest is 0.02.');
  });

  it('accepts both ends of every range exactly', () => {
    for (const spec of PROFILE_FIELDS) {
      expect(parseField(spec.key, String(spec.min)), spec.key).toEqual({
        ok: true,
        value: spec.min,
      });
      expect(parseField(spec.key, String(spec.max)), spec.key).toEqual({
        ok: true,
        value: spec.max,
      });
    }
  });

  it('rejects a hair outside either end', () => {
    expect(parseField('ftp', '29').ok).toBe(false);
    expect(parseField('ftp', '601').ok).toBe(false);
  });

  /** The point of the whole module: nothing it approves may break a calculation. */
  it('approves only values the physics and the zones survive', () => {
    for (const spec of PROFILE_FIELDS) {
      for (const raw of [String(spec.min), String(spec.max)]) {
        const result = parseField(spec.key, raw);
        expect(result.ok, `${spec.key} ${raw}`).toBe(true);
        if (!result.ok) continue;
        const profile = { ...DEFAULTS, [spec.key]: result.value };
        expect(() => zoneForPower(150, profile.ftp)).not.toThrow();
        expect(() => zoneForHeartRate(150, profile.hrMax)).not.toThrow();
        const speed = speedFromPower(200, 4, {
          riderMassKg: profile.riderMassKg,
          bikeMassKg: profile.bikeMassKg,
          cda: profile.cda,
          crr: profile.crr,
        });
        expect(Number.isFinite(speed), `${spec.key} ${raw}`).toBe(true);
        expect(speed).toBeGreaterThan(0);
      }
    }
  });
});

describe('clampField and clampProfile', () => {
  it('leaves a value already in range alone', () => {
    expect(clampProfile(DEFAULTS)).toEqual(DEFAULTS);
  });

  it('pulls a stored blob that would divide by zero back into range', () => {
    const broken = { ...DEFAULTS, ftp: 0, riderMassKg: 0, gradeLookaheadM: 0 };
    const fixed = clampProfile(broken);
    expect(fixed.ftp).toBe(fieldSpec('ftp').min);
    expect(fixed.riderMassKg).toBe(fieldSpec('riderMassKg').min);
    expect(fixed.gradeLookaheadM).toBe(fieldSpec('gradeLookaheadM').min);
    expect(() => zoneForPower(0, fixed.ftp)).not.toThrow();
  });

  it('pulls an absurdly high value down to the ceiling', () => {
    expect(clampField('ftp', 10_000)).toBe(600);
    expect(clampField('cda', 12)).toBe(0.6);
  });

  it('treats a non-finite number as no answer at all', () => {
    expect(clampField('ftp', Number.NaN)).toBe(30);
    expect(clampField('ftp', Number.POSITIVE_INFINITY)).toBe(600);
    expect(clampField('ftp', Number.NEGATIVE_INFINITY)).toBe(30);
  });
});

describe('formatting', () => {
  it("renders a value at the field's own precision", () => {
    expect(formatValue('ftp', 250)).toBe('250');
    expect(formatValue('riderMassKg', 75)).toBe('75.0');
    expect(formatValue('crr', 0.004)).toBe('0.0040');
    expect(formatValue('cda', 0.32)).toBe('0.320');
  });

  it('drops trailing zeros from a bound, which is read as prose', () => {
    expect(formatBound(100, 0)).toBe('100');
    expect(formatBound(0.02, 4)).toBe('0.02');
    expect(formatBound(0.0015, 4)).toBe('0.0015');
  });
});
