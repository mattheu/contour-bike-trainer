import { describe, expect, it } from 'vitest';
import { GAP_THRESHOLD_MS, interArrivals, interArrivalStats, summarise } from './stats';
import type { EventKind, RecordedEvent } from './types';

/** Hand-built log: only kind and t matter to the statistics. */
function at(kind: EventKind, t: number): RecordedEvent {
  return { kind, t, wallClock: new Date(t).toISOString() };
}

function series(kind: EventKind, ts: readonly number[]): RecordedEvent[] {
  return ts.map((t) => at(kind, t));
}

/** Merge several kinds into one log in timestamp order, as the recorder would. */
function merged(...lists: RecordedEvent[][]): RecordedEvent[] {
  return lists.flat().sort((a, b) => a.t - b.t);
}

describe('interArrivals', () => {
  it('returns gaps between consecutive events of one kind', () => {
    expect(interArrivals(series('timer-tick', [0, 1000, 2500]), 'timer-tick')).toEqual([
      1000, 1500,
    ]);
  });

  it('ignores other kinds entirely', () => {
    const log = merged(series('ibd-notification', [0, 1000, 2000]), series('timer-tick', [500]));
    expect(interArrivals(log, 'ibd-notification')).toEqual([1000, 1000]);
  });

  it('is empty for an empty log and for a single event', () => {
    expect(interArrivals([], 'marker')).toEqual([]);
    expect(interArrivals(series('marker', [42]), 'marker')).toEqual([]);
  });
});

describe('interArrivalStats', () => {
  it('reports nulls with a zero count for an absent kind', () => {
    expect(interArrivalStats([], 'ibd-notification')).toEqual({
      kind: 'ibd-notification',
      count: 0,
      min: null,
      median: null,
      p95: null,
      max: null,
      mean: null,
      gapsOver5s: 0,
    });
  });

  it('reports nulls but a count of one for a single event', () => {
    const stats = interArrivalStats(series('marker', [123]), 'marker');
    expect(stats.count).toBe(1);
    expect(stats.min).toBeNull();
    expect(stats.median).toBeNull();
    expect(stats.p95).toBeNull();
    expect(stats.max).toBeNull();
    expect(stats.mean).toBeNull();
    expect(stats.gapsOver5s).toBe(0);
  });

  it('collapses to the single gap when there are exactly two events', () => {
    const stats = interArrivalStats(series('timer-tick', [1000, 2500]), 'timer-tick');
    expect(stats).toEqual({
      kind: 'timer-tick',
      count: 2,
      min: 1500,
      median: 1500,
      p95: 1500,
      max: 1500,
      mean: 1500,
      gapsOver5s: 0,
    });
  });

  it('computes a perfectly regular 1 Hz series exactly', () => {
    const stats = interArrivalStats(series('timer-tick', [0, 1000, 2000, 3000]), 'timer-tick');
    expect(stats.count).toBe(4);
    expect([stats.min, stats.median, stats.p95, stats.max, stats.mean]).toEqual([
      1000, 1000, 1000, 1000, 1000,
    ]);
    expect(stats.gapsOver5s).toBe(0);
  });

  it('computes min, max, mean and median for gaps of 100/200/300/400', () => {
    // Cumulative timestamps: 0, 100, 300, 600, 1000.
    const stats = interArrivalStats(
      series('ibd-notification', [0, 100, 300, 600, 1000]),
      'ibd-notification',
    );
    expect(stats.count).toBe(5);
    expect(stats.min).toBe(100);
    expect(stats.max).toBe(400);
    expect(stats.mean).toBe(250);
    // Four gaps: median interpolates between the two middle values, 200 and 300.
    expect(stats.median).toBe(250);
    // R-7 rank = 3 x 0.95 = 2.85, between 300 and 400.
    expect(stats.p95).toBeCloseTo(385, 6);
  });

  it('interpolates p95 across two gaps', () => {
    const stats = interArrivalStats(series('timer-tick', [0, 1000, 4000]), 'timer-tick');
    expect(stats.median).toBe(2000);
    expect(stats.p95).toBeCloseTo(2900, 6);
  });

  it('counts only gaps strictly longer than five seconds', () => {
    // Gaps: 1000, 5000 (exactly the threshold), 5001, 9000.
    const stats = interArrivalStats(
      series('ibd-notification', [0, 1000, 6000, 11001, 20001]),
      'ibd-notification',
    );
    expect(GAP_THRESHOLD_MS).toBe(5000);
    expect(stats.gapsOver5s).toBe(2);
    expect(stats.max).toBe(9000);
  });

  it('is unaffected by interleaved events of other kinds', () => {
    const log = merged(
      series('ibd-notification', [0, 1000, 2000, 3000]),
      series('timer-tick', [100, 1100, 2100]),
      series('hr-notification', [50, 1050]),
    );
    expect(interArrivalStats(log, 'ibd-notification').mean).toBe(1000);
    expect(interArrivalStats(log, 'timer-tick').count).toBe(3);
    expect(interArrivalStats(log, 'hr-notification').median).toBe(1000);
  });
});

describe('summarise', () => {
  it('handles an empty log', () => {
    expect(summarise([])).toEqual({
      totalEvents: 0,
      firstT: null,
      lastT: null,
      durationMs: null,
      byKind: [],
    });
  });

  it('handles a single event', () => {
    const summary = summarise(series('marker', [500]));
    expect(summary.totalEvents).toBe(1);
    expect(summary.firstT).toBe(500);
    expect(summary.lastT).toBe(500);
    expect(summary.durationMs).toBe(0);
    expect(summary.byKind).toHaveLength(1);
    expect(summary.byKind[0]?.count).toBe(1);
    expect(summary.byKind[0]?.median).toBeNull();
  });

  it('reports the span of the whole log', () => {
    const log = merged(series('timer-tick', [1000, 2000]), series('marker', [7500]));
    const summary = summarise(log);
    expect(summary.totalEvents).toBe(3);
    expect(summary.firstT).toBe(1000);
    expect(summary.lastT).toBe(7500);
    expect(summary.durationMs).toBe(6500);
  });

  it('lists only kinds present, in canonical order regardless of arrival order', () => {
    const log = [at('marker', 0), at('visibility-change', 1), at('ibd-notification', 2)];
    expect(summarise(log).byKind.map((k) => k.kind)).toEqual([
      'ibd-notification',
      'visibility-change',
      'marker',
    ]);
  });

  it('carries the same per-kind numbers as interArrivalStats', () => {
    const log = merged(
      series('ibd-notification', [0, 1000, 2000]),
      series('timer-tick', [0, 9000]),
    );
    const summary = summarise(log);
    expect(summary.byKind).toEqual([
      interArrivalStats(log, 'ibd-notification'),
      interArrivalStats(log, 'timer-tick'),
    ]);
    const tick = summary.byKind.find((k) => k.kind === 'timer-tick');
    expect(tick?.gapsOver5s).toBe(1);
  });
});
