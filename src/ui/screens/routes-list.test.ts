import { describe, expect, it } from 'vitest';
import type { Ride, Route as StoredRoute } from '../../storage/types';
import {
  ROUTE_DELETE_WORDING,
  canRemoveRoute,
  descriptionLine,
  labelRow,
  rideCounts,
  riddenLabel,
  routeFigures,
  sortRoutes,
} from './routes-list';

function ride(routeId: string | null, id: string): Ride {
  return {
    id,
    updatedAt: '2026-09-29T10:00:00.000Z',
    routeId,
    routeName: routeId,
    workoutId: null,
    workoutName: null,
    startedAt: '2026-09-29T10:00:00.000Z',
    elapsedS: 100,
    pausedS: 0,
    distanceM: 1000,
    ascentM: 10,
    avgPowerW: 200,
    avgHeartRateBpm: null,
    tss: null,
    lapSplits: [],
    settings: {
      trainerDifficulty: 50,
      workoutScalePct: 100,
      ergMode: 'erg',
      ftp: 200,
      hrMax: 190,
      riderMassKg: 75,
      bikeMassKg: 9,
    },
  };
}

function route(id: string, name: string): StoredRoute {
  return {
    id,
    updatedAt: '2026-09-01T00:00:00.000Z',
    name,
    file: `${id}.gpx`,
    totalDistanceM: 1000,
    totalAscentM: 10,
  };
}

describe('rideCounts', () => {
  it('counts rides per route and ignores free rides', () => {
    const counts = rideCounts([ride('a', '1'), ride('a', '2'), ride(null, '3'), ride('b', '4')]);
    expect(counts.get('a')).toBe(2);
    expect(counts.get('b')).toBe(1);
    expect(counts.size).toBe(2);
  });
});

describe('riddenLabel', () => {
  it('pluralises, and says when a route has never been ridden', () => {
    expect(riddenLabel(7)).toBe('7 rides');
    expect(riddenLabel(1)).toBe('1 ride');
    expect(riddenLabel(0)).toBe('Not ridden');
  });
});

describe('routeFigures', () => {
  const ditchling: StoredRoute = {
    ...route('ditchling', 'Ditchling Beacon Loop'),
    totalDistanceM: 38_240,
    totalAscentM: 512,
  };

  it('folds distance, gain and rides ridden, in that order and in their own units', () => {
    expect(routeFigures(ditchling, 7)).toEqual([
      { value: '38.2', unit: 'km' },
      { value: '512', unit: 'm' },
      { value: '7 rides', muted: true },
    ]);
  });

  it('says a route has never been ridden rather than folding a nought', () => {
    const [, , ridden] = routeFigures(ditchling, 0);
    expect(ridden).toEqual({ value: 'Not ridden', muted: true });
  });
});

describe('sortRoutes', () => {
  it('sorts by name without touching the input', () => {
    const input = [route('b', 'Sa Calobra'), route('a', 'Box Hill Repeats')];
    expect(sortRoutes(input).map((r) => r.id)).toEqual(['a', 'b']);
    expect(input.map((r) => r.id)).toEqual(['b', 'a']);
  });
});

describe('labelRow', () => {
  it('reads region then kind, which is the order the row draws them in', () => {
    // Where a route is is what a rider scans for; the kind qualifies it.
    expect(labelRow('loop', 'Surrey, UK')).toEqual([
      { text: 'Surrey, UK', kind: false },
      { text: 'Loop', kind: true },
    ]);
  });

  it('marks the kind so its glyph can travel with it rather than lead the line', () => {
    // The one part the component draws a mark in front of. Which part that is belongs
    // here with the order, not in the markup.
    const parts = labelRow('point_to_point', 'Oisans, France');
    expect(parts.filter((part) => part.kind)).toEqual([{ text: 'Point to point', kind: true }]);
  });

  it('names a point-to-point route as plainly as a loop', () => {
    // Both kinds get a word and a mark. Marking loops alone made the other kind read as
    // a route about which nothing was known.
    expect(labelRow('point_to_point', undefined)).toEqual([{ text: 'Point to point', kind: true }]);
  });

  it('leaves the kind out until the row knows it', () => {
    // Geometry loads per row and the sparkline comes with it; until then the row says
    // where the route is and nothing about its shape.
    expect(labelRow(null, 'Mallorca, Spain')).toEqual([{ text: 'Mallorca, Spain', kind: false }]);
  });

  it('gives no label row at all to a route with neither', () => {
    expect(labelRow(null, undefined)).toEqual([]);
    expect(labelRow(null, '   ')).toEqual([]);
  });
});

describe('descriptionLine', () => {
  it('is the route’s own description', () => {
    const described = { ...route('a', 'Box Hill'), description: 'Zig Zag Road, three times.' };
    expect(descriptionLine(described)).toBe('Zig Zag Road, three times.');
  });

  it('is null where a route has none, so the row closes up instead of leaving a gap', () => {
    // The common case for an imported GPX: no <desc> in the file, no line on the row.
    expect(descriptionLine(route('a', 'Imported'))).toBeNull();
  });

  it('treats a blank description as none, not as an empty line', () => {
    expect(descriptionLine({ ...route('a', 'Blank'), description: '   \n ' })).toBeNull();
  });

  it('trims a description that is only padded', () => {
    expect(descriptionLine({ ...route('a', 'Padded'), description: '  Over the moor.  ' })).toBe(
      'Over the moor.',
    );
  });
});

describe('ROUTE_DELETE_WORDING', () => {
  it('does not borrow the rides list’s claim that this cannot be undone', () => {
    // A route is metadata over a GPX that is still in the build. The rides wording is
    // about something unrecoverable, and reusing it here would be a false warning.
    const words = Object.values(ROUTE_DELETE_WORDING);
    expect(words.some((word) => /undone|permanent|forever/i.test(word))).toBe(false);
  });

  it('scopes the removal to this install, which is the whole of what happens', () => {
    // Only an imported route can be removed now, and nothing else in the app is touched:
    // the rides on it keep their own name and figures. Download sits beside Remove, which
    // is how the rider keeps the GPX this install is the only copy of.
    expect(ROUTE_DELETE_WORDING.prompt).toBe('Remove from this install?');
  });

  it('repeats one verb across the control and its confirm', () => {
    expect(ROUTE_DELETE_WORDING.confirm).toBe(ROUTE_DELETE_WORDING.action);
    expect(ROUTE_DELETE_WORDING.cancel).toBe('Keep');
  });
});

describe('canRemoveRoute', () => {
  const builtIn: ReadonlySet<string> = new Set(['greenhow-hill', 'alpe-dhuez']);

  it('offers no Remove on a route the build supplies', () => {
    // Absent, not disabled. Seeding writes a built-in route back on the next boot, so a
    // control here would be a question with one honest answer.
    expect(canRemoveRoute('greenhow-hill', builtIn)).toBe(false);
  });

  it('offers Remove on a route the rider imported', () => {
    expect(canRemoveRoute('a-minted-uuid', builtIn)).toBe(true);
  });

  it('offers Remove once a route has left the manifest', () => {
    // The way out for a stale record: drop the entry and the id stops being built in.
    expect(canRemoveRoute('greenhow-hill', new Set(['alpe-dhuez']))).toBe(true);
  });
});
