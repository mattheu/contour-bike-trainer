import { describe, expect, it } from 'vitest';
import {
  SWIPE_MIN_PX,
  nextMapZoom,
  nextProfileZoom,
  swipeDirection,
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

  it('labels the near zoom the way the desktop control does', () => {
    expect(zoomToggle('map', 'route', 'route').label).toBe('Zoom to 5 km');
    expect(zoomToggle('map', 'route', 'near').label).toBe('Zoom to the whole route');
  });
});

describe('the zoom each chart cycles through', () => {
  it('is two states on the profile', () => {
    expect(nextProfileZoom('route')).toBe('window');
    expect(nextProfileZoom('window')).toBe('route');
  });

  it('is two states on the map', () => {
    expect(nextMapZoom('route')).toBe('near');
    expect(nextMapZoom('near')).toBe('route');
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
  it('puts the map to the right of the profile', () => {
    expect(viewAfterSwipe('left')).toBe('map');
    expect(viewAfterSwipe('right')).toBe('profile');
  });

  it('is a position rather than a toggle, so swiping on leaves you where you are', () => {
    expect(viewAfterSwipe('left')).toBe(viewAfterSwipe('left'));
  });
});
