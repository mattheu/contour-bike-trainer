// Fixtures here are built BY HAND from the FTMS field table, not captured from a
// real trainer. They test our reading of the specification, not the device. Replace
// or supplement them with real captures once hardware is on the bench.
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CRR,
  DEFAULT_CW,
  FITNESS_MACHINE_CONTROL_POINT_CHARACTERISTIC,
  FTMS_SERVICE,
  HEART_RATE_MEASUREMENT_CHARACTERISTIC,
  HEART_RATE_SERVICE,
  INDOOR_BIKE_DATA_CHARACTERISTIC,
  encodeRequestControl,
  encodeSetSimulationParameters,
  encodeSetTargetPower,
  encodeStartResume,
  parseControlPointResponse,
  parseHeartRateMeasurement,
  parseIndoorBikeData,
} from './ftms';

const view = (bytes: number[]): DataView => new DataView(Uint8Array.from(bytes).buffer);
const bytes = (a: Uint8Array): number[] => Array.from(a);

const u16 = (v: number): number[] => [v & 0xff, (v >>> 8) & 0xff];
const u24 = (v: number): number[] => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff];
const i16 = (v: number): number[] => {
  const buffer = new ArrayBuffer(2);
  new DataView(buffer).setInt16(0, v, true);
  return Array.from(new Uint8Array(buffer));
};

// Flag bits, named so the fixtures read against the table.
const MORE_DATA = 1 << 0; // set means instantaneous speed is ABSENT
const AVG_SPEED = 1 << 1;
const INST_CADENCE = 1 << 2;
const AVG_CADENCE = 1 << 3;
const TOTAL_DISTANCE = 1 << 4;
const RESISTANCE = 1 << 5;
const INST_POWER = 1 << 6;
const AVG_POWER = 1 << 7;
const EXPENDED_ENERGY = 1 << 8;
const HEART_RATE = 1 << 9;
const METABOLIC_EQUIVALENT = 1 << 10;
const ELAPSED_TIME = 1 << 11;
const REMAINING_TIME = 1 << 12;

describe('parseIndoorBikeData', () => {
  it('reads instantaneous speed when the More Data bit is CLEAR', () => {
    const d = parseIndoorBikeData(view([...u16(0), ...u16(3000)]));
    expect(d.speedKmh).toBeCloseTo(30);
    expect(d.powerW).toBeUndefined();
    expect(d.cadenceRpm).toBeUndefined();
    expect(typeof d.receivedAt).toBe('number');
  });

  it('omits speed when the More Data bit is SET, shifting every later field', () => {
    // Identical payload bytes, flags differing only in bit 0.
    const payload = [...u16(3000), ...i16(250)];

    const withSpeed = parseIndoorBikeData(view([...u16(INST_POWER), ...payload]));
    expect(withSpeed.speedKmh).toBeCloseTo(30);
    expect(withSpeed.powerW).toBe(250);

    const withoutSpeed = parseIndoorBikeData(view([...u16(MORE_DATA | INST_POWER), ...payload]));
    expect(withoutSpeed.speedKmh).toBeUndefined();
    // Power now reads the first pair, proving the offset moved rather than staying put.
    expect(withoutSpeed.powerW).toBe(3000);
  });

  it('parses power only', () => {
    const d = parseIndoorBikeData(view([...u16(MORE_DATA | INST_POWER), ...i16(187)]));
    expect(d).toMatchObject({ powerW: 187, speedKmh: undefined, cadenceRpm: undefined });
  });

  it('parses cadence only, at 0.5 rpm resolution', () => {
    const d = parseIndoorBikeData(view([...u16(MORE_DATA | INST_CADENCE), ...u16(180)]));
    expect(d.cadenceRpm).toBe(90);
    expect(d.powerW).toBeUndefined();
    expect(d.speedKmh).toBeUndefined();
  });

  it('parses speed, cadence and power together', () => {
    const d = parseIndoorBikeData(
      view([...u16(INST_CADENCE | INST_POWER), ...u16(3210), ...u16(174), ...i16(243)]),
    );
    expect(d.speedKmh).toBeCloseTo(32.1);
    expect(d.cadenceRpm).toBe(87);
    expect(d.powerW).toBe(243);
  });

  it('returns negative power on a descent', () => {
    const d = parseIndoorBikeData(view([...u16(MORE_DATA | INST_POWER), ...i16(-50)]));
    expect(d.powerW).toBe(-50);
  });

  it('never substitutes 0 for an absent field', () => {
    const d = parseIndoorBikeData(view([...u16(MORE_DATA)]));
    expect(d.powerW).toBeUndefined();
    expect(d.cadenceRpm).toBeUndefined();
    expect(d.speedKmh).toBeUndefined();
  });

  it('picks the right offsets out of a full packet with every field present', () => {
    const flags =
      AVG_SPEED |
      INST_CADENCE |
      AVG_CADENCE |
      TOTAL_DISTANCE |
      RESISTANCE |
      INST_POWER |
      AVG_POWER |
      EXPENDED_ENERGY |
      HEART_RATE |
      METABOLIC_EQUIVALENT |
      ELAPSED_TIME |
      REMAINING_TIME; // bit 0 clear, so instantaneous speed is present

    const packet = [
      ...u16(flags), //          0  flags
      ...u16(3245), //           2  instantaneous speed  32.45 km/h
      ...u16(3100), //           4  average speed        31.00 km/h
      ...u16(182), //            6  instantaneous cadence 91 rpm
      ...u16(176), //            8  average cadence       88 rpm
      ...u24(12345), //         10  total distance        12345 m
      ...i16(7), //             13  resistance level
      ...i16(268), //           15  instantaneous power   268 W
      ...i16(241), //           17  average power
      ...u16(420), //           19  total energy
      ...u16(750), //           21  energy per hour
      12, //                    23  energy per minute
      148, //                   24  heart rate
      95, //                    25  metabolic equivalent  9.5
      ...u16(1834), //          26  elapsed time
      ...u16(2400), //          28  remaining time
    ];
    expect(packet).toHaveLength(30);

    const d = parseIndoorBikeData(view(packet));
    expect(d.speedKmh).toBeCloseTo(32.45);
    expect(d.cadenceRpm).toBe(91);
    expect(d.powerW).toBe(268);
  });
});

