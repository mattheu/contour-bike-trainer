import { CommandQueue, toHex } from './command-queue';
import {
  FITNESS_MACHINE_CONTROL_POINT_CHARACTERISTIC,
  FTMS_SERVICE,
  HEART_RATE_SERVICE,
  INDOOR_BIKE_DATA_CHARACTERISTIC,
  encodeRequestControl,
  encodeSetSimulationParameters,
  encodeSetTargetPower,
  encodeStartResume,
  parseIndoorBikeData,
} from './ftms';
import type { BikeData, ConnectionState, Trainer } from './types';

// --- Minimal Web Bluetooth types -------------------------------------------
// Web Bluetooth is not in lib.dom.d.ts and @types/web-bluetooth is a dependency this
// project does not want. Only the surface actually used is declared, and hrm.ts
// shares it rather than repeating it.

export interface GattCharacteristic extends EventTarget {
  readonly uuid: string;
  readonly value?: DataView | null;
  startNotifications(): Promise<GattCharacteristic>;
  stopNotifications(): Promise<GattCharacteristic>;
  // Narrowed to what this codebase sends; the real API also accepts other BufferSources.
  writeValueWithResponse(value: Uint8Array): Promise<void>;
}

export interface GattService {
  readonly uuid: string;
  getCharacteristic(uuid: number | string): Promise<GattCharacteristic>;
}

export interface GattServer {
  readonly connected: boolean;
  connect(): Promise<GattServer>;
  disconnect(): void;
  getPrimaryService(uuid: number | string): Promise<GattService>;
  getPrimaryServices?(): Promise<GattService[]>;
}

export interface BluetoothDeviceLike extends EventTarget {
  readonly id: string;
  readonly name?: string;
  readonly gatt?: GattServer;
}

export interface RequestDeviceOptions {
  filters?: { services?: (number | string)[]; namePrefix?: string }[];
  optionalServices?: (number | string)[];
  acceptAllDevices?: boolean;
}

export interface BluetoothLike {
  requestDevice(options: RequestDeviceOptions): Promise<BluetoothDeviceLike>;
}

const NO_WEB_BLUETOOTH =
  'Web Bluetooth is unavailable in this browser. Contour needs Chrome or Edge on desktop — ' +
  'Safari and every browser on iOS have no Web Bluetooth at any version. ' +
  'If you are already in Chrome, the page must be served over https:// or localhost.';

/** Shared with hrm.ts. Throws the browser message rather than a TypeError on undefined. */
export function requireBluetooth(): BluetoothLike {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  const bluetooth = (nav as (Navigator & { bluetooth?: BluetoothLike }) | undefined)?.bluetooth;
  if (bluetooth === undefined) throw new Error(NO_WEB_BLUETOOTH);
  return bluetooth;
}

