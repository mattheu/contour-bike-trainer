import { describe, expect, it } from 'vitest';
import { SLOT_SYMBOL, type GhostSlot } from '../../ghost/slots';
import type { ActiveGhost, GhostEnd } from '../../ghost/state';
import { buildProfile } from '../../route/profile';
import type { Route, RoutePoint } from '../../route/types';
import { elevationGeometry } from './elevation';
import {
  DONE_OPACITY,
  LABEL_GAP_X,
  LABEL_PLATE_H,
  LABEL_PLATE_W,
  LABEL_RISE_PX,
  LABEL_STEM_PX,
  PHONE_METRICS,
  STOPPED_OPACITY,
  SUMMIT_CLEAR_PX,
  ghostLayer,
  ghostMarks,
  type GhostPlacement,
} from './ghosts';

/**
 * A ghost at a distance, with the gap it is showing. An ended ghost carries no gap, which
 * is the state.ts contract rather than a convenience here.
 */
function ghost(
  slot: GhostSlot,
  distanceM: number,
  gapS: number | null,
  end: GhostEnd = 'racing',
): ActiveGhost {
  const racing = end === 'racing';
  return {
    slot,
    symbol: SLOT_SYMBOL[slot],
    name: slot,
    end,
    distanceM,
    gapS: racing ? gapS : null,
    gapLabel: !racing || gapS === null ? null : `${gapS < 0 ? '−' : '+'}${String(Math.abs(gapS))}`,
  };
}

/** Metres straight to pixels on a flat chart, so a test can place a symbol by hand. */
function flat(groundY = 100) {
  return (distanceM: number) => ({ x: distanceM, y: groundY });
}

function bySlot(placements: readonly GhostPlacement[], slot: GhostSlot): GhostPlacement {
  const found = placements.find((placement) => placement.slot === slot);
  if (found === undefined) throw new Error(`no placement for ${slot}`);
  return found;
}

describe('ghostLayer', () => {
  it('hangs the label at a fixed rise over a plate centred on the symbol', () => {
    const { placements } = ghostLayer({
      ghosts: [ghost('best', 400, 18)],
      project: flat(120),
    });

    const label = bySlot(placements, 'best').label;
    expect(label).not.toBeNull();
    expect(label?.anchor).toBe('middle');
    expect(label?.plateX).toBe(400 - LABEL_PLATE_W / 2);
    expect(label?.plateY).toBe(120 - LABEL_RISE_PX - LABEL_PLATE_H / 2);
    expect(label?.textX).toBe(400);
  });

  it('gives the nearest ghost in time the label and the other its symbol alone', () => {
    const { placements } = ghostLayer({
      // Inside the box in both axes: 20 px apart horizontally, 4 vertically.
      ghosts: [ghost('best', 500, 41), ghost('year', 520, 5)],
      project: (distanceM) => ({ x: distanceM, y: distanceM === 500 ? 100 : 104 }),
    });

    expect(bySlot(placements, 'year').label?.text).toBe('+5');
    expect(bySlot(placements, 'best').label).toBeNull();
    // The loser keeps its symbol, at full weight: it is still racing.
    expect(bySlot(placements, 'best').opacity).toBe(1);
  });

  it('leaves both labels alone once the symbols are far enough apart', () => {
    const { placements } = ghostLayer({
      ghosts: [ghost('best', 500, 41), ghost('year', 500 + LABEL_GAP_X, 5)],
      project: flat(),
    });

    expect(bySlot(placements, 'best').label).not.toBeNull();
    expect(bySlot(placements, 'year').label).not.toBeNull();
  });

  it('keeps both labels when the symbols are stacked beyond the vertical reach', () => {
    const { placements } = ghostLayer({
      ghosts: [ghost('best', 500, 41), ghost('year', 505, 5)],
      project: (distanceM) => ({ x: distanceM, y: distanceM === 500 ? 40 : 180 }),
    });

    expect(bySlot(placements, 'best').label).not.toBeNull();
    expect(bySlot(placements, 'year').label).not.toBeNull();
  });

  it('takes a summit’s gain figure out of a label’s way and leaves the tick', () => {
    const summits = [500 + SUMMIT_CLEAR_PX - 1, 500 + SUMMIT_CLEAR_PX];
    const layer = ghostLayer({
      ghosts: [ghost('best', 500, 18)],
      project: flat(),
      summits,
    });

    expect(layer.hiddenSummits).toEqual([0]);
    // Nothing here removes a tick: hiddenSummits names figures, and both ticks survive it.
    expect(summits).toHaveLength(2);
  });

  it('lets a summit figure stand where the ghost beside it lost its label', () => {
    const layer = ghostLayer({
      ghosts: [ghost('best', 500, 41), ghost('year', 510, 5)],
      project: flat(),
      summits: [500],
    });

    // One label survives the collision, and it is the one that claims the summit's space.
    expect(bySlot(layer.placements, 'best').label).toBeNull();
    expect(layer.hiddenSummits).toEqual([0]);
  });

  it('hangs every stem from the symbol box, so none is longer than another', () => {
    // A square, a triangle and a star: three glyphs of three different heights.
    const { placements } = ghostLayer({
      ghosts: [ghost('best', 100, 5), ghost('year', 400, 9), ghost('last', 700, 14)],
      project: flat(150),
    });

    for (const placement of placements) {
      const label = placement.label;
      expect(label).not.toBeNull();
      expect((label?.stemY ?? 0) - (label?.stemTopY ?? 0)).toBe(LABEL_STEM_PX);
      // And all three figures land on the same line.
      expect(label?.textY).toBe(placements[0]?.label?.textY);
    }
  });

  it('parks a finished ghost at the route end, faded, with no label', () => {
    const lengthM = 20_000;
    const { placements } = ghostLayer({
      ghosts: [ghost('best', lengthM, null, 'finished')],
      project: flat(90),
    });

    const done = bySlot(placements, 'best');
    expect(done.x).toBe(lengthM);
    expect(done.opacity).toBe(DONE_OPACITY);
    expect(done.label).toBeNull();
  });

  it('marks a stopped ghost where it stopped, fainter than a finished one', () => {
    const { placements } = ghostLayer({
      ghosts: [ghost('chosen', 6200, null, 'stopped')],
      project: flat(90),
    });

    const stopped = bySlot(placements, 'chosen');
    expect(stopped.x).toBe(6200);
    expect(stopped.opacity).toBe(STOPPED_OPACITY);
    expect(STOPPED_OPACITY).toBeLessThan(DONE_OPACITY);
    expect(stopped.label).toBeNull();
  });

  it('draws nothing for a ghost the window has scrolled past', () => {
    const { placements } = ghostLayer({
      ghosts: [ghost('best', 9000, 18), ghost('year', 400, 5)],
      project: (distanceM) => (distanceM > 1000 ? null : { x: distanceM, y: 100 }),
    });

    expect(placements.map((placement) => placement.slot)).toEqual(['year']);
  });
});

