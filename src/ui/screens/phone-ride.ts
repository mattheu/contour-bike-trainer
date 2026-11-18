import type { MapZoom } from '../charts/map';
import { chartZoomToggle, type ProfileZoom, type ZoomToggle } from './ride-view';

/**
 * The phone ride screen's two controls, as arithmetic rather than as JSX.
 *
 * design/DESIGN.md > Screen rules: a phone shows the profile or the map, one at a time,
 * and the foot carries a view toggle and a zoom toggle as icons. Which glyph each shows
 * and what the zoom cycles through depend on the view, and on a desktop state that
 * already exists — so it is decided here, where a test can hold it to the rule.
 */

export type PhoneView = 'profile' | 'map';

/** The view glyphs name a view; the zoom glyphs a direction — see ride-view. */
export type ViewGlyph = PhoneView;

export interface ViewToggle {
  /** What pressing it leaves you looking at. */
  next: PhoneView;
  glyph: ViewGlyph;
  label: string;
}

/**
 * The view toggle shows the view you would switch *to*, not the one you are on: the
 * glyph is the destination, which is the only reading that survives being pressed.
 */
export function viewToggle(view: PhoneView): ViewToggle {
  return view === 'profile'
    ? { next: 'map', glyph: 'map', label: 'Show map' }
    : { next: 'profile', glyph: 'profile', label: 'Show profile' };
}

/**
 * One button for two charts' zooms. Which chart it speaks for is the view on screen, and
 * the state it reads is the one every arrangement shares — a phone that kept a zoom of
 * its own would hand the rider a chart at one zoom and a control naming another the
 * moment the window changed shape mid-ride.
 */
export function zoomToggle(
  view: PhoneView,
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
 * The view a swipe lands on. The two views sit side by side in one order — profile on
 * the left, map on the right — so a direction names a view rather than toggling: swiping
 * the same way twice leaves you where the first swipe put you, which is what a pair of
 * cards does.
 */
export function viewAfterSwipe(direction: SwipeDirection): PhoneView {
  return direction === 'left' ? 'map' : 'profile';
}
