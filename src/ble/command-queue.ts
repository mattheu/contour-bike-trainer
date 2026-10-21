import { parseControlPointResponse, type ControlPointResponse } from './ftms';

/**
 * The transport is deliberately the narrowest thing the queue needs, so the
 * sequencing rule below is testable without Web Bluetooth anywhere near it.
 */
export interface CommandTransport {
  write(bytes: Uint8Array): Promise<void>;
}

export const DEFAULT_COMMAND_TIMEOUT_MS = 3000;

/** Shared with the BLE layer: every diagnostic here is only useful with the bytes attached. */
export function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join(' ');
}

interface Pending {
  bytes: Uint8Array;
  settled: boolean;
  resolve: (response: ControlPointResponse) => void;
  reject: (error: Error) => void;
}

export interface CommandQueueOptions {
  timeoutMs?: number;
}

/**
 * Serialises FTMS control point writes: one command in flight at a time, each
 * resolved by its indication before the next is written. Trainers silently ignore
 * writes that arrive while a previous command is outstanding, which looks exactly
 * like a command that was accepted and had no effect — the worst failure to debug.
 *
 * Known limitation: an indication that arrives after its command has timed out is
 * matched against whatever is in flight at that moment. Guarding against it needs a
 * stale counter, which fails worse when a trainer genuinely never responds, so the
 * simpler behaviour stands until a real capture says otherwise.
 */
export class CommandQueue {
  private readonly timeoutMs: number;
  private readonly waiting: Pending[] = [];
  private inFlight: Pending | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly transport: CommandTransport,
    options: CommandQueueOptions = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;
  }

  /** Commands not yet resolved, including the one in flight. */
  get pendingCount(): number {
    return this.waiting.length + (this.inFlight === null ? 0 : 1);
  }

  get busy(): boolean {
    return this.inFlight !== null;
  }

  /**
   * Queues a command. Resolves with the trainer's parsed response — including a
   * refusal such as Control Not Permitted, which is an answer rather than a fault.
   * Rejects only when we never got a usable answer at all.
   */
  enqueue(bytes: Uint8Array): Promise<ControlPointResponse> {
    return new Promise<ControlPointResponse>((resolve, reject) => {
      this.waiting.push({ bytes, settled: false, resolve, reject });
      this.pump();
    });
  }

  /** Called by the BLE layer for every control point indication. */
  handleIndication(view: DataView): void {
    const pending = this.inFlight;
    if (pending === null) return; // Unsolicited, or a straggler after a timeout.

    const response = parseControlPointResponse(view);
    if (!response.wellFormed) {
      // Not a refusal: we are misreading the stream, so the command bytes matter too.
      this.settleRejected(
        pending,
        new Error(`FTMS control point: sent [${toHex(pending.bytes)}], got ${response.message}`),
      );
      return;
    }
    this.settleResolved(pending, response);
  }

  /** Rejects everything outstanding, e.g. when the link drops mid-command. */
  clear(reason: string): void {
    const abandoned = [this.inFlight, ...this.waiting].filter((p): p is Pending => p !== null);
    this.waiting.length = 0;
    this.clearTimer();
    this.inFlight = null;
    for (const pending of abandoned) {
      if (pending.settled) continue;
      pending.settled = true;
      pending.reject(
        new Error(`FTMS control point: [${toHex(pending.bytes)}] abandoned: ${reason}`),
      );
    }
  }

  private pump(): void {
    if (this.inFlight !== null) return;
    const next = this.waiting.shift();
    if (next === undefined) return;

    this.inFlight = next;
    this.transport.write(next.bytes).then(
      () => {
        // A fast trainer can indicate before write() resolves; do not arm a dead timer.
        if (this.inFlight !== next || next.settled) return;
        this.timer = setTimeout(() => this.handleTimeout(next), this.timeoutMs);
      },
      (error: unknown) => {
        this.settleRejected(
          next,
          new Error(
            `FTMS control point write failed for [${toHex(next.bytes)}]: ${
              error instanceof Error ? error.message : String(error)
            }`,
          ),
        );
      },
    );
  }

  private handleTimeout(pending: Pending): void {
    this.settleRejected(
      pending,
      new Error(
        `FTMS control point: no indication for [${toHex(pending.bytes)}] within ${this.timeoutMs} ms. ` +
          'The write was accepted but never answered — check that startNotifications() ran on 0x2AD9.',
      ),
    );
  }

  private settleResolved(pending: Pending, response: ControlPointResponse): void {
    if (pending.settled) return;
    this.finish(pending);
    pending.resolve(response);
    this.pump();
  }

  private settleRejected(pending: Pending, error: Error): void {
    if (pending.settled) return;
    this.finish(pending);
    pending.reject(error);
    this.pump();
  }

  /** Marks settled and frees the slot, so one failure does not wedge the queue. */
  private finish(pending: Pending): void {
    pending.settled = true;
    if (this.inFlight === pending) {
      this.clearTimer();
      this.inFlight = null;
    }
  }

  private clearTimer(): void {
    if (this.timer === null) return;
    clearTimeout(this.timer);
    this.timer = null;
  }
}
