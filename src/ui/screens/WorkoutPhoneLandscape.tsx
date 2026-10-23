import { useMemo, useRef } from 'react';
import { PHONE_PLAN_LABEL_GUTTER_PX, PlanChart, phoneLandscapePlanHeight } from '../charts';
import { ButtonGroup } from '../components/ButtonGroup';
import { IconButton } from '../components/IconButton';
import {
  EndIcon,
  PauseIcon,
  PlanIcon,
  SettingsIcon,
  SkipIcon,
  StepsIcon,
} from '../components/icons';
import {
  PhoneInlinePrimary,
  PhoneInlineStat,
  PhoneIntervalPrimary,
} from '../components/PhoneReading';
import { LABEL, MONO } from '../components/styles';
import { Logo } from '../components/Wordmark';
import { AlertStrip } from './AlertStrip';
import { ergToggle, workoutViewAfterSwipe, workoutViewToggle } from './phone-workout';
import { useElementHeight, useElementWidth } from './use-element-width';
import { useViewSwipe } from './use-view-swipe';
import type { WorkoutArrangementProps } from './workout-arrangement';
import { canSkip } from './workout-view';
import { WorkoutPhoneSteps } from './WorkoutPhoneSteps';

/**
 * The workout screen on a phone turned sideways, after
 * design/mockups/phone-landscape-workout.html.
 *
 * The landscape ride's four-slot row, with the interval taking the slot that ride gives
 * to speed and gradient: a workout has one reading the rider is riding to, and on a short
 * screen it earns a 44 px figure rather than a line of an 11 px band. The targets go
 * inline beside their figures for the reason the ride's readouts do — height is the
 * scarce thing here, and width is not.
 *
 * What is left under the clocks is the view: the plan chart or the step list, one at a
 * time, switched by the icon at the right end of that line — the slot the landscape ride
 * gives its view and zoom toggles, and for the same reason, which is that nothing may sit
 * over the one part of the screen that gets whatever is left.
 */
