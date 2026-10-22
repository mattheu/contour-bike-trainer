import type { GhostSlotView } from '../../ghost/live';
import type { HistorySlot } from '../../ghost/resolve';
import {
  SLOT_DESCRIPTION,
  SLOT_SYMBOL,
  SYMBOL_BOX,
  SYMBOL_STROKE_WIDTH,
  longDate,
} from '../../ghost/slots';
import { SettingsPanel } from '../components/SettingsPanel';
import { Button } from '../components/Button';
import { Devices, type DevicesView } from '../components/Devices';
import { LABEL, MONO } from '../components/styles';
import { duration } from '../format';

export interface Targets {
  powerW: number | null;
  cadenceRpm: number | null;
  heartRateBpm: number | null;
}

interface RideSettingsProps {
  devices: DevicesView;
  difficulty: number;
  /**
   * Why trainer difficulty does nothing right now, or absent while it does something. A
   * disabled control that says why beats one that silently swallows the drag — see
   * workout-view.difficultyInertReason, which is where the wording is decided.
   */
  difficultyInertReason?: string | null;
  targets: Targets;
  /**
   * The ghost section, absent on a session with no route to race over — a workout ride
   * has no history of the same road and so has no slots to offer.
   */
  ghosts?: GhostSettingsView;
  onDifficultyChange: (percent: number) => void;
  onTargetsChange: (targets: Targets) => void;
  onEnd: () => void;
  onClose: () => void;
}

export interface GhostSettingsView {
  /** Every slot, including the ones switched off and the ones nothing can fill. */
  slots: readonly GhostSlotView[];
  /** The three resolved slots. The picked one is not a preference and is not here. */
  onSlot: (slot: HistorySlot, on: boolean) => void;
  /** Empties the picked slot. Filling it is the rides list's Race button. */
  onClearPicked: () => void;
}

