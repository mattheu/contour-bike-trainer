import type { BikeData } from './types';

// --- UUIDs -----------------------------------------------------------------
// 16-bit forms; Web Bluetooth accepts these numerically.
export const FTMS_SERVICE = 0x1826;
export const INDOOR_BIKE_DATA_CHARACTERISTIC = 0x2ad2;
export const FITNESS_MACHINE_CONTROL_POINT_CHARACTERISTIC = 0x2ad9;
export const HEART_RATE_SERVICE = 0x180d;
export const HEART_RATE_MEASUREMENT_CHARACTERISTIC = 0x2a37;

// --- Control point opcodes -------------------------------------------------
export const OpCode = {
  RequestControl: 0x00,
  SetTargetPower: 0x05,
  StartOrResume: 0x07,
  SetIndoorBikeSimulationParameters: 0x11,
  ResponseCode: 0x80,
} as const;

export const ResultCode = {
  Success: 0x01,
  OpCodeNotSupported: 0x02,
  InvalidParameter: 0x03,
  OperationFailed: 0x04,
  ControlNotPermitted: 0x05,
} as const;

const RESULT_MESSAGES: Record<number, string> = {
  [ResultCode.Success]: 'Success',
  [ResultCode.OpCodeNotSupported]: 'Op Code Not Supported',
  [ResultCode.InvalidParameter]: 'Invalid Parameter',
  [ResultCode.OperationFailed]: 'Operation Failed',
  [ResultCode.ControlNotPermitted]: 'Control Not Permitted',
};

const INT16_MIN = -32768;
const INT16_MAX = 32767;
const UINT8_MAX = 255;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Scale to a characteristic's raw resolution, rounded and clamped to its range. */
function quantise(value: number, resolution: number, min: number, max: number): number {
  return clamp(Math.round(value / resolution), min, max);
}

// --- Indoor Bike Data (0x2AD2) --------------------------------------------

/**
 * Fields appear in flag-bit order, each present only if its bit is set, and each
 * shifts the offset of everything after it. We only surface power, cadence and
 * speed, but every field has to be walked for those offsets to be right.
 */
export function parseIndoorBikeData(view: DataView): BikeData {
  const flags = view.getUint16(0, true);
  const has = (bit: number): boolean => (flags & (1 << bit)) !== 0;

  // Cursor walks the payload; every field consumes bytes whether we surface it or not.
  const cursor = { at: 2 };
  const skip = (byteLength: number): void => {
    cursor.at += byteLength;
  };
  const readUint16 = (): number => {
    const value = view.getUint16(cursor.at, true);
    skip(2);
    return value;
  };
  const readInt16 = (): number => {
    const value = view.getInt16(cursor.at, true);
    skip(2);
    return value;
  };

  let speedKmh: number | undefined;
  // Bit 0 is "More Data" and is INVERTED: instantaneous speed is present when it is CLEAR.
  if (!has(0)) speedKmh = readUint16() * 0.01;
  if (has(1)) skip(2); // average speed, uint16, 0.01 km/h

  let cadenceRpm: number | undefined;
  if (has(2)) cadenceRpm = readUint16() * 0.5;
  if (has(3)) skip(2); // average cadence, uint16, 0.5 rpm
  if (has(4)) skip(3); // total distance, uint24, 1 m
  if (has(5)) skip(2); // resistance level, int16

  let powerW: number | undefined;
  if (has(6)) powerW = readInt16();
  if (has(7)) skip(2); // average power, int16, 1 W
  if (has(8)) skip(5); // expended energy: total uint16 + per-hour uint16 + per-minute uint8
  if (has(9)) skip(1); // heart rate, uint8, bpm
  if (has(10)) skip(1); // metabolic equivalent, uint8, 0.1
  if (has(11)) skip(2); // elapsed time, uint16, s
  if (has(12)) skip(2); // remaining time, uint16, s

  return { powerW, cadenceRpm, speedKmh, receivedAt: performance.now() };
}

// --- Control point encoders ------------------------------------------------

export function encodeRequestControl(): Uint8Array {
  return new Uint8Array([OpCode.RequestControl]);
}

export function encodeStartResume(): Uint8Array {
  return new Uint8Array([OpCode.StartOrResume]);
}

export function encodeSetTargetPower(watts: number): Uint8Array {
  const buffer = new ArrayBuffer(3);
  const view = new DataView(buffer);
  view.setUint8(0, OpCode.SetTargetPower);
  view.setInt16(1, quantise(watts, 1, INT16_MIN, INT16_MAX), true);
  return new Uint8Array(buffer);
}

export interface SimulationParameters {
  windSpeedMs?: number;
  gradePercent?: number;
  crr?: number;
  cw?: number;
}

export const DEFAULT_WIND_SPEED_MS = 0;
export const DEFAULT_CRR = 0.004;
export const DEFAULT_CW = 0.51;

export function encodeSetSimulationParameters(params: SimulationParameters = {}): Uint8Array {
  const {
    windSpeedMs = DEFAULT_WIND_SPEED_MS,
    gradePercent = 0,
    crr = DEFAULT_CRR,
    cw = DEFAULT_CW,
  } = params;

  const buffer = new ArrayBuffer(7);
  const view = new DataView(buffer);
  view.setUint8(0, OpCode.SetIndoorBikeSimulationParameters);
  view.setInt16(1, quantise(windSpeedMs, 0.001, INT16_MIN, INT16_MAX), true);
  view.setInt16(3, quantise(gradePercent, 0.01, INT16_MIN, INT16_MAX), true);
  view.setUint8(5, quantise(crr, 0.0001, 0, UINT8_MAX));
  view.setUint8(6, quantise(cw, 0.01, 0, UINT8_MAX));
  return new Uint8Array(buffer);
}

// --- Control point response ------------------------------------------------

export interface ControlPointResponse {
  requestOpcode: number;
  resultCode: number;
  success: boolean;
  message: string;
  /** False when byte 0 is not 0x80, meaning we are misreading the stream rather than seeing a failure. */
  wellFormed: boolean;
}

export function parseControlPointResponse(view: DataView): ControlPointResponse {
  // A response always starts 0x80. Anything else means our framing is wrong, which is a
  // different problem from the trainer rejecting a command, so surface it separately.
  const wellFormed = view.byteLength >= 3 && view.getUint8(0) === OpCode.ResponseCode;
  if (!wellFormed) {
    return {
      requestOpcode: view.byteLength > 1 ? view.getUint8(1) : -1,
      resultCode: -1,
      success: false,
      wellFormed: false,
      message: `Malformed control point response: ${[
        ...new Uint8Array(view.buffer, view.byteOffset, view.byteLength),
      ]
        .map((b) => `0x${b.toString(16).padStart(2, '0')}`)
        .join(' ')}`,
    };
  }

  const requestOpcode = view.getUint8(1);
  const resultCode = view.getUint8(2);
  return {
    requestOpcode,
    resultCode,
    success: resultCode === ResultCode.Success,
    wellFormed: true,
    message: RESULT_MESSAGES[resultCode] ?? `Unknown result code 0x${resultCode.toString(16)}`,
  };
}

// --- Heart Rate Measurement (0x2A37) --------------------------------------

/** Flags bit 0 selects the value format: clear = uint8, set = uint16. */
export function parseHeartRateMeasurement(view: DataView): number {
  const flags = view.getUint8(0);
  return (flags & 0x01) === 0 ? view.getUint8(1) : view.getUint16(1, true);
}
