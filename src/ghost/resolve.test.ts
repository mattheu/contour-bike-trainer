import { describe, expect, it } from 'vitest';

import type { GhostLap } from './lap';
import { YEAR_MS, resolveGhosts, sameLap } from './resolve';

const NOW = Date.parse('2026-09-30T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function lap(rideId: string, durationS: number, daysAgo: number, lapIndex = 0): GhostLap {
  return { rideId, lapIndex, durationS, completedAtMs: NOW - daysAgo * DAY_MS };
}

describe('resolveGhosts', () => {
  it('fills Best with the fastest lap ever ridden, however old', () => {
    const laps = [lap('a', 400, 900), lap('b', 420, 10), lap('c', 410, 2)];

    expect(resolveGhosts(laps, NOW).laps.best?.rideId).toBe('a');
  });

  it('fills Year with the fastest lap of the last 365 days, not of this calendar year', () => {
    // January of the same year is inside the window; the previous autumn is not.
    const laps = [lap('old', 400, 400), lap('january', 415, 260), lap('recent', 430, 3)];

    expect(resolveGhosts(laps, NOW).laps.year?.rideId).toBe('january');
  });

  it('counts a lap at 364 days and drops one at 366', () => {
    // An older, faster lap holds Best, so Year is deciding on the window alone.
    const ancient = lap('ancient', 300, 900);
    const justInside = resolveGhosts([ancient, lap('x', 400, 364)], NOW).laps;
    const justOutside = resolveGhosts([ancient, lap('x', 400, 366)], NOW).laps;

    expect(justInside.year?.rideId).toBe('x');
    expect(justOutside.year).toBeNull();
  });

  it('counts a lap exactly on the boundary', () => {
    const laps = [lap('ancient', 300, 900), { ...lap('x', 400, 0), completedAtMs: NOW - YEAR_MS }];

    expect(resolveGhosts(laps, NOW).laps.year?.rideId).toBe('x');
  });

  it('fills Last with the most recently completed lap', () => {
    const laps = [lap('a', 400, 900), lap('b', 410, 300), lap('c', 450, 2)];

    expect(resolveGhosts(laps, NOW).laps.last?.rideId).toBe('c');
  });

  it('reads laps of one ride separately, so a loop can hold two slots', () => {
    const laps = [lap('a', 400, 1, 0), lap('a', 395, 1, 1), lap('a', 500, 1, 2)];
    const resolved = resolveGhosts(laps, NOW).laps;

    expect(resolved.best?.lapIndex).toBe(1);
    expect(resolved.last?.lapIndex).toBe(2);
  });

  it('gives Year the next fastest in the window when Best already holds the lap', () => {
    const laps = [lap('fastest', 400, 20), lap('second', 410, 30), lap('slow', 480, 5)];
    const resolved = resolveGhosts(laps, NOW).laps;

    expect(resolved.best?.rideId).toBe('fastest');
    expect(resolved.year?.rideId).toBe('second');
  });

  it('gives Last the next most recent when a faster slot already holds the lap', () => {
    // The newest lap is also the fastest ever, so Best keeps it and Last steps back.
    const laps = [lap('today', 390, 0), lap('yesterday', 430, 1), lap('older', 450, 40)];
    const resolved = resolveGhosts(laps, NOW).laps;

    expect(resolved.best?.rideId).toBe('today');
    expect(resolved.year?.rideId).toBe('yesterday');
    expect(resolved.last?.rideId).toBe('older');
  });

  it('leaves a slot empty rather than falling through to a lap that is not its own', () => {
    // One lap in the history: it is the best, and nothing else is anything.
    const resolved = resolveGhosts([lap('only', 400, 5)], NOW).laps;

    expect(resolved.best?.rideId).toBe('only');
    expect(resolved.year).toBeNull();
    expect(resolved.last).toBeNull();
  });

  it('fills nothing from an empty history', () => {
    expect(resolveGhosts([], NOW)).toEqual({
      laps: { best: null, year: null, last: null },
      yearIsSecond: false,
    });
  });

  it('never gives one lap two slots', () => {
    const laps = [lap('a', 400, 2), lap('b', 401, 1), lap('c', 402, 3)];
    const { best, year, last } = resolveGhosts(laps, NOW).laps;

    expect(sameLap(best, year)).toBe(false);
    expect(sameLap(best, last)).toBe(false);
    expect(sameLap(year, last)).toBe(false);
  });

  it('holds a record until it is beaten, not until it is equalled', () => {
    const laps = [lap('later', 400, 1), lap('first', 400, 90)];

    expect(resolveGhosts(laps, NOW).laps.best?.rideId).toBe('first');
  });

  it('says the slot is a second best when Best took the fastest lap of the window', () => {
    const laps = [lap('fastest', 400, 20), lap('second', 410, 30), lap('slow', 480, 5)];
    const resolved = resolveGhosts(laps, NOW);

    expect(resolved.laps.year?.rideId).toBe('second');
    expect(resolved.yearIsSecond).toBe(true);
  });

  it('says it is the best of the year where Best is older than the window', () => {
    const laps = [lap('ancient', 300, 900), lap('january', 415, 260)];
    const resolved = resolveGhosts(laps, NOW);

    expect(resolved.laps.year?.rideId).toBe('january');
    expect(resolved.yearIsSecond).toBe(false);
  });

  it('says nothing of the sort where there is no Best at all', () => {
    expect(resolveGhosts([], NOW).yearIsSecond).toBe(false);
  });

  it('says a second best however far back the second lap is', () => {
    // Eleven months between the two: the flag is about which lap Best took, not about how
    // close the times are.
    const laps = [lap('today', 400, 0), lap('november', 460, 330)];
    const resolved = resolveGhosts(laps, NOW);

    expect(resolved.laps.year?.rideId).toBe('november');
    expect(resolved.yearIsSecond).toBe(true);
  });

  it('says a second best with no second lap to be it, which the empty slot answers', () => {
    // Best holds the only lap in the window, so nothing fell to this slot and there is
    // nothing for a caller to word.
    const resolved = resolveGhosts([lap('only', 400, 5)], NOW);

    expect(resolved.laps.year).toBeNull();
    expect(resolved.yearIsSecond).toBe(true);
  });

  it('resolves a lap of the ride in progress like any other', () => {
    const laps = [lap('history', 400, 30), lap('live', 395, 0)];
    const resolved = resolveGhosts(laps, NOW).laps;

    expect(resolved.best?.rideId).toBe('live');
    expect(resolved.year?.rideId).toBe('history');
  });
});
