import type { KeyValueStore } from './settings';
import type { Session, SessionRepository } from './types';

export const SESSION_KEY = 'contour.session';

/** The record pressing Start writes. The time is passed in so the shape stays pure. */
export function guestSession(startedAt: Date = new Date()): Session {
  return { mode: 'guest', startedAt: startedAt.toISOString() };
}

/**
 * Pure: takes whatever was stored and answers "is this install signed in?".
 *
 * Null for anything it cannot vouch for, where parseSettings falls back to a default.
 * The difference is deliberate: a half-written or hand-edited session is not a session,
 * and showing the screen again costs one press, where trusting a broken record would
 * leave the rider with no way back to it.
 */
export function parseSession(raw: unknown): Session | null {
  if (raw === null || typeof raw !== 'object') return null;
  const stored = raw as Record<string, unknown>;
  if (stored.mode !== 'guest') return null;
  if (typeof stored.startedAt !== 'string' || stored.startedAt === '') return null;
  const session: Session = { mode: stored.mode, startedAt: stored.startedAt };
  // Unreadable means no ride was left part-written, which is the safe answer either way:
  // boot only ever clears the marker, and a ride it fails to clear is still a ride.
  if (typeof stored.liveRideId === 'string' && stored.liveRideId !== '') {
    session.liveRideId = stored.liveRideId;
  }
  return session;
}

/** The question every caller actually asks, named once so nothing re-states it. */
export function isSignedIn(session: Session | null): session is Session {
  return session !== null;
}

/**
 * One JSON blob under one key, like the settings beside it: a session is two strings
 * read once at boot, and a database transaction would buy nothing.
 */
export class StoredSessionRepository implements SessionRepository {
  constructor(
    private readonly store: KeyValueStore,
    private readonly key: string = SESSION_KEY,
  ) {}

  async get(): Promise<Session | null> {
    const raw = this.store.getItem(this.key);
    if (raw === null) return null;
    try {
      return parseSession(JSON.parse(raw));
    } catch {
      // Corrupt blob: the login screen is a better answer than a crash on start-up.
      return null;
    }
  }

  async put(session: Session): Promise<void> {
    this.store.setItem(this.key, JSON.stringify(session));
  }
}

export function createLocalSessionRepository(): SessionRepository {
  return new StoredSessionRepository(localStorage);
}