describe('control point encoders', () => {
  it('encodes Request Control', () => {
    expect(bytes(encodeRequestControl())).toEqual([0x00]);
  });

  it('encodes Start/Resume', () => {
    expect(bytes(encodeStartResume())).toEqual([0x07]);
  });

  it('encodes Set Target Power little-endian', () => {
    expect(bytes(encodeSetTargetPower(250))).toEqual([0x05, 0xfa, 0x00]);
    expect(bytes(encodeSetTargetPower(1000))).toEqual([0x05, 0xe8, 0x03]);
    expect(bytes(encodeSetTargetPower(-100))).toEqual([0x05, 0x9c, 0xff]);
  });

  it('rounds fractional target power', () => {
    expect(bytes(encodeSetTargetPower(249.6))).toEqual([0x05, 0xfa, 0x00]);
  });

  it('clamps target power to the int16 range instead of overflowing', () => {
    expect(bytes(encodeSetTargetPower(100_000))).toEqual([0x05, 0xff, 0x7f]);
    expect(bytes(encodeSetTargetPower(-100_000))).toEqual([0x05, 0x00, 0x80]);
  });

  it('encodes simulation parameters with the documented defaults', () => {
    // wind 0, grade 0, Crr 0.004 -> 40, Cw 0.51 -> 51
    expect(bytes(encodeSetSimulationParameters())).toEqual([
      0x11, 0x00, 0x00, 0x00, 0x00, 0x28, 0x33,
    ]);
    expect(bytes(encodeSetSimulationParameters({ crr: DEFAULT_CRR, cw: DEFAULT_CW }))).toEqual(
      bytes(encodeSetSimulationParameters()),
    );
  });

  it('encodes a positive grade at 0.01 % resolution', () => {
    // 4.5 % -> 450 -> 0x01C2
    expect(bytes(encodeSetSimulationParameters({ gradePercent: 4.5 }))).toEqual([
      0x11, 0x00, 0x00, 0xc2, 0x01, 0x28, 0x33,
    ]);
  });

  it('encodes a negative grade as a two-complement int16', () => {
    // -4.5 % -> -450 -> 0xFE3E
    expect(bytes(encodeSetSimulationParameters({ gradePercent: -4.5 }))).toEqual([
      0x11, 0x00, 0x00, 0x3e, 0xfe, 0x28, 0x33,
    ]);
  });

  it('encodes wind speed at 0.001 m/s resolution, both signs', () => {
    // 2.5 m/s -> 2500 -> 0x09C4
    expect(bytes(encodeSetSimulationParameters({ windSpeedMs: 2.5 }))).toEqual([
      0x11, 0xc4, 0x09, 0x00, 0x00, 0x28, 0x33,
    ]);
    // -2.5 m/s -> -2500 -> 0xF63C
    expect(bytes(encodeSetSimulationParameters({ windSpeedMs: -2.5 }))).toEqual([
      0x11, 0x3c, 0xf6, 0x00, 0x00, 0x28, 0x33,
    ]);
  });

  it('clamps grade, wind, Crr and Cw at the extremes', () => {
    expect(bytes(encodeSetSimulationParameters({ gradePercent: 1000 })).slice(3, 5)).toEqual([
      0xff, 0x7f,
    ]);
    expect(bytes(encodeSetSimulationParameters({ gradePercent: -1000 })).slice(3, 5)).toEqual([
      0x00, 0x80,
    ]);
    expect(bytes(encodeSetSimulationParameters({ windSpeedMs: 100 })).slice(1, 3)).toEqual([
      0xff, 0x7f,
    ]);
    expect(bytes(encodeSetSimulationParameters({ crr: 1, cw: 10 })).slice(5)).toEqual([0xff, 0xff]);
    expect(bytes(encodeSetSimulationParameters({ crr: -1, cw: -1 })).slice(5)).toEqual([
      0x00, 0x00,
    ]);
  });

  it('emits a 7-byte simulation packet', () => {
    expect(encodeSetSimulationParameters({ gradePercent: 2 })).toHaveLength(7);
  });
});

