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

import {
  DESKTOP_STRIP,
  PHONE_LANDSCAPE_STRIP,
  PHONE_STRIP,
  stripHeight,
  stripsHeight,
} from './strips';

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
  /** Also the trend strips' width: they share the profile's x-axis. */
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
/** design/mockups/ride.html draws the profile at this height inside a 900 px artboard. */
export const MOCKUP_PROFILE_HEIGHT = 220;

/**
 * One strip, and both of them. Fixed, unlike every other height here: design/DESIGN.md
 * gives a strip 22 px of caption band and 28 px of trace, and both hold type that does not
 * shrink with the chart.
 *
 * There is no gap anywhere in this file any more. The profile's baseline is the power
 * strip's top rule and the power strip's is the heart-rate strip's, so a margin between
 * them would be a margin through a rule the two charts share.
 */
export const DESKTOP_STRIP_HEIGHT = stripHeight(DESKTOP_STRIP);
export const DESKTOP_STRIPS_HEIGHT = stripsHeight(DESKTOP_STRIP);

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
 * The profile is the only chart in the block that flexes vertically.
 *
 * The strips do not, because they are type: 22 px of that is a caption whatever the screen
 * is, and a strip that shared the slack proportionally would end up with a trace shallower
 * than the words above it. The band below them carries live readings — the ghost delta, the
 * difficulty — rather than reference, so it is not a candidate for the space either.
 *
 * The map then matches the whole stack exactly, which is what keeps the two columns aligned
 * at any height rather than by the coincidence that 220 + 50 + 50 is about 302.
 *
 * No ceiling: on a tall screen the profile keeps growing rather than leaving a band of
 * centred whitespace. DESIGN.md asks for everything to be readable from a metre away, and a
 * turbo screen is further off than a desk one, so bigger is the point.
 */
export function chartStackHeights(availableHeight: number | null): {
  profileHeight: number;
  /** One strip. The block below the profile is twice this. */
  stripHeight: number;
  mapHeight: number;
} {
  const strip = DESKTOP_STRIP_HEIGHT;
  const stacked = (
    profileHeight: number,
  ): { profileHeight: number; stripHeight: number; mapHeight: number } => ({
    profileHeight,
    stripHeight: strip,
    mapHeight: profileHeight + DESKTOP_STRIPS_HEIGHT,
  });

  if (availableHeight === null || !Number.isFinite(availableHeight)) {
    return stacked(MOCKUP_PROFILE_HEIGHT);
  }

  const chrome = CHART_HEADING_PX + CHART_HEADING_GAP_PX;
  const forCharts = Math.floor(availableHeight) - chrome;
  return stacked(Math.max(MIN_PROFILE_HEIGHT, forCharts - DESKTOP_STRIPS_HEIGHT));
}

/**
 * A phone shows one chart over the two strips, so its stack is simpler than the desktop's:
 * no heading row and no second column.
 *
 * design/mockups/phone-portrait-profile.html draws the view at 200 and each strip at 36
 * inside an 844 px artboard, with nothing between them.
 */
export const PHONE_VIEW_HEIGHT = 200;
export const PHONE_STRIP_HEIGHT = stripHeight(PHONE_STRIP);
export const PHONE_STRIPS_HEIGHT = stripsHeight(PHONE_STRIP);

/** Below this the profile is a line rather than terrain, and the map a smudge. */
export const MIN_PHONE_VIEW_HEIGHT = 120;

/**
 * How a phone divides the space left under its readings.
 *
 * The view keeps the height it is drawn at and gives it up only on a screen too short for
 * it, which is the opposite of the desktop's "grow into whatever is there". The phone's
 * view is 358 px wide: at the desktop's full height it would be nearly square, and a
 * profile that tall shows the same terrain as a band floating in an empty box rather than
 * more of it. design/mockups/phone-portrait-profile.html spends the slack above the chart
 * instead, where it costs nothing.
 */
export function phoneChartStack(availableHeight: number | null): PhoneChartStack {
  return phoneStack(availableHeight, {
    view: PHONE_VIEW_HEIGHT,
    strips: PHONE_STRIPS_HEIGHT,
    strip: PHONE_STRIP_HEIGHT,
    minView: MIN_PHONE_VIEW_HEIGHT,
  });
}

/**
 * design/mockups/phone-landscape.html draws the profile at 102 and each strip at 34 inside a
 * 390 px artboard; phone-landscape-map.html draws the map at 108. Shallower than portrait's
 * because the four-slot row and the stats line have already taken the top half of a short
 * screen — and the map gets the extra 6 px because a route folds into a band sooner than
 * terrain does.
 */
