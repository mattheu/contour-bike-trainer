import {
  copyBytes,
  delay,
  describe,
  requireBluetooth,
  type BluetoothDeviceLike,
  type GattCharacteristic,
  type GattServer,
} from './ftms-trainer';
import { toHex } from './command-queue';
import {
  HEART_RATE_MEASUREMENT_CHARACTERISTIC,
  HEART_RATE_SERVICE,
  parseHeartRateMeasurement,
} from './ftms';
import type { ConnectionState, HeartRateMonitor } from './types';

const RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 2000;

export interface HeartRateMonitorOptions {
  reconnectAttempts?: number;
  reconnectDelayMs?: number;
}

/**
 * Heart Rate Service (0x180D). A separate device from the trainer, so it needs its
 * own requestDevice call from its own user gesture — one click cannot pair both.
 * Optional throughout: the app rides fine without it.
 */
export class WebBluetoothHeartRateMonitor implements HeartRateMonitor {
  private readonly dataCallbacks = new Set<(bpm: number) => void>();
  private readonly stateCallbacks = new Set<(s: ConnectionState) => void>();

  private device: BluetoothDeviceLike | null = null;
  private measurement: GattCharacteristic | null = null;
  private state: ConnectionState = 'disconnected';
  private closing = false;
  private reconnecting = false;
  private parseErrors = 0;

  constructor(private readonly options: HeartRateMonitorOptions = {}) {}

  get connectionState(): ConnectionState {
    return this.state;
  }

  get deviceName(): string | null {
    return this.device?.name ?? null;
  }

  get parseErrorCount(): number {
    return this.parseErrors;
  }

  async connect(): Promise<void> {
    if (this.state === 'connected') return;
    const bluetooth = requireBluetooth();
    this.closing = false;
    this.setState('connecting');

    if (this.device === null) {
      try {
        this.device = await bluetooth.requestDevice({
          filters: [{ services: [HEART_RATE_SERVICE] }],
          optionalServices: [HEART_RATE_SERVICE, 'device_information'],
        });
      } catch (error) {
        this.setState('disconnected');
        throw new Error(
          `No heart rate monitor selected: ${describe(error)}. If the chooser was empty, the ` +
            'strap is asleep, out of range, or already paired to a watch or head unit.',
          { cause: error },
        );
      }
      this.device.addEventListener('gattserverdisconnected', this.handleDisconnected);
    }

    try {
      await this.open();
    } catch (error) {
      this.teardown();
      this.setState('disconnected');
      throw error;
    }
    this.setState('connected');
  }

  async disconnect(): Promise<void> {
    this.closing = true;
    try {
      await this.measurement?.stopNotifications();
    } catch {
      // The link is going away regardless.
    }
    this.teardown();
    this.setState('disconnected');
  }

  onData(cb: (bpm: number) => void): () => void {
    this.dataCallbacks.add(cb);
    return () => this.dataCallbacks.delete(cb);
  }

  onStateChange(cb: (s: ConnectionState) => void): () => void {
    this.stateCallbacks.add(cb);
    return () => this.stateCallbacks.delete(cb);
  }

  /** Re-fetches GATT every time; handles kept across a disconnect are dead. */
  private async open(): Promise<void> {
    const device = this.device;
    if (device === null) throw new Error('HRM: no device chosen. Call connect() from a click.');

    const server = device.gatt;
    if (server === undefined) {
      throw new Error(`HRM: "${this.label()}" exposes no GATT server.`);
    }

    await this.step('connect to GATT', () => server.connect());
    const service = await this.step('find the Heart Rate Service (0x180D)', () =>
      server.getPrimaryService(HEART_RATE_SERVICE),
    );
    const measurement = await this.step('find Heart Rate Measurement (0x2A37)', () =>
      service.getCharacteristic(HEART_RATE_MEASUREMENT_CHARACTERISTIC),
    );

    // Notifications do not start on their own; the listener alone delivers nothing.
    measurement.addEventListener('characteristicvaluechanged', this.handleMeasurement);
    await this.step('start notifications on Heart Rate Measurement (0x2A37)', () =>
      measurement.startNotifications(),
    );
    this.measurement = measurement;
  }

  private async step<T>(what: string, run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      throw new Error(`HRM: failed to ${what} on "${this.label()}": ${describe(error)}.`, {
        cause: error,
      });
    }
  }

  private label(): string {
    return this.device?.name ?? this.device?.id ?? 'unknown device';
  }

  private handleMeasurement = (event: Event): void => {
    const view = (event.target as GattCharacteristic | null)?.value;
    if (view === undefined || view === null) return;
    try {
      const bpm = parseHeartRateMeasurement(view);
      for (const cb of this.dataCallbacks) cb(bpm);
    } catch (error) {
      this.parseErrors += 1;
      console.warn(
        `HRM: could not parse Heart Rate Measurement [${toHex(copyBytes(view))}]: ${describe(error)}`,
      );
    }
  };

  private handleDisconnected = (): void => {
    if (this.device?.gatt?.connected === true) return; // Stale event from an earlier teardown.
    this.measurement = null;
    if (this.closing) {
      this.setState('disconnected');
      return;
    }
    void this.reconnect();
  };

  private async reconnect(): Promise<void> {
    if (this.reconnecting) return;
    this.reconnecting = true;
    this.setState('reconnecting');

    const attempts = this.options.reconnectAttempts ?? RECONNECT_ATTEMPTS;
    const wait = this.options.reconnectDelayMs ?? RECONNECT_DELAY_MS;

    try {
      for (let attempt = 1; attempt <= attempts && !this.closing; attempt += 1) {
        try {
          await this.open();
          this.setState('connected');
          return;
        } catch (error) {
          console.warn(`HRM: reconnect attempt ${attempt}/${attempts} failed: ${describe(error)}`);
          this.teardown();
          if (attempt < attempts) await delay(wait);
        }
      }
      this.setState('disconnected');
    } finally {
      this.reconnecting = false;
    }
  }

  private teardown(): void {
    this.measurement?.removeEventListener('characteristicvaluechanged', this.handleMeasurement);
    this.measurement = null;
    const server: GattServer | undefined = this.device?.gatt;
    if (server?.connected === true) server.disconnect();
  }

  private setState(next: ConnectionState): void {
    if (next === this.state) return;
    this.state = next;
    for (const cb of this.stateCallbacks) cb(next);
  }
}
