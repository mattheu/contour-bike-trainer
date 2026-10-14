import { afterEach, describe, expect, it, vi } from 'vitest';
import { toHex } from './command-queue';
import { FtmsTrainer, type RequestDeviceOptions } from './ftms-trainer';
import { OpCode, ResultCode } from './ftms';
import type { BikeData, ConnectionState } from './types';

// --- A fake GATT stack -----------------------------------------------------
// Enough of Web Bluetooth to exercise the ordering and teardown rules. It cannot
// tell us anything about how a real trainer behaves; see the notes in the report.

class FakeCharacteristic extends EventTarget {
  value: DataView | null = null;
  notifying = false;
  readonly writes: string[] = [];
  onWrite: ((bytes: Uint8Array) => void) | null = null;
  failStartNotifications = false;

  constructor(readonly uuid: string) {
    super();
  }

  async startNotifications(): Promise<FakeCharacteristic> {
    if (this.failStartNotifications) throw new Error('NotSupportedError');
    this.notifying = true;
    return this;
  }

  async stopNotifications(): Promise<FakeCharacteristic> {
    this.notifying = false;
    return this;
  }

  async writeValueWithResponse(bytes: Uint8Array): Promise<void> {
    this.writes.push(toHex(bytes));
    this.onWrite?.(bytes);
  }

  emit(bytes: number[]): void {
    this.value = new DataView(new Uint8Array(bytes).buffer);
    this.dispatchEvent(new Event('characteristicvaluechanged'));
  }
}

class FakeService {
  constructor(
    readonly uuid: string,
    private readonly characteristics: Map<number, FakeCharacteristic>,
  ) {}

  async getCharacteristic(uuid: number | string): Promise<FakeCharacteristic> {
    const found = this.characteristics.get(uuid as number);
    if (found === undefined) throw new Error('NotFoundError: no such characteristic');
    return found;
  }
}

class FakeServer {
  connected = false;
  connectCount = 0;

  constructor(
    private readonly device: FakeDevice,
    private readonly services: Map<number, FakeService>,
  ) {}

  async connect(): Promise<FakeServer> {
    this.connectCount += 1;
    this.connected = true;
    return this;
  }

  disconnect(): void {
    if (!this.connected) return;
    this.connected = false;
    this.device.dispatchEvent(new Event('gattserverdisconnected'));
  }

  async getPrimaryService(uuid: number | string): Promise<FakeService> {
    const found = this.services.get(uuid as number);
    if (found === undefined) throw new Error('NotFoundError: no such service');
    return found;
  }

  async getPrimaryServices(): Promise<FakeService[]> {
    return [...this.services.values()];
  }
}

class FakeDevice extends EventTarget {
  readonly id = 'fake-device-id';
  gatt: FakeServer;

  constructor(
    readonly name: string,
    services: Map<number, FakeService>,
  ) {
    super();
    this.gatt = new FakeServer(this, services);
  }

  /** The trainer going out of range, as opposed to us closing the link. */
  drop(): void {
    this.gatt.disconnect();
  }
}

const FTMS = 0x1826;
const IBD = 0x2ad2;
const CP = 0x2ad9;

interface Rig {
  device: FakeDevice;
  bikeData: FakeCharacteristic;
  controlPoint: FakeCharacteristic;
  requests: RequestDeviceOptions[];
}

function buildRig(options: { omitBikeData?: boolean; refuseControl?: boolean } = {}): Rig {
  const bikeData = new FakeCharacteristic('00002ad2-0000-1000-8000-00805f9b34fb');
  const controlPoint = new FakeCharacteristic('00002ad9-0000-1000-8000-00805f9b34fb');

  const characteristics = new Map<number, FakeCharacteristic>([[CP, controlPoint]]);
  if (options.omitBikeData !== true) characteristics.set(IBD, bikeData);

  const services = new Map<number, FakeService>([
    [FTMS, new FakeService('00001826-0000-1000-8000-00805f9b34fb', characteristics)],
    [0x180d, new FakeService('0000180d-0000-1000-8000-00805f9b34fb', new Map())],
  ]);

  // Answer every write the way a compliant trainer does: one indication per command.
  controlPoint.onWrite = (bytes) => {
    const result =
      options.refuseControl === true && bytes[0] === OpCode.RequestControl
        ? ResultCode.ControlNotPermitted
        : ResultCode.Success;
    queueMicrotask(() => controlPoint.emit([OpCode.ResponseCode, bytes[0]!, result]));
  };

  const device = new FakeDevice('KICKR CORE 1234', services);
  const requests: RequestDeviceOptions[] = [];
  vi.stubGlobal('navigator', {
    bluetooth: {
      requestDevice: async (opts: RequestDeviceOptions) => {
        requests.push(opts);
        return device;
      },
    },
  });

  return { device, bikeData, controlPoint, requests };
}