describe('parseControlPointResponse', () => {
  it('reports success', () => {
    expect(parseControlPointResponse(view([0x80, 0x05, 0x01]))).toEqual({
      requestOpcode: 0x05,
      resultCode: 0x01,
      success: true,
      wellFormed: true,
      message: 'Success',
    });
  });

  it.each([
    [0x02, 'Op Code Not Supported'],
    [0x03, 'Invalid Parameter'],
    [0x04, 'Operation Failed'],
    [0x05, 'Control Not Permitted'],
  ])('reports result code 0x%s as a failure', (code, message) => {
    const r = parseControlPointResponse(view([0x80, 0x11, code]));
    expect(r).toEqual({
      requestOpcode: 0x11,
      resultCode: code,
      success: false,
      wellFormed: true,
      message,
    });
  });

  it('flags a response whose first byte is not 0x80 as malformed', () => {
    // A misframed stream looks like a rejection unless we distinguish it, and the two
    // need completely different debugging.
    const r = parseControlPointResponse(view([0x11, 0x05, 0x01]));
    expect(r.wellFormed).toBe(false);
    expect(r.success).toBe(false);
    expect(r.message).toContain('0x11 0x05 0x01');
  });

  it('flags a truncated response as malformed rather than reading past the end', () => {
    const r = parseControlPointResponse(view([0x80, 0x05]));
    expect(r.wellFormed).toBe(false);
    expect(r.success).toBe(false);
  });

  it('describes an unrecognised result code rather than throwing', () => {
    const r = parseControlPointResponse(view([0x80, 0x00, 0x7f]));
    expect(r.success).toBe(false);
    expect(r.message).toContain('0x7f');
  });
});

describe('parseHeartRateMeasurement', () => {
  it('reads a uint8 value when flags bit 0 is clear', () => {
    expect(parseHeartRateMeasurement(view([0x00, 0x48]))).toBe(72);
  });

  it('reads a little-endian uint16 value when flags bit 0 is set', () => {
    expect(parseHeartRateMeasurement(view([0x01, 0x2c, 0x01]))).toBe(300);
    expect(parseHeartRateMeasurement(view([0x01, 0xa5, 0x00]))).toBe(165);
  });

  it('ignores the other flag bits when selecting the format', () => {
    // Sensor contact and energy-expended bits set, value format still uint8.
    expect(parseHeartRateMeasurement(view([0x16, 0x5a]))).toBe(90);
  });
});

describe('uuids', () => {
  it('exports the 16-bit assigned numbers', () => {
    expect(FTMS_SERVICE).toBe(0x1826);
    expect(INDOOR_BIKE_DATA_CHARACTERISTIC).toBe(0x2ad2);
    expect(FITNESS_MACHINE_CONTROL_POINT_CHARACTERISTIC).toBe(0x2ad9);
    expect(HEART_RATE_SERVICE).toBe(0x180d);
    expect(HEART_RATE_MEASUREMENT_CHARACTERISTIC).toBe(0x2a37);
  });
});
