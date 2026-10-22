import {
  createId,
  DEFAULT_ERG_MODE,
  DEFAULT_WORKOUT_SCALE_PCT,
  type ErgMode,
  type Ride,
  type RideSample,
  type RideSamples,
  type RideSettings,
} from '../storage/types';

export interface RideRecorderOptions {
  /** Supplied only so a caller can pre-allocate the id it will export under. */
  id?: string;
  routeId: string | null;
  routeName: string | null;
  workoutId?: string | null;
  workoutName?: string | null;
  /** ISO 8601. The wall-clock instant the ride began; sample t is relative to it. */
  startedAt: string;
  /**
   * Frozen at the start of the ride, never re-read afterwards — except workoutScalePct and
   * ergMode, which build() takes as the ride ended because both are switchable mid-session.
   * A caller with no workout may leave either out of both; they are recorded as 100 and
   * ERG, which is what a session with no target to hold was.
   */
  settings: Omit<RideSettings, 'workoutScalePct' | 'ergMode'> & {
    workoutScalePct?: number;
    ergMode?: ErgMode;
  };
}

export interface RideSummary {
  /** Wall-clock time spent paused, which the engine owns and the samples cannot show. */
  pausedS: number;
  /**
   * The workout scale as the ride ended, which is the one setting not frozen at the
   * start: the control exists to be reached for in the third minute of an interval, so
   * the value before anyone touched it answers nothing. It is still one number for
   * something that may have moved, and that is the right trade — the ride's actual TSS
   * comes from recorded power, so this says what was asked of the rider rather than what
   * they did. Absent leaves whatever the ride started with.
   */
  workoutScalePct?: number;
  /**
   * Which way the session was ridden as it ended, and not frozen at the start for the
   * same reason the scale is not: the control exists to be switched mid-session. One
   * value for something that may have moved, which is the same trade.
   */
  ergMode?: ErgMode;
}

/** Averages ignore absent readings rather than counting them as zero. */
function mean(sum: number, count: number): number | null {
  return count === 0 ? null : Math.round((sum / count) * 10) / 10;
}

/**
 * Turns the 1 Hz sample stream into the two records storage holds: the aggregates the
 * history list renders, and the series behind them. Pure — it is handed samples, it does
 * not go looking for them.
 */
export class RideRecorder {
  readonly id: string;
  private readonly collected: RideSample[] = [];
  private readonly options: RideRecorderOptions;

  private powerSum = 0;
  private powerCount = 0;
  private heartRateSum = 0;
  private heartRateCount = 0;
  private ascentM = 0;
  private lastEleM: number | null = null;

  constructor(options: RideRecorderOptions) {
    this.options = options;
    this.id = options.id ?? createId();
  }

  add(sample: RideSample): void {
    this.collected.push(sample);

    if (sample.powerW !== null) {
      this.powerSum += sample.powerW;
      this.powerCount += 1;
    }
    if (sample.heartRateBpm !== null) {
      this.heartRateSum += sample.heartRateBpm;
      this.heartRateCount += 1;
    }
    if (sample.eleM !== null) {
      if (this.lastEleM !== null && sample.eleM > this.lastEleM) {
        this.ascentM += sample.eleM - this.lastEleM;
      }
      this.lastEleM = sample.eleM;
    }
  }

  get sampleCount(): number {
    return this.collected.length;
  }

  get samples(): readonly RideSample[] {
    return this.collected;
  }

  /** Moving time: the last sample's own clock, which the engine already pause-adjusted. */
  get elapsedS(): number {
    return this.collected[this.collected.length - 1]?.t ?? 0;
  }

  get distanceM(): number {
    return this.collected[this.collected.length - 1]?.distanceM ?? 0;
  }

  /** Summed from the samples rather than taken from the engine, so the stored record and
   * the exported track can never disagree about how much climbing happened. */
  get totalAscentM(): number {
    return this.ascentM;
  }

  get avgPowerW(): number | null {
    return mean(this.powerSum, this.powerCount);
  }

  get avgHeartRateBpm(): number | null {
    return mean(this.heartRateSum, this.heartRateCount);
  }

  build(summary: RideSummary): { ride: Ride; samples: RideSamples } {
    const ride: Ride = {
      id: this.id,
      // The repository restamps this on write; it is here because the shape requires it.
      updatedAt: this.options.startedAt,
      routeId: this.options.routeId,
      routeName: this.options.routeName,
      workoutId: this.options.workoutId ?? null,
      workoutName: this.options.workoutName ?? null,
      startedAt: this.options.startedAt,
      elapsedS: this.elapsedS,
      pausedS: summary.pausedS,
      distanceM: this.distanceM,
      ascentM: this.ascentM,
      avgPowerW: this.avgPowerW,
      avgHeartRateBpm: this.avgHeartRateBpm,
      settings: {
        ...this.options.settings,
        workoutScalePct:
          summary.workoutScalePct ??
          this.options.settings.workoutScalePct ??
          DEFAULT_WORKOUT_SCALE_PCT,
        ergMode: summary.ergMode ?? this.options.settings.ergMode ?? DEFAULT_ERG_MODE,
      },
    };

    const samples: RideSamples = {
      id: this.id,
      updatedAt: this.options.startedAt,
      samples: [...this.collected],
    };

    return { ride, samples };
  }
}
