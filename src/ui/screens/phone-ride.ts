import type { MapZoom } from '../charts/map';
import { chartZoomToggle, type ProfileZoom, type ZoomToggle } from './ride-view';

/**
 * The phone ride screen's controls, as arithmetic rather than as JSX.
 *
 * design/DESIGN.md > Screen rules: a phone shows one view at a time, and the foot carries
 * icons for changing which. Which glyph each shows and what the zoom cycles through depend
 * on the view, and on a desktop state that already exists — so it is decided here, where a
 * test can hold it to the rule.
 */

export type PhoneView = 'profile' | 'map' | 'times';

/** The two of them that are charts, which are the two the zoom and the toggle name. */
export type PhoneChart = 'profile' | 'map';

/**
 * The three views in the order they sit side by side, which is the order a swipe moves
 * through: the two charts, then the ranked times — which on every wider arrangement is
 * what takes the map column's place, so it is the map it sits next to.
 */
export const PHONE_VIEWS: readonly PhoneView[] = ['profile', 'map', 'times'];

/** The view glyphs name a view; the zoom glyphs a direction — see ride-view. */
export type ViewGlyph = PhoneChart;

export interface ViewToggle {
  /** What pressing it leaves you looking at. */
  next: PhoneView;
  glyph: ViewGlyph;
  label: string;
}

/**
 * The view toggle shows the view you would switch *to*, not the one you are on: the
 * glyph is the destination, which is the only reading that survives being pressed.
 *
 * It stays the two charts with three views on the screen. A two-state button cannot name
 * three, and spending the glyph on "the next one round" would cost it the one thing it
 * says. From the times list it offers the profile, because the times button beside it is
 * already the way back to the map the list replaced.
 */
export function viewToggle(view: PhoneView): ViewToggle {
  return view === 'profile'
    ? { next: 'map', glyph: 'map', label: 'Show map' }
    : { next: 'profile', glyph: 'profile', label: 'Show profile' };
}

export interface TimesToggle {
  /** What pressing it leaves you looking at. */
  next: PhoneView;
  /** Whether the list is the view on screen. The button reports it in both states. */
  pressed: boolean;
  label: string;
}

/**
 * The times list's own button, beside the view toggle rather than inside it.
 *
 * A switch rather than a third destination glyph: pressed while the list is up, and
 * pressing it again puts the map back. The list takes the map column's place on every
 * arrangement wide enough to have one — see RideDesktop — and this is the same swap on a
 * screen with only one column, which is why it is the map it hands back to.
 */
export function timesToggle(view: PhoneView): TimesToggle {
  return {
    next: view === 'times' ? 'map' : 'times',
    pressed: view === 'times',
    label: 'Times',
  };
}

/**
 * One button for two charts' zooms. Which chart it speaks for is the view on screen, and
 * the state it reads is the one every arrangement shares — a phone that kept a zoom of
 * its own would hand the rider a chart at one zoom and a control naming another the
 * moment the window changed shape mid-ride.
 */
export function zoomToggle(
  view: PhoneChart,
  profileZoom: ProfileZoom,
  mapZoom: MapZoom,
): ZoomToggle {
  return view === 'profile'
    ? chartZoomToggle({ chart: 'profile', zoom: profileZoom })
    : chartZoomToggle({ chart: 'map', zoom: mapZoom });
}

/**
 * How far a finger has to travel sideways before it is a swipe and not a tap. A touch
 * target is 44 px, so a gesture shorter than one is inside the slop of pressing the
 * chart rather than crossing it.
 */
export const SWIPE_MIN_PX = 44;

/**
 * And how much more sideways than vertical. Well over 1 so a diagonal drag — the start
 * of a scroll, or a thumb rolling off the screen — is not read as a view change.
 */
export const SWIPE_RATIO = 1.5;

export type SwipeDirection = 'left' | 'right';

export interface SwipePoint {
  x: number;
  y: number;
}

/**
 * Whether a pointer that went down at `from` and came up at `to` was a swipe.
 *
 * Null for a tap, for a drag too short to mean anything, and for anything more vertical
 * than horizontal. Null is what lets the chart keep its own handlers: the gesture is
 * judged on release, and a gesture that was not a swipe has changed nothing by then.
 */
export function swipeDirection(from: SwipePoint, to: SwipePoint): SwipeDirection | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) < SWIPE_MIN_PX) return null;
  if (Math.abs(dx) < Math.abs(dy) * SWIPE_RATIO) return null;
  return dx < 0 ? 'left' : 'right';
}

/**
 * The view a swipe lands on: one place along PHONE_VIEWS, and no further.
 *
 * The views are a row of cards rather than a cycle. Swiping left at the far end leaves
 * you where you are instead of wrapping round to the profile, because a rider swiping
 * through three cards has no way of knowing which end they are at — and a wrap would
 * send them backwards past two views they did not ask for.
 */
export function viewAfterSwipe(view: PhoneView, direction: SwipeDirection): PhoneView {
  const at = PHONE_VIEWS.indexOf(view) + (direction === 'left' ? 1 : -1);
  return PHONE_VIEWS[Math.min(Math.max(at, 0), PHONE_VIEWS.length - 1)] ?? view;
}
