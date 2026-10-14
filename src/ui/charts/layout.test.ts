import { describe, expect, it } from 'vitest';
import {
  CHART_HEADING_GAP_PX,
  CHART_HEADING_PX,
  CHART_ROW_GAP_PX,
  CHART_STACK_GAP_PX,
  MIN_MAP_WIDTH,
  MIN_PROFILE_HEIGHT,
  MIN_STRIP_HEIGHT,
  MIN_PROFILE_WIDTH,
  MOCKUP_MAP_WIDTH,
  MOCKUP_PROFILE_HEIGHT,
  MOCKUP_PROFILE_WIDTH,
  POWER_STRIP_HEIGHT,
  chartRowLayout,
  chartStackHeights,
} from './layout';

/** The ride screen pads the page by 64 px a side, so this is what the row actually gets. */
function rowWidthForViewport(viewport: number): number {
  return viewport - 128;
}

describe('chartRowLayout', () => {
  it('reproduces the mockup exactly at 1440 px', () => {
    const layout = chartRowLayout(rowWidthForViewport(1440));
    expect(layout).toEqual({
      profileWidth: MOCKUP_PROFILE_WIDTH,
      mapWidth: MOCKUP_MAP_WIDTH,
      showMap: true,
    });
  });

  it('fills the row exactly, so nothing clips and nothing is left over', () => {
    for (const viewport of [1152, 1280, 1366, 1440, 1470, 1680, 1920, 2560]) {
      const available = rowWidthForViewport(viewport);
      const { profileWidth, mapWidth, showMap } = chartRowLayout(available);
      const used = showMap ? profileWidth + CHART_ROW_GAP_PX + mapWidth : profileWidth;
      expect(used).toBe(available);
    }
  });

  it('holds the mockups’ 944:320 ratio at every width that keeps the map', () => {
    for (const viewport of [1124, 1280, 1440, 1470, 1920, 2560]) {
      const { profileWidth, mapWidth, showMap } = chartRowLayout(rowWidthForViewport(viewport));
      expect(showMap).toBe(true);
      // Within a pixel of the design ratio; the rest is integer rounding.
      expect(profileWidth / mapWidth).toBeCloseTo(MOCKUP_PROFILE_WIDTH / MOCKUP_MAP_WIDTH, 1);
    }
  });

  it('shrinks both charts on a 13-inch MacBook rather than clipping the map', () => {
    // 1470 logical px, the machine SPEC.md is written for.
    const layout = chartRowLayout(rowWidthForViewport(1470));
    expect(layout.showMap).toBe(true);
    expect(layout.profileWidth).toBeGreaterThan(MOCKUP_PROFILE_WIDTH);
    expect(layout.mapWidth).toBeGreaterThan(MOCKUP_MAP_WIDTH);
  });

  it('shrinks both charts at 1280 px', () => {
    const layout = chartRowLayout(rowWidthForViewport(1280));
    expect(layout).toEqual({ profileWidth: 825, mapWidth: 279, showMap: true });
  });

  it('grows both charts at 1920 px', () => {
    const layout = chartRowLayout(rowWidthForViewport(1920));
    expect(layout).toEqual({ profileWidth: 1302, mapWidth: 442, showMap: true });
  });

  it('drops the map the moment its share falls under the minimum', () => {
    expect(chartRowLayout(995)).toEqual({
      profileWidth: 707,
      mapWidth: MIN_MAP_WIDTH,
      showMap: true,
    });
    expect(chartRowLayout(994)).toEqual({ profileWidth: 994, mapWidth: 0, showMap: false });
  });

  it('gives the whole row to the profile once the map is gone', () => {
    const layout = chartRowLayout(900);
    expect(layout.showMap).toBe(false);
    expect(layout.mapWidth).toBe(0);
    expect(layout.profileWidth).toBe(900);
  });

  it('never draws a profile below the legibility floor', () => {
    for (const available of [1, 120, 400, MIN_PROFILE_WIDTH - 1]) {
      const layout = chartRowLayout(available);
      expect(layout.showMap).toBe(false);
      expect(layout.profileWidth).toBe(MIN_PROFILE_WIDTH);
    }
  });

  it('falls back to the mockup row when the container has not been measured', () => {
    const mockup = {
      profileWidth: MOCKUP_PROFILE_WIDTH,
      mapWidth: MOCKUP_MAP_WIDTH,
      showMap: true,
    };
    expect(chartRowLayout(null)).toEqual(mockup);
    expect(chartRowLayout(0)).toEqual(mockup);
    expect(chartRowLayout(Number.NaN)).toEqual(mockup);
    expect(chartRowLayout(-40)).toEqual(mockup);
  });

  it('returns whole pixels, so no chart lands on a half-pixel boundary', () => {
    for (const available of [1152, 1153, 1311, 1312, 1313, 1791]) {
      const { profileWidth, mapWidth } = chartRowLayout(available);
      expect(Number.isInteger(profileWidth)).toBe(true);
      expect(Number.isInteger(mapWidth)).toBe(true);
    }
  });
});