export const PHONE_LANDSCAPE_PROFILE_HEIGHT = 102;
export const PHONE_LANDSCAPE_MAP_HEIGHT = 108;
export const PHONE_LANDSCAPE_STRIP_HEIGHT = stripHeight(PHONE_LANDSCAPE_STRIP);
export const PHONE_LANDSCAPE_STRIPS_HEIGHT = stripsHeight(PHONE_LANDSCAPE_STRIP);

/**
 * Lower than the portrait floor because the box is a different shape: at 796 px wide a
 * 96 px profile is still a 8:1 band of terrain, where the same height at 358 px wide is
 * the squashed chart MIN_PHONE_VIEW_HEIGHT exists to prevent.
 */
export const MIN_PHONE_LANDSCAPE_VIEW_HEIGHT = 96;

/** Which chart the one-at-a-time arrangements are showing, for the heights that differ. */
export type StackView = 'profile' | 'map';

/** The same division on a phone turned sideways, where the two views differ in height. */
export function phoneLandscapeChartStack(
  availableHeight: number | null,
  view: StackView = 'profile',
): PhoneChartStack {
  return phoneStack(availableHeight, {
    view: view === 'map' ? PHONE_LANDSCAPE_MAP_HEIGHT : PHONE_LANDSCAPE_PROFILE_HEIGHT,
    strips: PHONE_LANDSCAPE_STRIPS_HEIGHT,
    strip: PHONE_LANDSCAPE_STRIP_HEIGHT,
    minView: MIN_PHONE_LANDSCAPE_VIEW_HEIGHT,
  });
}

export interface PhoneChartStack {
  viewHeight: number;
  /** One strip. The block under the view is twice this. */
  stripHeight: number;
}

/**
 * The strips never give height up, here or anywhere: they are a caption over a trace, and
 * a screen too short for 36 px of them is a screen the readings above have already
 * overflowed. The view is what absorbs a short phone, down to its own floor.
 */
function phoneStack(
  availableHeight: number | null,
  drawn: { view: number; strips: number; strip: number; minView: number },
): PhoneChartStack {
  if (availableHeight === null || !Number.isFinite(availableHeight)) {
    return { viewHeight: drawn.view, stripHeight: drawn.strip };
  }

  const forCharts = Math.floor(availableHeight);
  const viewHeight = Math.min(drawn.view, Math.max(drawn.minView, forCharts - drawn.strips));
  return { viewHeight, stripHeight: drawn.strip };
}

/**
 * design/mockups/tablet-portrait.html draws all four charts at once inside an 834 x 1194
 * artboard: the profile at 190 over two strips at the desktop's 50, then the map at 240
 * under a heading of its own, 40 px below the block.
 */
export const TABLET_PROFILE_HEIGHT = 190;
export const TABLET_STRIP_HEIGHT = DESKTOP_STRIP_HEIGHT;
export const TABLET_STRIPS_HEIGHT = DESKTOP_STRIPS_HEIGHT;
export const TABLET_MAP_HEIGHT = 240;
export const TABLET_STACK_GAP_PX = 40;

/**
 * The map is 754 px wide here, so it runs out of use at a height the desktop's narrow
 * column never reaches: under this it is a 5:1 letterbox and a route folds into a band
 * rather than keeping a shape the rider can recognise.
 */
export const MIN_TABLET_MAP_HEIGHT = 160;

export interface TabletChartStack {
  profileHeight: number;
  /** One strip. The block under the profile is twice this. */
  stripHeight: number;
  mapHeight: number;
}

const TABLET_CHART_CHROME_PX = TABLET_STACK_GAP_PX + CHART_HEADING_PX + CHART_HEADING_GAP_PX;

const TABLET_STACK_DRAWN: TabletChartStack = {
  profileHeight: TABLET_PROFILE_HEIGHT,
  stripHeight: TABLET_STRIP_HEIGHT,
  mapHeight: TABLET_MAP_HEIGHT,
};

/**
 * How a tablet held upright divides the space its readings left.
 *
 * Capped at the drawn heights rather than grown into whatever is there, which is the
 * bargain the phone stacks already make and the one the mockup draws: it centres the
 * charts and spends the slack above and below them. Unlike a phone there is more than one
 * chart here, so a short tablet has an order to give height up in — the map first, because
 * the profile is the chart you ride to and the map is the reference beside it, which is the
 * same call MIN_MAP_WIDTH makes across the desktop row. The strips never give any up: see
 * phoneStack.
 */
