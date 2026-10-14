import type { RideSample } from '../../storage/types';
import type { PowerSample } from '../charts/power';

/**
 * A finished ride's samples in the shape the power strip reads. Samples with no power —
 * a dropped trainer, or the seconds before the first notification — are left out rather
 * than drawn as zero watts, which the strip would shade as a genuine zone 1 effort.
 */
export function powerSamplesFrom(samples: readonly RideSample[]): PowerSample[] {
  const out: PowerSample[] = [];
  for (const sample of samples) {
    if (sample.powerW === null || !Number.isFinite(sample.powerW)) continue;
    out.push({ distM: sample.distanceM, watts: sample.powerW });
  }
  return out;
}
