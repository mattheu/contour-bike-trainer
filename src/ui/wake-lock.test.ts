import { describe, expect, it, vi } from 'vitest';

import { createWakeLock, shouldHoldLock } from './wake-lock';

describe('shouldHoldLock', () => {
  it('holds only while running and visible', () => {
    expect(shouldHoldLock(true, 'visible')).toBe(true);
    expect(shouldHoldLock(false, 'visible')).toBe(false);
    // Hidden releases it by specification, so asking for it would fail anyway.
    expect(shouldHoldLock(true, 'hidden')).toBe(false);
  });
});

function harness(visibility: DocumentVisibilityState = 'visible') {
  const release = vi.fn(async () => {});
  const listeners: Record<string, (() => void)[]> = {};
  const sentinel = {
    release,
    addEventListener: (type: 'release', fn: () => void) => {
      (listeners[type] ??= []).push(fn);
    },
  };
  const request = vi.fn(async () => sentinel);
  const docListeners: (() => void)[] = [];
  const doc = {
    visibilityState: visibility,
    addEventListener: (_t: string, fn: () => void) => docListeners.push(fn),
    removeEventListener: vi.fn(),
  };
  const handle = createWakeLock({ request }, doc as never);
  return { handle, request, release, doc, fireVisibility: () => docListeners.forEach((f) => f()) };
}

describe('createWakeLock', () => {
  it('takes a lock when a ride starts and drops it when it stops', async () => {
    const { handle, request, release } = harness();

    handle.setActive(true);
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));

    handle.setActive(false);
    await vi.waitFor(() => expect(release).toHaveBeenCalledTimes(1));
  });

  it('does not ask for a lock while the document is hidden', async () => {
    const { handle, request } = harness('hidden');
    handle.setActive(true);
    await Promise.resolve();
    expect(request).not.toHaveBeenCalled();
  });

  it('re-acquires when the document becomes visible again mid-ride', async () => {
    const h = harness('hidden');
    h.handle.setActive(true);
    await Promise.resolve();
    expect(h.request).not.toHaveBeenCalled();

    // Hiding releases the lock; coming back has to take it again or the screen sleeps
    // for the rest of the ride.
    h.doc.visibilityState = 'visible';
    h.fireVisibility();
    await vi.waitFor(() => expect(h.request).toHaveBeenCalledTimes(1));
  });

  it('survives a request the browser refuses', async () => {
    const request = vi.fn(async () => {
      throw new Error('denied by battery saver');
    });
    const doc = {
      visibilityState: 'visible' as DocumentVisibilityState,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    const handle = createWakeLock({ request }, doc as never);
    handle.setActive(true);
    await vi.waitFor(() => expect(request).toHaveBeenCalled());
    // A refused lock must not break the ride; the screen may simply sleep.
    expect(() => handle.setActive(false)).not.toThrow();
  });

  it('does nothing at all where the API is absent', () => {
    const handle = createWakeLock(undefined, {
      visibilityState: 'visible',
      addEventListener: () => {},
      removeEventListener: () => {},
    } as never);
    expect(() => handle.setActive(true)).not.toThrow();
  });
});