describe('ghostMarks', () => {
  it('leaves a finished ghost off the map entirely', () => {
    const marks = ghostMarks(
      [ghost('best', 500, 18), ghost('year', 20_000, null, 'finished')],
      flat(60),
    );

    expect(marks.map((mark) => mark.slot)).toEqual(['best']);
    expect(marks[0]).toMatchObject({ x: 500, y: 60, opacity: 1 });
  });

  it('keeps a stopped ghost on the map, faded, where its ride ended', () => {
    const marks = ghostMarks([ghost('chosen', 6200, null, 'stopped')], flat(60));

    expect(marks[0]).toMatchObject({ slot: 'chosen', x: 6200, opacity: STOPPED_OPACITY });
  });
});

describe('ghostLayer on a phone', () => {
  it('puts the gap to the right of the symbol while the ghost is up the road', () => {
    const { placements } = ghostLayer({
      ghosts: [ghost('chosen', 400, 41)],
      project: flat(120),
      metrics: PHONE_METRICS,
    });

    const label = bySlot(placements, 'chosen').label;
    expect(label?.anchor).toBe('start');
    expect(label?.plateX).toBe(400 + PHONE_METRICS.clearPx);
    // On the symbol's own line rather than above it: there is no stem to hang from.
    expect(label?.plateY).toBe(120 - PHONE_METRICS.plateH / 2);
    expect(label?.stemY).toBe(label?.stemTopY);
  });

  it('puts the gap to the left once the rider has overtaken it', () => {
    const { placements } = ghostLayer({
      ghosts: [ghost('year', 400, -5)],
      project: flat(120),
      metrics: PHONE_METRICS,
    });

    const label = bySlot(placements, 'year').label;
    expect(label?.anchor).toBe('end');
    expect(label?.plateX).toBe(400 - PHONE_METRICS.clearPx - PHONE_METRICS.plateW);
  });

  it('gives the nearest ghost in time the label inside the 60 x 16 box', () => {
    const { placements } = ghostLayer({
      // 50 px apart and 8 high: inside the phone box, outside the desktop one.
      ghosts: [ghost('best', 500, 41), ghost('year', 550, 5)],
      project: (distanceM) => ({ x: distanceM, y: distanceM === 500 ? 100 : 108 }),
      metrics: PHONE_METRICS,
    });

    expect(bySlot(placements, 'year').label?.text).toBe('+5');
    expect(bySlot(placements, 'best').label).toBeNull();
  });

  it('leaves both labels alone once the symbols clear the box', () => {
    const { placements } = ghostLayer({
      ghosts: [ghost('best', 500, 41), ghost('year', 500 + PHONE_METRICS.gapX, 5)],
      project: flat(),
      metrics: PHONE_METRICS,
    });

    expect(bySlot(placements, 'best').label).not.toBeNull();
    expect(bySlot(placements, 'year').label).not.toBeNull();
  });
});

