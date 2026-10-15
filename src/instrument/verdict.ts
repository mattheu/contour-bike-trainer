import { summarise, type KindStats, type Summary } from './stats';
import { EVENT_KINDS, type EventKind, type RecordedEvent } from './types';
import type { VisibilityState } from './probe';

/**
 * Turns a recorded run into the answer phase 1 actually needs: does Chrome throttle
 * this app when the window is hidden, and does a BLE-notification-driven tick
 * survive it. Pure, DOM-free and tested — the gate decision (ADR-0000) is made on
 * what this file says, so every threshold is a named constant rather than a magic
 * number buried in a comparison.
 *
 * Validity is the load-bearing half. A confident conclusion drawn from a run that
 * was never actually hidden, or that ended before Chrome's five-minute intensive
 * throttling timer fired, is worse than no conclusion at all.
 */

// --- Thresholds ---------------------------------------------------------------

/** Both the probe's setInterval and the device's notification rate target 1 Hz. */
export const EXPECTED_INTERVAL_MS = 1000;

/** Median at or under this is the expected rate plus ordinary jitter. */
export const HEALTHY_MEDIAN_MS = 1500;

/**
 * Median beyond this is throttling rather than lateness. Chrome's intensive
 * throttling clamps hidden timers to roughly one per minute, so a genuinely
 * clamped stream lands far above this — the threshold only has to separate
 * "late" from "clamped", not pinpoint the clamp.
 */
export const THROTTLED_MEDIAN_MS = 5000;

/**
 * A single gap this long means a notification was lost, not merely delayed.
 * Re-exported from stats so the classification and the gap count in the table can
 * never drift apart.
 */
export { GAP_THRESHOLD_MS } from './stats';

/** Chrome's intensive throttling engages five minutes after the page is hidden. */
export const INTENSIVE_THROTTLING_DELAY_MS = 5 * 60 * 1000;

/** SPEC condition 3 asks for ten minutes: five to trigger, five to measure. */
export const RECOMMENDED_HIDDEN_MS = 10 * 60 * 1000;

/** Below this share of the run hidden, the run is not testing background behaviour. */
export const MIN_HIDDEN_SHARE = 0.8;

/**
 * Fewest events in the busiest stream for the medians to mean anything. Deliberately
 * checked against the busiest stream, not every stream: a correctly throttled timer
 * produces about ten ticks in ten minutes and must not invalidate its own run.
 */
export const MIN_SAMPLES = 20;

// --- Stream classification ----------------------------------------------------

export type StreamHealth = 'healthy' | 'degraded' | 'throttled' | 'no-data';

const TIMER_KIND: EventKind = 'timer-tick';
export const NOTIFICATION_KINDS: readonly EventKind[] = ['ibd-notification', 'hr-notification'];

const HEALTH_RANK: Record<StreamHealth, number> = {
  'no-data': -1,
  healthy: 0,
  degraded: 1,
  throttled: 2,
};

function band(median: number): StreamHealth {
  if (median < HEALTHY_MEDIAN_MS) return 'healthy';
  if (median > THROTTLED_MEDIAN_MS) return 'throttled';
  return 'degraded';
}

/**
 * The experiment's control variable. No gap penalty: a clamped timer is defined by
 * its median, and penalising its gaps would only restate the same fact.
 */
export function classifyTimer(stats: KindStats | undefined): StreamHealth {
  if (stats === undefined || stats.median === null) return 'no-data';
  return band(stats.median);
}

/**
 * The stream the decision turns on. A gap over five seconds is a dropped
 * notification — a ride losing data — so it costs the stream its clean bill of
 * health even when the median looks fine.
 */
export function classifyNotifications(stats: KindStats | undefined): StreamHealth {
  if (stats === undefined || stats.median === null) return 'no-data';
  const fromMedian = band(stats.median);
  if (stats.gapsOver5s > 0 && fromMedian === 'healthy') return 'degraded';
  return fromMedian;
}

