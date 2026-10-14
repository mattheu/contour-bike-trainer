import { useEffect, useRef, useState } from 'react';
import { MAX_SCALE_PCT, MIN_SCALE_PCT } from '../../workout/runner';
import { Button } from '../components/Button';
import { ButtonGroup } from '../components/ButtonGroup';
import { CONTROL_SIZE } from '../components/control';
import { Hero } from '../components/Hero';
import { RideHeader } from '../components/RideHeader';
import { SLIDE } from '../components/motion';
import { Stat } from '../components/Stat';
import { LABEL, MONO } from '../components/styles';
import { ZoneLadder } from '../components/ZoneLadder';
import { ABSENT, distance, num } from '../format';
import type { RideSnapshot, WorkoutSnapshot } from '../store';
import { AlertStrip } from './AlertStrip';
import {
  heartRateLadder,
  kilometres,
  powerLadder,
  primaryControlLabel,
  readingTone,
} from './ride-view';
import { RideSettings, type DevicesView, type Targets } from './RideSettings';
import {
  cadenceBand,
  cadenceNote,
  canSkip,
  currentRowNumber,
  ergLabel,
  intervalClock,
  powerHero,
  scaleLabel,
  stepRows,
  stepsHeading,
  workoutClock,
  type CadenceBandView,
  type StepRow,
} from './workout-view';

