import { describe, expect, it } from 'vitest';
import { summarise } from './stats';
import type { EventKind, RecordedEvent } from './types';
import {
  assessValidity,
  assessStreams,
  classifyNotifications,
  classifyTimer,
  computeVerdict,
  formatDurationMs,
  formatShare,
  HEALTHY_MEDIAN_MS,
  INTENSIVE_THROTTLING_DELAY_MS,
  MIN_SAMPLES,
  NO_VISIBILITY,
  parseLogExport,
  THROTTLED_MEDIAN_MS,
  visibilityTotalsFromEvents,
  VisibilityTracker,
  type StreamHealth,
  type VerdictInput,
  type VisibilityTotals,
} from './verdict';

const MINUTE = 60_000;

function at(kind: EventKind, t: number, detail?: RecordedEvent['detail']): RecordedEvent {
  return { kind, t, wallClock: new Date(t).toISOString(), ...(detail ? { detail } : {}) };
}

/** `count` events of `kind` spaced `intervalMs` apart, starting at `start`. */
function series(
  kind: EventKind,
  start: number,
  intervalMs: number,
  count: number,
): RecordedEvent[] {
  return Array.from({ length: count }, (_, i) => at(kind, start + i * intervalMs));
}

function merged(...lists: RecordedEvent[][]): RecordedEvent[] {
  return lists.flat().sort((a, b) => a.t - b.t);
}

function statsOf(kind: EventKind, events: RecordedEvent[]) {
  return summarise(events).byKind.find((entry) => entry.kind === kind);
}

/** Intervals of exactly `median` ms, enough of them to satisfy MIN_SAMPLES. */
function streamAt(kind: EventKind, median: number, count = MIN_SAMPLES + 5): RecordedEvent[] {
  return series(kind, 0, median, count);
}

/** A run that passes every validity check, so verdict tests isolate the decision table. */
function validRun(timerMs: number, notificationMs: number): VerdictInput {
  const hiddenMs = 12 * MINUTE;
  const events = merged(
    streamAt('timer-tick', timerMs, Math.max(MIN_SAMPLES, Math.ceil(hiddenMs / timerMs))),
    streamAt(
      'ibd-notification',
      notificationMs,
      Math.max(MIN_SAMPLES, Math.ceil(hiddenMs / notificationMs)),
    ),
  );
  return {
    summary: summarise(events),
    visibility: { visibleMs: 0, hiddenMs },
    droppedEvents: 0,
  };
}

describe('classifyTimer', () => {
  it('has no verdict on an absent or single-event stream', () => {
    expect(classifyTimer(undefined)).toBe('no-data');
    expect(classifyTimer(statsOf('timer-tick', [at('timer-tick', 0)]))).toBe('no-data');
  });

  it('is healthy at the expected 1 Hz rate', () => {
    expect(classifyTimer(statsOf('timer-tick', streamAt('timer-tick', 1000)))).toBe('healthy');
  });

  it('is healthy just under the healthy threshold and degraded at it', () => {
    expect(
      classifyTimer(statsOf('timer-tick', streamAt('timer-tick', HEALTHY_MEDIAN_MS - 1))),
    ).toBe('healthy');
    expect(classifyTimer(statsOf('timer-tick', streamAt('timer-tick', HEALTHY_MEDIAN_MS)))).toBe(
      'degraded',
    );
  });

  it('is degraded at the throttled threshold and throttled just beyond it', () => {
    expect(classifyTimer(statsOf('timer-tick', streamAt('timer-tick', THROTTLED_MEDIAN_MS)))).toBe(
      'degraded',
    );
    expect(
      classifyTimer(statsOf('timer-tick', streamAt('timer-tick', THROTTLED_MEDIAN_MS + 1))),
    ).toBe('throttled');
  });

  it("is throttled at Chrome's one-per-minute clamp", () => {
    expect(classifyTimer(statsOf('timer-tick', streamAt('timer-tick', MINUTE)))).toBe('throttled');
  });

  it('ignores gaps when the median is clean, since the median defines a clamp', () => {
    const events = merged(streamAt('ibd-notification', 1000), [at('timer-tick', 0)]);
    const withGap = [...series('timer-tick', 0, 1000, 25), at('timer-tick', 24_000 + 30_000)];
    expect(statsOf('timer-tick', withGap)?.gapsOver5s).toBe(1);
    expect(classifyTimer(statsOf('timer-tick', withGap))).toBe('healthy');
    expect(events).toHaveLength(MIN_SAMPLES + 6);
  });
});