describe('chartStackHeights', () => {
  it('gives the drawn heights at the height the design was drawn for', () => {
    // 220 + 74 plus the chrome that sits inside the measured area.
    const drawn = MOCKUP_PROFILE_HEIGHT + POWER_STRIP_HEIGHT;
    const area = drawn + CHART_HEADING_PX + CHART_HEADING_GAP_PX + CHART_STACK_GAP_PX;
    expect(chartStackHeights(area)).toEqual({
      profileHeight: MOCKUP_PROFILE_HEIGHT,
      stripHeight: POWER_STRIP_HEIGHT,
      mapHeight: MOCKUP_PROFILE_HEIGHT + CHART_STACK_GAP_PX + POWER_STRIP_HEIGHT,
    });
  });

  it('shares what is left in the ratio the design draws', () => {
    // The heading, its gap and the space above the strip all sit inside the measured
    // area, so they come out of the budget before either chart gets anything.
    const area = 300;
    const forCharts = area - (CHART_HEADING_PX + CHART_HEADING_GAP_PX + CHART_STACK_GAP_PX);
    const { profileHeight, stripHeight } = chartStackHeights(area);

    expect(profileHeight + stripHeight).toBe(forCharts);
    // Within a pixel of the drawn 220:74, which is what rounding allows.
    const drawnRatio = MOCKUP_PROFILE_HEIGHT / (MOCKUP_PROFILE_HEIGHT + POWER_STRIP_HEIGHT);
    expect(profileHeight / forCharts).toBeCloseTo(drawnRatio, 2);
  });

  it('shrinks the strip rather than letting it dwarf a squeezed profile', () => {
    const roomy = chartStackHeights(400);
    const tight = chartStackHeights(260);
    expect(tight.stripHeight).toBeLessThan(roomy.stripHeight);
    expect(tight.stripHeight).toBeGreaterThanOrEqual(MIN_STRIP_HEIGHT);
  });

  it('hands the slack back to the profile once the strip is on its floor', () => {
    // A strip pinned at its floor must not leave the space it did not need empty.
    const area = 212;
    const forCharts = area - (CHART_HEADING_PX + CHART_HEADING_GAP_PX + CHART_STACK_GAP_PX);
    const { profileHeight, stripHeight } = chartStackHeights(area);
    expect(stripHeight).toBe(MIN_STRIP_HEIGHT);
    expect(profileHeight).toBe(forCharts - MIN_STRIP_HEIGHT);
  });

  it('never takes the profile below the height a gradient can be read off', () => {
    expect(chartStackHeights(100).profileHeight).toBe(MIN_PROFILE_HEIGHT);
    expect(chartStackHeights(0).profileHeight).toBe(MIN_PROFILE_HEIGHT);
    expect(chartStackHeights(-50).profileHeight).toBe(MIN_PROFILE_HEIGHT);
  });

  it('matches the map to the profile stack so the two columns align', () => {
    for (const area of [240, 300, 420, 1000]) {
      const { profileHeight, stripHeight, mapHeight } = chartStackHeights(area);
      expect(mapHeight).toBe(profileHeight + CHART_STACK_GAP_PX + stripHeight);
    }
  });

  it('falls back to the drawn height before anything has been measured', () => {
    expect(chartStackHeights(null).profileHeight).toBe(MOCKUP_PROFILE_HEIGHT);
    expect(chartStackHeights(Number.NaN).profileHeight).toBe(MOCKUP_PROFILE_HEIGHT);
  });

  it('keeps growing on a tall screen rather than leaving centred whitespace', () => {
    // No ceiling: a turbo screen sits further away than a desk one, so the charts take
    // the room they are given. The ratio holds all the way up.
    const tall = chartStackHeights(900);
    expect(tall.profileHeight).toBeGreaterThan(MOCKUP_PROFILE_HEIGHT);
    expect(tall.stripHeight).toBeGreaterThan(POWER_STRIP_HEIGHT);

    const forCharts = 900 - (CHART_HEADING_PX + CHART_HEADING_GAP_PX + CHART_STACK_GAP_PX);
    expect(tall.profileHeight + tall.stripHeight).toBe(forCharts);
    const drawnRatio = MOCKUP_PROFILE_HEIGHT / (MOCKUP_PROFILE_HEIGHT + POWER_STRIP_HEIGHT);
    expect(tall.profileHeight / forCharts).toBeCloseTo(drawnRatio, 2);
  });
});