/** A blank field clears the target rather than pinning it to zero. */
function readNumber(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

const SECTION = 'flex flex-col gap-[16px]';

/**
 * design/mockups/ride-settings.html, minus FTP, which is not edited mid-ride. Everything
 * here takes effect on the ride in progress.
 *
 * Devices lead, because pairing is the precondition for everything under it: this panel
 * pairs what you are riding with now, and the same rows live in the rider profile panel
 * for when you are not in a ride. A connection fault reaches the rider through the alert
 * strip on the ride screen rather than through a screen of its own.
 */
export function RideSettings({
  devices,
  difficulty,
  difficultyInertReason = null,
  targets,
  ghosts,
  onDifficultyChange,
  onTargetsChange,
  onEnd,
  onClose,
}: RideSettingsProps) {
  const difficultyInert = difficultyInertReason !== null;
  return (
    <SettingsPanel title="Ride settings" onClose={onClose}>
      <Devices devices={devices} />

      <div className={SECTION}>
        <div className="flex items-baseline justify-between">
          <label htmlFor="trainer-difficulty" className={LABEL}>
            Trainer difficulty
          </label>
          <div className={`${MONO} text-sub text-ink`}>{difficulty}</div>
        </div>
        <input
          id="trainer-difficulty"
          type="range"
          min={0}
          max={100}
          value={difficulty}
          disabled={difficultyInert}
          aria-describedby={difficultyInert ? 'trainer-difficulty-note' : undefined}
          onChange={(event) => onDifficultyChange(Number(event.target.value))}
          className={[
            'h-[44px] w-full appearance-none bg-transparent',
            // DESIGN.md > Controls: disabled is 40 % opacity and no hover.
            difficultyInert ? 'cursor-not-allowed opacity-40' : 'cursor-pointer',
            '[&::-webkit-slider-runnable-track]:bg-hairline [&::-webkit-slider-runnable-track]:h-px',
            '[&::-moz-range-track]:bg-hairline [&::-moz-range-track]:h-px',
            '[&::-webkit-slider-thumb]:border-ink [&::-webkit-slider-thumb]:bg-ground',
            '[&::-webkit-slider-thumb]:mt-[-6.5px] [&::-webkit-slider-thumb]:size-[14px]',
            '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full',
            '[&::-webkit-slider-thumb]:border-[1.5px]',
            '[&::-moz-range-thumb]:border-ink [&::-moz-range-thumb]:bg-ground',
            '[&::-moz-range-thumb]:size-[14px] [&::-moz-range-thumb]:rounded-full',
            '[&::-moz-range-thumb]:border-[1.5px]',
          ].join(' ')}
        />
        <div className={`${MONO} text-micro text-muted flex justify-between`}>
          <div>0 · flat</div>
          <div>100 · real</div>
        </div>
        {difficultyInert && (
          <div id="trainer-difficulty-note" className="text-caption text-muted font-sans">
            {difficultyInertReason}
          </div>
        )}
      </div>

      {/* "up to 5" is the mockup's and the design's count of the slots that will exist,
          not of the rows below: the two friend slots share nothing yet, and a dimmed
          placeholder for a feature with no code behind it is a promise, not a control.
          The fifth is absent entirely; the fourth is here because the rides list can
          fill it today. */}
      {ghosts !== undefined && (
        <div className={SECTION}>
          <div className="flex items-baseline justify-between">
            <div className={LABEL}>Ghosts</div>
            <div className={`${MONO} text-micro text-muted`}>up to 5</div>
          </div>
          {ghosts.slots.map((view) => (
            <GhostRow
              key={view.slot}
              view={view}
              onChange={(on) => {
                if (view.slot === 'chosen') ghosts.onClearPicked();
                else ghosts.onSlot(view.slot, on);
              }}
            />
          ))}
        </div>
      )}

      <div className={SECTION}>
        <div className={LABEL}>Targets</div>
        <div className="grid grid-cols-3 gap-[16px]">
          <TargetField
            id="target-power"
            label="Power W"
            value={targets.powerW}
            onChange={(powerW) => onTargetsChange({ ...targets, powerW })}
          />
          <TargetField
            id="target-cadence"
            label="Cadence"
            value={targets.cadenceRpm}
            onChange={(cadenceRpm) => onTargetsChange({ ...targets, cadenceRpm })}
          />
          <TargetField
            id="target-heart-rate"
            label="Heart bpm"
            value={targets.heartRateBpm}
            onChange={(heartRateBpm) => onTargetsChange({ ...targets, heartRateBpm })}
          />
        </div>
        <div className="text-caption text-muted font-sans">
          Zone is ±5% of target. Leave blank to hide.
        </div>
      </div>

      <div className="grow" />
      <div className="self-start">
        <Button tone="ink" onClick={onEnd}>
          End ride
        </Button>
      </div>
    </SettingsPanel>
  );
}

/**
 * One slot: its symbol, what it is, the ride filling it, and a toggle.
 *
 * A slot with no candidate is dimmed and cannot be switched on, rather than falling
 * through to the next best ride — DESIGN.md gives each symbol one meaning, and a triangle
 * on a lap that is not the best of the year spends that meaning to avoid an empty row.
 *
 * The picked slot's checkbox only ever empties it. There is no ride to put back from
 * here, which is why an empty one says where it is filled from instead of sitting dead.
 */
function GhostRow({ view, onChange }: { view: GhostSlotView; onChange: (on: boolean) => void }) {
  const id = `ghost-${view.slot}`;
  const ride = view.ride;
  const note =
    ride !== null
      ? `${longDate(ride.startedAt)} · ${duration(ride.durationS)}`
      : view.slot === 'chosen'
        ? 'race a ride from the history'
        : 'no ride yet';

  return (
    <div className={`flex items-center gap-[12px] ${ride === null ? 'opacity-40' : ''}`}>
      <svg
        width={16}
        height={16}
        viewBox={`0 0 ${String(SYMBOL_BOX)} ${String(SYMBOL_BOX)}`}
        className="shrink-0"
        aria-hidden="true"
      >
        <path
          d={SLOT_SYMBOL[view.slot].d}
          fill="var(--color-ground)"
          stroke="var(--color-muted)"
          strokeWidth={SYMBOL_STROKE_WIDTH}
          strokeLinejoin="round"
        />
      </svg>
      <label htmlFor={id} className="text-body grow font-sans">
        {SLOT_DESCRIPTION[view.slot]}
        <span className={`${MONO} text-micro text-muted ml-[6px]`}>{note}</span>
      </label>
      <input
        id={id}
        type="checkbox"
        checked={view.on}
        disabled={ride === null}
        onChange={(event) => onChange(event.target.checked)}
        className="accent-accent size-[20px] shrink-0"
      />
    </div>
  );
}

function TargetField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <div className="flex flex-col gap-[6px]">
      <label htmlFor={id} className={`${MONO} text-micro text-muted`}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        value={value === null ? '' : value}
        onChange={(event) => onChange(readNumber(event.target.value))}
        className={`${MONO} border-hairline text-sub text-ink min-h-[44px] w-full border-0 border-b bg-transparent py-[8px]`}
      />
    </div>
  );
}
