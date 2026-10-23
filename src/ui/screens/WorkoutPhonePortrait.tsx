import { useMemo, useRef } from 'react';
import { PHONE_PLAN_LABEL_GUTTER_PX, PlanChart, phonePlanHeight } from '../charts';
import { ButtonGroup } from '../components/ButtonGroup';
import { IconButton } from '../components/IconButton';
import { EndIcon, PauseIcon, SettingsIcon } from '../components/icons';
import { PhoneIntervalBand, PhonePrimary, PhoneStat } from '../components/PhoneReading';
import { LABEL, MONO } from '../components/styles';
import { Logo } from '../components/Wordmark';
import { AlertStrip } from './AlertStrip';
import { useElementHeight, useElementWidth } from './use-element-width';
import type { WorkoutArrangementProps } from './workout-arrangement';

/**
 * The workout screen on a phone held upright, after
 * design/mockups/phone-portrait-workout.html.
 *
 * One column: the three primaries with their targets in the readout line, the interval as
 * a band of its own, the three clocks, then the plan chart where a ride draws its profile
 * and strip. The Steps panel does not come: at 390 px it would be a list of eight rows
 * under a chart too short to read, and the band above already says what is being asked
 * for now and what is coming next.
 *
 * Provisional, not settled. Neither phone mockup has room for the panel and DESIGN.md's
 * phone bullets do not mention it, so this follows the design as drawn — but a rider who
 * navigates a long session by looking ahead loses that here, and the question was still
 * with design when this was built.
 */
export function WorkoutPhonePortrait({
  snapshot,
  workout,
  readings,
  ftpW,
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

      <div className="mt-[18px] grid shrink-0 grid-cols-3 gap-[14px] whitespace-nowrap">
        <PhoneStat {...readings.workout} />
        <PhoneStat {...readings.distance} divided />
        <PhoneStat {...readings.speed} divided />
      </div>

      {/* min-h-0 so the area measures the space the chart has rather than the chart it
          contains; justify-end so the heading travels with the chart and a short screen
          takes its height off the top, where the readings have already had theirs. The
          bottom margin is the room the tick figures need under the baseline, kept as a
          margin because a padded box would measure two different heights. */}
      <div
        ref={chartAreaRef}
        className="mt-[18px] mb-[22px] flex min-h-0 grow flex-col justify-end gap-[14px]"
      >
        <div className="flex h-[16px] shrink-0 items-center justify-between">
          <div className={`${LABEL} text-micro`}>Plan</div>
          {/* The two facts the desktop keeps in its bottom band, in a phone's width. */}
          <div className={`${MONO} text-micro text-muted`}>{readings.plan}</div>
        </div>
        <PlanChart
          steps={workout.steps}
          samples={snapshot.samples}
          ftpW={ftpW}
          scalePct={workout.scalePct}
          elapsedS={snapshot.elapsedS}
          width={chartWidth}
          height={chartHeight}
        />
      </div>

      {/* Pause and End as glyphs, and grey: design/DESIGN.md takes the accent off a
          control once the session is under way — the data owns the colour from then on. */}
      <div className="mt-[18px] flex shrink-0 items-center justify-end">
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
