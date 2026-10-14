import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandQueue, toHex, type CommandTransport } from './command-queue';
import { OpCode, ResultCode } from './ftms';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** Records what was written and lets a test decide when each write resolves. */
class FakeTransport implements CommandTransport {
  readonly written: string[] = [];
  private releases: (() => void)[] = [];
  /** When true, write() stays pending until releaseWrites() is called. */
  holdWrites = false;
  failNext: Error | null = null;

  write(bytes: Uint8Array): Promise<void> {
    this.written.push(toHex(bytes));
    if (this.failNext !== null) {
      const error = this.failNext;
      this.failNext = null;
      return Promise.reject(error);
    }
    if (!this.holdWrites) return Promise.resolve();
    return new Promise<void>((resolve) => this.releases.push(resolve));
  }

  releaseWrites(): void {
    const pending = this.releases;
    this.releases = [];
    for (const resolve of pending) resolve();
  }
}

function response(requestOpcode: number, resultCode: number = ResultCode.Success): DataView {
  return new DataView(new Uint8Array([OpCode.ResponseCode, requestOpcode, resultCode]).buffer);
}

function raw(...bytes: number[]): DataView {
  return new DataView(new Uint8Array(bytes).buffer);
}

const REQUEST_CONTROL = new Uint8Array([OpCode.RequestControl]);
const START = new Uint8Array([OpCode.StartOrResume]);

