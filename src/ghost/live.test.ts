import { describe, expect, it, vi } from 'vitest';

import { lapSplits } from '../ride/metrics';
import type { Ride, RideSample, RideSamples, RideSettings } from '../storage/types';
import { GhostTracker, candidatePool, liveLaps, type GhostStorage } from './live';

const SETTINGS: RideSettings = {
  trainerDifficulty: 60,
  workoutScalePct: 100,
  ergMode: 'erg',
  ftp: 250,
  hrMax: 186,
  riderMassKg: 75,
  bikeMassKg: 9,
};

const LAP_M = 1000;
/** 10 m/s, so a lap is a round hundred seconds and a split is easy to read. */
const SPEED_MS = 10;
const LIVE_ID = 'live-ride';
const ROUTE_ID = 'route-1';
const STARTED_AT = '2026-10-20T09:00:00.000Z';

function ride(patch: Partial<Ride> & { id: string }): Ride {
  return {
    updatedAt: '2026-09-29T10:00:00.000Z',
    routeId: ROUTE_ID,
    routeName: 'Rolling',
    workoutId: null,
    workoutName: null,
    startedAt: '2026-09-29T09:00:00.000Z',
    elapsedS: 600,
    pausedS: 0,
    distanceM: 3000,
    ascentM: 20,
    avgPowerW: 200,
    avgHeartRateBpm: 140,
    tss: 30,
    lapSplits: [],
    settings: SETTINGS,
    ...patch,
  };
}

/** A steady ride at one sample a second, which is what the engine emits. */
function ridden(seconds: number, metresPerSecond = SPEED_MS): RideSample[] {
  const samples: RideSample[] = [];
  for (let t = 0; t <= seconds; t += 1) {
    samples.push({
      t,
      distanceM: t * metresPerSecond,
      speedKmh: metresPerSecond * 3.6,
      powerW: 200,
      cadenceRpm: 88,
      heartRateBpm: 140,
      lat: null,
      lon: null,
      eleM: null,
    });
  }
  return samples;
}

/** The two repositories a tracker reads, over plain maps. */
function storageOf(
  rides: readonly Ride[],
  series: Record<string, RideSample[]> = {},
): GhostStorage {
  const unsupported = () => Promise.reject(new Error('not used'));
  return {
    rides: {
      list: () => Promise.resolve([...rides]),
      get: (id) => Promise.resolve(rides.find((item) => item.id === id)),
      put: unsupported,
      delete: unsupported,
    },
    rideSamples: {
      list: () => Promise.resolve([]),
      get: (id) =>
        Promise.resolve(
          series[id] === undefined
            ? undefined
            : ({ id, updatedAt: STARTED_AT, samples: series[id] } satisfies RideSamples),
        ),
      put: unsupported,
      delete: unsupported,
    },
  };
}

interface TrackerHarness {
  tracker: GhostTracker;
  /** Rides on to a given second, one tick at a time: the tracker watches for the line
   * crossing as it goes past, which is the whole reason it is fed every second. */
  rideTo: (seconds: number) => void;
  samples: () => readonly RideSample[];
}

function harness(options: {
  stored?: readonly Ride[];
  series?: Record<string, RideSample[]>;
  loops?: boolean;
  chosenRideId?: string | null;
}): TrackerHarness {
  let samples: RideSample[] = [];
  const tracker = new GhostTracker({
    storage: storageOf(options.stored ?? [], options.series),
    routeId: ROUTE_ID,
    rideId: LIVE_ID,
    startedAt: STARTED_AT,
    routeLengthM: LAP_M,
    loops: options.loops ?? true,
    samples: () => samples,
    now: () => Date.parse('2026-10-20T10:00:00.000Z'),
    selection: {
      best: true,
      year: true,
      last: true,
      chosenRideId: options.chosenRideId ?? null,
    },
    onFailure: () => {},
  });

  const whole = ridden(3600);
  let at = 0;
  return {
    tracker,
    samples: () => samples,
    rideTo: (seconds: number) => {
      for (; at <= seconds; at += 1) {
        samples = whole.slice(0, at + 1);
        const last = samples[samples.length - 1];
        tracker.update({ elapsedS: last?.t ?? 0, distanceM: last?.distanceM ?? 0 });
      }
    },
  };
}

describe('liveLaps', () => {
  it('places each lap at the ride start plus the splits so far', () => {
    const laps = liveLaps({
      rideId: LIVE_ID,
      startedAtMs: Date.parse(STARTED_AT),
      splits: [100, 110],
    });

    expect(laps).toEqual([
      {
        rideId: LIVE_ID,
        lapIndex: 0,
        durationS: 100,
        completedAtMs: Date.parse(STARTED_AT) + 100_000,
      },
      {
        rideId: LIVE_ID,
        lapIndex: 1,
        durationS: 110,
        completedAtMs: Date.parse(STARTED_AT) + 210_000,
      },
    ]);
  });
});