export function tabletChartStack(availableHeight: number | null): TabletChartStack {
  if (availableHeight === null || !Number.isFinite(availableHeight)) return TABLET_STACK_DRAWN;

  const forCharts = Math.floor(availableHeight) - TABLET_CHART_CHROME_PX;
  let owed = TABLET_PROFILE_HEIGHT + TABLET_STRIPS_HEIGHT + TABLET_MAP_HEIGHT - forCharts;
  if (owed <= 0) return TABLET_STACK_DRAWN;

  const mapHeight = Math.max(MIN_TABLET_MAP_HEIGHT, TABLET_MAP_HEIGHT - owed);
  owed -= TABLET_MAP_HEIGHT - mapHeight;
  const profileHeight = Math.max(MIN_PROFILE_HEIGHT, TABLET_PROFILE_HEIGHT - owed);

  return { profileHeight, stripHeight: TABLET_STRIP_HEIGHT, mapHeight };
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
 *
 * The two strips come out of the budget before the chart does. They sit flush under it —
 * the plan's baseline is the power strip's top rule — and the time axis has moved off the
 * plan to the bottom of the block, so PLAN_AXIS_PX is now the room the figures need under
 * the heart-rate strip rather than under this chart.
 */
export function planChartHeight(availableHeight: number | null): number {
  if (availableHeight === null || !Number.isFinite(availableHeight)) return MOCKUP_PLAN_HEIGHT;
  const chrome = PLAN_HEADING_PX + PLAN_HEADING_GAP_PX + PLAN_AXIS_PX + DESKTOP_STRIPS_HEIGHT;
  return Math.max(MIN_PLAN_HEIGHT, Math.floor(availableHeight) - chrome);
}

/** design/mockups/workout.html draws the plan at this height over its two strips. */
export const MOCKUP_PLAN_HEIGHT = 188;

/**
 * The plan chart on a phone, where it stands in for the profile and the power strip
 * together and the Steps panel is not drawn at all.
 *
 * design/mockups/phone-portrait-workout.html draws it 320 wide inside a 358 px column and
 * phone-landscape-workout.html 756 inside 796, so both keep 40 px clear to the right of
 * the chart. That is where the Z1-Z6 figures sit: the SVG overflows its own box to draw
 * them, and without the gutter they would be clipped by the page padding.
 */
export const PHONE_PLAN_LABEL_GUTTER_PX = 40;

/** The heights the same two mockups draw, inside 844 px and 390 px artboards. */
export const PHONE_PLAN_HEIGHT = 118;
export const PHONE_LANDSCAPE_PLAN_HEIGHT = 106;

/**
 * Shallower than the desktop's floor, because a phone is not reading a target off this
 * chart. The interval band above it carries the figures; the chart is there to show where
 * in the session the rider is, which survives the zone bands crowding well past the point
 * where MIN_PLAN_HEIGHT says a desktop should stop.
 */
export const MIN_PHONE_PLAN_HEIGHT = 88;

/**
 * Portrait keeps a `Plan` heading over the chart, where landscape has no room for one.
 * It is inside the measured area, so it comes out of the budget before the chart does.
 */
export const PHONE_PLAN_HEADING_PX = 16;
export const PHONE_PLAN_HEADING_GAP_PX = 14;

/**
 * The room the time figures need under the block's bottom rule. They are drawn outside the
 * heart-rate strip's own box — design/mockups/phone-landscape-workout.html puts them at
 * y 56 inside a box 34 tall — so a block given the whole area would push them past its
 * bottom edge, where the landscape arrangement's overflow-hidden cuts them off. Taken out
 * of the chart's height rather than added under it, so the figures land inside the area
 * that was measured.
 */
export const PHONE_PLAN_TICK_ROOM_PX = 22;

/**
 * How tall the chart is drawn in the space the readings left it.
 *
 * Capped at the drawn height rather than grown into whatever is there, which is the
 * bargain phoneChartStack already makes: a plan chart stretched to fill a tall phone is
 * the same six zone bands in a taller box, and the mockups spend that slack above the
 * chart instead, where it costs nothing.
 */
function phonePlan(availableHeight: number | null, drawn: number, chrome: number): number {
  if (availableHeight === null || !Number.isFinite(availableHeight)) return drawn;
  const forChart = Math.floor(availableHeight) - chrome;
  return Math.max(MIN_PHONE_PLAN_HEIGHT, Math.min(drawn, forChart));
}

export function phonePlanHeight(availableHeight: number | null): number {
  return phonePlan(
    availableHeight,
    PHONE_PLAN_HEIGHT,
    PHONE_PLAN_HEADING_PX + PHONE_PLAN_HEADING_GAP_PX + PHONE_STRIPS_HEIGHT,
  );
}

/** The same chart on a phone turned sideways: wider, shorter, and with no heading over it. */
export function phoneLandscapePlanHeight(availableHeight: number | null): number {
  return phonePlan(
    availableHeight,
    PHONE_LANDSCAPE_PLAN_HEIGHT,
    PHONE_PLAN_TICK_ROOM_PX + PHONE_LANDSCAPE_STRIPS_HEIGHT,
  );
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
