/**
 * How the chart row divides whatever width and height it is given.
 *
 * The charts are re-projected to the width they get, not scaled into it. Every geometry
 * module here is already a pure function of size, so handing them a smaller width costs
 * nothing and — unlike a CSS transform — leaves the 1/1.5/2.5 px stroke family and the
 * 11 px tick type at their true sizes. A transform would shrink both and quietly break
 * the design system at exactly the widths this exists to support.
 *
 * Pure, and tested, because "how narrow before the map stops being worth drawing" is a
 * decision with a right answer and no business living inside a render.
 */

/** The column gap, matching the ride screen's chart row. */
export const CHART_ROW_GAP_PX = 48;

/** design/mockups/ride.html draws the row at 944 + 48 + 320 inside 64 px page padding. */
export const MOCKUP_PROFILE_WIDTH = 944;
export const MOCKUP_MAP_WIDTH = 320;
const MOCKUP_CHART_WIDTH = MOCKUP_PROFILE_WIDTH + MOCKUP_MAP_WIDTH;

/**
 * Below this the map is a smear rather than a map: at 240 px the 2.5 km view still
 * resolves a hairpin, and the whole-route view still separates the outward and return
 * legs of both bundled routes. Narrower, and the honest thing is to drop it.
 */
export const MIN_MAP_WIDTH = 240;

/**
 * The profile is the chart you actually ride to, so it is the one that survives. At
 * 560 px a 30 km route still gets a tick every 5 km with room for the label between.
 */
export const MIN_PROFILE_WIDTH = 560;

export interface ChartRowLayout {
  /** Also the power strip's width: the strip shares the profile's x-axis. */
  profileWidth: number;
  /** Zero when the map is dropped. */
  mapWidth: number;
  showMap: boolean;
}

/** The mockup row, for a container that has not been measured yet. */
const DEFAULT_LAYOUT: ChartRowLayout = {
  profileWidth: MOCKUP_PROFILE_WIDTH,
  mapWidth: MOCKUP_MAP_WIDTH,
  showMap: true,
};

/**
 * Splits the measured row width into a profile and a map.
 *
 * The ratio is the mockups' 944:320 held constant, so the row looks like the design at
 * every width rather than only at 1440. The map goes when its proportional share would
 * fall under MIN_MAP_WIDTH — dropping it gives the profile the whole row, which is a
 * better instrument than two charts that are both too narrow to read.
 */
/** design/mockups/ride.html draws them at these heights inside a 900 px artboard. */
export const MOCKUP_PROFILE_HEIGHT = 220;
export const POWER_STRIP_HEIGHT = 74;
/** The gap between the profile and the strip below it, as the ride screen sets it. */
export const CHART_STACK_GAP_PX = 26;

/**
 * The chart heading above each chart, and the gap under it. Inside the measured area, so
 * it has to come out of the budget before the profile gets what is left — the measurement
 * is of the row's whole box, not of the space a chart may occupy.
 */
export const CHART_HEADING_PX = 32;
export const CHART_HEADING_GAP_PX = 6;

/**
 * The vertical exaggeration clamps at 10 % and 80 % of the chart height, both proportional,
 * so a shorter chart shows the same terrain in a shallower band rather than less of it.
 * What runs out first is the 20 % above the ceiling, which is where a summit tick and its
 * gain label sit: at 100 px that is 20 px, enough for the label and nothing else.
 *
 * So this is a readability floor rather than a geometric one, and it is deliberately
 * generous about how short is still useful — a squeezed profile on a small laptop beats
 * a clipped one.
 */
export const MIN_PROFILE_HEIGHT = 100;

/**
 * The strip is a shape to glance at, not a chart to read a value off, so it can go
 * considerably shallower than the profile before it stops working. Below this the three
 * zone washes stop being separable from each other — and 48 is the control height, so it
 * is a number already in the system.
 */
export const MIN_STRIP_HEIGHT = 48;

/**
 * The profile is the only chart that flexes vertically.
 *
 * The strip keeps its height because it is already the shortest thing on the screen, and
 * the band below it carries live readings — the ghost delta, the difficulty — rather than
 * reference, so neither is a candidate for the space. The map then matches the profile
 * stack exactly, which is what keeps the two columns aligned at any height rather than by
 * the coincidence that 220 + 6 + 74 is about 302.
 */
export function chartStackHeights(availableHeight: number | null): {
  profileHeight: number;
  stripHeight: number;
  mapHeight: number;
} {
  if (availableHeight === null || !Number.isFinite(availableHeight)) {
    return {
      profileHeight: MOCKUP_PROFILE_HEIGHT,
      stripHeight: POWER_STRIP_HEIGHT,
      mapHeight: MOCKUP_PROFILE_HEIGHT + CHART_STACK_GAP_PX + POWER_STRIP_HEIGHT,
    };
  }

  const chrome = CHART_HEADING_PX + CHART_HEADING_GAP_PX + CHART_STACK_GAP_PX;
  const forCharts = Math.floor(availableHeight) - chrome;
  const drawn = MOCKUP_PROFILE_HEIGHT + POWER_STRIP_HEIGHT;

  // Share what is left in the ratio the design draws, rather than shrinking the profile
  // alone: a strip that keeps its full height while the profile halves ends up nearly as
  // tall as the chart it belongs under, which is not what a subordinate strip looks like.
  // No ceiling: on a tall screen the charts keep growing rather than leaving a band of
  // centred whitespace. DESIGN.md asks for everything to be readable from a metre away,
  // and a turbo screen is further off than a desk one, so bigger is the point.
  const stripHeight = Math.max(
    MIN_STRIP_HEIGHT,
    Math.round((forCharts * POWER_STRIP_HEIGHT) / drawn),
  );

  // Whatever the strip did not need goes to the profile, so a strip pinned at its floor
  // hands the slack back rather than leaving it empty.
  const profileHeight = Math.max(MIN_PROFILE_HEIGHT, forCharts - stripHeight);

  return {
    profileHeight,
    stripHeight,
    mapHeight: profileHeight + CHART_STACK_GAP_PX + stripHeight,
  };
}

export function chartRowLayout(availableWidth: number | null): ChartRowLayout {
  if (availableWidth === null || !Number.isFinite(availableWidth) || availableWidth <= 0) {
    return DEFAULT_LAYOUT;
  }

  const available = Math.floor(availableWidth);
  const forCharts = available - CHART_ROW_GAP_PX;
  const profileWidth = Math.round((forCharts * MOCKUP_PROFILE_WIDTH) / MOCKUP_CHART_WIDTH);
  const mapWidth = forCharts - profileWidth;

  if (profileWidth >= MIN_PROFILE_WIDTH && mapWidth >= MIN_MAP_WIDTH) {
    return { profileWidth, mapWidth, showMap: true };
  }

  // Never below the floor: a profile narrower than this clips rather than compresses,
  // and a clipped chart is worse than one that overflows a window nobody should be
  // riding in anyway.
  return { profileWidth: Math.max(MIN_PROFILE_WIDTH, available), mapWidth: 0, showMap: false };
}
