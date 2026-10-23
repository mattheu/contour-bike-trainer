import { describe, expect, it } from 'vitest';
import { arrangementFor, type ArrangementName } from './arrangement';
import { PHONE_LANDSCAPE_QUERY, PHONE_PORTRAIT_QUERY } from './use-media-query';

interface Viewport {
  width: number;
  height: number;
}

/**
 * The media features the two phone queries use, evaluated against a viewport.
 *
 * The tests run in node, so there is no matchMedia to ask. Parsing the exported strings
 * is what keeps this honest: a threshold changed in use-media-query is a threshold these
 * cases see, where a predicate rewritten here would be a second rule that agrees with
 * the first until someone edits one of them.
 */
function matchesViewport(query: string, viewport: Viewport): boolean {
  return query.split(' and ').every((clause) => {
    const [feature = '', value = ''] = clause.replace(/[()]/g, '').split(':');
    const px = Number.parseInt(value, 10);
    switch (feature.trim()) {
      case 'max-width':
        return viewport.width <= px;
      case 'max-height':
        return viewport.height <= px;
      // CSS calls a square viewport portrait: landscape is strictly wider than it is tall.
      case 'orientation':
        return value.trim() === (viewport.width > viewport.height ? 'landscape' : 'portrait');
      default:
        throw new Error(`unsupported media feature: ${feature}`);
    }
  });
}

function arrangementAt(viewport: Viewport): ArrangementName {
  return arrangementFor({
    phonePortrait: matchesViewport(PHONE_PORTRAIT_QUERY, viewport),
    phoneLandscape: matchesViewport(PHONE_LANDSCAPE_QUERY, viewport),
  });
}

/** The viewports the arrangements are designed at, and the ones they must not take. */
const PHONE_LANDSCAPE: Viewport = { width: 844, height: 390 };
const PHONE_PORTRAIT: Viewport = { width: 390, height: 844 };
const SMALL_PHONE_LANDSCAPE: Viewport = { width: 667, height: 375 };
const TABLET_PORTRAIT: Viewport = { width: 820, height: 1180 };
const TABLET_LANDSCAPE: Viewport = { width: 1180, height: 820 };
const DESKTOP: Viewport = { width: 1440, height: 900 };

describe('which arrangement a viewport asks for', () => {
  it('gives a phone on its side the landscape arrangement', () => {
    expect(arrangementAt(PHONE_LANDSCAPE)).toBe('phone-landscape');
    expect(arrangementAt(SMALL_PHONE_LANDSCAPE)).toBe('phone-landscape');
  });

  it('leaves the portrait arrangement where it was', () => {
    expect(arrangementAt(PHONE_PORTRAIT)).toBe('phone-portrait');
  });

  // The tablet arrangement is still the desktop one. What matters is that a tablet is
  // not handed a phone's: four 44 px slots across 1180 px is not a ride screen.
  it('takes neither the tablet nor the desktop', () => {
    expect(arrangementAt(TABLET_PORTRAIT)).toBe('desktop');
    expect(arrangementAt(TABLET_LANDSCAPE)).toBe('desktop');
    expect(arrangementAt(DESKTOP)).toBe('desktop');
  });

  it('turns a phone from one phone arrangement straight into the other', () => {
    for (const viewport of [PHONE_PORTRAIT, PHONE_LANDSCAPE, SMALL_PHONE_LANDSCAPE]) {
      const portrait = matchesViewport(PHONE_PORTRAIT_QUERY, viewport);
      const landscape = matchesViewport(PHONE_LANDSCAPE_QUERY, viewport);
      // Exclusive, so neither arrangement depends on which query is read first.
      expect(portrait).not.toBe(landscape);
    }
  });

  it('falls back to the widest arrangement where nothing matches', () => {
    expect(arrangementFor({ phonePortrait: false, phoneLandscape: false })).toBe('desktop');
  });
});

/**
 * The workout screen asks the same question of the same two queries, which is why the
 * answer lives in a module of its own rather than beside the ride's props.
 *
 * Asserted at the viewports its own mockups are drawn at — phone-portrait-workout.html
 * at 390 × 844 and phone-landscape-workout.html at 844 × 390 — so a rule forked for that
 * screen fails here instead of quietly handing a phone the desktop plan row.
 */
describe('the workout screen takes the same choice', () => {
  it('gives each workout mockup the arrangement it was drawn at', () => {
    expect(arrangementAt(PHONE_PORTRAIT)).toBe('phone-portrait');
    expect(arrangementAt(PHONE_LANDSCAPE)).toBe('phone-landscape');
  });

  // The plan chart and the Steps panel are a desktop row: a tablet keeps them.
  it('leaves a tablet and a desktop on the plan row', () => {
    expect(arrangementAt(TABLET_PORTRAIT)).toBe('desktop');
    expect(arrangementAt(DESKTOP)).toBe('desktop');
  });
});