function worse(a: StreamHealth, b: StreamHealth): StreamHealth {
  if (a === 'no-data') return b;
  if (b === 'no-data') return a;
  return HEALTH_RANK[a] >= HEALTH_RANK[b] ? a : b;
}

export interface StreamAssessment {
  kind: EventKind;
  health: StreamHealth;
  stats: KindStats | undefined;
}

function statsFor(summary: Summary | null, kind: EventKind): KindStats | undefined {
  return summary?.byKind.find((entry) => entry.kind === kind);
}

/** Timer plus whichever notification streams are present, in EVENT_KINDS order. */
export function assessStreams(summary: Summary | null): StreamAssessment[] {
  const kinds: EventKind[] = [TIMER_KIND, ...NOTIFICATION_KINDS];
  return EVENT_KINDS.filter((kind) => kinds.includes(kind)).map((kind) => {
    const stats = statsFor(summary, kind);
    return {
      kind,
      health: kind === TIMER_KIND ? classifyTimer(stats) : classifyNotifications(stats),
      stats,
    };
  });
}

// --- Visibility ---------------------------------------------------------------

export interface VisibilityTotals {
  visibleMs: number;
  hiddenMs: number;
}

export const NO_VISIBILITY: VisibilityTotals = Object.freeze({ visibleMs: 0, hiddenMs: 0 });

function detailVisibility(event: RecordedEvent): VisibilityState | null {
  const raw = event.detail?.visibilityState;
  return raw === 'hidden' || raw === 'visible' ? raw : null;
}

/**
 * Reconstructs how long a recorded run spent hidden from its visibility-change
 * events. A log that starts mid-run has no record of the state it started in, so
 * the caller states the assumption rather than the function guessing at it.
 */
export function visibilityTotalsFromEvents(
  events: readonly RecordedEvent[],
  initial: VisibilityState = 'visible',
): VisibilityTotals {
  const first = events[0];
  const last = events[events.length - 1];
  if (first === undefined || last === undefined) return { ...NO_VISIBILITY };

  const totals: VisibilityTotals = { visibleMs: 0, hiddenMs: 0 };
  let state = initial;
  let since = first.t;

  const add = (until: number): void => {
    const delta = Math.max(0, until - since);
    if (state === 'hidden') totals.hiddenMs += delta;
    else totals.visibleMs += delta;
    since = until;
  };

  for (const event of events) {
    if (event.kind !== 'visibility-change') continue;
    const next = detailVisibility(event);
    if (next === null || next === state) continue;
    add(event.t);
    state = next;
  }
  add(last.t);

  return totals;
}

/**
 * Live equivalent for the running experiment, where the full event log is not on
 * the UI side of the boundary. Each observation attributes the time since the
 * previous one to the state that was in force then, so observing more or less
 * often than the state actually changes cannot skew the totals — which matters,
 * because a hidden tab is observed rarely and only the transitions are exact.
 *
 * It is also an observable in the same shape as RideStore, so React can read it
 * through useSyncExternalStore rather than mirroring it into component state.
 * getSnapshot therefore returns a cached object whose identity changes only when
 * the totals do; building a fresh one per call would loop forever.
 */
export class VisibilityTracker {
  private state: VisibilityState | null = null;
  private since = 0;
  private visibleMs = 0;
  private hiddenMs = 0;
  private published: VisibilityTotals = NO_VISIBILITY;
  private readonly listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): VisibilityTotals => this.published;

  private publish(): void {
    if (this.published.visibleMs === this.visibleMs && this.published.hiddenMs === this.hiddenMs) {
      return;
    }
    this.published = { visibleMs: this.visibleMs, hiddenMs: this.hiddenMs };
    for (const listener of this.listeners) listener();
  }

  observe(state: VisibilityState, t: number): void {
    if (this.state === null) {
      this.state = state;
      this.since = t;
      return;
    }
    const delta = Math.max(0, t - this.since);
    if (this.state === 'hidden') this.hiddenMs += delta;
    else this.visibleMs += delta;
    this.since = t;
    this.state = state;
    this.publish();
  }

  reset(): void {
    this.state = null;
    this.since = 0;
    this.visibleMs = 0;
    this.hiddenMs = 0;
    this.publish();
  }

  totals(): VisibilityTotals {
    return { visibleMs: this.visibleMs, hiddenMs: this.hiddenMs };
  }
}

