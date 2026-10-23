import type { ErgMode } from '../../storage/types';
import type { RideSnapshot, WorkoutSnapshot } from '../store';
import type { WorkoutView } from './phone-workout';
import type { LadderView } from './ride-view';
import type { WorkoutReadings } from './workout-readings';
import type { CadenceBandView, PowerHeroView, StepRow } from './workout-view';

/**
 * What a workout arrangement is given.
 *
 * The counterpart of ride-arrangement, and the same bargain: the screen draws one
 * arrangement at a time — a desktop's plan row, a phone's two — and everything derived
 * arrives here already derived. An arrangement is a layout, and the moment one of them
 * formats a figure of its own the three start disagreeing about the session.
 *
 * A phone draws one of its two views at a time, as the ride screen does — but unlike it
 * there are no chart handles to share: PlanChart holds no ref, because the screen
 * re-renders every second for its clocks anyway and there is nothing mutation would save.
 */
export interface WorkoutArrangementProps {
  /** For what no arrangement formats: the alert, the plan, the difficulty. */
  snapshot: RideSnapshot;
  workout: WorkoutSnapshot;
  readings: WorkoutReadings;

  /**
   * The session's FTP, not the rider's: a workout declaring its own `ftp:` is ridden at
   * it, so the plan chart's zone bands are drawn against the FTP the targets came from.
   */
  ftpW: number;

  /** The desktop hero's target figure and the line above it. */
  hero: PowerHeroView;
  /** `target 85–95 rpm`, or null where the step asks for no cadence. */
  cadenceNote: string | null;
  /** Where the cadence window and the tick sit, or null for a step with no window. */
  cadenceBand: CadenceBandView | null;
  /** Null until there is a reading to place on the ladder. */
  powerZone: LadderView | null;
  heartZone: LadderView | null;

  /** Every step the session will ride, as the Steps panel and the phone list show them. */
  rows: readonly StepRow[];

  /**
   * The plan chart or the step list. A phone has room for one, and the desktop
   * arrangements ignore it: they draw both, side by side, and never ask.
   */
  view: WorkoutView;
  onView: (view: WorkoutView) => void;
  /** The row the hovered step points at, by number, or null for none. */
  hoveredRow: number | null;
  /** The hovered step by expanded-step index, which the chart outlines. */
  hoveredStep: number | null;
  onHoverStep: (stepIndex: number | null) => void;
  /** Whether the screen's step change is in its lit frame — one event, read three ways. */
  stepFlash: boolean;

  /** What the primary control reads now: Start, Pause or Resume. */
  pauseLabel: string;

  onPause: () => void;
  onEnd: () => void;
  onSettings: () => void;
  onErgModeChange: (mode: ErgMode) => void;
  /** Presses, not percentages: one press is 5 %, clamped by the runner. */
  onNudgeScale: (presses: number) => void;
  onSkipStep: () => void;
  onDismissAlert: () => void;
  onRetryTrainer: () => void;
}