describe('over the real profile geometry', () => {
  /** A straight 20 km drag, which is all the placement needs out of a route. */
  function route(): Route {
    const points: RoutePoint[] = [];
    for (let distM = 0; distM <= 20_000; distM += 100) {
      points.push({ lat: 54 + distM / 1e6, lon: -2, eleM: 100 + distM / 200, distM });
    }
    return { points, totalDistanceM: 20_000, totalAscentM: 100 };
  }

  it('places a ghost at the chart x its lap distance maps to', () => {
    const geometry = elevationGeometry({
      route: route(),
      profile: buildProfile(route()),
      width: 944,
      height: 220,
    });
    const project = (distanceM: number) => {
      const at = geometry.marker(distanceM);
      return { x: at.x, y: at.y };
    };

    const { placements } = ghostLayer({ ghosts: [ghost('best', 10_000, 18)], project });
    const best = bySlot(placements, 'best');

    // Half way along a 20 km route on a 944 px chart.
    expect(best.x).toBeCloseTo(472, 0);
    expect(best.y).toBeGreaterThan(0);
    expect(best.y).toBeLessThan(220);
    // And the plate clears the top of the chart rather than being drawn off it.
    expect(best.label?.plateY).toBeGreaterThan(0);
  });

  it('drops a ghost the zoom window has left behind', () => {
    const geometry = elevationGeometry({
      route: route(),
      profile: buildProfile(route()),
      width: 944,
      height: 220,
    });
    const project = (distanceM: number) => {
      // The window the ride screen hands the chart on its 5 km zoom.
      if (distanceM < 8000 || distanceM > 13_000) return null;
      const at = geometry.marker(distanceM);
      return { x: at.x, y: at.y };
    };

    const { placements } = ghostLayer({
      ghosts: [ghost('best', 2000, 18), ghost('year', 10_000, 5)],
      project,
    });

    expect(placements.map((placement) => placement.slot)).toEqual(['year']);
  });
});

/**
 * design/mockups/ride.html draws three ghosts around the rider's marker: a square above
 * the road, a diamond higher still, and a triangle tucked under it. Reproducing their
 * plates and stems to the decimal is the strongest statement that the rules above are the
 * design's and not an approximation of it.
 */
describe('the mockup’s own ghosts', () => {
  const AT: Record<string, { x: number; y: number }> = {
    best: { x: 553.6, y: 80.0 },
    year: { x: 520.5, y: 185.9 },
    chosen: { x: 572.6, y: 41.9 },
  };

  function mockupLayer() {
    return ghostLayer({
      ghosts: [ghost('best', 1, 18), ghost('year', 2, -5), ghost('chosen', 3, 41)],
      project: (distanceM) =>
        AT[distanceM === 1 ? 'best' : distanceM === 2 ? 'year' : 'chosen'] ?? null,
    });
  }

  it('puts the square’s plate, figure and stem exactly where the mockup does', () => {
    const label = bySlot(mockupLayer().placements, 'best').label;
    expect(label).toMatchObject({ anchor: 'middle', plateX: 531.6, plateY: 45.0, textX: 553.6 });
    expect(label?.textY).toBeCloseTo(58.0, 5);
    expect(label?.stemY).toBeCloseTo(73.0, 5);
    expect(label?.stemTopY).toBeCloseTo(62.0, 5);
  });

  it('leaves the diamond centred, and keeps all three labels', () => {
    const { placements } = mockupLayer();
    const label = bySlot(placements, 'chosen').label;
    expect(label?.anchor).toBe('middle');
    expect(label?.plateX).toBeCloseTo(550.6, 5);
    expect(label?.plateY).toBeCloseTo(6.9, 5);
    expect(label?.textY).toBeCloseTo(19.9, 5);

    // The square and the diamond are 19 px apart across but 38 down, which clears the
    // collision box: the mockup draws both figures, and so does this.
    expect(placements.every((placement) => placement.label !== null)).toBe(true);
  });
});
