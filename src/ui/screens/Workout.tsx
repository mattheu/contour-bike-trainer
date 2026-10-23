import { useEffect, useState, type ReactElement } from 'react';
import type { ErgMode } from '../../storage/types';
import type { DevicesView } from '../components/Devices';
import { useFlash } from '../components/motion';
import type { RideSnapshot, WorkoutSnapshot } from '../store';
import { arrangementFor, type ArrangementName } from './arrangement';
import type { WorkoutView } from './phone-workout';
import { heartRateLadder, powerLadder, primaryControlLabel } from './ride-view';
import { RideSettings, type Targets } from './RideSettings';
import {
  PHONE_LANDSCAPE_QUERY,
  PHONE_PORTRAIT_QUERY,
  TABLET_PORTRAIT_QUERY,
  useMediaQuery,
} from './use-media-query';
import type { WorkoutArrangementProps } from './workout-arrangement';
import { workoutReadings } from './workout-readings';
import {
  cadenceBand,
  cadenceNote,
  difficultyInertReason,
  hoveredRowNumber,
  powerHero,
  stepRows,
} from './workout-view';
import { WorkoutDesktop } from './WorkoutDesktop';
import { WorkoutPhoneLandscape } from './WorkoutPhoneLandscape';
import { WorkoutPhonePortrait } from './WorkoutPhonePortrait';

/**
 * The component each arrangement name draws. One at a time — see arrangementFor.
 *
 * A tablet held upright gets the desktop one: the plan chart and the Steps panel are a
 * row this screen is built around, and no mockup re-proportions them yet. Named here
 * rather than by withholding the query from arrangementFor, so the day there is a
 * workout tablet arrangement this is the one line that changes.
 */
const ARRANGEMENTS: Record<ArrangementName, (props: WorkoutArrangementProps) => ReactElement> = {
  'phone-portrait': WorkoutPhonePortrait,
  'phone-landscape': WorkoutPhoneLandscape,
  'tablet-portrait': WorkoutDesktop,
  desktop: WorkoutDesktop,
};

export interface WorkoutProps {
  snapshot: RideSnapshot;
  /**
   * Non-null exactly when a workout is running; the screen exists for it. It carries the
   * session's own FTP, which is why there is no ftpW prop beside it: everything here that
   * zones or scales reads the FTP the targets were resolved against rather than the
   * profile's, which a workout declaring its own `ftp:` is not being ridden at.
   */
  workout: WorkoutSnapshot;
  hrMaxBpm: number;
  targetMarginPct: number;
  targets: Targets;
  /** What produced the data: a real device, or the named fake script. */
  source: string;
  onTargetsChange: (targets: Targets) => void;
  onPauseToggle: () => void;
  onEnd: () => void;
  onDifficultyChange: (percent: number) => void;
  /** ERG on, or off and the rider holds the target. Takes effect at once, mid-step. */
  onErgModeChange: (mode: ErgMode) => void;
  onSkipStep: () => void;
  /** Presses, not percentages: one press is 5 %, clamped by the runner. */
  onNudgeScale: (presses: number) => void;
  onDismissAlert: () => void;
  onRetryTrainer: () => void;
  onConnectTrainer: () => void;
  onDisconnectTrainer: () => void;
  onConnectHrm: () => void;
  onDisconnectHrm: () => void;
}

/**
 * The screen a rider looks at while riding a workout: everything the arrangements share,
 * and the choice between them.
 *
 * No route, so no map, no profile and no gradient — a readout pinned at 0.0 % for an hour
 * is worse than no readout. Laying a workout over a route is phase 4 and adds those back.
 *
 * Everything with a right answer is in workout-view and workout-readings: the arrangements
 * render what they are told, and what a screen size changes is only where it lands.
 */
