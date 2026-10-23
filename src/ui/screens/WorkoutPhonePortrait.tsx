import { useMemo, useRef } from 'react';
import { PHONE_PLAN_LABEL_GUTTER_PX, PlanChart, phonePlanHeight } from '../charts';
import { ButtonGroup } from '../components/ButtonGroup';
import { IconButton } from '../components/IconButton';
import { EndIcon, PauseIcon, PlanIcon, SettingsIcon, StepsIcon } from '../components/icons';
import { PhoneIntervalBand, PhonePrimary, PhoneStat } from '../components/PhoneReading';
import { LABEL, MONO } from '../components/styles';
import { Logo } from '../components/Wordmark';
import { AlertStrip } from './AlertStrip';
import { useViewSwipe } from './use-view-swipe';
import { workoutViewAfterSwipe, workoutViewToggle } from './phone-workout';
import { useElementHeight, useElementWidth } from './use-element-width';
import type { WorkoutArrangementProps } from './workout-arrangement';
import { stepsHeading } from './workout-view';
import { WorkoutPhoneSteps } from './WorkoutPhoneSteps';

/**
 * The workout screen on a phone held upright, after
 * design/mockups/phone-portrait-workout.html.
 *
 * One column: the three primaries with their targets in the readout line, the interval as
 * a band of its own, the three clocks, then the view — the plan chart or the step list,
 * never both — where a ride draws its profile and strip.
 *
 * One at a time, because at 390 px neither is worth drawing at half height, and the pair
 * are the same choice the ride screen makes between the profile and the map: a toggle at
 * the left of the foot, a swipe across the view itself, and the plan is where it opens.
 */
export function WorkoutPhonePortrait({
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
  onDismissAlert,
  onRetryTrainer,
}: WorkoutArrangementProps) {
  // Measured rather than taken from the mockup's 390 x 844: a phone is whatever it is, and
  // the chart is re-projected to the box it is given rather than scaled into it. The
  // measured element carries margins and no padding — see use-element-width.
  const chartAreaRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(chartAreaRef);
  const areaHeight = useElementHeight(chartAreaRef);
  const chartHeight = useMemo(() => phonePlanHeight(areaHeight), [areaHeight]);
  // The zone figures are drawn outside the SVG's own box, so the chart gives up the
  // gutter they sit in rather than overflowing the page padding.
  const chartWidth = (width ?? 358) - PHONE_PLAN_LABEL_GUTTER_PX;

  const toggle = workoutViewToggle(view);
  const swipe = useViewSwipe(workoutViewAfterSwipe, onView);

  return (
    <div className="flex min-h-0 grow flex-col px-[16px] pt-[28px] pb-[28px]">
      <header className="flex shrink-0 items-center justify-between">
        <div className="flex items-center gap-[12px]">
          <Logo size={44} />
          {/* The session's name, in the space a desktop gives a tag. */}
          <div className={`${LABEL} text-micro`}>{workout.name}</div>
        </div>
        <IconButton label="Settings" size={44} onClick={onSettings}>
          <SettingsIcon />
        </IconButton>
      </header>

      <AlertStrip alert={snapshot.alert} onDismiss={onDismissAlert} onRetry={onRetryTrainer} />

      {/* The targets ride in the readout line the ride screen gives the FTP share: a phone
          has one line under each figure, and on a workout this is what belongs in it. */}
      <div className="mt-[32px] grid shrink-0 grid-cols-3 gap-[14px]">
        <PhonePrimary {...readings.power} />
        <PhonePrimary {...readings.cadence} divided />
        <PhonePrimary {...readings.heartRate} divided />
      </div>

      {/* A band of its own rather than one of three clocks, because it is the reading the
          rider is actually riding to — and the only one with a shape, which is the track. */}
      <div className="border-hairline mt-[26px] shrink-0 border-t pt-[14px]">
        <PhoneIntervalBand {...readings.interval} next={readings.next} />
      </div>

      <div className="mt-[24px] grid shrink-0 grid-cols-3 gap-[14px] whitespace-nowrap">
        <PhoneStat {...readings.workout} />
        <PhoneStat {...readings.distance} divided />
        <PhoneStat {...readings.speed} divided />
      </div>

      {/* min-h-0 so the area measures the space the view has rather than the chart it
          contains; justify-end so the heading travels with the view and a short screen
          takes its height off the top, where the readings have already had theirs. The top
          margin is a floor rather than the gap: justify-end already puts the area's slack
          above its content, so it is invisible on the eight-step session the mockup draws
          and is the only thing keeping the Steps heading off the clocks on a plan long
          enough to fill the list.
          pan-y so a vertical gesture still belongs to the browser — the step list scrolls
          under the same finger — and the horizontal one is not spent on the back-swipe.
          The bottom margin is only the plan's: it is the room the tick figures need under
          the baseline, which a list of rows does not have. A margin rather than padding,
          because a padded box would measure two different heights. */}
      <div
        ref={chartAreaRef}
        className={`mt-[18px] flex min-h-0 grow flex-col justify-end gap-[14px] ${
          view === 'plan' ? 'mb-[22px]' : ''
        }`}
        style={{ touchAction: 'pan-y' }}
        data-testid="phone-view"
        {...swipe}
      >
        <div className="flex h-[16px] shrink-0 items-center justify-between">
          <div className={`${LABEL} text-micro`}>{view === 'plan' ? 'Plan' : 'Steps'}</div>
          {/* The two facts the desktop keeps in its bottom band, in a phone's width — and
              on the list, the count and length its own panel heading carries there. */}
          <div className={`${MONO} text-micro text-muted`}>
            {view === 'plan' ? readings.plan : stepsHeading(workout.steps)}
          </div>
        </div>
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
          <WorkoutPhoneSteps rows={rows} />
        )}
      </div>

      {/* The view toggle takes the slot the ride screen gives its view and zoom icons —
          what you are looking at on the left, what the session is doing on the right.

          Pause and End as glyphs, and grey: design/DESIGN.md takes the accent off a
          control once the session is under way — the data owns the colour from then on. */}
      <div className="mt-[18px] flex shrink-0 items-center justify-between">
        <IconButton
          label={toggle.label}
          title={toggle.label}
          size={44}
          onClick={() => {
            onView(toggle.next);
          }}
        >
          {toggle.glyph === 'steps' ? <StepsIcon /> : <PlanIcon />}
        </IconButton>
        <ButtonGroup label="Workout">
          <IconButton label={pauseLabel} size={44} onClick={onPause}>
            <PauseIcon />
          </IconButton>
          <IconButton label="End workout" size={44} onClick={onEnd}>
            <EndIcon />
          </IconButton>
        </ButtonGroup>
      </div>
    </div>
  );
}