export function WorkoutPhoneLandscape({
  snapshot,
  workout,
  readings,
  ftpW,
  rows,
  view,
  onView,
  pauseLabel,
  onPause,
  onEnd,
  onSettings,
  onErgModeChange,
  onSkipStep,
  onDismissAlert,
  onRetryTrainer,
}: WorkoutArrangementProps) {
  // Measured rather than taken from the mockup's 844 x 390, for the reason the portrait
  // arrangement gives. The measured element carries margins and no padding of its own.
  const chartAreaRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(chartAreaRef);
  const areaHeight = useElementHeight(chartAreaRef);
  const chartHeight = useMemo(() => phoneLandscapePlanHeight(areaHeight), [areaHeight]);
  // design/mockups/phone-landscape-workout.html draws 756 inside 796: the Z1-Z6 figures
  // are outside the SVG's own box, so the gutter is what keeps them inside the padding.
  const chartWidth = (width ?? 796) - PHONE_PLAN_LABEL_GUTTER_PX;

  const toggle = workoutViewToggle(view);
  const erg = ergToggle(workout.ergMode);
  const swipe = useViewSwipe(workoutViewAfterSwipe, onView);

  return (
    <div className="flex min-h-0 grow flex-col px-[24px] pt-[16px] pb-[14px]">
      <header className="flex shrink-0 items-center justify-between">
        <div className="flex items-center gap-[12px]">
          <Logo size={44} />
          <div className={`${LABEL} text-micro`}>{workout.name}</div>
        </div>
        {/* The session's own controls stay in the header here: the line under the slots is
            11 px type, and 44 px buttons in it would cost the chart its height twice over.
            Three objects, 12 px apart — the plan's controls, the session's, then settings —
            so a press aimed at Skip cannot land on Pause. ERG | Skip leads because it is
            the pair reached for mid-interval; Pause and End sit nearest the thumb's rest. */}
        <div className="flex items-center gap-[12px]">
          <ButtonGroup label="Plan">
            <IconButton
              label={erg.label}
              title={erg.label}
              size={44}
              pressed={erg.pressed}
              onClick={() => {
                onErgModeChange(erg.next);
              }}
            >
              <span className="text-micro tracking-[0.08em]">ERG</span>
            </IconButton>
            <IconButton
              label="Skip step"
              title="Skip step"
              size={44}
              disabled={!canSkip(workout)}
              onClick={onSkipStep}
            >
              <SkipIcon />
            </IconButton>
          </ButtonGroup>
          <ButtonGroup label="Workout">
            <IconButton label={pauseLabel} size={44} onClick={onPause}>
              <PauseIcon />
            </IconButton>
            <IconButton label="End workout" size={44} onClick={onEnd}>
              <EndIcon />
            </IconButton>
          </ButtonGroup>
          <IconButton label="Settings" size={44} onClick={onSettings}>
            <SettingsIcon />
          </IconButton>
        </div>
      </header>

      <AlertStrip alert={snapshot.alert} onDismiss={onDismissAlert} onRetry={onRetryTrainer} />

      <div className="mt-[18px] grid shrink-0 grid-cols-4 items-start gap-[20px]">
        <PhoneInlinePrimary {...readings.power} />
        <PhoneInlinePrimary {...readings.cadence} divided />
        <PhoneInlinePrimary {...readings.heartRate} divided />
        <PhoneIntervalPrimary {...readings.interval} divided />
      </div>

      {/* items-center, not baseline: the 32 px toggle at the end of the line has no type
          in it to sit on one, so the row centres on the tallest thing instead. */}
      <div className="mt-[4px] flex shrink-0 items-center gap-[20px]">
        <PhoneInlineStat {...readings.workout} />
        <PhoneInlineStat {...readings.distance} divided />
        <PhoneInlineStat {...readings.speed} divided />
        {/* What is coming, at the right end of the line the countdown's track started —
            so "6:42 left" and "then 5:00 recovery" read across the screen in that order.
            truncate, because a step's name is whatever its author wrote. */}
        <div className={`${MONO} text-micro text-muted ml-auto min-w-0 truncate`}>
          {readings.next}
        </div>
        {/* 32 px, not 44: this line is 11 px type, and the taller box would cost the view
            the height it is the whole point of leaving alone. */}
        <IconButton
          label={toggle.label}
          title={toggle.label}
          size={32}
          onClick={() => {
            onView(toggle.next);
          }}
        >
          {toggle.glyph === 'steps' ? <StepsIcon /> : <PlanIcon />}
        </IconButton>
      </div>

      {/* min-h-0 and overflow-hidden so the area measures the space the view has rather
          than the content it holds, and so a list longer than the screen is clipped to it
          rather than pushing the page. No justify-end: the mockups now start the view
          under the clocks and let it take the height, which is the whole of what a 390 px
          screen has. pan-y so a vertical gesture still belongs to the browser — the step
          list scrolls under the same finger — and the horizontal one is not spent on the
          back-swipe. The tick figures' room is not here but inside the chart's own height —
          see PHONE_PLAN_TICK_ROOM_PX — because overflow-hidden would cut off anything this
          box did not pay for. The margin is a margin and not padding, because a padded box
          would measure two different heights. */}
      <div
        ref={chartAreaRef}
        className="mt-[12px] mb-[4px] flex min-h-0 grow flex-col overflow-hidden"
        style={{ touchAction: 'pan-y' }}
        data-testid="phone-view"
        {...swipe}
      >
        {view === 'plan' ? (
          <PlanChart
            steps={workout.steps}
            samples={snapshot.samples}
            ftpW={ftpW}
            scalePct={workout.scalePct}
            elapsedS={snapshot.elapsedS}
            width={chartWidth}
            height={chartHeight}
          />
        ) : (
          <WorkoutPhoneSteps rows={rows} dense />
        )}
      </div>
    </div>
  );
}
