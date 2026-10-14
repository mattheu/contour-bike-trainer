import { EVENT_KINDS, type EventKind, type RecordedEvent } from './types';

/**
 * Pure statistics over a recorded event log. The phase 1 gate decision is made on
 * these numbers, so everything here is deterministic, side-effect free and tested.
 */

/** A gap longer than this means a notification or tick was lost, not merely late. */
export const GAP_THRESHOLD_MS = 5000;

export interface KindStats {
  kind: EventKind;
  /** Events of this kind. Inter-arrival intervals number one fewer. */
  count: number;
  /** All durations in milliseconds; null when there are fewer than two events. */
  min: number | null;
  median: number | null;
  p95: number | null;
  max: number | null;
  mean: number | null;
  /** Intervals strictly longer than GAP_THRESHOLD_MS. */
  gapsOver5s: number;
}

export interface Summary {
  totalEvents: number;
  firstT: number | null;
  lastT: number | null;
  /** Span of the whole log in milliseconds. */
  durationMs: number | null;
  /** Only kinds actually present, in EVENT_KINDS order. */
  byKind: KindStats[];
}

/**
 * Linear interpolation between closest ranks (the R-7 / Excel PERCENTILE.INC
 * method). Chosen so median is exactly percentile(0.5) rather than a special case.
 */
function percentile(sorted: readonly number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const rank = (sorted.length - 1) * p;
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  const a = sorted[lo];
  const b = sorted[hi];
  if (a === undefined || b === undefined) return null;
  return a + (b - a) * (rank - lo);
}

/** Gaps between consecutive events of one kind, in log order. */
export function interArrivals(events: readonly RecordedEvent[], kind: EventKind): number[] {
  const gaps: number[] = [];
  let previous: number | null = null;
  for (const event of events) {
    if (event.kind !== kind) continue;
    if (previous !== null) gaps.push(event.t - previous);
    previous = event.t;
  }
  return gaps;
}

export function interArrivalStats(events: readonly RecordedEvent[], kind: EventKind): KindStats {
  const count = events.reduce((n, event) => (event.kind === kind ? n + 1 : n), 0);
  const gaps = interArrivals(events, kind);
  const gapsOver5s = gaps.reduce((n, gap) => (gap > GAP_THRESHOLD_MS ? n + 1 : n), 0);

  if (gaps.length === 0) {
    return { kind, count, min: null, median: null, p95: null, max: null, mean: null, gapsOver5s };
  }

  const sorted = [...gaps].sort((a, b) => a - b);
  const total = gaps.reduce((sum, gap) => sum + gap, 0);

  return {
    kind,
    count,
    min: sorted[0] ?? null,
    median: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    max: sorted[sorted.length - 1] ?? null,
    mean: total / gaps.length,
    gapsOver5s,
  };
}

/** Compact enough to render as a table and to embed in the JSON export. */
export function summarise(events: readonly RecordedEvent[]): Summary {
  const first = events[0];
  const last = events[events.length - 1];
  const present = new Set(events.map((event) => event.kind));

  return {
    totalEvents: events.length,
    firstT: first?.t ?? null,
    lastT: last?.t ?? null,
    durationMs: first && last ? last.t - first.t : null,
    byKind: EVENT_KINDS.filter((kind) => present.has(kind)).map((kind) =>
      interArrivalStats(events, kind),
    ),
  };
}
