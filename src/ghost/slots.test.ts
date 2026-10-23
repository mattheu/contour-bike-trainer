import { describe, expect, it } from 'vitest';

import { SLOT_ORDER, SLOT_SYMBOL, shortDate, slotName } from './slots';

describe('slots', () => {
  it('gives every slot its own symbol, and never the reserved one', () => {
    const shapes = SLOT_ORDER.map((slot) => SLOT_SYMBOL[slot].shape);

    // No shape implies rank; the slots answer different questions, not graded ones.
    expect(shapes).toEqual(['square', 'triangle', 'diamond', 'pentagon']);
    expect(new Set(SLOT_ORDER.map((slot) => SLOT_SYMBOL[slot].d)).size).toBe(4);
  });

  it('draws every symbol as a closed path on the same box', () => {
    for (const slot of SLOT_ORDER) {
      const { d } = SLOT_SYMBOL[slot];
      expect(d.startsWith('M')).toBe(true);
      expect(d.endsWith('Z')).toBe(true);
      const numbers = d.match(/[\d.]+/g)?.map(Number) ?? [];
      expect(numbers.length).toBeGreaterThan(0);
      for (const n of numbers) expect(n).toBeGreaterThanOrEqual(0);
      for (const n of numbers) expect(n).toBeLessThanOrEqual(14);
    }
  });

  it('names the three resolved slots with the band words', () => {
    expect(slotName('best', '2026-09-29T09:00:00.000Z')).toBe('Best');
    expect(slotName('year', '2026-09-29T09:00:00.000Z')).toBe('Year');
    expect(slotName('last', '2026-09-29T09:00:00.000Z')).toBe('Last');
  });

  it('names the picked slot after the day the ride was ridden', () => {
    expect(slotName('chosen', '2026-09-29T09:00:00.000Z')).toBe('29 Sep');
    expect(shortDate('2026-01-02T09:00:00.000Z')).toBe('2 Jan');
  });

  it('names a picked ride with an unreadable date nothing at all', () => {
    expect(slotName('chosen', 'not a date')).toBe('');
  });
});