export interface WorkoutProps {
  snapshot: RideSnapshot;
  /** Non-null exactly when a workout is running; the screen exists for it. */
  workout: WorkoutSnapshot;
  ftpW: number;
  hrMaxBpm: number;
  targetMarginPct: number;
  targets: Targets;
  /** What produced the data: a real device, or the named fake script. */
  source: string;
  onTargetsChange: (targets: Targets) => void;
  onPauseToggle: () => void;
  onEnd: () => void;
  onDifficultyChange: (percent: number) => void;
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
 * The screen a rider looks at while riding a workout: the ride screen's three primaries
 * with targets on them, four secondaries, and the plan itself down the right of the page.
 *
 * No route, so no map, no profile and no gradient — a readout pinned at 0.0 % for an hour
 * is worse than no readout. Laying a workout over a route is phase 4 and adds those back.
 *
 * Everything with a right answer is in workout-view: this renders what it is told.
 */
export function Workout({
  snapshot,
  workout,
  ftpW,
  hrMaxBpm,
  targetMarginPct,
  targets,
  source,
  onTargetsChange,
  onPauseToggle,
  onEnd,
  onDifficultyChange,
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

  // design/DESIGN.md: a fault shows in the data too. The trainer's readings go stale when
  // it drops; heart rate follows the strap, which can fail on its own.
  const trainerTone = readingTone(snapshot.trainerState);
  const heartRateTone = readingTone(snapshot.hrmState);

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

  // The target the ladder's accent window is drawn from is the workout's, not the panel's:
  // during a workout the plan is what you are aiming at.
  const power = powerLadder(snapshot.powerW, ftpW, workout.targetW, targetMarginPct);
  const heart = heartRateLadder(
    snapshot.heartRateBpm,
    hrMaxBpm,
    targets.heartRateBpm,
    targetMarginPct,
  );

  const hero = powerHero(workout.targetW, ftpW);
  const cadence = cadenceBand(workout.cadence, snapshot.cadenceRpm);
  const interval = intervalClock(workout);
  const clock = workoutClock(snapshot.elapsedS, workout.totalRemainingS);
  const rows = stepRows(workout);

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

  return (
    <div className="text-ink relative flex h-screen flex-col overflow-hidden">
      <div className="px-[64px] pt-[36px]">
        <RideHeader
          title={workout.name}
          pauseLabel={primaryControlLabel(snapshot.state, snapshot.elapsedS)}
          actions={<Difficulty scalePct={workout.scalePct} onNudge={onNudgeScale} />}
          onPause={onPauseToggle}
          onEnd={onEnd}
          onSettings={() => setSettingsOpen(true)}
        />
      </div>

      <AlertStrip alert={snapshot.alert} onDismiss={onDismissAlert} onRetry={onRetryTrainer} />

      <div className="grid grid-cols-3 gap-[48px] px-[64px] pt-[28px]">
        <Primary>
          <Hero
            testId="workout-power"
            label="Power"
            note={hero.note}
            value={num(snapshot.displayPowerW)}
            target={hero.target ?? undefined}
            unit="W"
            tone={trainerTone}
          />
          <div className="mt-[14px]">
            {power === null ? (
              <Rule />
            ) : (
              <ZoneLadder
                zone={power.zone}
                marker={power.marker}
                target={power.target}
                label="Power zone"
              />
            )}
          </div>
        </Primary>
        <Primary divided>
          <Hero
            testId="workout-cadence"
            label="Cadence"
            note={cadenceNote(workout.cadence) ?? undefined}
            value={num(snapshot.cadenceRpm)}
            unit="rpm"
            tone={trainerTone}
          />
          <div className="mt-[14px]">
            {cadence === null ? <Rule /> : <CadenceBand band={cadence} />}
          </div>
        </Primary>
        <Primary divided>
          <Hero
            testId="workout-heart-rate"
            label="Heart rate"
            value={num(snapshot.heartRateBpm)}
            unit="bpm"
            tone={heartRateTone}
            figure={heart === null ? undefined : `Z${String(heart.zone)}`}
          />
          <div className="mt-[14px]">
            {heart === null ? (
              <Rule />
            ) : (
              <ZoneLadder
                zone={heart.zone}
                marker={heart.marker}
                target={heart.target}
                label="Heart rate zone"
              />
            )}
          </div>
        </Primary>
      </div>

      {/* Four, not five: with no route under the session the gradient is zero all the way
          through, and a readout that never moves is worse than an absent one. */}
      <div className="grid grid-cols-4 gap-[32px] px-[64px] pt-[28px]">
        <Secondary>
          <Stat
            testId="workout-interval"
            label="Interval"
            value={interval.value}
            total={interval.total}
          />
        </Secondary>
        <Secondary divided>
          <Stat testId="workout-clock" label="Workout" value={clock.value} total={clock.total} />
        </Secondary>
        <Secondary divided>
          <Stat
            testId="workout-distance"
            label="Distance"
            value={distance(kilometres(snapshot.distanceM))}
            unit="km"
          />
        </Secondary>
        <Secondary divided>
          {/* Speed is solved from the trainer's power, so it is only as live as the trainer. */}
          <Stat
            testId="workout-speed"
            label="Speed"
            value={distance(snapshot.speedKmh)}
            unit="km/h"
            tone={trainerTone}
          />
        </Secondary>
      </div>

      <Steps
        rows={rows}
        heading={stepsHeading(workout.steps)}
        skippable={canSkip(workout)}
        onSkip={onSkipStep}
      />

      <div className="mt-[24px] flex items-end justify-between px-[64px] pb-[36px]">
        <div className={`${MONO} text-label text-muted`}>
          next <span className="text-ink">{workout.nextLabel ?? ABSENT}</span>
        </div>
        <div className="flex items-center gap-[14px]" data-testid="workout-erg">
          <div className={`${LABEL} text-micro`}>ERG</div>
          <div className={`${MONO} text-micro text-ink`}>{ergLabel(workout.ergEngaged)}</div>
        </div>
      </div>

      {settingsOpen && (
        <RideSettings
          devices={devices}
          difficulty={snapshot.trainerDifficulty}
          targets={targets}
          onDifficultyChange={onDifficultyChange}
          onTargetsChange={onTargetsChange}
          onEnd={onEnd}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}

/**
 * The plan, all of it: seeing step 4 of 8 with two blocks still below is what tells you
 * where you are in the work. It takes the space the profile and map have on a ride, and
 * scrolls inside itself when a session has more steps than the window has room for —
 * carrying the current step with it, since a panel of finished rows answers nothing.
 */
function Steps({
  rows,
  heading,
  skippable,
  onSkip,
}: {
  rows: readonly StepRow[];
  heading: string;
  skippable: boolean;
  onSkip: () => void;
}) {
  const current = currentRowNumber(rows);
  const currentRow = useRef<HTMLDivElement>(null);

  // Keyed on the step rather than the tick, because a step change is minutes apart: the
  // panel moves once when the plan advances and sits still for the whole block after it.
  // `nearest` leaves a row that is already on screen exactly where it is, so a rider who
  // has scrolled the panel to read ahead is not dragged back by it.
  useEffect(() => {
    currentRow.current?.scrollIntoView({ block: 'nearest' });
  }, [current]);

  return (
    <div className="mt-[32px] flex min-h-0 grow flex-col px-[64px]">
      <div className="flex shrink-0 items-center justify-between pb-[10px]">
        <div className="flex items-baseline gap-[18px]">
          <div className={`${LABEL} text-micro`}>Steps</div>
          <div className={`${MONO} text-micro text-muted`} data-testid="workout-steps-heading">
            {heading}
          </div>
        </div>
        {/* One control, not one per row: only one step is ever current, so there is
            nothing to choose between. No confirmation — it is not destructive, and a
            dialogue three minutes into an interval is worse than an occasional mis-tap. */}
        <Button onClick={onSkip} disabled={!skippable}>
          Skip step
        </Button>
      </div>
      {/* bg-ground/60 rather than solid ground, because the contour field runs behind it. */}
      <div className="bg-ground/60 min-h-0 grow overflow-y-auto" data-testid="workout-steps">
        {rows.map((row) => (
          <Step key={row.number} row={row} ref={row.number === current ? currentRow : undefined} />
        ))}
      </div>
    </div>
  );
}

/**
 * design/DESIGN.md > Screen rules: completed steps are muted, and so is the plan ahead. The
 * current step is ink with an accent edge and the faint fill that means "current" everywhere
 * else in the app — so accent says one thing on this screen, which is where you are now.
 */
const QUIET = {
  frame: 'border-hairline border-t pl-[14px]',
  number: 'text-muted',
  name: 'text-muted',
  target: 'text-muted',
  duration: 'text-muted',
};

const ROW_TONE: Record<
  StepRow['state'],
  { frame: string; number: string; name: string; target: string; duration: string }
> = {
  done: QUIET,
  current: {
    frame: 'border-hairline border-accent bg-ink/10 border-t border-l-2 pl-[12px]',
    number: 'text-accent',
    name: 'text-ink font-medium',
    target: 'text-ink',
    duration: 'text-accent',
  },
  ahead: QUIET,
};

function Step({ row, ref }: { row: StepRow; ref?: React.Ref<HTMLDivElement> }) {
  const tone = ROW_TONE[row.state];
  return (
    <div
      ref={ref}
      className={`flex items-baseline gap-[14px] py-[9px] pr-[10px] ${tone.frame}`}
      aria-current={row.state === 'current' ? 'step' : undefined}
    >
      <div className={`${MONO} text-micro w-[16px] ${tone.number}`}>{row.number}</div>
      <div className={`text-label grow font-sans ${tone.name}`}>{row.name}</div>
      <div className={`${MONO} text-caption ${tone.target}`}>{row.target}</div>
      <div className={`${MONO} text-caption w-[52px] text-right ${tone.duration}`}>
        {row.duration}
      </div>
    </div>
  );
}

/**
 * Workout difficulty: minus, the figure, plus, sharing edges like any other group. It
 * scales the work itself rather than the gradient written to the trainer — see SPEC.md —
 * so it is nowhere near trainer difficulty, which stays in the settings panel.
 *
 * It lives in the header because of when it is reached for: the third minute of a
 * twenty-minute block, when opening a panel is the last thing anyone wants.
 */
function Difficulty({
  scalePct,
  onNudge,
}: {
  scalePct: number;
  onNudge: (presses: number) => void;
}) {
  return (
    <ButtonGroup label="Workout difficulty">
      <Button onClick={() => onNudge(-1)} disabled={scalePct <= MIN_SCALE_PCT}>
        <span aria-hidden="true">−</span>
        <span className="sr-only">Easier</span>
      </Button>
      {/* Not pressable, so it carries the group's edges rather than a box of its own. */}
      <div
        aria-live="polite"
        data-testid="workout-scale"
        className={`${CONTROL_SIZE} ${MONO} border-hairline text-ink relative z-[1] -ml-px flex items-center justify-center border px-[16px] tracking-normal normal-case`}
      >
        {scaleLabel(scalePct)}
      </div>
      <Button onClick={() => onNudge(1)} disabled={scalePct >= MAX_SCALE_PCT}>
        <span aria-hidden="true">+</span>
        <span className="sr-only">Harder</span>
      </Button>
    </ButtonGroup>
  );
}

/**
 * The cadence target, which is a request rather than a measure of effort: a window to sit
 * in over a fixed 60–120 rpm span, not a ladder of zones. Same geometry as ZoneLadder, so
 * the three primaries share a baseline whichever of them has a target.
 */
function CadenceBand({ band }: { band: CadenceBandView }) {
  const pct = (fraction: number) => `${(fraction * 100).toFixed(4)}%`;
  return (
    <div className="relative h-[30px]" role="img" aria-label="Cadence target">
      <div className="bg-hairline absolute top-[5px] right-0 left-0 h-px" />
      <div
        className={`absolute top-[3px] left-0 w-full ${SLIDE}`}
        style={{ transform: `translateX(${pct(band.from)})` }}
      >
        <div className="bg-accent h-[5px]" style={{ width: pct(band.to - band.from) }} />
      </div>
      {band.marker !== null && (
        <div
          className={`absolute top-0 left-0 w-full ${SLIDE}`}
          style={{ transform: `translateX(${pct(band.marker)})` }}
        >
          <div className="bg-ink h-[12px] w-[2px]" />
        </div>
      )}
    </div>
  );
}

/** A reading with nothing to measure it against still keeps the row's baseline. */
function Rule() {
  return (
    <div className="relative h-[30px]">
      <div className="bg-hairline absolute top-[5px] right-0 left-0 h-px" />
    </div>
  );
}

function Primary({ children, divided = false }: { children: React.ReactNode; divided?: boolean }) {
  return (
    <div
      className={`flex flex-col gap-[10px] ${divided ? 'border-hairline border-l pl-[36px]' : ''}`}
    >
      {children}
    </div>
  );
}

function Secondary({
  children,
  divided = false,
}: {
  children: React.ReactNode;
  divided?: boolean;
}) {
  return <div className={divided ? 'border-hairline border-l pl-[32px]' : ''}>{children}</div>;
}
