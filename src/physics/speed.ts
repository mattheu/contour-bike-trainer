export const GRAVITY_MS2 = 9.81;
export const AIR_DENSITY_KGM3 = 1.225;
export const DRIVETRAIN_EFFICIENCY = 0.97;

/** Terminal speed on a long descent is otherwise unbounded by anything sensible. */
export const MAX_SPEED_MS = 80 / 3.6;

/** Bisection iterations. 60 halvings of a 22 m/s bracket is far past double precision. */
const BISECTION_ITERATIONS = 60;

export interface RiderParameters {
  riderMassKg: number;
  bikeMassKg: number;
  cda: number;
  crr: number;
}

/** SPEC.md's settings defaults. */
export const DEFAULT_RIDER: RiderParameters = {
  riderMassKg: 75,
  bikeMassKg: 9,
  cda: 0.32,
  crr: 0.004,
};

/**
 * Rider power needed to hold v, before drivetrain losses are added back:
 * (m·g·Crr·cosθ + m·g·sinθ + 0.5·ρ·CdA·v²) · v / η
 *
 * Negative on a descent steep enough to need braking rather than pedalling.
 */
export function powerForSpeed(
  speedMs: number,
  gradePercent: number,
  rider: RiderParameters = DEFAULT_RIDER,
): number {
  const theta = Math.atan(gradePercent / 100);
  const weightN = (rider.riderMassKg + rider.bikeMassKg) * GRAVITY_MS2;
  const resistiveN =
    weightN * rider.crr * Math.cos(theta) +
    weightN * Math.sin(theta) +
    0.5 * AIR_DENSITY_KGM3 * rider.cda * speedMs * speedMs;
  return (resistiveN * speedMs) / DRIVETRAIN_EFFICIENCY;
}

/**
 * Solve the power model for speed, in m/s.
 *
 * The cubic is not monotonic on a descent — gravity makes required power dip
 * negative before drag wins — so bisect from the turning point upwards, which
 * is the branch the only physical root sits on. Below the turning point the
 * rider would be braking, not coasting.
 *
 * The caller passes the REAL route grade. Trainer difficulty scales what the
 * legs feel, never how fast the ride moves.
 */
export function speedFromPower(
  powerW: number,
  gradePercent: number,
  rider: RiderParameters = DEFAULT_RIDER,
): number {
  const power = Number.isFinite(powerW) ? Math.max(0, powerW) : 0;

  const theta = Math.atan(gradePercent / 100);
  const weightN = (rider.riderMassKg + rider.bikeMassKg) * GRAVITY_MS2;
  const constantN = weightN * (rider.crr * Math.cos(theta) + Math.sin(theta));
  const dragCoefficient = 0.5 * AIR_DENSITY_KGM3 * rider.cda;

  // On the flat or uphill with no power there is nothing to roll you forward.
  if (power === 0 && constantN >= 0) return 0;

  // d/dv of (constantN·v + drag·v³); zero only when gravity is assisting.
  const turningPointMs =
    constantN < 0 && dragCoefficient > 0 ? Math.sqrt(-constantN / (3 * dragCoefficient)) : 0;

  if (powerForSpeed(MAX_SPEED_MS, gradePercent, rider) <= power) return MAX_SPEED_MS;

  let low = turningPointMs;
  let high = MAX_SPEED_MS;
  for (let i = 0; i < BISECTION_ITERATIONS; i += 1) {
    const mid = (low + high) / 2;
    if (powerForSpeed(mid, gradePercent, rider) <= power) low = mid;
    else high = mid;
  }
  return low;
}

export function speedFromPowerKmh(
  powerW: number,
  gradePercent: number,
  rider: RiderParameters = DEFAULT_RIDER,
): number {
  return speedFromPower(powerW, gradePercent, rider) * 3.6;
}