export function Workout({
  snapshot,
  workout,
  hrMaxBpm,
  targetMarginPct,
  targets,
  source,
  onTargetsChange,
  onPauseToggle,
  onEnd,
  onDifficultyChange,
  onErgModeChange,
  onSkipStep,
  onNudgeScale,
  onDismissAlert,
  onRetryTrainer,
  onConnectTrainer,
  onDisconnectTrainer,
  onConnectHrm,
  onDisconnectHrm,
}: WorkoutProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  /**
   * Which of the two a phone is showing. Held here rather than in the arrangements, so
   * turning the phone mid-session lands on the view the rider chose rather than resetting
   * it — the two phone arrangements are different components and one unmounts the other.
   */
  const [view, setView] = useState<WorkoutView>('plan');
  /**
   * The step under the pointer, by expanded-step index. One value for both directions:
   * the chart's blocks set it, and so do the Steps panel's rows, so a block and a row can
   * never hold different ideas of what is hovered.
   *
   * One piece of state is also what rules out the loop. Both ends write it from a pointer
   * event and neither reads the other's mark: the row's lit type and the block's outline
   * are both derived on the way down, so a row lighting its block cannot light the row
   * again. There is no effect and no callback between them to go round.
   *
   * React state here where the ride screen's profile hover is imperative, because the two
   * are different shapes of event: that one fires per pixel of mouse travel, this one only
   * when the pointer crosses from one block or row to the next — a handful of times a
   * session. The screen already re-renders every second for its clocks, so a render on a
   * block boundary costs nothing it was not spending anyway.
   */
  const [hoveredStep, setHoveredStep] = useState<number | null>(null);

  /**
   * One arrangement is rendered, not three with two hidden. Less load-bearing than on the
   * ride screen, whose charts are imperative — but a hidden plan chart would still be
   * projected and redrawn every second to show nobody anything.
   */
  const arrangementName = arrangementFor({
    phonePortrait: useMediaQuery(PHONE_PORTRAIT_QUERY),
    phoneLandscape: useMediaQuery(PHONE_LANDSCAPE_QUERY),
    tabletPortrait: useMediaQuery(TABLET_PORTRAIT_QUERY),
  });

  // Space is the one keyboard shortcut: hands are on the bars, not the keyboard.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.code !== 'Space' || event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, select, textarea, button, [contenteditable]')) return;
      event.preventDefault();
      onPauseToggle();
    }
    globalThis.addEventListener('keydown', onKeyDown);
    return () => globalThis.removeEventListener('keydown', onKeyDown);
  }, [onPauseToggle]);

  // The session's FTP, not the profile's: a workout that declares its own `ftp:` is ridden
  // at it, so the plan, the zones, the band and the share all have to be read against it.
  const ftpW = workout.ftpW;

  // The target the ladder's accent window is drawn from is the workout's, not the panel's:
  // during a workout the plan is what you are aiming at.
  // The smoothed figure, as the hero above it shows: in ERG the rider reads actual
  // against target, and only the actual is eased. The target is the plan and stays exact.
  const powerZone = powerLadder(snapshot.displayPowerW, ftpW, workout.targetW, targetMarginPct);
  const heartZone = heartRateLadder(
    snapshot.heartRateBpm,
    hrMaxBpm,
    targets.heartRateBpm,
    targetMarginPct,
  );

  /**
   * The step change, as one event.
   *
   * design/mockups/animation-guide.html runs its interval change as a single beat — the
   * target cuts to ink and settles, the band slides, the chart steps — so the three places
   * on this screen that announce it read one boolean rather than each keeping its own. Two
   * hooks on two keys would light in the same frame today and drift the moment either key
   * changed for a different reason.
   *
   * Keyed on the step and not on the target: a block that asks for the same watts as the
   * one before it is still a new block, with its own clock and its own place in the list,
   * and a target that declined to flash would say the plan had not moved on.
   *
   * Under prefers-reduced-motion useFlash never lights, and the change is left to say
   * itself: the target figure and its note carry new numbers, the accent band is over a
   * new window, and the Steps panel has carried a different row into its middle. All of
   * that is state rather than announcement, which is the point — a flash marks a change
   * that is already visible and never carries one on its own.
   */
  const stepFlash = useFlash(workout.stepIndex);

  const readings = workoutReadings({
    snapshot,
    workout,
    hrMaxBpm,
    targetHeartRateBpm: targets.heartRateBpm,
    targetMarginPct,
  });

  const rows = stepRows(workout, ftpW);

  const devices: DevicesView = {
    source,
    trainerState: snapshot.trainerState,
    trainerDeviceName: snapshot.trainerDeviceName,
    trainerServices: snapshot.trainerServices,
    powerW: snapshot.powerW,
    hrmState: snapshot.hrmState,
    heartRateBpm: snapshot.heartRateBpm,
    onConnectTrainer,
    onDisconnectTrainer,
    onConnectHrm,
    onDisconnectHrm,
  };

  const arrangement: WorkoutArrangementProps = {
    snapshot,
    workout,
    readings,
    ftpW,
    hero: powerHero(workout.targetW, ftpW),
    cadenceNote: cadenceNote(workout.cadence),
    cadenceBand: cadenceBand(workout.cadence, snapshot.cadenceRpm),
    powerZone,
    heartZone,
    rows,
    view,
    onView: setView,
    hoveredRow: hoveredRowNumber(rows, hoveredStep),
    hoveredStep,
    onHoverStep: setHoveredStep,
    stepFlash,
    pauseLabel: primaryControlLabel(snapshot.state, snapshot.elapsedS),
    onPause: onPauseToggle,
    onEnd,
    onSettings: () => {
      setSettingsOpen(true);
    },
    onErgModeChange,
    onNudgeScale,
    onSkipStep,
    onDismissAlert,
    onRetryTrainer,
  };

  const Arrangement = ARRANGEMENTS[arrangementName];

  return (
    // h-dvh rather than h-screen: on a phone the viewport is whatever the browser's
    // toolbars have left, and design/DESIGN.md asks every screen to fit one without
    // scrolling. The same height as h-screen anywhere the toolbars do not move.
    <div className="text-ink relative flex h-dvh flex-col overflow-hidden">
      <Arrangement {...arrangement} />

      {settingsOpen && (
        <RideSettings
          devices={devices}
          difficulty={snapshot.trainerDifficulty}
          difficultyInertReason={difficultyInertReason(workout.ergMode)}
          targets={targets}
          onDifficultyChange={onDifficultyChange}
          onTargetsChange={onTargetsChange}
          onEnd={onEnd}
          onClose={() => {
            setSettingsOpen(false);
          }}
        />
      )}
    </div>
  );
}