describe('classifyNotifications', () => {
  it('has no verdict on an absent or single-event stream', () => {
    expect(classifyNotifications(undefined)).toBe('no-data');
    expect(classifyNotifications(statsOf('ibd-notification', [at('ibd-notification', 0)]))).toBe(
      'no-data',
    );
  });

  it('uses the same three bands as the timer', () => {
    const band = (interval: number): StreamHealth =>
      classifyNotifications(statsOf('ibd-notification', streamAt('ibd-notification', interval)));
    expect(band(1000)).toBe('healthy');
    expect(band(HEALTHY_MEDIAN_MS - 1)).toBe('healthy');
    expect(band(HEALTHY_MEDIAN_MS)).toBe('degraded');
    expect(band(THROTTLED_MEDIAN_MS)).toBe('degraded');
    expect(band(THROTTLED_MEDIAN_MS + 1)).toBe('throttled');
  });

  it('downgrades a clean median to degraded when a gap over 5s dropped data', () => {
    const events = [
      ...series('ibd-notification', 0, 1000, 25),
      at('ibd-notification', 24_000 + 30_000),
    ];
    expect(statsOf('ibd-notification', events)?.gapsOver5s).toBe(1);
    expect(classifyNotifications(statsOf('ibd-notification', events))).toBe('degraded');
  });

  it('does not upgrade an already-throttled stream because of its gaps', () => {
    const events = streamAt('ibd-notification', MINUTE);
    expect(classifyNotifications(statsOf('ibd-notification', events))).toBe('throttled');
  });
});

describe('assessStreams', () => {
  it('returns the timer and both notification kinds in canonical order', () => {
    const streams = assessStreams(null);
    expect(streams.map((stream) => stream.kind)).toEqual([
      'ibd-notification',
      'timer-tick',
      'hr-notification',
    ]);
    expect(streams.every((stream) => stream.health === 'no-data')).toBe(true);
  });

  it('classifies each present stream independently', () => {
    const events = merged(
      streamAt('timer-tick', MINUTE),
      streamAt('ibd-notification', 1000),
      streamAt('hr-notification', 1000),
    );
    const streams = assessStreams(summarise(events));
    expect(streams.find((s) => s.kind === 'timer-tick')?.health).toBe('throttled');
    expect(streams.find((s) => s.kind === 'ibd-notification')?.health).toBe('healthy');
    expect(streams.find((s) => s.kind === 'hr-notification')?.health).toBe('healthy');
  });
});

describe('visibilityTotalsFromEvents', () => {
  it('is zero for an empty log', () => {
    expect(visibilityTotalsFromEvents([])).toEqual(NO_VISIBILITY);
  });

  it('counts a run with no visibility changes as entirely visible', () => {
    const events = series('timer-tick', 0, 1000, 11);
    expect(visibilityTotalsFromEvents(events)).toEqual({ visibleMs: 10_000, hiddenMs: 0 });
  });

  it('splits the run at each visibility change', () => {
    const events = merged(
      [at('timer-tick', 0), at('timer-tick', 100_000)],
      [
        at('visibility-change', 20_000, { visibilityState: 'hidden' }),
        at('visibility-change', 80_000, { visibilityState: 'visible' }),
      ],
    );
    expect(visibilityTotalsFromEvents(events)).toEqual({ visibleMs: 40_000, hiddenMs: 60_000 });
  });

  it('honours a stated initial state', () => {
    const events = [
      at('timer-tick', 0),
      at('visibility-change', 30_000, { visibilityState: 'visible' }),
      at('timer-tick', 50_000),
    ];
    expect(visibilityTotalsFromEvents(events, 'hidden')).toEqual({
      visibleMs: 20_000,
      hiddenMs: 30_000,
    });
  });

  it('ignores repeated and malformed visibility events', () => {
    const events = [
      at('timer-tick', 0),
      at('visibility-change', 10_000, { visibilityState: 'hidden' }),
      at('visibility-change', 20_000, { visibilityState: 'hidden' }),
      at('visibility-change', 30_000, { visibilityState: 'nonsense' }),
      at('timer-tick', 40_000),
    ];
    expect(visibilityTotalsFromEvents(events)).toEqual({ visibleMs: 10_000, hiddenMs: 30_000 });
  });
});

