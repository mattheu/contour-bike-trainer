import type { MapZoom } from '../charts/map';
import { MAP_ZOOMS, PROFILE_ZOOMS, type ProfileZoom } from './ride-view';

/**
 * The phone ride screen's two controls, as arithmetic rather than as JSX.
 *
 * design/DESIGN.md > Screen rules: a phone shows the profile or the map, one at a time,
 * and the foot carries a view toggle and a zoom toggle as icons. Which glyph each shows
 * and what the zoom cycles through depend on the view, and on a desktop state that
 * already exists — so it is decided here, where a test can hold it to the rule.
 */

export type PhoneView = 'profile' | 'map';

/** The glyph a toggle draws. The view glyphs name a view; the zoom glyphs a direction. */
export type ViewGlyph = PhoneView;
export type ZoomGlyph = 'in' | 'out';

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

export interface ZoomToggle {
  /** Magnifier + while the whole route is showing, − once it is zoomed in. */
  glyph: ZoomGlyph;
  label: string;
  /** Whether the chart in view is at its near zoom. */
  zoomed: boolean;
}

const PROFILE_NEAR: ProfileZoom = 'window';
const MAP_NEAR: MapZoom = 'near';

/** The label the desktop's Segmented gives the same zoom, so the two cannot drift. */
function nearLabel(options: readonly { value: string; label: string }[], near: string): string {
  return options.find((option) => option.value === near)?.label ?? near;
}

/**
 * One button for two charts' zooms. The state it reads is the desktop row's own — a
 * phone that kept a zoom of its own would hand the rider a chart at one zoom and a
 * control naming another the moment the window changed shape mid-ride.
 */
export function zoomToggle(
  view: PhoneView,
  profileZoom: ProfileZoom,
  mapZoom: MapZoom,
): ZoomToggle {
  const zoomed = view === 'profile' ? profileZoom === PROFILE_NEAR : mapZoom === MAP_NEAR;
  const near =
    view === 'profile' ? nearLabel(PROFILE_ZOOMS, PROFILE_NEAR) : nearLabel(MAP_ZOOMS, MAP_NEAR);
  return {
    glyph: zoomed ? 'out' : 'in',
    label: zoomed ? 'Zoom to the whole route' : `Zoom to ${near}`,
    zoomed,
  };
}

/** The zoom the toggle leaves the profile at. */
export function nextProfileZoom(zoom: ProfileZoom): ProfileZoom {
  return zoom === PROFILE_NEAR ? 'route' : PROFILE_NEAR;
}

/** The zoom the toggle leaves the map at. */
export function nextMapZoom(zoom: MapZoom): MapZoom {
  return zoom === MAP_NEAR ? 'route' : MAP_NEAR;
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