describe('candidatePool', () => {
  it('takes the live ride from the recorder and not from its stale stored copy', () => {
    // What a checkpoint wrote thirty seconds ago: one lap, where two have been ridden.
    const stale = ride({ id: LIVE_ID, lapSplits: [100] });

    const pool = candidatePool({
      stored: [stale, ride({ id: 'old', lapSplits: [120] })],
      routeId: ROUTE_ID,
      live: { rideId: LIVE_ID, startedAtMs: Date.parse(STARTED_AT), splits: [100, 98] },
    });

    expect(pool.filter((lap) => lap.rideId === LIVE_ID).map((lap) => lap.durationS)).toEqual([
      100, 98,
    ]);
    expect(pool.map((lap) => lap.rideId)).toEqual(['old', LIVE_ID, LIVE_ID]);
  });
});

describe('GhostTracker', () => {
  it('races a lap of the live ride as soon as it is recorded, with no checkpoint', async () => {
    // Nothing in storage at all: the only ghost available is the lap just ridden.
    const live = harness({ stored: [] });
    await live.tracker.start();

    live.rideTo(99);
    expect(live.tracker.update({ elapsedS: 99, distanceM: 990 })).toEqual([]);

    // Two seconds later the line is behind them and the lap is in the recorder's series.
    live.rideTo(101);
    await vi.waitFor(() => {
      const racing = live.tracker.update({ elapsedS: 101, distanceM: 1010 });
      // One lap in the pool fills one slot: nothing falls through to Year or Last.
      expect(racing.map((ghost) => ghost.slot)).toEqual(['best']);
    });

    // And it is the lap that was just ridden, not a stored copy of one.
    expect(lapSplits(live.samples(), LAP_M)).toHaveLength(1);
  });

  it('re-resolves at the line and never part way round one', async () => {
    // A slow stored lap, so the live ride's first lap takes Best away from it when the
    // rider crosses the line — a swap with a visible before and after.
    const slow = ride({ id: 'old', lapSplits: [200] });
    const live = harness({ stored: [slow], series: { old: ridden(200, LAP_M / 200) } });
    await live.tracker.start();

    await vi.waitFor(() => {
      expect(live.tracker.update({ elapsedS: 1, distanceM: 10 })[0]?.slot).toBe('best');
    });
    const beforeLine = live.tracker.update({ elapsedS: 50, distanceM: 500 });
    expect(beforeLine).toHaveLength(1);
    // The stored lap took 200 s for 1 000 m, so it was at 500 m on 100 s: the rider is
    // fifty up on it.
    expect(beforeLine[0]?.gapS).toBeCloseTo(-50, 1);

    // Half a lap further on, still mid-lap. The gap has to have moved by the riding and
    // by nothing else — a ghost swapped under the rider here would step it to nought.
    live.rideTo(90);
    const midLap = live.tracker.update({ elapsedS: 90, distanceM: 900 });
    expect(midLap).toHaveLength(1);
    expect(midLap[0]?.gapS).toBeCloseTo(-90, 1);

    // Over the line: now there is a second lap in the pool and a second slot filled.
    live.rideTo(105);
    await vi.waitFor(() => {
      expect(live.tracker.update({ elapsedS: 105, distanceM: 1050 })).toHaveLength(2);
    });
  });

  it('restarts the rider’s lap clock at the line, so the gap resets with it', async () => {
    const live = harness({ stored: [] });
    await live.tracker.start();

    live.rideTo(150);
    await vi.waitFor(() => {
      expect(live.tracker.update({ elapsedS: 150, distanceM: 1500 })).toHaveLength(1);
    });

    // 150 s in, 50 s into lap two, against a first lap that took 100. The rider is half
    // way round and the ghost was here at 50 s, so they are level.
    const racing = live.tracker.update({ elapsedS: 150, distanceM: 1500 });
    const best = racing.find((ghost) => ghost.slot === 'best');
    expect(best?.gapS).toBeCloseTo(0, 1);
    expect(best?.distanceM).toBeCloseTo(500, 0);
  });

  it('reads a point-to-point ride as one lap, which is the ride', async () => {
    const line = harness({ stored: [], loops: false });
    await line.tracker.start();
    line.rideTo(150);

    // No line to cross, so nothing resolved from the live ride's own second lap: the
    // rider's lap is the whole ride and the clock never restarts.
    const racing = line.tracker.update({ elapsedS: 150, distanceM: 1500 });
    expect(racing.every((ghost) => ghost.distanceM <= LAP_M)).toBe(true);
  });

  it('drops a ghost whose samples cannot be read rather than alerting', async () => {
    const failures: unknown[] = [];
    const missing = ride({ id: 'old', lapSplits: [120] });
    const tracker = new GhostTracker({
      // The ride record is there; its series is not.
      storage: storageOf([missing]),
      routeId: ROUTE_ID,
      rideId: LIVE_ID,
      startedAt: STARTED_AT,
      routeLengthM: LAP_M,
      loops: true,
      samples: () => [],
      now: () => Date.parse('2026-10-20T10:00:00.000Z'),
      selection: { best: true, year: true, last: true, chosenRideId: null },
      onFailure: (error) => failures.push(error),
    });

    await tracker.start();
    await Promise.resolve();
    expect(tracker.update({ elapsedS: 10, distanceM: 100 })).toEqual([]);
    expect(failures).toEqual([]);
  });

  it('puts the chosen ride’s fastest lap in the picked slot', async () => {
    const picked = ride({ id: 'picked', lapSplits: [140, 120] });
    const tracker = new GhostTracker({
      storage: storageOf([picked], { picked: ridden(260, LAP_M / 130) }),
      routeId: ROUTE_ID,
      rideId: LIVE_ID,
      startedAt: STARTED_AT,
      routeLengthM: LAP_M,
      loops: true,
      samples: () => [],
      now: () => Date.parse('2026-10-20T10:00:00.000Z'),
      selection: { best: false, year: false, last: false, chosenRideId: 'picked' },
      onFailure: () => {},
    });

    await tracker.start();
    await vi.waitFor(() => {
      const racing = tracker.update({ elapsedS: 10, distanceM: 100 });
      expect(racing.map((ghost) => ghost.slot)).toEqual(['chosen']);
      // 29 Sep, the day the stored ride was ridden: the picked slot is named after it.
      expect(racing[0]?.name).toBe('29 Sep');
    });

    // The 120 s lap and not the 140 s one: a ride with laps still races its fastest, so
    // it is over by 121 s where the slower lap would still be out on the road.
    const over = tracker.update({ elapsedS: 121, distanceM: 900 });
    expect(over[0]?.end).toBe('finished');
    expect(over[0]?.distanceM).toBe(LAP_M);
  });

  it('races a chosen ride that never completed a lap, ending where it stopped', async () => {
    // 600 m up the road in 60 s, and no splits: nothing here can fill a resolved slot.
    const quit = ride({ id: 'quit', lapSplits: [], distanceM: 600, elapsedS: 60 });
    const tracker = new GhostTracker({
      storage: storageOf([quit], { quit: ridden(60) }),
      routeId: ROUTE_ID,
      rideId: LIVE_ID,
      startedAt: STARTED_AT,
      routeLengthM: LAP_M,
      loops: true,
      samples: () => [],
      now: () => Date.parse('2026-10-20T10:00:00.000Z'),
      selection: { best: true, year: true, last: true, chosenRideId: 'quit' },
      onFailure: () => {},
    });

    await tracker.start();
    await vi.waitFor(() => {
      const racing = tracker.update({ elapsedS: 30, distanceM: 200 });
      // The diamond alone: the ride has no completed lap for Best, Year or Last to take.
      expect(racing.map((ghost) => ghost.slot)).toEqual(['chosen']);
      expect(racing[0]?.end).toBe('racing');
      expect(racing[0]?.distanceM).toBeCloseTo(300, 0);
    });

    const over = tracker.update({ elapsedS: 90, distanceM: 800 });
    expect(over[0]?.end).toBe('stopped');
    expect(over[0]?.distanceM).toBe(600);
    expect(over[0]?.gapLabel).toBeNull();
  });

  it('offers the panel a row per slot, saying which have nothing to fill them', async () => {
    const quit = ride({ id: 'quit', lapSplits: [], elapsedS: 60 });
    const tracker = new GhostTracker({
      storage: storageOf([quit], { quit: ridden(60) }),
      routeId: ROUTE_ID,
      rideId: LIVE_ID,
      startedAt: STARTED_AT,
      routeLengthM: LAP_M,
      loops: true,
      samples: () => [],
      now: () => Date.parse('2026-10-20T10:00:00.000Z'),
      selection: { best: true, year: false, last: true, chosenRideId: 'quit' },
      onFailure: () => {},
    });

    await tracker.start();
    const slots = tracker.slots();

    expect(slots.map((view) => view.slot)).toEqual(['best', 'year', 'last', 'chosen']);
    // Nothing falls through: a ride with no completed lap fills none of the three.
    expect(slots.slice(0, 3).map((view) => view.ride)).toEqual([null, null, null]);
    expect(slots.map((view) => view.on)).toEqual([true, false, true, true]);
    expect(slots[3]?.ride).toEqual({ startedAt: quit.startedAt, durationS: 60 });
    // An empty year slot is not a second anything, whatever Best did.
    expect(slots[1]?.description).toBe('Best of year');
  });

  it('calls the year slot a second best where Best holds the fastest lap of the window', async () => {
    // Both laps three weeks old, so Best is inside the window and this slot fell to the
    // slower of the two.
    const recent = ride({ id: 'recent', lapSplits: [100, 140] });
    const tracker = new GhostTracker({
      storage: storageOf([recent], { recent: ridden(240, LAP_M / 120) }),
      routeId: ROUTE_ID,
      rideId: LIVE_ID,
      startedAt: STARTED_AT,
      routeLengthM: LAP_M,
      loops: true,
      samples: () => [],
      now: () => Date.parse('2026-10-20T10:00:00.000Z'),
      selection: { best: true, year: true, last: true, chosenRideId: null },
      onFailure: () => {},
    });

    await tracker.start();

    const slots = tracker.slots();
    expect(slots[1]?.description).toBe('2nd best of year');
    // The band is untouched: eleven pixels beside a gap, where the symbol identifies it.
    await vi.waitFor(() => {
      const year = tracker.update({ elapsedS: 10, distanceM: 100 }).find((g) => g.slot === 'year');
      expect(year?.name).toBe('Year');
      expect(year?.description).toBe('2nd best of year');
    });
  });

  it('changes the word at the line where a lap of this ride takes Best', async () => {
    // An all-time best from two winters ago, outside the window, and a slower lap from
    // last month inside it: the year slot genuinely holds the best of the year.
    const ancient = ride({ id: 'ancient', startedAt: '2024-11-02T09:00:00.000Z', lapSplits: [60] });
    const recent = ride({ id: 'recent', lapSplits: [400] });
    const live = harness({
      stored: [ancient, recent],
      series: { ancient: ridden(60, LAP_M / 60), recent: ridden(400, LAP_M / 400) },
    });
    await live.tracker.start();

    await vi.waitFor(() => {
      const racing = live.tracker.update({ elapsedS: 1, distanceM: 10 });
      expect(racing.map((ghost) => ghost.slot)).toEqual(['best', 'year']);
    });
    expect(live.tracker.slots()[1]?.description).toBe('Best of year');

    // Over the line in 100 s. The lap is the fastest of the window and so takes the year
    // slot, but it does not beat the 60 s best — Best stays outside the window and the
    // slot is still the best of the year rather than a second to anything.
    live.rideTo(105);
    expect(live.tracker.slots()[1]?.description).toBe('Best of year');
    await vi.waitFor(() => {
      const year = live.tracker
        .update({ elapsedS: 105, distanceM: 1050 })
        .find((ghost) => ghost.slot === 'year');
      expect(year?.lapTimeS).toBe(100);
      expect(year?.description).toBe('Best of year');
    });
  });

  it('re-words a year ghost already on the road when Best moves inside the window', async () => {
    // The all-time best is a slow one from two winters ago, so the live ride's first lap
    // takes Best off it. The year slot keeps the lap it was racing and changes only its
    // word, which is the case a reload would never catch.
    const ancient = ride({
      id: 'ancient',
      startedAt: '2024-11-02T09:00:00.000Z',
      lapSplits: [150],
    });
    const recent = ride({ id: 'recent', lapSplits: [400] });
    const live = harness({
      stored: [ancient, recent],
      series: { ancient: ridden(150, LAP_M / 150), recent: ridden(400, LAP_M / 400) },
    });
    await live.tracker.start();

    let year: { description: string; lapTimeS: number | null } | undefined;
    await vi.waitFor(() => {
      year = live.tracker.update({ elapsedS: 1, distanceM: 10 }).find((g) => g.slot === 'year');
      expect(year?.description).toBe('Best of year');
    });
    const wasRacing = year?.lapTimeS;

    // A 100 s lap: faster than the ancient best, so Best is now a lap of this ride and the
    // fastest lap of the year is in the Best row.
    live.rideTo(105);
    await vi.waitFor(() => {
      const racing = live.tracker.update({ elapsedS: 105, distanceM: 1050 });
      expect(racing.find((ghost) => ghost.slot === 'best')?.lapTimeS).toBe(100);
    });

    const after = live.tracker
      .update({ elapsedS: 105, distanceM: 1050 })
      .find((ghost) => ghost.slot === 'year');
    expect(after?.description).toBe('2nd best of year');
    expect(live.tracker.slots()[1]?.description).toBe('2nd best of year');
    // Same lap, re-worded rather than swapped: it never left the road.
    expect(after?.lapTimeS).toBe(wasRacing);
  });
});