describe('CommandQueue', () => {
  it('resolves a command with its parsed response', async () => {
    const transport = new FakeTransport();
    const queue = new CommandQueue(transport);

    const pending = queue.enqueue(REQUEST_CONTROL);
    await vi.advanceTimersByTimeAsync(0);
    expect(transport.written).toEqual(['00']);

    queue.handleIndication(response(OpCode.RequestControl));
    await expect(pending).resolves.toMatchObject({
      requestOpcode: OpCode.RequestControl,
      success: true,
      wellFormed: true,
    });
    expect(queue.pendingCount).toBe(0);
  });

  it('resolves rather than rejects when the trainer refuses the command', async () => {
    const transport = new FakeTransport();
    const queue = new CommandQueue(transport);

    const pending = queue.enqueue(REQUEST_CONTROL);
    await vi.advanceTimersByTimeAsync(0);
    queue.handleIndication(response(OpCode.RequestControl, ResultCode.ControlNotPermitted));

    // A refusal is an answer: the caller decides what to do about it.
    await expect(pending).resolves.toMatchObject({
      success: false,
      message: 'Control Not Permitted',
    });
  });

  it('sends one command at a time, in order', async () => {
    const transport = new FakeTransport();
    const queue = new CommandQueue(transport);

    const first = queue.enqueue(REQUEST_CONTROL);
    const second = queue.enqueue(START);
    await vi.advanceTimersByTimeAsync(0);

    expect(transport.written).toEqual(['00']);
    expect(queue.pendingCount).toBe(2);

    queue.handleIndication(response(OpCode.RequestControl));
    await first;
    await vi.advanceTimersByTimeAsync(0);
    expect(transport.written).toEqual(['00', '07']);

    queue.handleIndication(response(OpCode.StartOrResume));
    await expect(second).resolves.toMatchObject({ requestOpcode: OpCode.StartOrResume });
  });

  it('holds a command enqueued while another is in flight', async () => {
    const transport = new FakeTransport();
    const queue = new CommandQueue(transport);

    const first = queue.enqueue(REQUEST_CONTROL);
    await vi.advanceTimersByTimeAsync(0);
    expect(queue.busy).toBe(true);

    const second = queue.enqueue(new Uint8Array([OpCode.SetTargetPower, 0xc8, 0x00]));
    await vi.advanceTimersByTimeAsync(0);
    expect(transport.written).toEqual(['00']);

    queue.handleIndication(response(OpCode.RequestControl));
    await first;
    await vi.advanceTimersByTimeAsync(0);
    expect(transport.written).toEqual(['00', '05 c8 00']);

    queue.handleIndication(response(OpCode.SetTargetPower));
    await second;
    expect(queue.busy).toBe(false);
  });

  it('rejects on timeout and moves on to the next command', async () => {
    const transport = new FakeTransport();
    const queue = new CommandQueue(transport, { timeoutMs: 1000 });

    const first = queue.enqueue(REQUEST_CONTROL);
    const second = queue.enqueue(START);
    await vi.advanceTimersByTimeAsync(0);

    const caught = first.catch((e: Error) => e);
    await vi.advanceTimersByTimeAsync(1000);

    const error = await caught;
    expect(error.message).toContain('no indication for [00]');
    expect(error.message).toContain('1000 ms');
    expect(error.message).toContain('0x2AD9');

    // The queue has to keep running: one dead command must not wedge the ride.
    expect(transport.written).toEqual(['00', '07']);
    queue.handleIndication(response(OpCode.StartOrResume));
    await expect(second).resolves.toMatchObject({ success: true });
  });

  it('rejects a malformed response with both the command and the raw bytes', async () => {
    const transport = new FakeTransport();
    const queue = new CommandQueue(transport);

    const pending = queue.enqueue(REQUEST_CONTROL);
    await vi.advanceTimersByTimeAsync(0);

    const caught = pending.catch((e: Error) => e);
    queue.handleIndication(raw(0x01, 0x00, 0x01));

    const error = await caught;
    expect(error.message).toContain('sent [00]');
    expect(error.message).toContain('0x01 0x00 0x01');
    expect(queue.busy).toBe(false);
  });

  it('rejects when the write itself fails, without wedging the queue', async () => {
    const transport = new FakeTransport();
    const queue = new CommandQueue(transport);

    transport.failNext = new Error('GATT operation not permitted');
    const first = queue.enqueue(REQUEST_CONTROL);
    const second = queue.enqueue(START);

    const caught = first.catch((e: Error) => e);
    await vi.advanceTimersByTimeAsync(0);

    const error = await caught;
    expect(error.message).toContain('write failed for [00]');
    expect(error.message).toContain('GATT operation not permitted');

    queue.handleIndication(response(OpCode.StartOrResume));
    await expect(second).resolves.toMatchObject({ success: true });
  });

  it('ignores an indication when nothing is in flight', async () => {
    const transport = new FakeTransport();
    const queue = new CommandQueue(transport);

    expect(() => queue.handleIndication(response(OpCode.RequestControl))).not.toThrow();

    const pending = queue.enqueue(REQUEST_CONTROL);
    await vi.advanceTimersByTimeAsync(0);
    queue.handleIndication(response(OpCode.RequestControl));
    await expect(pending).resolves.toMatchObject({ success: true });
  });

  it('settles a command that is answered before its write resolves', async () => {
    const transport = new FakeTransport();
    transport.holdWrites = true;
    const queue = new CommandQueue(transport, { timeoutMs: 1000 });

    const pending = queue.enqueue(REQUEST_CONTROL);
    await vi.advanceTimersByTimeAsync(0);
    queue.handleIndication(response(OpCode.RequestControl));
    await expect(pending).resolves.toMatchObject({ success: true });

    // The late write resolution must not arm a timer against an already-settled command.
    transport.releaseWrites();
    await vi.advanceTimersByTimeAsync(5000);
    expect(queue.pendingCount).toBe(0);
  });

  it('rejects everything outstanding when the link drops', async () => {
    const transport = new FakeTransport();
    const queue = new CommandQueue(transport);

    const first = queue.enqueue(REQUEST_CONTROL);
    const second = queue.enqueue(START);
    await vi.advanceTimersByTimeAsync(0);

    const caught = Promise.all([first.catch((e: Error) => e), second.catch((e: Error) => e)]);
    queue.clear('the trainer disconnected');

    const [a, b] = await caught;
    expect(a?.message).toContain('[00] abandoned: the trainer disconnected');
    expect(b?.message).toContain('[07] abandoned: the trainer disconnected');
    expect(queue.pendingCount).toBe(0);
    expect(transport.written).toEqual(['00']);
  });

  it('times out each command independently rather than sharing one deadline', async () => {
    const transport = new FakeTransport();
    const queue = new CommandQueue(transport, { timeoutMs: 1000 });

    const first = queue.enqueue(REQUEST_CONTROL);
    const second = queue.enqueue(START);
    const caught = Promise.all([first.catch((e: Error) => e), second.catch((e: Error) => e)]);

    await vi.advanceTimersByTimeAsync(1000);
    expect(transport.written).toEqual(['00', '07']);
    await vi.advanceTimersByTimeAsync(999);
    expect(queue.busy).toBe(true);
    await vi.advanceTimersByTimeAsync(1);

    const [a, b] = await caught;
    expect(a?.message).toContain('[00]');
    expect(b?.message).toContain('[07]');
    expect(queue.pendingCount).toBe(0);
  });
});

describe('toHex', () => {
  it('pads every byte to two digits', () => {
    expect(toHex(new Uint8Array([0x00, 0x05, 0xc8, 0xff]))).toBe('00 05 c8 ff');
  });
});