describe('VisibilityTracker', () => {
  it('starts empty and ignores the first observation, which only sets the clock', () => {
    const tracker = new VisibilityTracker();
    expect(tracker.totals()).toEqual(NO_VISIBILITY);
    tracker.observe('visible', 1000);
    expect(tracker.totals()).toEqual(NO_VISIBILITY);
  });

  it('attributes elapsed time to the state in force over it', () => {
    const tracker = new VisibilityTracker();
    tracker.observe('visible', 0);
    tracker.observe('hidden', 5000);
    tracker.observe('visible', 65_000);
    expect(tracker.totals()).toEqual({ visibleMs: 5000, hiddenMs: 60_000 });
  });

  it('is unaffected by how often it is observed between changes', () => {
    const sparse = new VisibilityTracker();
    sparse.observe('visible', 0);
    sparse.observe('hidden', 1000);
    sparse.observe('visible', 61_000);

    const busy = new VisibilityTracker();
    busy.observe('visible', 0);
    busy.observe('hidden', 1000);
    for (let t = 2000; t <= 61_000; t += 1000) busy.observe('hidden', t);
    busy.observe('visible', 61_000);

    expect(busy.totals()).toEqual(sparse.totals());
  });

  it('ignores a clock that goes backwards rather than subtracting time', () => {
    const tracker = new VisibilityTracker();
    tracker.observe('hidden', 10_000);
    tracker.observe('hidden', 5000);
    expect(tracker.totals()).toEqual(NO_VISIBILITY);
  });

  it('notifies subscribers only when the totals actually change', () => {
    const tracker = new VisibilityTracker();
    let notifications = 0;
    const unsubscribe = tracker.subscribe(() => {
      notifications += 1;
    });

    expect(tracker.getSnapshot()).toEqual(NO_VISIBILITY);
    tracker.observe('visible', 0);
    expect(notifications).toBe(0);

    tracker.observe('hidden', 5000);
    expect(notifications).toBe(1);
    expect(tracker.getSnapshot()).toEqual({ visibleMs: 5000, hiddenMs: 0 });

    // No time passed, so nothing changed and nothing is published.
    tracker.observe('hidden', 5000);
    expect(notifications).toBe(1);

    unsubscribe();
    tracker.observe('visible', 65_000);
    expect(notifications).toBe(1);
  });

  it('keeps the published snapshot identity stable between changes', () => {
    const tracker = new VisibilityTracker();
    tracker.observe('visible', 0);
    tracker.observe('hidden', 1000);
    const first = tracker.getSnapshot();
    expect(tracker.getSnapshot()).toBe(first);
    tracker.observe('visible', 61_000);
    expect(tracker.getSnapshot()).not.toBe(first);
  });

  it('reset clears the totals and the clock', () => {
    const tracker = new VisibilityTracker();
    tracker.observe('hidden', 0);
    tracker.observe('visible', 60_000);
    tracker.reset();
    expect(tracker.totals()).toEqual(NO_VISIBILITY);
    expect(tracker.getSnapshot()).toEqual(NO_VISIBILITY);
  });
});

