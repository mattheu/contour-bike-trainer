import type { ConnectionState } from '../../ble/types';
import { SettingsPanel } from '../components/SettingsPanel';
import { Button } from '../components/Button';
import { LABEL, MONO } from '../components/styles';
import { describeServices, speaksFtms } from './connect-view';

export interface Targets {
  powerW: number | null;
  cadenceRpm: number | null;
  heartRateBpm: number | null;
}

/** Everything the devices section reads and everything it can do. */
export interface DevicesView {
  /** What produced the data: a real device, or the named fake script. */
  source: string;
  trainerState: ConnectionState;
  /** What the chooser said it paired with. Null on a fake trainer and before pairing. */
  trainerDeviceName: string | null;
  trainerServices: readonly string[];
  powerW: number | null;
  hrmState: ConnectionState;
  heartRateBpm: number | null;
  onConnectTrainer: () => void;
  onDisconnectTrainer: () => void;
  onConnectHrm: () => void;
  onDisconnectHrm: () => void;
}

interface RideSettingsProps {
  devices: DevicesView;
  difficulty: number;
  targets: Targets;
  onDifficultyChange: (percent: number) => void;
  onTargetsChange: (targets: Targets) => void;
  onEnd: () => void;
  onClose: () => void;
}

const STATE_TEXT: Record<ConnectionState, string> = {
  disconnected: 'Not connected',
  connecting: 'Connecting…',
  connected: 'Connected',
  reconnecting: 'Reconnecting…',
};

/** A blank field clears the target rather than pinning it to zero. */
function readNumber(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

const SECTION = 'flex flex-col gap-[16px]';

/** The device rows carry their own hairlines, so they sit closer to the section label. */
const DEVICES_SECTION = 'flex flex-col gap-[8px]';

/**
 * design/mockups/ride-settings.html, minus the ghost block, which is phase 4, and minus
 * FTP, which is not edited mid-ride. Everything here takes effect on the ride in progress.
 *
 * Devices lead, because pairing is the precondition for everything under it and this is
 * now the only place in the app where it happens: there is no standalone connect screen,
 * and a connection fault reaches the rider through the alert strip on the ride screen
 * rather than through a screen of its own.
 */
export function RideSettings({
  devices,
  difficulty,
  targets,
  onDifficultyChange,
  onTargetsChange,
  onEnd,
  onClose,
}: RideSettingsProps) {
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
          onChange={(event) => onDifficultyChange(Number(event.target.value))}
          className={[
            'h-[44px] w-full cursor-pointer appearance-none bg-transparent',
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
      </div>

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

function Devices({ devices }: { devices: DevicesView }) {
  const trainerLive = devices.trainerState === 'connected';
  const hrmLive = devices.hrmState === 'connected';

  return (
    <div className={DEVICES_SECTION}>
      <div className="flex items-baseline justify-between">
        <div className={LABEL}>Devices</div>
        {/* Which of these numbers are a trainer's and which are a script's. */}
        <div className={`${MONO} text-micro text-muted`}>{devices.source}</div>
      </div>

      <div className="flex flex-col">
        <Device
          testId="device-trainer"
          label="Trainer"
          state={devices.trainerState}
          detail={
            trainerLive
              ? `${STATE_TEXT.connected} · ${devices.powerW === null ? 'no reading yet' : `${devices.powerW} W`}`
              : STATE_TEXT[devices.trainerState]
          }
          action={
            <Button
              onClick={trainerLive ? devices.onDisconnectTrainer : devices.onConnectTrainer}
              disabled={devices.trainerState === 'connecting'}
            >
              {trainerLive ? 'Disconnect' : 'Connect'}
            </Button>
          }
        >
          <Discovery
            deviceName={devices.trainerDeviceName}
            services={describeServices(devices.trainerServices)}
            ftms={speaksFtms(devices.trainerServices)}
            connected={trainerLive}
          />
        </Device>
        <Device
          testId="device-heart-rate"
          label="Heart rate"
          state={devices.hrmState}
          detail={
            hrmLive
              ? `${STATE_TEXT.connected} · ${devices.heartRateBpm === null ? 'no reading yet' : `${devices.heartRateBpm} bpm`}`
              : `${STATE_TEXT[devices.hrmState]} · optional`
          }
          action={
            <Button
              onClick={hrmLive ? devices.onDisconnectHrm : devices.onConnectHrm}
              disabled={devices.hrmState === 'connecting'}
            >
              {hrmLive ? 'Disconnect' : 'Connect'}
            </Button>
          }
        />
      </div>
    </div>
  );
}

/**
 * Label and reading beside the control, discovery full width beneath it.
 *
 * The two live in the same 48 px band rather than stacked above it, because the panel is
 * 440 px wide and a whole screen tall: four rows that each clear a button's height push
 * End ride off the bottom. Discovery drops below because a service list is the one thing
 * here that needs the full 344 px.
 */
function Device({
  testId,
  label,
  state,
  detail,
  action,
  children,
}: {
  /** Both rows offer a button reading "Connect"; this is what tells them apart. */
  testId: string;
  label: string;
  state: ConnectionState;
  detail: string;
  action: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div
      data-testid={testId}
      className="border-hairline flex flex-col gap-[8px] border-t py-[14px] first:border-t-0"
    >
      <div className="flex items-center justify-between gap-[16px]">
        <div className="flex min-w-0 flex-col gap-[4px]">
          <div className={LABEL}>{label}</div>
          <div
            className={`${MONO} text-caption ${state === 'connected' ? 'text-ink' : 'text-muted'}`}
          >
            {detail}
          </div>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

/**
 * SPEC.md > Decision gate: "whether the trainer speaks FTMS, verified on first connect
 * rather than assumed". This row is where that is verified, so it shows what was paired
 * with and every service GATT actually returned - not a badge claiming it worked.
 */
function Discovery({
  deviceName,
  services,
  ftms,
  connected,
}: {
  deviceName: string | null;
  services: ReturnType<typeof describeServices>;
  ftms: boolean;
  connected: boolean;
}) {
  if (!connected || (deviceName === null && services.length === 0)) return null;

  return (
    <div className="mt-[6px] flex flex-col gap-[4px]">
      {deviceName !== null && <div className={`${MONO} text-caption text-ink`}>{deviceName}</div>}
      <div className={`${MONO} text-caption text-muted`}>
        {services.length === 0
          ? 'No services reported by this browser, so FTMS is unconfirmed.'
          : `Services · ${services.map((service) => service.label).join(' · ')}`}
      </div>
      {services.length > 0 && !ftms && (
        <div className={`${MONO} text-caption text-alert`}>
          No Fitness Machine Service. This device does not speak FTMS.
        </div>
      )}
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
