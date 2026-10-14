import { useEffect, useMemo, useRef, useState } from 'react';
import type { ErgMode } from '../../storage/types';
import { DEFAULT_SCALE_PCT, MAX_SCALE_PCT, MIN_SCALE_PCT } from '../../workout/runner';
import { ZONE_COUNT as HR_ZONE_COUNT } from '../../zones/hr';
import { ZONE_COUNT as POWER_ZONE_COUNT } from '../../zones/power';
import {
  CHART_ROW_GAP_PX,
  PLAN_HEADING_GAP_PX,
  PLAN_HEADING_PX,
  PlanChart,
  planChartHeight,
  planRowLayout,
} from '../charts';
import { Button } from '../components/Button';
import { ButtonGroup } from '../components/ButtonGroup';
import { CONTROL_SIZE } from '../components/control';
import { Hero } from '../components/Hero';
import { RideHeader } from '../components/RideHeader';
import { Segmented } from '../components/Segmented';
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
  difficultyInertReason,
  ergLabel,
  ERG_MODE_OPTIONS,
  intervalClock,
  powerHero,
  scaleLabel,
  stepRows,
  stepsHeading,
  workoutClock,
  type CadenceBandView,
  type StepRow,
} from './workout-view';
import { useElementHeight, useElementWidth } from './use-element-width';

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

  // The session's FTP, not the profile's: a workout that declares its own `ftp:` is ridden
  // at it, so the plan, the zones, the band and the share all have to be read against it.
  const ftpW = workout.ftpW;

  // The target the ladder's accent window is drawn from is the workout's, not the panel's:
  // during a workout the plan is what you are aiming at.
  const power = powerLadder(snapshot.powerW, ftpW, workout.targetW, targetMarginPct);
  const heart = heartRateLadder(
    snapshot.heartRateBpm,
    hrMaxBpm,
    targets.heartRateBpm,
    targetMarginPct,
  );

  // The chart is re-projected to the row it is given rather than scaled into it, the way
  // the ride screen's are: strokes and tick type stay at their token sizes at every width.
  const rowRef = useRef<HTMLDivElement>(null);
  const chartAreaRef = useRef<HTMLDivElement>(null);
  const rowWidth = useElementWidth(rowRef);
  const chartAreaHeight = useElementHeight(chartAreaRef);
  const layout = useMemo(() => planRowLayout(rowWidth), [rowWidth]);
  const chartHeight = useMemo(() => planChartHeight(chartAreaHeight), [chartAreaHeight]);

  const hero = powerHero(workout.targetW, ftpW);
  const cadence = cadenceBand(workout.cadence, snapshot.cadenceRpm);
  const interval = intervalClock(workout);
  const clock = workoutClock(snapshot.elapsedS, workout.totalRemainingS);
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

  return (
    <div className="text-ink relative flex h-screen flex-col overflow-hidden">
      <div className="px-[64px] pt-[36px]">
        <RideHeader
          title={workout.name}
          pauseLabel={primaryControlLabel(snapshot.state, snapshot.elapsedS)}
          /* The mode goes left of the difficulty, so difficulty keeps the place beside
             the ride group it has had since it arrived: coarse choice, then fine. */
          actions={
            <>
              <ErgControl mode={workout.ergMode} onChange={onErgModeChange} />
              <Difficulty scalePct={workout.scalePct} onNudge={onNudgeScale} />
            </>
          }
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
                count={POWER_ZONE_COUNT}
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
                count={HR_ZONE_COUNT}
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

      {/* min-h-0: a grow child will not shrink below its content without it, so the area
          would measure what it contains rather than the space that content has. */}
      <div ref={chartAreaRef} className="mt-[32px] flex min-h-0 grow flex-col px-[64px]">
        <div
          ref={rowRef}
          className="grid min-h-0 grow"
          style={{
            gridTemplateColumns: layout.showPlan
              ? `${String(layout.planWidth)}px ${String(layout.stepsWidth)}px`
              : `${String(layout.stepsWidth)}px`,
            columnGap: `${String(CHART_ROW_GAP_PX)}px`,
          }}
        >
          {layout.showPlan && (
            <div className="flex min-h-0 flex-col">
              {/* The figure only appears off 100 %, which is also the only time the
                  unscaled plan is drawn behind: it says what the faint line is. */}
              <PanelHeading
                label="Plan"
                note={
                  workout.scalePct === DEFAULT_SCALE_PCT ? undefined : (
                    <div className={`${MONO} text-micro text-muted`}>
                      {`${scaleLabel(workout.scalePct)} of plan`}
                    </div>
                  )
                }
              />
              <PlanChart
                steps={workout.steps}
                samples={snapshot.samples}
                ftpW={ftpW}
                scalePct={workout.scalePct}
                elapsedS={snapshot.elapsedS}
                width={layout.chartWidth}
                height={chartHeight}
              />
            </div>
          )}
          <Steps
            rows={rows}
            heading={stepsHeading(workout.steps)}
            skippable={canSkip(workout)}
            onSkip={onSkipStep}
          />
        </div>
      </div>

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
          difficultyInertReason={difficultyInertReason(workout.ergMode)}
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
    <div className="flex min-h-0 flex-col">
      <PanelHeading
        label="Steps"
        note={
          <div className={`${MONO} text-micro text-muted`} data-testid="workout-steps-heading">
            {heading}
          </div>
        }
        /* One control, not one per row: only one step is ever current, so there is nothing
           to choose between. No confirmation — it is not destructive, and a dialogue three
           minutes into an interval is worse than an occasional mis-tap. */
        action={
          <Button onClick={onSkip} disabled={!skippable}>
            Skip step
          </Button>
        }
      />
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
 * The heading over each column of the lower row.
 *
 * One height for both, set from the figures planChartHeight budgets for rather than from
 * whatever each column happens to contain: the Skip control makes the Steps heading 48 px
 * tall and the Plan heading would otherwise sit 10 px shorter, which starts the two
 * columns on different lines.
 */
function PanelHeading({
  label,
  note,
  action,
}: {
  label: string;
  note?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div
      className="flex shrink-0 items-center justify-between"
      style={{
        height: PLAN_HEADING_PX + PLAN_HEADING_GAP_PX,
        paddingBottom: PLAN_HEADING_GAP_PX,
      }}
    >
      <div className="flex items-baseline gap-[18px]">
        <div className={`${LABEL} text-micro`}>{label}</div>
        {note}
      </div>
      {action}
    </div>
  );
}

/**
 * design/DESIGN.md > Screen rules. The plan ahead is muted; a completed step is muted and
 * the whole row drops to 45 %; the current step takes the Controls section's hover
 * treatment — solid ink, ground text — with an accent left edge.
 *
 * That edge is the only accent in the panel: accent is reserved for the chart beside it,
 * so the current step's countdown reads in ground like the rest of its row rather than
 * competing with the marker for what orange means.
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
  done: { ...QUIET, frame: `${QUIET.frame} opacity-45` },
  current: {
    frame: 'border-hairline border-l-accent bg-ink border-t border-l-2 pl-[12px]',
    number: 'text-ground',
    name: 'text-ground font-medium',
    target: 'text-ground',
    duration: 'text-ground',
  },
  ahead: QUIET,
};

/**
 * The row's wash is the plan chart's block wash: one scale, so the list shows intensity
 * at the shade the chart already drew it at. Mixed from the ink token rather than written
 * as a colour, and left off the current row, where solid ink has already taken the space.
 */
function washColour(wash: number | null): string | undefined {
  if (wash === null) return undefined;
  return `color-mix(in srgb, var(--color-ink) ${String(wash * 100)}%, transparent)`;
}

/**
 * The gap between a wash and the rule above and below it.
 *
 * The hairline is itself ink at about 15 % of the ground, so the top of the wash scale
 * passes straight through it: zone 5 at 16 % is brighter than the rule, and a rule with no
 * contrast against the fill it touches reads as a blurred edge rather than a boundary.
 * Insetting the fill keeps the rule on ground at full contrast on both sides, so the
 * ceiling can stay at 20 % without the separators dissolving.
 *
 * It also makes the row read the way the chart does. DESIGN.md asks the two to match, and
 * the chart draws blocks — bounded shapes with space around them — not tinted rows.
 */
const WASH_INSET_PX = 4;

function Step({ row, ref }: { row: StepRow; ref?: React.Ref<HTMLDivElement> }) {
  const tone = ROW_TONE[row.state];
  const wash = row.state === 'current' ? undefined : washColour(row.wash);
  return (
    <div
      ref={ref}
      className={`relative ${tone.frame}`}
      aria-current={row.state === 'current' ? 'step' : undefined}
    >
      {wash !== undefined && (
        <div
          aria-hidden="true"
          className="absolute inset-x-0"
          style={{ top: WASH_INSET_PX, bottom: WASH_INSET_PX, backgroundColor: wash }}
        />
      )}
      {/* Positioned, so it paints over the wash rather than under it. */}
      <div className="relative flex items-baseline gap-[14px] py-[9px] pr-[10px]">
        <div className={`${MONO} text-micro w-[16px] ${tone.number}`}>{row.number}</div>
        <div className={`text-label grow font-sans ${tone.name}`}>{row.name}</div>
        <div className={`${MONO} text-caption ${tone.target}`}>{row.target}</div>
        <div className={`${MONO} text-caption w-[52px] text-right ${tone.duration}`}>
          {row.duration}
        </div>
      </div>
    </div>
  );
}

/**
 * ERG on or off, beside Pause and End ride because of when it is reached for: the moment
 * ERG starts fighting a sagging cadence, or the moment a rider wants the effort back in
 * their own legs. One segmented choice, one ink member — the two states are both named, so
 * neither has to be inferred from a control that renames itself.
 *
 * Switching is immediate, mid-step: the engine releases the trainer to simulation
 * parameters, or hands it the target again, without waiting for the plan to move on.
 */
function ErgControl({ mode, onChange }: { mode: ErgMode; onChange: (mode: ErgMode) => void }) {
  return (
    <Segmented
      size={48}
      label="Trainer control"
      options={ERG_MODE_OPTIONS}
      value={mode}
      onChange={onChange}
    />
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