describe('assessValidity', () => {
  const streamsFor = (input: VerdictInput) => assessStreams(input.summary);

  it('accepts a long, fully hidden, complete run', () => {
    const input = validRun(MINUTE, 1000);
    const validity = assessValidity(input, streamsFor(input));
    expect(validity.valid).toBe(true);
    expect(validity.problems).toEqual([]);
    expect(validity.warnings).toEqual([]);
    expect(validity.pastIntensiveThreshold).toBe(true);
    expect(validity.hiddenShare).toBe(1);
  });

  it('rejects an empty run', () => {
    const input: VerdictInput = {
      summary: null,
      visibility: NO_VISIBILITY,
      droppedEvents: 0,
    };
    const validity = assessValidity(input, streamsFor(input));
    expect(validity.valid).toBe(false);
    expect(validity.problems[0]).toContain('No events');
    expect(validity.elapsedMs).toBeNull();
    expect(validity.hiddenShare).toBeNull();
    expect(validity.sampleCount).toBe(0);
  });

  it('rejects a run that dropped events from the ring buffer', () => {
    const input = { ...validRun(MINUTE, 1000), droppedEvents: 37 };
    const validity = assessValidity(input, streamsFor(input));
    expect(validity.valid).toBe(false);
    expect(validity.problems.join(' ')).toContain('37 events were dropped');
  });

  it('rejects a run shorter than the five-minute intensive throttling threshold', () => {
    const events = merged(
      series('timer-tick', 0, 1000, 121),
      series('ibd-notification', 0, 1000, 121),
    );
    const input: VerdictInput = {
      summary: summarise(events),
      visibility: { visibleMs: 0, hiddenMs: 2 * MINUTE },
      droppedEvents: 0,
    };
    const validity = assessValidity(input, streamsFor(input));
    expect(validity.valid).toBe(false);
    expect(validity.pastIntensiveThreshold).toBe(false);
    expect(validity.problems.join(' ')).toContain('five minutes');
  });

  it('rejects a run where the window was never hidden', () => {
    const input = { ...validRun(1000, 1000), visibility: { visibleMs: 12 * MINUTE, hiddenMs: 0 } };
    const validity = assessValidity(input, streamsFor(input));
    expect(validity.valid).toBe(false);
    expect(validity.hiddenShare).toBe(0);
    expect(validity.problems.join(' ')).toContain('never hidden');
  });

  it('rejects a run only half spent hidden', () => {
    const input = {
      ...validRun(MINUTE, 1000),
      visibility: { visibleMs: 6 * MINUTE, hiddenMs: 6 * MINUTE },
    };
    const validity = assessValidity(input, streamsFor(input));
    expect(validity.valid).toBe(false);
    expect(validity.problems.join(' ')).toContain('50% of the run');
  });

  it('rejects a run with too few samples to take a median from', () => {
    const events = merged(
      series('timer-tick', 0, MINUTE, 6),
      series('ibd-notification', 0, MINUTE, 6),
    );
    const input: VerdictInput = {
      summary: summarise(events),
      visibility: { visibleMs: 0, hiddenMs: 12 * MINUTE },
      droppedEvents: 0,
    };
    const validity = assessValidity(input, streamsFor(input));
    expect(validity.valid).toBe(false);
    expect(validity.problems.join(' ')).toContain(`Fewer than ${MIN_SAMPLES}`);
  });

  it('does not let a correctly throttled timer invalidate its own run', () => {
    // Ten ticks in ten minutes is exactly what a clamped timer looks like.
    const events = merged(
      series('timer-tick', 0, MINUTE, 11),
      series('ibd-notification', 0, 1000, 601),
    );
    const input: VerdictInput = {
      summary: summarise(events),
      visibility: { visibleMs: 0, hiddenMs: 10 * MINUTE },
      droppedEvents: 0,
    };
    const validity = assessValidity(input, streamsFor(input));
    expect(validity.sampleCount).toBe(601);
    expect(validity.valid).toBe(true);
  });

  it('warns rather than rejects when hidden past five minutes but under ten', () => {
    const events = merged(
      series('timer-tick', 0, MINUTE, 7),
      series('ibd-notification', 0, 1000, 361),
    );
    const input: VerdictInput = {
      summary: summarise(events),
      visibility: { visibleMs: 0, hiddenMs: 6 * MINUTE },
      droppedEvents: 0,
    };
    const validity = assessValidity(input, streamsFor(input));
    expect(validity.valid).toBe(true);
    expect(validity.warnings.join(' ')).toContain('ten minutes');
  });

  it('flags the five-minute boundary exactly', () => {
    const base = validRun(MINUTE, 1000);
    const under: VisibilityTotals = {
      visibleMs: 0,
      hiddenMs: INTENSIVE_THROTTLING_DELAY_MS - 1,
    };
    const exactly: VisibilityTotals = { visibleMs: 0, hiddenMs: INTENSIVE_THROTTLING_DELAY_MS };
    expect(
      assessValidity({ ...base, visibility: under }, streamsFor(base)).pastIntensiveThreshold,
    ).toBe(false);
    expect(
      assessValidity({ ...base, visibility: exactly }, streamsFor(base)).pastIntensiveThreshold,
    ).toBe(true);
  });
});

