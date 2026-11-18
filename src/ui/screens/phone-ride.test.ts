import { describe, expect, it } from 'vitest';
import {
  PHONE_VIEWS,
  SWIPE_MIN_PX,
  swipeDirection,
  timesToggle,
  viewAfterSwipe,
  viewToggle,
  zoomToggle,
} from './phone-ride';

describe('viewToggle', () => {
  it('shows the map glyph while the profile is on screen', () => {
    const toggle = viewToggle('profile');
    expect(toggle.glyph).toBe('map');
    expect(toggle.next).toBe('map');
    expect(toggle.label).toBe('Show map');
  });

  it('shows the profile glyph while the map is on screen', () => {
    const toggle = viewToggle('map');
    expect(toggle.glyph).toBe('profile');
    expect(toggle.next).toBe('profile');
    expect(toggle.label).toBe('Show profile');
  });

  it('never names the view you are already looking at', () => {
    expect(viewToggle('profile').glyph).not.toBe('profile');
    expect(viewToggle('map').glyph).not.toBe('map');
  });

  it('offers the profile from the times list, which the times button hands back to the map', () => {
    expect(viewToggle('times')).toMatchObject({ next: 'profile', glyph: 'profile' });
    expect(timesToggle('times').next).toBe('map');
  });
});

describe('timesToggle', () => {
  it('is a switch rather than a third destination, pressed while the list is up', () => {
    expect(timesToggle('profile')).toEqual({ next: 'times', pressed: false, label: 'Times' });
    expect(timesToggle('map')).toEqual({ next: 'times', pressed: false, label: 'Times' });
    expect(timesToggle('times')).toEqual({ next: 'map', pressed: true, label: 'Times' });
  });

  it('keeps one name in both states, so the label is the control and not its state', () => {
    expect(timesToggle('map').label).toBe(timesToggle('times').label);
  });
});

describe('zoomToggle', () => {
  it('offers the profile its 5 km window, and the way back out', () => {
    expect(zoomToggle('profile', 'route', 'route')).toMatchObject({
      glyph: 'in',
      label: 'Zoom to 5 km',
      zoomed: false,
    });
    expect(zoomToggle('profile', 'window', 'route')).toMatchObject({
      glyph: 'out',
      zoomed: true,
    });
  });

  it('reads the map zoom when the map is the one showing', () => {
    // Route on the profile, zoomed on the map: the button follows the view, not the
    // other chart's state.
    expect(zoomToggle('map', 'route', 'near')).toMatchObject({ glyph: 'out', zoomed: true });
    expect(zoomToggle('map', 'window', 'route')).toMatchObject({ glyph: 'in', zoomed: false });
  });

  it('labels the near zoom the way every other chart header does', () => {
    expect(zoomToggle('map', 'route', 'route').label).toBe('Zoom to 5 km');
    expect(zoomToggle('map', 'route', 'near').label).toBe('Zoom to the whole route');
  });
});

describe('swipeDirection', () => {
  const from = { x: 200, y: 400 };

  it('ignores a tap', () => {
    expect(swipeDirection(from, from)).toBeNull();
    expect(swipeDirection(from, { x: 203, y: 402 })).toBeNull();
  });

  it('ignores a drag shorter than a touch target', () => {
    expect(swipeDirection(from, { x: from.x - (SWIPE_MIN_PX - 1), y: 400 })).toBeNull();
    expect(swipeDirection(from, { x: from.x + SWIPE_MIN_PX, y: 400 })).not.toBeNull();
  });

  it('ignores a gesture more vertical than horizontal', () => {
    expect(swipeDirection(from, { x: 120, y: 480 })).toBeNull();
  });

  it('reads a shallow diagonal as the swipe it is', () => {
    expect(swipeDirection(from, { x: 120, y: 420 })).toBe('left');
  });

  it('names the direction the finger travelled', () => {
    expect(swipeDirection(from, { x: 100, y: 400 })).toBe('left');
    expect(swipeDirection(from, { x: 300, y: 400 })).toBe('right');
  });
});

describe('viewAfterSwipe', () => {
  it('lays the three views out in one order: profile, map, then the times', () => {
    expect(PHONE_VIEWS).toEqual(['profile', 'map', 'times']);
  });

  it('moves one place along the row, whichever view you start from', () => {
    expect(viewAfterSwipe('profile', 'left')).toBe('map');
    expect(viewAfterSwipe('map', 'left')).toBe('times');
    expect(viewAfterSwipe('times', 'right')).toBe('map');
    expect(viewAfterSwipe('map', 'right')).toBe('profile');
  });

  it('stops at either end rather than wrapping round to the far side', () => {
    expect(viewAfterSwipe('profile', 'right')).toBe('profile');
    expect(viewAfterSwipe('times', 'left')).toBe('times');
  });

  it('is a position rather than a toggle, so swiping on leaves you where you are', () => {
    expect(viewAfterSwipe(viewAfterSwipe('map', 'left'), 'left')).toBe('times');
  });
});
