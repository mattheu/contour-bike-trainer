import { summarise, type Summary } from './stats';
import type { EventDetail, EventKind, RecordedEvent } from './types';

/** Roughly three hours of a 1 Hz tick plus notifications before anything is dropped. */
export const DEFAULT_CAPACITY = 20000;

export interface RecorderOptions {
  /** Label for what produced the data, e.g. "fake:constant" or "real device". */
  source: string;
  capacity?: number;
}

export interface RunMetadata {
  source: string;
  userAgent: string;
  startWallClock: string;
  startT: number;
  exportedAt: string;
  capacity: number;
  /** Events discarded because the ring buffer was full. Non-zero invalidates a run. */
  dropped: number;
  totalRecorded: number;
}

export interface LogExport {
  metadata: RunMetadata;
  summary: Summary;
  events: RecordedEvent[];
}

function userAgent(): string {
  return typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent;
}

/**
 * Bounded event log for the background experiment. A ring buffer rather than an
 * unbounded array so a forgotten tab cannot exhaust memory mid-measurement; drops
 * are counted, because a silently truncated log would read as a throttled one.
 */
export class Recorder {
  private readonly capacity: number;
  private readonly buffer: (RecordedEvent | undefined)[];
  private next = 0;
  private size = 0;
  private dropped = 0;
  private recorded = 0;
  private startWallClock: string;
  private startT: number;

  constructor(private readonly options: RecorderOptions) {
    this.capacity = Math.max(1, options.capacity ?? DEFAULT_CAPACITY);
    this.buffer = new Array<RecordedEvent | undefined>(this.capacity);
    this.startWallClock = new Date().toISOString();
    this.startT = performance.now();
  }

  get source(): string {
    return this.options.source;
  }

  /** Monotonic across drops, unlike events().length. */
  get totalRecorded(): number {
    return this.recorded;
  }

  get droppedCount(): number {
    return this.dropped;
  }

  record(kind: EventKind, detail?: EventDetail): RecordedEvent {
    const event: RecordedEvent = {
      kind,
      t: performance.now(),
      wallClock: new Date().toISOString(),
      ...(detail === undefined ? {} : { detail }),
    };

    if (this.size === this.capacity) this.dropped += 1;
    else this.size += 1;

    this.buffer[this.next] = event;
    this.next = (this.next + 1) % this.capacity;
    this.recorded += 1;
    return event;
  }

  /** Starts a fresh run: the export's start times move with it. */
  clear(): void {
    this.buffer.fill(undefined);
    this.next = 0;
    this.size = 0;
    this.dropped = 0;
    this.recorded = 0;
    this.startWallClock = new Date().toISOString();
    this.startT = performance.now();
  }

  /** Oldest first. */
  events(): RecordedEvent[] {
    const out: RecordedEvent[] = [];
    const start = (this.next - this.size + this.capacity) % this.capacity;
    for (let i = 0; i < this.size; i += 1) {
      const event = this.buffer[(start + i) % this.capacity];
      if (event !== undefined) out.push(event);
    }
    return out;
  }

  metadata(): RunMetadata {
    return {
      source: this.options.source,
      userAgent: userAgent(),
      startWallClock: this.startWallClock,
      startT: this.startT,
      exportedAt: new Date().toISOString(),
      capacity: this.capacity,
      dropped: this.dropped,
      totalRecorded: this.recorded,
    };
  }

  toExport(): LogExport {
    const events = this.events();
    return { metadata: this.metadata(), summary: summarise(events), events };
  }

  toJson(): string {
    return JSON.stringify(this.toExport(), null, 2);
  }

  /** What the download button hands to URL.createObjectURL. */
  toBlob(): Blob {
    return new Blob([this.toJson()], { type: 'application/json' });
  }

  /** contour-experiment-fake-constant-2026-09-30T10-15-00.json */
  fileName(): string {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const source = this.options.source.replace(/[^a-z0-9]+/gi, '-');
    return `contour-experiment-${source}-${stamp}.json`;
  }
}