describe('computeVerdict decision table', () => {
  it('throttled timer with healthy notifications means the browser is viable', () => {
    const verdict = computeVerdict(validRun(MINUTE, 1000));
    expect(verdict.conclusion).toBe('browser-viable');
    expect(verdict.timer).toBe('throttled');
    expect(verdict.notifications).toBe('healthy');
    expect(verdict.confidence).toBe('high');
    expect(verdict.summary).toContain('notification-driven tick survives');
  });

  it('throttled timer with degraded notifications means Electron is needed', () => {
    const verdict = computeVerdict(validRun(MINUTE, 3000));
    expect(verdict.notifications).toBe('degraded');
    expect(verdict.conclusion).toBe('electron-needed');
    expect(verdict.summary).toContain('backgroundThrottling');
  });

  it('throttled timer with throttled notifications means Electron is needed', () => {
    const verdict = computeVerdict(validRun(MINUTE, MINUTE));
    expect(verdict.notifications).toBe('throttled');
    expect(verdict.conclusion).toBe('electron-needed');
  });

  it('healthy timer with healthy notifications means nothing was throttled', () => {
    const verdict = computeVerdict(validRun(1000, 1000));
    expect(verdict.conclusion).toBe('no-throttling-observed');
    // The run really was hidden past five minutes, so the summary must not hedge
    // toward "you probably didn't hide the window".
    expect(verdict.summary).toContain('genuinely hidden past the five-minute mark');
    expect(verdict.summary).not.toContain('not genuinely hidden');
  });

  it('hedges when nothing was throttled but the window was never hidden', () => {
    const base = validRun(1000, 1000);
    const verdict = computeVerdict({
      ...base,
      visibility: { visibleMs: 12 * MINUTE, hiddenMs: 0 },
    });
    expect(verdict.conclusion).toBe('no-throttling-observed');
    expect(verdict.summary).toContain('not genuinely hidden');
  });

  it('points at Electron when notifications degrade on a genuinely hidden run', () => {
    // Timer clean but notifications dropping is the wrong way round for throttling.
    // The cause is the Bluetooth link, but the consequence is still lost ride data.
    const verdict = computeVerdict(validRun(1000, 9000));
    expect(verdict.conclusion).toBe('anomalous');
    expect(verdict.summary).toContain('Electron');
    expect(verdict.summary).toContain('visible baseline');
  });

  it('healthy timer with degraded notifications is anomalous', () => {
    const verdict = computeVerdict(validRun(1000, 3000));
    expect(verdict.conclusion).toBe('anomalous');
    expect(verdict.summary).toContain('device');
  });

  it('healthy timer with throttled notifications is anomalous', () => {
    const verdict = computeVerdict(validRun(1000, MINUTE));
    expect(verdict.conclusion).toBe('anomalous');
  });

  it('takes the worse of the two notification streams', () => {
    const events = merged(
      series('timer-tick', 0, MINUTE, 13),
      series('ibd-notification', 0, 1000, 721),
      series('hr-notification', 0, MINUTE, 13),
    );
    const verdict = computeVerdict({
      summary: summarise(events),
      visibility: { visibleMs: 0, hiddenMs: 12 * MINUTE },
      droppedEvents: 0,
    });
    expect(verdict.notifications).toBe('throttled');
    expect(verdict.conclusion).toBe('electron-needed');
  });

  it('is inconclusive with no timer to use as a control', () => {
    const events = series('ibd-notification', 0, 1000, 721);
    const verdict = computeVerdict({
      summary: summarise(events),
      visibility: { visibleMs: 0, hiddenMs: 12 * MINUTE },
      droppedEvents: 0,
    });
    expect(verdict.conclusion).toBe('inconclusive');
    expect(verdict.confidence).toBe('none');
    expect(verdict.summary).toContain('timer probe recorded nothing');
  });

  it('is inconclusive with no notifications to compare against', () => {
    const events = series('timer-tick', 0, MINUTE, 13);
    const verdict = computeVerdict({
      summary: summarise(events),
      visibility: { visibleMs: 0, hiddenMs: 12 * MINUTE },
      droppedEvents: 0,
    });
    expect(verdict.conclusion).toBe('inconclusive');
    expect(verdict.summary).toContain('No BLE notifications');
  });

  it('is inconclusive when the timer is degraded, so there is no clean control', () => {
    const verdict = computeVerdict(validRun(3000, 1000));
    expect(verdict.timer).toBe('degraded');
    expect(verdict.conclusion).toBe('inconclusive');
  });
});

