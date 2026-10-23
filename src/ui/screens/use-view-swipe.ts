import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { swipeDirection, viewAfterSwipe, type PhoneView, type SwipePoint } from './phone-ride';

/**
 * Swiping the chart to change which one is showing, for the phone arrangements that draw
 * one at a time. The judgement itself is swipeDirection's; this is the plumbing.
 *
 * Shared rather than written into each arrangement: portrait and landscape are the same
 * gesture on the same two views, and a second copy is the one that would still be
 * reading a tap as a swipe after the first was fixed.
 */
export function useViewSwipe(onView: (view: PhoneView) => void): {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: () => void;
} {
  /**
   * Where a finger went down, so the gesture can be judged when it comes up.
   *
   * Touch and pen only. The charts' own hover is mouse-only by the same bargain — see
   * moveHover in ElevationProfile — so the two gestures never arrive from the same
   * device and a swipe can never drag the crosshair across the chart behind it.
   *
   * And nothing is decided until the pointer is released: a tap goes down and up in the
   * same place, produces no direction, and reaches the chart underneath untouched.
   */
  const from = useRef<SwipePoint | null>(null);

  return {
    onPointerDown(event) {
      if (event.pointerType === 'mouse') return;
      from.current = { x: event.clientX, y: event.clientY };
    },
    onPointerUp(event) {
      const start = from.current;
      from.current = null;
      if (start === null) return;
      const direction = swipeDirection(start, { x: event.clientX, y: event.clientY });
      if (direction !== null) onView(viewAfterSwipe(direction));
    },
    onPointerCancel() {
      from.current = null;
    },
  };
}
