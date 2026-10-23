import { describe, expect, it } from 'vitest';
import {
  CHART_HEADING_GAP_PX,
  MIN_TABLET_MAP_HEIGHT,
  TABLET_CHART_GAP_PX,
  TABLET_MAP_HEIGHT,
  TABLET_PROFILE_HEIGHT,
  TABLET_STACK_GAP_PX,
  TABLET_STRIP_HEIGHT,
  tabletChartStack,
  MIN_PHONE_LANDSCAPE_VIEW_HEIGHT,
  MIN_PHONE_STRIP_HEIGHT,
  MIN_PHONE_VIEW_HEIGHT,
  PHONE_CHART_GAP_PX,
  PHONE_LANDSCAPE_CHART_GAP_PX,
  PHONE_LANDSCAPE_STRIP_HEIGHT,
  PHONE_LANDSCAPE_VIEW_HEIGHT,
  phoneLandscapeChartStack,
  PHONE_STRIP_HEIGHT,
  PHONE_VIEW_HEIGHT,
  phoneChartStack,
  CHART_HEADING_PX,
  CHART_ROW_GAP_PX,
  CHART_STACK_GAP_PX,
  MIN_MAP_WIDTH,
  MIN_PROFILE_HEIGHT,
  MIN_STRIP_HEIGHT,
  MIN_PLAN_HEIGHT,
  MIN_PLAN_WIDTH,
  MIN_PROFILE_WIDTH,
  MIN_STEPS_WIDTH,
  MOCKUP_MAP_WIDTH,
  MOCKUP_PROFILE_HEIGHT,
  MOCKUP_PROFILE_WIDTH,
  MOCKUP_STEPS_WIDTH,
  PLAN_AXIS_PX,
  PLAN_HEADING_GAP_PX,
  PLAN_HEADING_PX,
  PLAN_LABEL_GUTTER_PX,
  POWER_STRIP_HEIGHT,
  chartRowLayout,
  chartStackHeights,
  planChartHeight,
  planRowLayout,
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

describe('planRowLayout', () => {
  it('reproduces the workout mockup exactly at 1440 px', () => {
    const layout = planRowLayout(rowWidthForViewport(1440));
    expect(layout).toEqual({
      planWidth: 944,
      chartWidth: 944 - PLAN_LABEL_GUTTER_PX,
      stepsWidth: MOCKUP_STEPS_WIDTH,
      showPlan: true,
    });
  });

  it('fills the row exactly, so nothing clips and nothing is left over', () => {
    for (const viewport of [1152, 1280, 1366, 1440, 1470, 1680, 1920, 2560]) {
      const available = rowWidthForViewport(viewport);
      const { planWidth, stepsWidth } = planRowLayout(available);
      expect(planWidth + CHART_ROW_GAP_PX + stepsWidth).toBe(available);
    }
  });

  it('gives a wider window to the chart, not to a list of short rows', () => {
    const wide = planRowLayout(rowWidthForViewport(2560));
    expect(wide.stepsWidth).toBe(MOCKUP_STEPS_WIDTH);
    expect(wide.planWidth).toBeGreaterThan(planRowLayout(rowWidthForViewport(1440)).planWidth);
  });

  it('takes width off the panel before it lets the chart go under its floor', () => {
    const narrow = planRowLayout(MIN_PLAN_WIDTH + CHART_ROW_GAP_PX + 280);
    expect(narrow.planWidth).toBe(MIN_PLAN_WIDTH);
    expect(narrow.stepsWidth).toBe(280);
    expect(narrow.stepsWidth).toBeGreaterThanOrEqual(MIN_STEPS_WIDTH);
  });

  it('drops the chart rather than squeezing the panel to nothing', () => {
    // The panel is the instrument the session can be ridden from, so it is what survives.
    const layout = planRowLayout(600);
    expect(layout.showPlan).toBe(false);
    expect(layout.planWidth).toBe(0);
    expect(layout.stepsWidth).toBe(600);
  });

  it('falls back to the mockup row before anything has been measured', () => {
    expect(planRowLayout(null).stepsWidth).toBe(MOCKUP_STEPS_WIDTH);
    expect(planRowLayout(Number.NaN).showPlan).toBe(true);
  });
});

describe('planChartHeight', () => {
  it('leaves the heading and the axis figures their own room', () => {
    const chrome = PLAN_HEADING_PX + PLAN_HEADING_GAP_PX + PLAN_AXIS_PX;
    expect(planChartHeight(400)).toBe(400 - chrome);
  });

  it('never goes below the height six zone bands can be told apart in', () => {
    expect(planChartHeight(120)).toBe(MIN_PLAN_HEIGHT);
    expect(planChartHeight(0)).toBe(MIN_PLAN_HEIGHT);
    expect(planChartHeight(-50)).toBe(MIN_PLAN_HEIGHT);
  });

  it('keeps growing on a tall screen, as the ride row does', () => {
    expect(planChartHeight(900)).toBeGreaterThan(planChartHeight(400));
  });

  it('falls back to the drawn height before anything has been measured', () => {
    expect(planChartHeight(null)).toBe(MOCKUP_PROFILE_HEIGHT);
    expect(planChartHeight(Number.NaN)).toBe(MOCKUP_PROFILE_HEIGHT);
  });
});

describe('phoneChartStack', () => {
  it('draws the mockup before the area has been measured', () => {
    expect(phoneChartStack(null)).toEqual({
      viewHeight: PHONE_VIEW_HEIGHT,
      stripHeight: PHONE_STRIP_HEIGHT,
    });
  });

  it('keeps both at their drawn heights where there is room', () => {
    const stack = phoneChartStack(400);
    expect(stack.viewHeight).toBe(PHONE_VIEW_HEIGHT);
    expect(stack.stripHeight).toBe(PHONE_STRIP_HEIGHT);
  });

  it("spends a taller phone's extra height above the chart rather than on it", () => {
    expect(phoneChartStack(460).viewHeight).toBe(phoneChartStack(300).viewHeight);
  });

  it('takes it off the view first on a screen with less', () => {
    const stack = phoneChartStack(260);
    expect(stack.viewHeight).toBe(260 - PHONE_CHART_GAP_PX - PHONE_STRIP_HEIGHT);
    expect(stack.stripHeight).toBe(PHONE_STRIP_HEIGHT);
  });

  it('holds both floors on a screen too short for either', () => {
    const stack = phoneChartStack(100);
    expect(stack.viewHeight).toBe(MIN_PHONE_VIEW_HEIGHT);
    expect(stack.stripHeight).toBe(MIN_PHONE_STRIP_HEIGHT);
  });
});

/**
 * What a phone on its side has left for the charts: design/mockups/phone-landscape.html
 * draws 844 x 390 with 16 + 14 of page padding, a 44 px header, the four-slot row 18
 * below it and 64 tall, and the stats line 4 below that at the 32 px button height.
 * Measured against the built screen at that viewport, not only read off the mockup.
 */
const LANDSCAPE_CHART_AREA = 390 - (16 + 14) - 44 - (18 + 64) - (4 + 32);

describe('phoneLandscapeChartStack', () => {
  it('draws the mockup before the area has been measured', () => {
    expect(phoneLandscapeChartStack(null)).toEqual({
      viewHeight: PHONE_LANDSCAPE_VIEW_HEIGHT,
      stripHeight: PHONE_LANDSCAPE_STRIP_HEIGHT,
    });
  });

  it('fits both charts at their drawn heights on the 844 x 390 screen it is for', () => {
    const stack = phoneLandscapeChartStack(LANDSCAPE_CHART_AREA);
    expect(stack.viewHeight).toBe(PHONE_LANDSCAPE_VIEW_HEIGHT);
    expect(stack.stripHeight).toBe(PHONE_LANDSCAPE_STRIP_HEIGHT);
    expect(stack.viewHeight + PHONE_LANDSCAPE_CHART_GAP_PX + stack.stripHeight).toBeLessThanOrEqual(
      LANDSCAPE_CHART_AREA,
    );
  });

  it('is shallower than the portrait stack, which is the point of the arrangement', () => {
    expect(PHONE_LANDSCAPE_VIEW_HEIGHT).toBeLessThan(PHONE_VIEW_HEIGHT);
    expect(PHONE_LANDSCAPE_CHART_GAP_PX).toBeLessThan(PHONE_CHART_GAP_PX);
  });

  it('spends a taller screen above the chart rather than on it', () => {
    expect(phoneLandscapeChartStack(300).viewHeight).toBe(PHONE_LANDSCAPE_VIEW_HEIGHT);
  });

  it('takes it off the view first on a shorter one', () => {
    const stack = phoneLandscapeChartStack(180);
    expect(stack.viewHeight).toBe(
      180 - PHONE_LANDSCAPE_CHART_GAP_PX - PHONE_LANDSCAPE_STRIP_HEIGHT,
    );
    expect(stack.stripHeight).toBe(PHONE_LANDSCAPE_STRIP_HEIGHT);
  });

  it('holds both floors on a screen too short for either', () => {
    const stack = phoneLandscapeChartStack(80);
    expect(stack.viewHeight).toBe(MIN_PHONE_LANDSCAPE_VIEW_HEIGHT);
    expect(stack.stripHeight).toBe(MIN_PHONE_STRIP_HEIGHT);
  });
});

/**
 * What a tablet held upright has left for the charts: design/mockups/tablet-portrait.html
 * draws 834 x 1194, and the built screen at that viewport measures an 88 px header block,
 * the primaries row at 191, the secondaries at 79, a 24 px margin and a 53 px foot.
 * Measured in the browser rather than read off the mockup, for the reason the landscape
 * figure above gives.
 */
const TABLET_CHART_AREA = 1194 - 88 - 191 - 79 - 24 - 53;

/** What the three charts and the two gaps and the map heading ask for between them. */
const TABLET_CHROME =
  TABLET_CHART_GAP_PX + TABLET_STACK_GAP_PX + CHART_HEADING_PX + CHART_HEADING_GAP_PX;

/** The area that fits the drawn stack exactly, which is where giving height up starts. */
const TABLET_EXACT_FIT =
  TABLET_PROFILE_HEIGHT + TABLET_STRIP_HEIGHT + TABLET_MAP_HEIGHT + TABLET_CHROME;

describe('tabletChartStack', () => {
  it('draws the mockup before the area has been measured', () => {
    expect(tabletChartStack(null)).toEqual({
      profileHeight: TABLET_PROFILE_HEIGHT,
      stripHeight: TABLET_STRIP_HEIGHT,
      mapHeight: TABLET_MAP_HEIGHT,
    });
  });

  it('leaves the 834 x 1194 screen it is for with height to spare', () => {
    expect(TABLET_CHART_AREA).toBeGreaterThan(TABLET_EXACT_FIT);
  });

  it('fits all three at their drawn heights on that screen', () => {
    const stack = tabletChartStack(TABLET_CHART_AREA);
    expect(stack).toEqual({
      profileHeight: TABLET_PROFILE_HEIGHT,
      stripHeight: TABLET_STRIP_HEIGHT,
      mapHeight: TABLET_MAP_HEIGHT,
    });
    expect(
      stack.profileHeight + stack.stripHeight + stack.mapHeight + TABLET_CHROME,
    ).toBeLessThanOrEqual(TABLET_CHART_AREA);
  });

  // A second line in the foot — the ghosts key, once anything is racing — costs the area
  // about 28 px. The three charts must not move when it appears mid-ride.
  it('does not move the charts when the ghosts line opens the foot', () => {
    expect(tabletChartStack(TABLET_CHART_AREA - 28)).toEqual(tabletChartStack(TABLET_CHART_AREA));
  });

  it("spends a taller tablet's extra height around the charts rather than on them", () => {
    expect(tabletChartStack(1200)).toEqual(tabletChartStack(TABLET_CHART_AREA));
  });

  it('takes it off the map first on a shorter tablet', () => {
    const stack = tabletChartStack(TABLET_EXACT_FIT - 40);
    expect(stack.mapHeight).toBe(TABLET_MAP_HEIGHT - 40);
    expect(stack.profileHeight).toBe(TABLET_PROFILE_HEIGHT);
    expect(stack.stripHeight).toBe(TABLET_STRIP_HEIGHT);
  });

  it('starts on the profile only once the map is at its floor', () => {
    const toFloor = TABLET_MAP_HEIGHT - MIN_TABLET_MAP_HEIGHT;
    const stack = tabletChartStack(TABLET_EXACT_FIT - toFloor - 30);
    expect(stack.mapHeight).toBe(MIN_TABLET_MAP_HEIGHT);
    expect(stack.profileHeight).toBe(TABLET_PROFILE_HEIGHT - 30);
    expect(stack.stripHeight).toBe(TABLET_STRIP_HEIGHT);
  });

  it('holds all three floors on a screen too short for any of them', () => {
    const stack = tabletChartStack(200);
    expect(stack.mapHeight).toBe(MIN_TABLET_MAP_HEIGHT);
    expect(stack.profileHeight).toBe(MIN_PROFILE_HEIGHT);
    expect(stack.stripHeight).toBe(MIN_STRIP_HEIGHT);
  });

  // The strip is the last thing to give height up: it is already the shortest chart here.
  it('leaves the strip alone until both charts above it are at their floors', () => {
    const toFloors =
      TABLET_MAP_HEIGHT -
      MIN_TABLET_MAP_HEIGHT +
      (TABLET_PROFILE_HEIGHT - MIN_PROFILE_HEIGHT);
    expect(tabletChartStack(TABLET_EXACT_FIT - toFloors).stripHeight).toBe(TABLET_STRIP_HEIGHT);
  });
});
