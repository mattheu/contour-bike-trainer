import { describe, expect, it } from 'vitest';
import { SWIPE_MIN_PX, swipeDirection } from './phone-ride';
import { ergToggle, workoutViewAfterSwipe, workoutViewToggle } from './phone-workout';

describe('workoutViewToggle', () => {
  it('shows the steps glyph while the plan is on screen', () => {
    const toggle = workoutViewToggle('plan');
    expect(toggle.glyph).toBe('steps');
    expect(toggle.next).toBe('steps');
    expect(toggle.label).toBe('Show steps');
  });

  it('shows the plan glyph while the steps are on screen', () => {
    const toggle = workoutViewToggle('steps');
    expect(toggle.glyph).toBe('plan');
    expect(toggle.next).toBe('plan');
    expect(toggle.label).toBe('Show plan');
  });

  it('never names the view it is already on, in either reading', () => {
    for (const view of ['plan', 'steps'] as const) {
      const toggle = workoutViewToggle(view);
      expect(toggle.glyph).not.toBe(view);
      expect(toggle.next).not.toBe(view);
    }
  });

  // The chart's own accessible name in design/mockups/phone-portrait-workout.html. Two
  // things called the same thing on one screen is the failure this guards.
  it('does not take the plan chart’s accessible name', () => {
    expect(workoutViewToggle('steps').label).not.toBe('Workout plan');
  });
});

describe('ergToggle', () => {
  it('reads pressed while ERG is the chosen mode, and offers the way out', () => {
    expect(ergToggle('erg')).toEqual({ pressed: true, next: 'manual', label: 'ERG mode' });
  });

  it('reads unpressed with ERG off, and offers the way back in', () => {
    expect(ergToggle('manual')).toEqual({ pressed: false, next: 'erg', label: 'ERG mode' });
  });

  // The state is aria-pressed's to carry. A label that changed with it would be announced
  // twice and, worse, in the two different tenses a screen reader cannot tell apart.
  it('keeps one name in both states', () => {
    expect(ergToggle('erg').label).toBe(ergToggle('manual').label);
  });

  it('round-trips, so a press and a press back leave the mode where it started', () => {
    expect(ergToggle(ergToggle('erg').next).next).toBe('erg');
    expect(ergToggle(ergToggle('manual').next).next).toBe('manual');
  });
});

describe('workoutViewAfterSwipe', () => {
  it('puts the steps to the right of the plan', () => {
    expect(workoutViewAfterSwipe('left')).toBe('steps');
    expect(workoutViewAfterSwipe('right')).toBe('plan');
  });

  it('is a position rather than a toggle, so swiping on leaves you where you are', () => {
    expect(workoutViewAfterSwipe('left')).toBe(workoutViewAfterSwipe('left'));
  });
});

/**
 * The step list is the one view on either phone screen that scrolls under the finger, so
 * the gesture it shares with the plan chart has to let a scroll through untouched. These
 * are swipeDirection's rule read against that list rather than against a chart: null is
 * no view change, and every shape a thumb makes while reading ahead has to produce it.
 */
describe('a drag down the step list', () => {
  const from = { x: 200, y: 400 };

  it('is not a view change, however far it travels', () => {
    expect(swipeDirection(from, { x: 200, y: 700 })).toBeNull();
    expect(swipeDirection(from, { x: 200, y: 100 })).toBeNull();
  });

  // A thumb arcs. A flick down the list that drifts a touch target sideways is still a
  // flick down the list.
  it('survives the sideways drift of a real thumb', () => {
    expect(swipeDirection(from, { x: 200 + SWIPE_MIN_PX, y: 700 })).toBeNull();
    expect(swipeDirection(from, { x: 200 - SWIPE_MIN_PX, y: 700 })).toBeNull();
  });

  it('still lets a deliberate sideways swipe across the list through', () => {
    expect(swipeDirection(from, { x: 80, y: 420 })).toBe('left');
  });
});
