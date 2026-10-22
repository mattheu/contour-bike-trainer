import { describe, expect, it } from 'vitest';

import { MINUS, formatGap } from './gap';

describe('formatGap', () => {
  it('signs a ghost up the road with a plus', () => {
    expect(formatGap(18)).toBe('+0:18');
  });

  it('signs a rider up the road with a true minus, not a hyphen', () => {
    expect(formatGap(-12)).toBe('−0:12');
    expect(formatGap(-12)).not.toBe('-0:12');
    expect(formatGap(-12).startsWith(MINUS)).toBe(true);
  });

  it('signs level pegging with a plus', () => {
    expect(formatGap(0)).toBe('+0:00');
  });

  it('counts minutes past 59 rather than rolling into an hour', () => {
    expect(formatGap(120)).toBe('+2:00');
    expect(formatGap(720)).toBe('+12:00');
    expect(formatGap(3600)).toBe('+60:00');
    expect(formatGap(-3725)).toBe(`${MINUS}62:05`);
  });

  it('rounds to the second', () => {
    expect(formatGap(18.4)).toBe('+0:18');
    expect(formatGap(18.6)).toBe('+0:19');
    expect(formatGap(-12.6)).toBe(`${MINUS}0:13`);
  });

  it('signs from the rounded figure, so half a second behind is not a signed nought', () => {
    expect(formatGap(-0.4)).toBe('+0:00');
  });

  it('pads the seconds but not the minutes', () => {
    expect(formatGap(61)).toBe('+1:01');
    expect(formatGap(599)).toBe('+9:59');
  });
});
