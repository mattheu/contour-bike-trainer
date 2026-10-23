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

/**
 * A phone shows one chart over the power strip, so its stack is simpler than the
 * desktop's: no heading row, no second column, and one gap.
 *
 * design/mockups/phone-portrait-profile.html draws the view at 200 and the strip at 58
 * inside an 844 px artboard, 36 px apart.
 */
export const PHONE_VIEW_HEIGHT = 200;
export const PHONE_STRIP_HEIGHT = 58;
export const PHONE_CHART_GAP_PX = 36;

/** Below this the profile is a line rather than terrain, and the map a smudge. */
export const MIN_PHONE_VIEW_HEIGHT = 120;

/**
 * The strip carries its own type — POWER, the FTP mark, the average — inside its box, so
 * it runs out of room sooner than the desktop's and holds its height for longer.
 */
export const MIN_PHONE_STRIP_HEIGHT = 48;

/**
 * How a phone divides the space left under its readings.
 *
 * Both charts keep the height they are drawn at and give it up only on a screen too
 * short for them, which is the opposite of the desktop's "grow into whatever is there".
 * The phone's view is 358 px wide: at the desktop's full height it would be nearly
 * square, and a profile that tall shows the same terrain as a band floating in an empty
 * box rather than more of it. design/mockups/phone-portrait-profile.html spends the
 * slack above the chart instead, where it costs nothing.
 */
export function phoneChartStack(availableHeight: number | null): {
  viewHeight: number;
  stripHeight: number;
} {
  if (availableHeight === null || !Number.isFinite(availableHeight)) {
    return { viewHeight: PHONE_VIEW_HEIGHT, stripHeight: PHONE_STRIP_HEIGHT };
  }

  const forCharts = Math.floor(availableHeight) - PHONE_CHART_GAP_PX;
  const viewHeight = Math.min(
    PHONE_VIEW_HEIGHT,
    Math.max(MIN_PHONE_VIEW_HEIGHT, forCharts - PHONE_STRIP_HEIGHT),
  );
  // Only once the view is already at its floor does the strip start giving height up,
  // and it stops at its own: two charts too short to read is worse than one that
  // overflows a screen nobody should be riding on.
  const stripHeight = Math.max(
    MIN_PHONE_STRIP_HEIGHT,
    Math.min(PHONE_STRIP_HEIGHT, forCharts - viewHeight),
  );

  return { viewHeight, stripHeight };
}

/**
 * design/mockups/workout.html draws the lower row as `minmax(0, 1fr) 320px` with the same
 * 48 px gap, and keeps 32 px clear inside the chart column for the zone figures.
 */
export const MOCKUP_STEPS_WIDTH = 320;
export const PLAN_LABEL_GUTTER_PX = 32;

/**
 * The Steps panel is the instrument you can ride the session from — number, target and a
 * countdown — so it is the one that survives, which is the opposite of the ride row where
 * the profile keeps the space. It gives width up only once the chart would otherwise be
 * unreadable, and never below this.
 */
export const MIN_STEPS_WIDTH = 248;

/**
 * Narrower than this and the chart stops being a chart: a 60-minute session would get a
 * tick every 9 px, and the six zone bands are no longer separable from each other at any
 * useful block width. Below it the honest thing is to drop it and give the list the row.
 */
export const MIN_PLAN_WIDTH = 480;

export interface PlanRowLayout {
  /** The chart column, gutter included. Zero when the chart is dropped. */
  planWidth: number;
  /** What the SVG itself is drawn at: the column less the zone-figure gutter. */
  chartWidth: number;
  stepsWidth: number;
  showPlan: boolean;
}

/** The mockup row, for a container that has not been measured yet. */
const DEFAULT_PLAN_ROW: PlanRowLayout = {
  planWidth: MOCKUP_PROFILE_WIDTH,
  chartWidth: MOCKUP_PROFILE_WIDTH - PLAN_LABEL_GUTTER_PX,
  stepsWidth: MOCKUP_STEPS_WIDTH,
  showPlan: true,
};

/**
 * Splits the workout screen's lower row into a plan chart and the Steps panel.
 *
 * The panel is a fixed column rather than a share of the row, which is what the mockup
 * draws and what a list of short rows wants: widening it past 320 px only stretches the
 * gap between a step's name and its duration. So the chart takes everything else, and
 * growing the window grows the chart.
 */
export function planRowLayout(availableWidth: number | null): PlanRowLayout {
  if (availableWidth === null || !Number.isFinite(availableWidth) || availableWidth <= 0) {
    return DEFAULT_PLAN_ROW;
  }

  const available = Math.floor(availableWidth);
  const forColumns = available - CHART_ROW_GAP_PX;
  const stepsWidth = Math.min(
    MOCKUP_STEPS_WIDTH,
    Math.max(MIN_STEPS_WIDTH, forColumns - MIN_PLAN_WIDTH),
  );
  const planWidth = forColumns - stepsWidth;

  if (planWidth >= MIN_PLAN_WIDTH && stepsWidth >= MIN_STEPS_WIDTH) {
    return {
      planWidth,
      chartWidth: planWidth - PLAN_LABEL_GUTTER_PX,
      stepsWidth,
      showPlan: true,
    };
  }

  return { planWidth: 0, chartWidth: 0, stepsWidth: available, showPlan: false };
}

/**
 * The chart's own height inside the measured row, after its heading and axis have taken
 * theirs. The heading row is the Steps panel's, which carries a 48 px control — the two
 * columns have to start their charts on the same line, so the taller of the two sets it.
 */
export const PLAN_HEADING_PX = 48;
export const PLAN_HEADING_GAP_PX = 10;
/** The tick figures and the total hang below the baseline, outside the SVG's own box. */
export const PLAN_AXIS_PX = 26;

/**
 * Below this the six zone bands stop being separable: zone 4 is 15 % of FTP against a
 * ceiling of 160 %, so it gets under 12 px of the chart and the band a threshold block
 * sits in can no longer be told from the one above it.
 */
export const MIN_PLAN_HEIGHT = 120;

/**
 * No ceiling, for the reason chartStackHeights gives: a turbo screen is further away than
 * a desk one, so a taller chart is the point rather than a band of centred whitespace.
 */
export function planChartHeight(availableHeight: number | null): number {
  if (availableHeight === null || !Number.isFinite(availableHeight)) return MOCKUP_PROFILE_HEIGHT;
  const chrome = PLAN_HEADING_PX + PLAN_HEADING_GAP_PX + PLAN_AXIS_PX;
  return Math.max(MIN_PLAN_HEIGHT, Math.floor(availableHeight) - chrome);
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
