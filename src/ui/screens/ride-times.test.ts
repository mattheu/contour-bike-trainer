import { describe, expect, it } from 'vitest';
import { SLOT_SYMBOL, type GhostSlot } from '../../ghost/slots';
import type { ActiveGhost } from '../../ghost/state';
import { projectedLapS, timeRows, timesNote, type CurrentLap } from './ride-times';
import type { LapProgress } from './ride-view';

/** A ghost with a time to be ranked on, which is all this list reads of one. */
function ghost(slot: GhostSlot, name: string, lapTimeS: number | null): ActiveGhost {
  return {
    slot,
    symbol: SLOT_SYMBOL[slot],
    name,
    end: 'racing',
    distanceM: 0,
    lapTimeS,
    gapS: null,
    gapLabel: null,
  };
}

const LAP_M = 12_000;

function current(partial: Partial<CurrentLap> = {}): CurrentLap {
  return { number: 2, elapsedS: 425, distanceM: 4100, lengthM: LAP_M, ...partial };
}

function lap(partial: Partial<LapProgress> = {}): LapProgress {
  return {
    label: 'Lap 2',
    number: 2,
    lengthM: LAP_M,
    startM: LAP_M,
    elapsedS: 425,
    distanceM: 4100,
    ascentM: 52,
    ...partial,
  };
}

describe('timeRows', () => {
  it('ranks laps and ghosts together by time, fastest first, labelled by neither', () => {
    const rows = timeRows({
      laps: [1232],
      ghosts: [ghost('best', 'Best', 1188), ghost('last', 'Last', 1272)],
      current: null,
    });

    expect(rows.map((row) => [row.rank, row.name, row.time])).toEqual([
      [1, 'Best', '19:48'],
      [2, 'Lap 1', '20:32'],
      [3, 'Last', '21:12'],
    ]);
  });

  it('labels a lap by its number and a ghost by its slot, and gives the lap no symbol', () => {
    const rows = timeRows({
      laps: [1232, 1190],
      ghosts: [ghost('year', 'Year', 1241)],
      current: null,
    });

    expect(rows.map((row) => row.name)).toEqual(['Lap 2', 'Lap 1', 'Year']);
    // The blank is the renderer's; what matters here is that a lap claims no slot's shape.
    expect(rows.filter((row) => row.symbol === null).map((row) => row.name)).toEqual([
      'Lap 2',
      'Lap 1',
    ]);
    expect(rows.find((row) => row.name === 'Year')?.symbol).toEqual(SLOT_SYMBOL.year);
  });

  it('measures every gap against the best time, and leaves the best row without one', () => {
    const rows = timeRows({
      laps: [1232],
      ghosts: [ghost('best', 'Best', 1188), ghost('last', 'Last', 1272)],
      current: null,
    });

    expect(rows.map((row) => row.gap)).toEqual([null, '+0:44', '+1:24']);
  });

  it('holds a record until it is beaten rather than equalled, so a tie keeps the ghost up', () => {
    const rows = timeRows({
      laps: [1188],
      ghosts: [ghost('best', 'Best', 1188)],
      current: null,
    });

    expect(rows.map((row) => row.name)).toEqual(['Best', 'Lap 1']);
  });

  it('leaves out a ghost with no comparable time, which has nothing to be ranked on', () => {
    const rows = timeRows({
      laps: [],
      ghosts: [ghost('chosen', '29 Sep', null)],
      current: null,
    });

    expect(rows).toEqual([]);
  });

  it('shows the lap in progress with its live time, no gap, and the current treatment', () => {
    const rows = timeRows({
      laps: [1232],
      ghosts: [ghost('best', 'Best', 1188)],
      current: current(),
    });

    const now = rows.find((row) => row.current);
    expect(now).toMatchObject({ name: 'Lap 2', time: '7:05', gap: null });
    expect(rows.filter((row) => row.current)).toHaveLength(1);
  });

  it('places the lap in progress where its pace projects it to finish', () => {
    const ghosts = [ghost('best', 'Best', 1188), ghost('last', 'Last', 1272)];
    // 4.1 km in 7:05 projects to 20:45 over 12 km: between the two.
    const projected = timeRows({ laps: [], ghosts, current: current() });
    expect(projected.map((row) => row.name)).toEqual(['Best', 'Lap 2', 'Last']);

    // The same lap ridden harder — 6 km in the same time — projects to 14:10 and leads.
    const quick = timeRows({ laps: [], ghosts, current: current({ distanceM: 6000 }) });
    expect(quick.map((row) => row.name)).toEqual(['Lap 2', 'Best', 'Last']);
  });

  it('sits a lap with no ground behind it last rather than claiming a rank on nothing', () => {
    const rows = timeRows({
      laps: [],
      ghosts: [ghost('best', 'Best', 1188)],
      current: current({ elapsedS: 0, distanceM: 0 }),
    });

    expect(rows.map((row) => row.name)).toEqual(['Best', 'Lap 2']);
    expect(projectedLapS(current({ elapsedS: 0, distanceM: 0 }))).toBe(Infinity);
  });

  it('keeps every lap of a long session, since a ranking of some of them ranks nothing', () => {
    // Twenty laps of a 2.3 km circuit, plus three ghosts and the lap being ridden.
    const laps = Array.from({ length: 20 }, (_, index) => 300 + index);
    const rows = timeRows({
      laps,
      ghosts: [ghost('best', 'Best', 290), ghost('year', 'Year', 295), ghost('last', 'Last', 301)],
      current: current({ number: 21, lengthM: 2300, distanceM: 1150, elapsedS: 150 }),
    });

    expect(rows).toHaveLength(24);
    expect(rows.map((row) => row.rank)).toEqual(
      Array.from({ length: 24 }, (_, index) => index + 1),
    );
    expect(rows[0]?.name).toBe('Best');
  });

  it('drops a split that is not a time, rather than ranking a ride on a bad record', () => {
    const rows = timeRows({ laps: [1232, 0, Number.NaN, 1190], ghosts: [], current: null });

    expect(rows.map((row) => row.name)).toEqual(['Lap 4', 'Lap 1']);
  });
});

describe('timesNote', () => {
  it('names the lap of this session and what the gaps are measured against', () => {
    expect(timesNote(lap())).toBe('Lap 2 of this session · gaps to best');
  });

  it('says only what is true on a route with no laps to count', () => {
    expect(timesNote(null)).toBe('gaps to best');
  });
});