async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for condition');
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('FtmsTrainer', () => {
  it('names a supported browser when Web Bluetooth is missing', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Safari' });
    await expect(new FtmsTrainer().connect()).rejects.toThrow(/Chrome or Edge/);
  });

  it('filters on FTMS and declares every service it will later touch', async () => {
    const rig = buildRig();
    await new FtmsTrainer().connect();

    expect(rig.requests).toHaveLength(1);
    const request = rig.requests[0]!;
    expect(request.filters).toEqual([{ services: [FTMS] }]);
    // Omitting a service here makes its characteristics invisible later.
    expect(request.optionalServices).toContain(FTMS);
    expect(request.optionalServices).toContain(0x180d);
  });

  it('starts notifications on both characteristics, including the indicating one', async () => {
    const rig = buildRig();
    await new FtmsTrainer().connect();

    expect(rig.bikeData.notifying).toBe(true);
    expect(rig.controlPoint.notifying).toBe(true);
  });

  it('requests control then start/resume, one at a time', async () => {
    const rig = buildRig();
    const trainer = new FtmsTrainer();
    const states: ConnectionState[] = [];
    trainer.onStateChange((s) => states.push(s));

    await trainer.connect();

    expect(rig.controlPoint.writes).toEqual(['00', '07']);
    expect(states).toEqual(['connecting', 'connected']);
    expect(trainer.deviceName).toBe('KICKR CORE 1234');
    expect(trainer.discoveredServices).toContain('00001826-0000-1000-8000-00805f9b34fb');
  });

  it('fails the connect with an actionable message when the trainer refuses control', async () => {
    const rig = buildRig({ refuseControl: true });
    const trainer = new FtmsTrainer();

    await expect(trainer.connect()).rejects.toThrow(
      /Request Control \(0x00\).*Control Not Permitted/s,
    );
    expect(trainer.connectionState).toBe('disconnected');
    // Start/Resume must not be sent after control was refused.
    expect(rig.controlPoint.writes).toEqual(['00']);
  });

  it('names the missing characteristic rather than reporting a bare GATT failure', async () => {
    buildRig({ omitBikeData: true });
    const trainer = new FtmsTrainer();

    await expect(trainer.connect()).rejects.toThrow(/Indoor Bike Data \(0x2AD2\)/);
    await expect(trainer.connect()).rejects.toThrow(/KICKR CORE 1234/);
  });

  it('names the step when starting notifications fails', async () => {
    const rig = buildRig();
    rig.bikeData.failStartNotifications = true;

    await expect(new FtmsTrainer().connect()).rejects.toThrow(
      /start notifications on Indoor Bike Data \(0x2AD2\)/,
    );
  });

  it('reports the raw packet before the parsed one', async () => {
    const rig = buildRig();
    const trainer = new FtmsTrainer();
    const order: string[] = [];
    const raw: string[] = [];
    const parsed: BikeData[] = [];

    trainer.onRawPacket((hex, bytes) => {
      order.push('raw');
      raw.push(hex);
      expect(bytes).toBeInstanceOf(Uint8Array);
    });
    trainer.onData((d) => {
      order.push('data');
      parsed.push(d);
    });
    await trainer.connect();

    // Flags 0x0044: instantaneous speed present (bit 0 clear), cadence (bit 2), power (bit 6).
    rig.bikeData.emit([0x44, 0x00, 0x10, 0x0e, 0xaa, 0x00, 0xc8, 0x00]);

    expect(order).toEqual(['raw', 'data']);
    expect(raw).toEqual(['44 00 10 0e aa 00 c8 00']);
    expect(parsed[0]).toMatchObject({ speedKmh: 36.0, cadenceRpm: 85, powerW: 200 });
  });

  it('survives a packet the codec cannot parse and keeps the stream alive', async () => {
    const rig = buildRig();
    const trainer = new FtmsTrainer();
    const parsed: BikeData[] = [];
    const raw: string[] = [];
    trainer.onRawPacket((hex) => raw.push(hex));
    trainer.onData((d) => parsed.push(d));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await trainer.connect();

    // Claims power is present but carries no payload: the decoder runs off the end.
    rig.bikeData.emit([0x41, 0x00]);
    expect(parsed).toHaveLength(0);
    expect(trainer.parseErrorCount).toBe(1);

    rig.bikeData.emit([0x44, 0x00, 0x10, 0x0e, 0xaa, 0x00, 0xc8, 0x00]);
    expect(parsed).toHaveLength(1);
    // The unparseable packet still reached the log, which is the only way to diagnose it.
    expect(raw).toEqual(['41 00', '44 00 10 0e aa 00 c8 00']);
  });

  it('encodes a grade as simulation parameters in 0.01 % units', async () => {
    const rig = buildRig();
    const trainer = new FtmsTrainer();
    await trainer.connect();
    rig.controlPoint.writes.length = 0;

    await trainer.setGrade(-4.5);

    // 0x11, wind 0, grade -450 = 0xfe3e LE, Crr 0.004 -> 40 = 0x28, Cw 0.51 -> 51 = 0x33.
    expect(rig.controlPoint.writes).toEqual(['11 00 00 3e fe 28 33']);
  });

  it('encodes a target power as int16 watts', async () => {
    const rig = buildRig();
    const trainer = new FtmsTrainer();
    await trainer.connect();
    rig.controlPoint.writes.length = 0;

    await trainer.setTargetPower(250);

    expect(rig.controlPoint.writes).toEqual(['05 fa 00']);
  });

  it('refuses a control write when not connected, naming the command', async () => {
    buildRig();
    await expect(new FtmsTrainer().setTargetPower(200)).rejects.toThrow(
      /Set Target Power 200 W .*not connected/,
    );
  });

  it('reconnects on an unexpected disconnect and re-fetches GATT', async () => {
    const rig = buildRig();
    const trainer = new FtmsTrainer({ reconnectDelayMs: 0 });
    const states: ConnectionState[] = [];
    trainer.onStateChange((s) => states.push(s));

    await trainer.connect();
    expect(rig.device.gatt.connectCount).toBe(1);

    rig.device.drop();
    await waitFor(() => trainer.connectionState === 'connected');

    expect(states).toEqual(['connecting', 'connected', 'reconnecting', 'connected']);
    // A fresh connect(), not a reused server handle: the old one is dead.
    expect(rig.device.gatt.connectCount).toBe(2);
    expect(rig.controlPoint.writes).toEqual(['00', '07', '00', '07']);
    expect(rig.bikeData.notifying).toBe(true);
  });

  it('gives up after the configured number of reconnect attempts', async () => {
    const rig = buildRig();
    const trainer = new FtmsTrainer({ reconnectDelayMs: 0, reconnectAttempts: 2 });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await trainer.connect();

    rig.device.gatt.connect = () => Promise.reject(new Error('NetworkError: device out of range'));
    rig.device.drop();

    await waitFor(() => trainer.connectionState === 'disconnected');
    expect(rig.device.gatt.connectCount).toBe(1);
  });

  it('does not try to reconnect after a deliberate disconnect', async () => {
    const rig = buildRig();
    const trainer = new FtmsTrainer({ reconnectDelayMs: 0 });
    const states: ConnectionState[] = [];
    await trainer.connect();
    trainer.onStateChange((s) => states.push(s));

    await trainer.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(states).toEqual(['disconnected']);
    expect(rig.bikeData.notifying).toBe(false);
    expect(rig.device.gatt.connected).toBe(false);
    expect(rig.device.gatt.connectCount).toBe(1);
  });
});
