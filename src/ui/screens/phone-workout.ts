import type { SwipeDirection } from './phone-ride';

/**
 * The phone workout screen's view toggle, as arithmetic rather than as JSX.
 *
 * design/mockups/phone-portrait-workout.html and phone-portrait-workout-steps.html: a
 * phone shows the plan chart or the step list, one at a time, and one icon switches
 * between them — the ride screen's profile/map toggle, on a workout's two views. Which
 * glyph and which label go with which view is decided here, where a test can hold it to
 * the rule rather than in two arrangements that would eventually disagree.
 *
 * The gesture itself is phone-ride's, borrowed rather than copied: one swipe judged one
 * way, so a diagonal that is the start of a scroll on a route is one on a workout too.
 */

export type WorkoutView = 'plan' | 'steps';

/** The glyph the toggle draws. Both glyphs name a view, as the ride's view glyphs do. */
export type WorkoutViewGlyph = WorkoutView;

export interface WorkoutViewToggle {
  /** What pressing it leaves you looking at. */
  next: WorkoutView;
  glyph: WorkoutViewGlyph;
  label: string;
}

/**
 * The toggle shows the view you would switch *to*, not the one you are on: the glyph is
 * the destination, which is the only reading that survives being pressed.
 *
 * "Show plan" rather than the chart's own "Workout plan", which is already taken — that
 * is the accessible name of the drawing, and a button sharing it would leave a screen
 * reader with two different things called the same thing on one screen.
 */
export function workoutViewToggle(view: WorkoutView): WorkoutViewToggle {
  return view === 'plan'
    ? { next: 'steps', glyph: 'steps', label: 'Show steps' }
    : { next: 'plan', glyph: 'plan', label: 'Show plan' };
}

/**
 * The view a swipe lands on. The two views sit side by side in one order — the plan on
 * the left, the steps on the right — so a direction names a view rather than toggling,
 * and swiping the same way twice leaves you where the first swipe put you.
 *
 * The plan is on the left because it is what the screen opens on: a workout's shape is
 * the thing you check first, and the list is what you go looking for.
 */
export function workoutViewAfterSwipe(direction: SwipeDirection): WorkoutView {
  return direction === 'left' ? 'steps' : 'plan';
}