// --- Validity -----------------------------------------------------------------

export interface RunValidity {
  /** False means the conclusion below cannot be relied on, whatever it says. */
  valid: boolean;
  elapsedMs: number | null;
  visibleMs: number;
  hiddenMs: number;
  /** Hidden time as a share of observed time; null when visibility was never observed. */
  hiddenShare: number | null;
  /** Was the window hidden long enough for intensive throttling to engage at all. */
  pastIntensiveThreshold: boolean;
  /** Events in the busiest classified stream. */
  sampleCount: number;
  droppedEvents: number;
  /** Reasons the run cannot be trusted. Empty means valid. */
  problems: string[];
  /** Caveats that weaken the result without invalidating it. */
  warnings: string[];
}

export function formatDurationMs(value: number | null): string {
  if (value === null || Number.isNaN(value)) return 'unknown';
  const total = Math.max(0, Math.round(value / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes === 0 ? `${seconds}s` : `${minutes}m ${seconds}s`;
}

export function formatShare(value: number | null): string {
  return value === null ? 'unknown' : `${Math.round(value * 100)}%`;
}

export interface VerdictInput {
  summary: Summary | null;
  visibility: VisibilityTotals;
  droppedEvents: number;
}

export function assessValidity(input: VerdictInput, streams: StreamAssessment[]): RunValidity {
  const { summary, visibility, droppedEvents } = input;
  const elapsedMs = summary?.durationMs ?? null;
  const { visibleMs, hiddenMs } = visibility;
  const observedMs = visibleMs + hiddenMs;
  const hiddenShare = observedMs > 0 ? hiddenMs / observedMs : null;
  const sampleCount = streams.reduce((max, stream) => Math.max(max, stream.stats?.count ?? 0), 0);

  const problems: string[] = [];
  const warnings: string[] = [];

  if (summary === null || summary.totalEvents === 0) {
    problems.push('No events were recorded, so there is nothing to measure.');
  }

  if (droppedEvents > 0) {
    problems.push(
      `${droppedEvents} events were dropped from the ring buffer. The log is incomplete and the intervals spanning the loss are wrong.`,
    );
  }

  if (sampleCount > 0 && sampleCount < MIN_SAMPLES) {
    problems.push(
      `Only ${sampleCount} events in the busiest stream. Fewer than ${MIN_SAMPLES} and the medians are noise.`,
    );
  }

  if (observedMs === 0) {
    problems.push('Visibility was never observed, so it is unknown whether the window was hidden.');
  } else if (hiddenMs === 0) {
    problems.push(
      'The window was never hidden during this run. That makes it a visible baseline, not a test of background behaviour.',
    );
  } else {
    if (hiddenShare !== null && hiddenShare < MIN_HIDDEN_SHARE) {
      problems.push(
        `The window was hidden for only ${formatShare(hiddenShare)} of the run. A mixed run averages throttled and unthrottled behaviour together.`,
      );
    }
    if (hiddenMs < INTENSIVE_THROTTLING_DELAY_MS) {
      problems.push(
        `The window was hidden for ${formatDurationMs(hiddenMs)}. Chrome's intensive throttling only engages after five minutes, so a shorter run proves nothing either way.`,
      );
    } else if (hiddenMs < RECOMMENDED_HIDDEN_MS) {
      warnings.push(
        `Hidden for ${formatDurationMs(hiddenMs)}. SPEC asks for ten minutes so there is measurable time on both sides of the five-minute threshold.`,
      );
    }
  }

  if (elapsedMs !== null && observedMs > 0 && observedMs < elapsedMs / 2) {
    warnings.push(
      'Visibility was observed for well under half the run, so the hidden share is a rough figure.',
    );
  }

  return {
    valid: problems.length === 0,
    elapsedMs,
    visibleMs,
    hiddenMs,
    hiddenShare,
    pastIntensiveThreshold: hiddenMs >= INTENSIVE_THROTTLING_DELAY_MS,
    sampleCount,
    droppedEvents,
    problems,
    warnings,
  };
}

// --- The verdict --------------------------------------------------------------

export type Conclusion =
  'browser-viable' | 'electron-needed' | 'no-throttling-observed' | 'anomalous' | 'inconclusive';

export type Confidence = 'high' | 'medium' | 'low' | 'none';

export interface Verdict {
  conclusion: Conclusion;
  /** One sentence a human can act on. */
  summary: string;
  /** The measurements the conclusion rests on. */
  detail: string[];
  confidence: Confidence;
  validity: RunValidity;
  timer: StreamHealth;
  notifications: StreamHealth;
  streams: StreamAssessment[];
}

export const CONCLUSION_LABELS: Record<Conclusion, string> = {
  'browser-viable': 'Browser is viable',
  'electron-needed': 'Electron is needed',
  'no-throttling-observed': 'No throttling observed',
  anomalous: 'Anomalous',
  inconclusive: 'Inconclusive',
};

function decide(
  timer: StreamHealth,
  notifications: StreamHealth,
  validity: RunValidity,
): { c: Conclusion; s: string } {
  // Whether the window was genuinely hidden changes what the same readings mean.
  const wasHidden = validity.hiddenShare !== null && validity.hiddenShare >= MIN_HIDDEN_SHARE;
  if (timer === 'no-data') {
    return {
      c: 'inconclusive',
      s: 'The timer probe recorded nothing. Without the control variable there is nothing to compare the notifications against — start the probe and run it again.',
    };
  }
  if (notifications === 'no-data') {
    return {
      c: 'inconclusive',
      s: 'No BLE notifications were recorded. Connect the trainer (or run with ?fake=) before the run, otherwise only the timer is being measured.',
    };
  }
  if (timer === 'degraded') {
    return {
      c: 'inconclusive',
      s: `The timer was neither clean nor clearly clamped, so it cannot act as a control. Notifications were ${notifications}. Re-run for longer with the window fully hidden.`,
    };
  }
  if (timer === 'throttled') {
    return notifications === 'healthy'
      ? {
          c: 'browser-viable',
          s: 'Chrome throttled the timer but the BLE notifications kept arriving at full rate. A notification-driven tick survives backgrounding, so the app can stay in the browser.',
        }
      : {
          c: 'electron-needed',
          s: 'Chrome throttled the timer and the BLE notifications degraded with it. The browser cannot be relied on to keep a ride running in the background — use Electron with backgroundThrottling: false.',
        };
  }
  if (notifications === 'healthy') {
    return wasHidden && validity.pastIntensiveThreshold
      ? {
          c: 'no-throttling-observed',
          s: 'Nothing was throttled across a run that was genuinely hidden past the five-minute mark. On this evidence Chrome left the tab alone.',
        }
      : {
          c: 'no-throttling-observed',
          s: 'Nothing was throttled. That usually means the window was not genuinely hidden for long enough rather than that Chrome left the tab alone — check the run validity below before reading anything into it.',
        };
  }
  return wasHidden
    ? {
        c: 'anomalous',
        s: "The timer ran clean while the BLE notifications degraded on a hidden window. That is the wrong way round for timer throttling, so the Bluetooth link is the suspect rather than Chrome's clamp — but the practical consequence is the same, a ride in a hidden tab loses data, and Electron is still the fix. Capture a visible baseline to rule out the device itself.",
      }
    : {
        c: 'anomalous',
        s: 'The timer ran clean while the BLE notifications degraded. That is the wrong way round for throttling, so suspect the device or the Bluetooth link rather than the browser.',
      };
}

function describe(stream: StreamAssessment): string {
  const { kind, health, stats } = stream;
  if (stats === undefined || stats.count === 0) return `${kind}: no events recorded.`;
  if (stats.median === null) return `${kind}: ${health} — a single event, no interval to measure.`;
  const gaps = stats.gapsOver5s > 0 ? `, ${stats.gapsOver5s} gaps over 5s` : '';
  return `${kind}: ${health} — median ${formatIntervalMs(stats.median)} across ${stats.count} events${gaps} (expected ${formatIntervalMs(EXPECTED_INTERVAL_MS)}).`;
}

function formatIntervalMs(value: number): string {
  return value < 1000 ? `${Math.round(value)}ms` : `${(value / 1000).toFixed(2)}s`;
}

function confidenceOf(conclusion: Conclusion, validity: RunValidity): Confidence {
  if (conclusion === 'inconclusive') return 'none';
  if (!validity.valid) return 'low';
  return validity.warnings.length > 0 ? 'medium' : 'high';
}

export function computeVerdict(input: VerdictInput): Verdict {
  const streams = assessStreams(input.summary);
  const validity = assessValidity(input, streams);
  const timerStream = streams.find((stream) => stream.kind === TIMER_KIND);
  const timer = timerStream?.health ?? 'no-data';
  const notifications = streams
    .filter((stream) => NOTIFICATION_KINDS.includes(stream.kind))
    .reduce<StreamHealth>((acc, stream) => worse(acc, stream.health), 'no-data');

  const { c, s } = decide(timer, notifications, validity);
  const detail = streams.map(describe);

  if (!validity.valid && c !== 'inconclusive') {
    detail.push('This run is not valid, so treat the conclusion above as unproven.');
  }

  return {
    conclusion: c,
    summary: s,
    detail,
    confidence: confidenceOf(c, validity),
    validity,
    timer,
    notifications,
    streams,
  };
}

// --- Loading a previously exported run ----------------------------------------

export interface LoadedRun {
  /** metadata.source from the file, e.g. "fake:constant" or "real device". */
  source: string;
  startWallClock: string | null;
  userAgent: string | null;
  eventCount: number;
  verdict: Verdict;
}

export type LoadResult = { ok: true; run: LoadedRun } | { ok: false; error: string };

function isRecordedEvent(value: unknown): value is RecordedEvent {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { kind?: unknown; t?: unknown };
  return typeof candidate.kind === 'string' && typeof candidate.t === 'number';
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/**
 * Parses an exported log for side-by-side comparison. The summary is recomputed
 * from the events rather than trusted, so a hand-edited or older export still
 * produces numbers built by the same code as the live run's.
 */
export function parseLogExport(text: string): LoadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: 'That JSON is not a Contour experiment log.' };
  }

  const root = parsed as { events?: unknown; metadata?: unknown };
  if (!Array.isArray(root.events)) {
    return { ok: false, error: 'That JSON is not a Contour experiment log: no events array.' };
  }

  const events = root.events.filter(isRecordedEvent);
  if (!events.some((event) => EVENT_KINDS.includes(event.kind))) {
    return {
      ok: false,
      error: 'That file has an events array but none of them are experiment events.',
    };
  }

  const metadata = (
    typeof root.metadata === 'object' && root.metadata !== null ? root.metadata : {}
  ) as Record<string, unknown>;
  const droppedEvents = typeof metadata.dropped === 'number' ? metadata.dropped : 0;

  return {
    ok: true,
    run: {
      source: stringOrNull(metadata.source) ?? 'unknown source',
      startWallClock: stringOrNull(metadata.startWallClock),
      userAgent: stringOrNull(metadata.userAgent),
      eventCount: events.length,
      verdict: computeVerdict({
        summary: summarise(events),
        visibility: visibilityTotalsFromEvents(events),
        droppedEvents,
      }),
    },
  };
}