describe('computeVerdict on empty and thin input', () => {
  it('returns an inconclusive verdict with no confidence for an empty run', () => {
    const verdict = computeVerdict({
      summary: null,
      visibility: NO_VISIBILITY,
      droppedEvents: 0,
    });
    expect(verdict.conclusion).toBe('inconclusive');
    expect(verdict.confidence).toBe('none');
    expect(verdict.validity.valid).toBe(false);
    expect(verdict.detail).toHaveLength(3);
    expect(verdict.detail[0]).toContain('no events recorded');
  });

  it('returns an inconclusive verdict for a single event of each kind', () => {
    const events = merged([at('timer-tick', 0)], [at('ibd-notification', 0)]);
    const verdict = computeVerdict({
      summary: summarise(events),
      visibility: NO_VISIBILITY,
      droppedEvents: 0,
    });
    expect(verdict.timer).toBe('no-data');
    expect(verdict.notifications).toBe('no-data');
    expect(verdict.conclusion).toBe('inconclusive');
  });
});

describe('computeVerdict confidence and warnings', () => {
  it('drops to low confidence and flags the detail when the run is invalid', () => {
    const input = { ...validRun(MINUTE, 1000), droppedEvents: 5 };
    const verdict = computeVerdict(input);
    expect(verdict.conclusion).toBe('browser-viable');
    expect(verdict.validity.valid).toBe(false);
    expect(verdict.confidence).toBe('low');
    expect(verdict.detail.at(-1)).toContain('not valid');
  });

  it('is medium confidence on a valid run carrying a warning', () => {
    const events = merged(
      series('timer-tick', 0, MINUTE, 7),
      series('ibd-notification', 0, 1000, 361),
    );
    const verdict = computeVerdict({
      summary: summarise(events),
      visibility: { visibleMs: 0, hiddenMs: 6 * MINUTE },
      droppedEvents: 0,
    });
    expect(verdict.conclusion).toBe('browser-viable');
    expect(verdict.confidence).toBe('medium');
  });

  it('reports a never-hidden run as no-throttling-observed but invalid', () => {
    const input = { ...validRun(1000, 1000), visibility: { visibleMs: 12 * MINUTE, hiddenMs: 0 } };
    const verdict = computeVerdict(input);
    expect(verdict.conclusion).toBe('no-throttling-observed');
    expect(verdict.confidence).toBe('low');
    expect(verdict.validity.problems.join(' ')).toContain('never hidden');
  });

  it('names the measured median in the detail lines', () => {
    const verdict = computeVerdict(validRun(MINUTE, 1000));
    expect(verdict.detail.join(' ')).toContain('timer-tick: throttled — median 60.00s');
    expect(verdict.detail.join(' ')).toContain('ibd-notification: healthy — median 1.00s');
  });
});

