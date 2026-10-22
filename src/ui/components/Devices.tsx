import type { ConnectionState } from '../../ble/types';
import { describeServices, speaksFtms } from '../screens/connect-view';
import { Button } from './Button';
import { LABEL, MONO } from './styles';

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

const STATE_TEXT: Record<ConnectionState, string> = {
  disconnected: 'Not connected',
  connecting: 'Connecting…',
  connected: 'Connected',
  reconnecting: 'Reconnecting…',
};

/** The device rows carry their own hairlines, so they sit closer to the section label. */
const DEVICES_SECTION = 'flex flex-col gap-[8px]';

/**
 * The device rows, mounted by both settings panels.
 *
 * The ride settings panel has them because pairing is the precondition for riding, and
 * the rider profile panel has them because the connection outlives any one ride: it is
 * held module-wide in services.ts and survives moving between the lists and in and out of
 * rides. A rider who has not picked anything to ride yet still needs somewhere to pair.
 */
export function Devices({ devices }: { devices: DevicesView }) {
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
