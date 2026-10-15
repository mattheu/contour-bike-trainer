import { describe, expect, it } from 'vitest';
import {
  FTMS_UUID,
  describeService,
  describeServices,
  shortUuid,
  speaksFtms,
} from './connect-view';

const HEART_RATE = '0000180d-0000-1000-8000-00805f9b34fb';
const CYCLING_POWER = '00001818-0000-1000-8000-00805f9b34fb';
const UNASSIGNED = '00001234-0000-1000-8000-00805f9b34fb';
const VENDOR = 'a026ee01-0a7d-4ab3-97fa-f1500f9feb8b';

describe('shortUuid', () => {
  it('reduces an assigned UUID to its 16-bit number', () => {
    expect(shortUuid(FTMS_UUID)).toBe('1826');
    expect(shortUuid(HEART_RATE)).toBe('180d');
  });

  it('is case-insensitive, because the browser is not consistent about it', () => {
    expect(shortUuid(FTMS_UUID.toUpperCase())).toBe('1826');
  });

  it('returns null for a vendor UUID, which has no short form', () => {
    expect(shortUuid(VENDOR)).toBeNull();
  });
});

describe('describeService', () => {
  it('names the services the gate cares about', () => {
    expect(describeService(FTMS_UUID)).toEqual({
      uuid: FTMS_UUID,
      label: 'Fitness Machine (FTMS)',
      isFtms: true,
    });
    expect(describeService(CYCLING_POWER).label).toBe('Cycling Power');
  });

  it('falls back to the id rather than inventing a name', () => {
    expect(describeService(UNASSIGNED).label).toBe('0x1234');
    expect(describeService(VENDOR).label).toBe(VENDOR);
  });
});

describe('describeServices', () => {
  it('keeps discovery order and drops duplicates', () => {
    const described = describeServices([HEART_RATE, FTMS_UUID, HEART_RATE.toUpperCase()]);
    expect(described.map((s) => s.label)).toEqual(['Heart Rate', 'Fitness Machine (FTMS)']);
  });

  it('ignores blanks rather than rendering an empty row', () => {
    expect(describeServices(['', '  '])).toEqual([]);
  });
});

describe('speaksFtms', () => {
  it('confirms FTMS only when it was actually discovered', () => {
    expect(speaksFtms([HEART_RATE, FTMS_UUID])).toBe(true);
    // Cycling Power without FTMS is the wahoo.ts signal, not a pass.
    expect(speaksFtms([CYCLING_POWER])).toBe(false);
  });

  it('is false when nothing was discovered at all', () => {
    expect(speaksFtms([])).toBe(false);
  });
});