describe('parseLogExport', () => {
  const log = (events: RecordedEvent[], metadata: Record<string, unknown> = {}) =>
    JSON.stringify({
      metadata: { source: 'fake:constant', dropped: 0, ...metadata },
      summary: summarise(events),
      events,
    });

  it('rejects text that is not JSON', () => {
    const result = parseLogExport('not json at all');
    expect(result).toEqual({ ok: false, error: 'That file is not valid JSON.' });
  });

  it('rejects JSON that is not an object', () => {
    expect(parseLogExport('[1, 2, 3]')).toEqual({
      ok: false,
      error: 'That JSON is not a Contour experiment log.',
    });
    expect(parseLogExport('42').ok).toBe(false);
  });

  it('rejects an unrelated object with no events array', () => {
    const result = parseLogExport(JSON.stringify({ type: 'FeatureCollection', features: [] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('no events array');
  });

  it('rejects an events array holding something else', () => {
    const result = parseLogExport(
      JSON.stringify({ events: [{ name: 'gig', date: '2026-01-01' }] }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('none of them are experiment events');
  });

  it('parses a real export and recomputes its verdict', () => {
    const events = merged(
      series('timer-tick', 0, MINUTE, 13),
      series('ibd-notification', 0, 1000, 721),
      [
        at('visibility-change', 0, { visibilityState: 'hidden' }),
        at('visibility-change', 12 * MINUTE, { visibilityState: 'visible' }),
      ],
    );
    const result = parseLogExport(log(events, { startWallClock: '2026-09-30T10:00:00.000Z' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.run.source).toBe('fake:constant');
    expect(result.run.startWallClock).toBe('2026-09-30T10:00:00.000Z');
    expect(result.run.eventCount).toBe(events.length);
    expect(result.run.verdict.conclusion).toBe('browser-viable');
    expect(result.run.verdict.validity.hiddenMs).toBe(12 * MINUTE);
  });

  it('ignores the stored summary and rebuilds it from the events', () => {
    const events = series('timer-tick', 0, MINUTE, 13);
    const tampered = JSON.stringify({
      metadata: { source: 'real device' },
      summary: { totalEvents: 999999, byKind: [] },
      events,
    });
    const result = parseLogExport(tampered);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.run.verdict.timer).toBe('throttled');
  });

  it('carries dropped events through to the validity assessment', () => {
    const events = merged(
      series('timer-tick', 0, MINUTE, 13),
      series('ibd-notification', 0, 1000, 721),
    );
    const result = parseLogExport(log(events, { dropped: 12 }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.run.verdict.validity.droppedEvents).toBe(12);
    expect(result.run.verdict.validity.valid).toBe(false);
  });

  it('falls back to safe defaults when metadata is missing', () => {
    const events = series('ibd-notification', 0, 1000, 30);
    const result = parseLogExport(JSON.stringify({ events }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.run.source).toBe('unknown source');
    expect(result.run.startWallClock).toBeNull();
    expect(result.run.userAgent).toBeNull();
    expect(result.run.verdict.validity.droppedEvents).toBe(0);
  });
});

describe('formatting helpers', () => {
  it('formats durations as minutes and seconds', () => {
    expect(formatDurationMs(null)).toBe('unknown');
    expect(formatDurationMs(0)).toBe('0s');
    expect(formatDurationMs(45_400)).toBe('45s');
    expect(formatDurationMs(5 * MINUTE)).toBe('5m 0s');
    expect(formatDurationMs(11 * MINUTE + 30_000)).toBe('11m 30s');
  });

  it('formats shares as whole percentages', () => {
    expect(formatShare(null)).toBe('unknown');
    expect(formatShare(0)).toBe('0%');
    expect(formatShare(0.826)).toBe('83%');
    expect(formatShare(1)).toBe('100%');
  });
});
