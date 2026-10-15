/**
 * Keeps the display awake while a ride is running.
 *
 * Without it the screen sleeps mid-climb, because riding involves not touching the
 * machine for an hour. `navigator.wakeLock` is the standard API and needs no permission.
 *
 * It is released by specification the moment the document becomes hidden, and cannot be
 * re-acquired until it is visible again — so this does nothing for a backgrounded tab,
 * which is ADR-0000's territory and would need Electron's powerSaveBlocker. Here that is
 * the correct behaviour rather than a limitation: nobody is reading a screen they have
 * covered with a video.
 */
export interface WakeLockHandle {
  /** True while a ride should be holding the display awake. */
  setActive(active: boolean): void;
  dispose(): void;
}

interface SentinelLike {
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
}

interface WakeLockLike {
  request(type: 'screen'): Promise<SentinelLike>;
}

/** Whether a lock should be held right now. Pure, so the rule is testable. */
export function shouldHoldLock(active: boolean, visibility: DocumentVisibilityState): boolean {
  return active && visibility === 'visible';
}

export function createWakeLock(
  api: WakeLockLike | undefined = (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock,
  doc: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'> = document,
): WakeLockHandle {
  let active = false;
  let sentinel: SentinelLike | null = null;
  let acquiring = false;

  async function sync(): Promise<void> {
    if (api === undefined) return;
    const want = shouldHoldLock(active, doc.visibilityState);

    if (want && sentinel === null && !acquiring) {
      acquiring = true;
      try {
        const next = await api.request('screen');
        // The release event fires when the document is hidden, or the OS takes it away.
        next.addEventListener('release', () => {
          if (sentinel === next) sentinel = null;
        });
        sentinel = next;
      } catch {
        // Denied by battery saver, or the document went hidden mid-request. Not an error
        // worth surfacing: the ride is unaffected, the screen may simply sleep.
      } finally {
        acquiring = false;
      }
      return;
    }

    if (!want && sentinel !== null) {
      const held = sentinel;
      sentinel = null;
      await held.release().catch(() => {});
    }
  }

  const onVisibility = (): void => void sync();
  doc.addEventListener('visibilitychange', onVisibility);

  return {
    setActive(next: boolean): void {
      if (next === active) return;
      active = next;
      void sync();
    },
    dispose(): void {
      doc.removeEventListener('visibilitychange', onVisibility);
      active = false;
      void sync();
    },
  };
}
