import { useMemo, useRef } from 'react';
import { PHONE_PLAN_LABEL_GUTTER_PX, PlanChart, phoneLandscapePlanHeight } from '../charts';
import { ButtonGroup } from '../components/ButtonGroup';
import { IconButton } from '../components/IconButton';
import { EndIcon, PauseIcon, SettingsIcon } from '../components/icons';
import {
  PhoneInlinePrimary,
  PhoneInlineStat,
  PhoneIntervalPrimary,
} from '../components/PhoneReading';
import { LABEL, MONO } from '../components/styles';
import { Logo } from '../components/Wordmark';
import { AlertStrip } from './AlertStrip';
import { useElementHeight, useElementWidth } from './use-element-width';
import type { WorkoutArrangementProps } from './workout-arrangement';

/**
 * The workout screen on a phone turned sideways, after
 * design/mockups/phone-landscape-workout.html.
 *
 * The landscape ride's four-slot row, with the interval taking the slot that ride gives
 * to speed and gradient: a workout has one reading the rider is riding to, and on a short
 * screen it earns a 44 px figure rather than a line of an 11 px band. The targets go
 * inline beside their figures for the reason the ride's readouts do — height is the
 * scarce thing here, and width is not.
 */
export function WorkoutPhoneLandscape({
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
  // Measured rather than taken from the mockup's 844 x 390, for the reason the portrait
  // arrangement gives. The measured element carries margins and no padding of its own.
  const chartAreaRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(chartAreaRef);
  const areaHeight = useElementHeight(chartAreaRef);
  const chartHeight = useMemo(() => phoneLandscapePlanHeight(areaHeight), [areaHeight]);
  // design/mockups/phone-landscape-workout.html draws 756 inside 796: the Z1-Z6 figures
  // are outside the SVG's own box, so the gutter is what keeps them inside the padding.
  const chartWidth = (width ?? 796) - PHONE_PLAN_LABEL_GUTTER_PX;

  return (
    <div className="flex min-h-0 grow flex-col px-[24px] pt-[16px] pb-[14px]">
      <header className="flex shrink-0 items-center justify-between">
        <div className="flex items-center gap-[12px]">
          <Logo size={44} />
          <div className={`${LABEL} text-micro`}>{workout.name}</div>
        </div>
        {/* The session's own controls stay in the header here: the line under the slots is
            11 px type, and 44 px buttons in it would cost the chart its height twice over. */}
        <div className="flex items-center">
          <ButtonGroup label="Workout">
            <IconButton label={pauseLabel} size={44} onClick={onPause}>
              <PauseIcon />
            </IconButton>
            <IconButton label="End workout" size={44} onClick={onEnd}>
              <EndIcon />
            </IconButton>
          </ButtonGroup>
          <div className="ml-[12px]">
            <IconButton label="Settings" size={44} onClick={onSettings}>
              <SettingsIcon />
            </IconButton>
          </div>
        </div>
      </header>

      <AlertStrip alert={snapshot.alert} onDismiss={onDismissAlert} onRetry={onRetryTrainer} />

      <div className="mt-[18px] grid shrink-0 grid-cols-4 items-start gap-[20px]">
        <PhoneInlinePrimary {...readings.power} />
        <PhoneInlinePrimary {...readings.cadence} divided />
        <PhoneInlinePrimary {...readings.heartRate} divided />
        <PhoneIntervalPrimary {...readings.interval} divided />
      </div>

      <div className="mt-[10px] flex shrink-0 items-baseline gap-[20px]">
        <PhoneInlineStat {...readings.workout} />
        <PhoneInlineStat {...readings.distance} divided />
        <PhoneInlineStat {...readings.speed} divided />
        {/* What is coming, at the right end of the line the countdown's track started —
            so "6:42 left" and "then 5:00 recovery" read across the screen in that order.
            truncate, because a step's name is whatever its author wrote. */}
        <div className={`${MONO} text-micro text-muted ml-auto min-w-0 truncate`}>
          {readings.next}
        </div>
      </div>

      {/* min-h-0 so the area measures the space the chart has rather than the chart it
          contains; justify-end so the slack falls above the chart, which is the clear band
          the mockup draws there. The bottom margin is the tick figures' room — a margin
          rather than padding, because a padded box would measure two different heights. */}
      <div
        ref={chartAreaRef}
        className="mt-[10px] mb-[22px] flex min-h-0 grow flex-col justify-end"
      >
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
    </div>
  );
}