/** Copies out of the notification buffer, which Chrome reuses between events. */
export function copyBytes(view: DataView): Uint8Array {
  return new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// --- FtmsTrainer -----------------------------------------------------------

/**
 * Every service touched after pairing has to be named here or its characteristics
 * are invisible, with an error that blames the characteristic rather than the
 * omission. The extras beyond FTMS are listed so discovery can report what the
 * trainer actually exposes — the phase 1 gate has to confirm FTMS rather than
 * assume it, and Cycling Power turning up without FTMS is the signal for wahoo.ts.
 */
const OPTIONAL_SERVICES: (number | string)[] = [
  FTMS_SERVICE,
  HEART_RATE_SERVICE,
  0x1818, // Cycling Power
  0x1816, // Cycling Speed and Cadence
  'device_information',
];

const RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 2000;

export interface FtmsTrainerOptions {
  commandTimeoutMs?: number;
  reconnectAttempts?: number;
  reconnectDelayMs?: number;
}

export class FtmsTrainer implements Trainer {
  private readonly dataCallbacks = new Set<(d: BikeData) => void>();
  private readonly stateCallbacks = new Set<(s: ConnectionState) => void>();
  private readonly rawCallbacks = new Set<(hex: string, bytes: Uint8Array) => void>();

  private device: BluetoothDeviceLike | null = null;
  private bikeData: GattCharacteristic | null = null;
  private controlPoint: GattCharacteristic | null = null;
  private queue: CommandQueue | null = null;

  private state: ConnectionState = 'disconnected';
  private services: string[] = [];
  private closing = false;
  private reconnecting = false;
  private parseErrors = 0;

  constructor(private readonly options: FtmsTrainerOptions = {}) {}

  get connectionState(): ConnectionState {
    return this.state;
  }

  /** Name the chooser reported, so the UI can show what it actually paired with. */
  get deviceName(): string | null {
    return this.device?.name ?? null;
  }

  /** UUIDs found on the device, restricted to the services we asked permission for. */
  get discoveredServices(): readonly string[] {
    return this.services;
  }

  /** Non-zero means the codec disagrees with the hardware. The raw log has the bytes. */
  get parseErrorCount(): number {
    return this.parseErrors;
  }

  /**
   * MUST be called synchronously from a click handler on the first connect:
   * requestDevice throws a SecurityError outside a user gesture. Reconnecting to an
   * already-chosen device needs no gesture, so retries are free.
   */
  async connect(): Promise<void> {
    if (this.state === 'connected') return;
    const bluetooth = requireBluetooth();
    this.closing = false;

    if (this.device === null) {
      this.setState('connecting');
      this.device = await this.chooseDevice(bluetooth);
      this.device.addEventListener('gattserverdisconnected', this.handleDisconnected);
    } else {
      this.setState('connecting');
    }

    try {
      await this.open();
      await this.takeControl();
    } catch (error) {
      this.teardown();
      this.setState('disconnected');
      throw error;
    }
    this.setState('connected');
  }

  async disconnect(): Promise<void> {
    this.closing = true;
    this.queue?.clear('disconnected by the user');
    try {
      await this.bikeData?.stopNotifications();
    } catch {
      // The link is going away regardless; a failure here is not worth surfacing.
    }
    this.teardown();
    this.setState('disconnected');
  }

  onData(cb: (d: BikeData) => void): () => void {
    this.dataCallbacks.add(cb);
    return () => this.dataCallbacks.delete(cb);
  }

  onStateChange(cb: (s: ConnectionState) => void): () => void {
    this.stateCallbacks.add(cb);
    return () => this.stateCallbacks.delete(cb);
  }

  /**
   * Every Indoor Bike Data packet, unparsed. The fixtures this codec was built
   * against were written from the specification rather than captured from hardware,
   * so without the raw bytes in the log a parser bug and a trainer quirk are
   * indistinguishable. Fires immediately before onData for the same notification.
   */
  onRawPacket(cb: (hex: string, bytes: Uint8Array) => void): () => void {
    this.rawCallbacks.add(cb);
    return () => this.rawCallbacks.delete(cb);
  }

  async setTargetPower(watts: number): Promise<void> {
    await this.command(encodeSetTargetPower(watts), `Set Target Power ${Math.round(watts)} W`);
  }

  async setGrade(percent: number): Promise<void> {
    // Wind, Crr and Cw fall back to the spec's defaults held in ftms.ts.
    await this.command(
      encodeSetSimulationParameters({ gradePercent: percent }),
      `Set Simulation Parameters at ${percent.toFixed(1)} %`,
    );
  }

  // --- Connection -----------------------------------------------------------

  private async chooseDevice(bluetooth: BluetoothLike): Promise<BluetoothDeviceLike> {
    try {
      return await bluetooth.requestDevice({
        filters: [{ services: [FTMS_SERVICE] }],
        optionalServices: OPTIONAL_SERVICES,
      });
    } catch (error) {
      const message = describe(error);
      // An empty chooser and a cancelled chooser both land here, and they mean
      // very different things for the FTMS question the phase 1 gate has to answer.
      throw new Error(
        `No trainer selected: ${message}. If the chooser was empty, the trainer is not ` +
          'advertising the Fitness Machine Service (0x1826) — check it is awake, in range, ' +
          'and not already connected to another app or a head unit.',
        { cause: error },
      );
    }
  }

  /** Fetches GATT fresh every time: handles cached across a disconnect are dead. */
  private async open(): Promise<void> {
    const device = this.device;
    if (device === null) throw new Error('FTMS: no device chosen. Call connect() from a click.');

    const server = device.gatt;
    if (server === undefined) {
      throw new Error(
        `FTMS: "${this.label()}" exposes no GATT server, so it cannot be controlled.`,
      );
    }

    await this.step('connect to GATT', () => server.connect());
    this.services = await this.listServices(server);

    const service = await this.step(
      `find the Fitness Machine Service (0x1826) on "${this.label()}"`,
      () => server.getPrimaryService(FTMS_SERVICE),
      this.services.length === 0
        ? undefined
        : `Services found: ${this.services.join(', ')}. The trainer may not speak FTMS.`,
    );

    const bikeData = await this.step('find Indoor Bike Data (0x2AD2)', () =>
      service.getCharacteristic(INDOOR_BIKE_DATA_CHARACTERISTIC),
    );
    const controlPoint = await this.step('find Fitness Machine Control Point (0x2AD9)', () =>
      service.getCharacteristic(FITNESS_MACHINE_CONTROL_POINT_CHARACTERISTIC),
    );

    // Subscribing to the event is not enough on its own; notifications have to be
    // started explicitly, and the control point needs it too even though it indicates.
    bikeData.addEventListener('characteristicvaluechanged', this.handleBikeData);
    await this.step('start notifications on Indoor Bike Data (0x2AD2)', () =>
      bikeData.startNotifications(),
    );

    controlPoint.addEventListener('characteristicvaluechanged', this.handleIndication);
    await this.step('start indications on Fitness Machine Control Point (0x2AD9)', () =>
      controlPoint.startNotifications(),
    );

    this.bikeData = bikeData;
    this.controlPoint = controlPoint;
    this.queue = new CommandQueue(
      { write: (bytes) => controlPoint.writeValueWithResponse(bytes) },
      { timeoutMs: this.options.commandTimeoutMs },
    );
  }

  private async listServices(server: GattServer): Promise<string[]> {
    if (server.getPrimaryServices === undefined) return [];
    try {
      const found = await server.getPrimaryServices();
      return found.map((s) => s.uuid);
    } catch {
      // Discovery is diagnostic only. Never fail a connect over it.
      return [];
    }
  }

  /** Request Control then Start/Resume, each waiting for its indication. */
  private async takeControl(): Promise<void> {
    await this.command(encodeRequestControl(), 'Request Control (0x00)');
    await this.command(encodeStartResume(), 'Start/Resume (0x07)');
  }

  private async command(bytes: Uint8Array, what: string): Promise<void> {
    const queue = this.queue;
    if (queue === null) {
      throw new Error(`FTMS: cannot send ${what} — the trainer is not connected.`);
    }
    const response = await queue.enqueue(bytes);
    if (!response.success) {
      throw new Error(
        `Trainer refused ${what} [${toHex(bytes)}]: ${response.message}. ` +
          'Another app or head unit may hold control of the trainer.',
      );
    }
  }

  /** Wraps a GATT call so the failure names the step rather than saying "GATT operation failed". */
  private async step<T>(what: string, run: () => Promise<T>, hint?: string): Promise<T> {
    try {
      return await run();
    } catch (error) {
      throw new Error(
        `FTMS: failed to ${what} on "${this.label()}": ${describe(error)}.` +
          (hint === undefined ? '' : ` ${hint}`),
        { cause: error },
      );
    }
  }

  private label(): string {
    return this.device?.name ?? this.device?.id ?? 'unknown device';
  }

  // --- Notifications --------------------------------------------------------

  private handleBikeData = (event: Event): void => {
    const view = (event.target as GattCharacteristic | null)?.value;
    if (view === undefined || view === null) return;

    const bytes = copyBytes(view);
    const hex = toHex(bytes);
    for (const cb of this.rawCallbacks) cb(hex, bytes);

    let data: BikeData;
    try {
      data = parseIndoorBikeData(view);
    } catch (error) {
      // A throw in a listener would otherwise vanish. The packet is already in the
      // raw log, which is the only thing that can tell us whose fault this is.
      this.parseErrors += 1;
      console.warn(`FTMS: could not parse Indoor Bike Data [${hex}]: ${describe(error)}`);
      return;
    }
    for (const cb of this.dataCallbacks) cb(data);
  };

  private handleIndication = (event: Event): void => {
    const view = (event.target as GattCharacteristic | null)?.value;
    if (view === undefined || view === null) return;
    this.queue?.handleIndication(view);
  };

  // --- Disconnect and reconnect ---------------------------------------------

  private handleDisconnected = (): void => {
    // A teardown during a reconnect attempt fires this too; the event arrives after
    // the next connect has already succeeded, so ignore it when the link is up.
    if (this.device?.gatt?.connected === true) return;

    this.queue?.clear('the trainer disconnected');
    this.bikeData = null;
    this.controlPoint = null;
    this.queue = null;

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
          await this.takeControl();
          this.setState('connected');
          return;
        } catch (error) {
          console.warn(`FTMS: reconnect attempt ${attempt}/${attempts} failed: ${describe(error)}`);
          this.teardown();
          if (attempt < attempts) await delay(wait);
        }
      }
      this.setState('disconnected');
    } finally {
      this.reconnecting = false;
    }
  }

  /** Drops the GATT handles but keeps the device, so a retry needs no new gesture. */
  private teardown(): void {
    this.bikeData?.removeEventListener('characteristicvaluechanged', this.handleBikeData);
    this.controlPoint?.removeEventListener('characteristicvaluechanged', this.handleIndication);
    this.bikeData = null;
    this.controlPoint = null;
    this.queue = null;
    const server = this.device?.gatt;
    if (server?.connected === true) server.disconnect();
  }

  private setState(next: ConnectionState): void {
    if (next === this.state) return;
    this.state = next;
    for (const cb of this.stateCallbacks) cb(next);
  }
}
