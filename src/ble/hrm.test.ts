import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebBluetoothHeartRateMonitor } from './hrm';
import type { ConnectionState } from './types';
import type { RequestDeviceOptions } from './ftms-trainer';

// Same shape of fake GATT stack as ftms-trainer.test.ts, kept local so importing one
// test file into another does not run its suite twice.

class FakeCharacteristic extends EventTarget {
  value: DataView | null = null;
  notifying = false;

  async startNotifications(): Promise<FakeCharacteristic> {
    this.notifying = true;
    return this;
  }

  async stopNotifications(): Promise<FakeCharacteristic> {
    this.notifying = false;
    return this;
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
}

class FakeDevice extends EventTarget {
  readonly id = 'fake-strap-id';
  gatt: FakeServer;

  constructor(
    readonly name: string,
    services: Map<number, FakeService>,
  ) {
    super();
    this.gatt = new FakeServer(this, services);
  }

  drop(): void {
    this.gatt.disconnect();
  }
}

const HR_SERVICE = 0x180d;
const HR_MEASUREMENT = 0x2a37;

function buildRig(options: { omitMeasurement?: boolean } = {}) {
  const measurement = new FakeCharacteristic();
  const characteristics = new Map<number, FakeCharacteristic>();
  if (options.omitMeasurement !== true) characteristics.set(HR_MEASUREMENT, measurement);

  const services = new Map<number, FakeService>([
    [HR_SERVICE, new FakeService('0000180d-0000-1000-8000-00805f9b34fb', characteristics)],
  ]);
  const device = new FakeDevice('TICKR 5678', services);
  const requests: RequestDeviceOptions[] = [];

  vi.stubGlobal('navigator', {
    bluetooth: {
      requestDevice: async (opts: RequestDeviceOptions) => {
        requests.push(opts);
        return device;
      },
    },
  });

  return { device, measurement, requests };
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

describe('WebBluetoothHeartRateMonitor', () => {
  it('names a supported browser when Web Bluetooth is missing', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Safari' });
    await expect(new WebBluetoothHeartRateMonitor().connect()).rejects.toThrow(/Chrome or Edge/);
  });

  it('asks for the strap separately from the trainer and starts notifications', async () => {
    const rig = buildRig();
    const hrm = new WebBluetoothHeartRateMonitor();
    const states: ConnectionState[] = [];
    hrm.onStateChange((s) => states.push(s));

    await hrm.connect();

    expect(rig.requests).toEqual([
      {
        filters: [{ services: [HR_SERVICE] }],
        optionalServices: [HR_SERVICE, 'device_information'],
      },
    ]);
    expect(rig.measurement.notifying).toBe(true);
    expect(states).toEqual(['connecting', 'connected']);
    expect(hrm.deviceName).toBe('TICKR 5678');
  });

  it('decodes both the uint8 and uint16 measurement formats', async () => {
    const rig = buildRig();
    const hrm = new WebBluetoothHeartRateMonitor();
    const readings: number[] = [];
    hrm.onData((bpm) => readings.push(bpm));
    await hrm.connect();

    rig.measurement.emit([0x00, 0x8a]); // flags bit 0 clear: uint8
    rig.measurement.emit([0x01, 0x2c, 0x01]); // flags bit 0 set: uint16 little-endian

    expect(readings).toEqual([138, 300]);
  });

  it('names the missing characteristic', async () => {
    buildRig({ omitMeasurement: true });
    await expect(new WebBluetoothHeartRateMonitor().connect()).rejects.toThrow(
      /Heart Rate Measurement \(0x2A37\).*TICKR 5678/s,
    );
  });

  it('reconnects on an unexpected disconnect', async () => {
    const rig = buildRig();
    const hrm = new WebBluetoothHeartRateMonitor({ reconnectDelayMs: 0 });
    const states: ConnectionState[] = [];
    hrm.onStateChange((s) => states.push(s));
    await hrm.connect();

    rig.device.drop();
    await waitFor(() => hrm.connectionState === 'connected');

    expect(states).toEqual(['connecting', 'connected', 'reconnecting', 'connected']);
    expect(rig.device.gatt.connectCount).toBe(2);
    expect(rig.measurement.notifying).toBe(true);
  });

  it('does not reconnect after a deliberate disconnect', async () => {
    const rig = buildRig();
    const hrm = new WebBluetoothHeartRateMonitor({ reconnectDelayMs: 0 });
    await hrm.connect();
    const states: ConnectionState[] = [];
    hrm.onStateChange((s) => states.push(s));

    await hrm.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(states).toEqual(['disconnected']);
    expect(rig.measurement.notifying).toBe(false);
    expect(rig.device.gatt.connectCount).toBe(1);
  });
});
