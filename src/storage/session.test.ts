import { describe, expect, it } from 'vitest';
import {
  guestSession,
  isSignedIn,
  parseSession,
  SESSION_KEY,
  StoredSessionRepository,
} from './session';
import { createMemoryKeyValueStore, type KeyValueStore } from './settings';

function withStored(value: string): KeyValueStore {
  const store = createMemoryKeyValueStore();
  store.setItem(SESSION_KEY, value);
  return store;
}

describe('guestSession', () => {
  it('is a guest, stamped with when it began', () => {
    expect(guestSession(new Date('2026-03-01T07:30:00.000Z'))).toEqual({
      mode: 'guest',
      startedAt: '2026-03-01T07:30:00.000Z',
    });
  });
});

describe('parseSession', () => {
  it('reads a stored guest session', () => {
    expect(parseSession({ mode: 'guest', startedAt: '2026-03-01T07:30:00.000Z' })).toEqual({
      mode: 'guest',
      startedAt: '2026-03-01T07:30:00.000Z',
    });
  });

  it('keeps nothing a later phase has not defined yet', () => {
    const parsed = parseSession({
      mode: 'guest',
      startedAt: '2026-03-01T07:30:00.000Z',
      token: 'not-a-thing-yet',
    });
    expect(parsed).toEqual({ mode: 'guest', startedAt: '2026-03-01T07:30:00.000Z' });
  });

  it('is not signed in for nothing stored', () => {
    expect(parseSession(null)).toBeNull();
    expect(parseSession(undefined)).toBeNull();
  });

  it('is not signed in for a record it cannot vouch for', () => {
    expect(parseSession({})).toBeNull();
    expect(parseSession('guest')).toBeNull();
    // A mode this build does not know is a session it cannot honour.
    expect(parseSession({ mode: 'account', startedAt: '2026-03-01T07:30:00.000Z' })).toBeNull();
    expect(parseSession({ mode: 'guest' })).toBeNull();
    expect(parseSession({ mode: 'guest', startedAt: '' })).toBeNull();
    expect(parseSession({ mode: 'guest', startedAt: 17 })).toBeNull();
  });
});

describe('isSignedIn', () => {
  it('is exactly whether there is a session', () => {
    expect(isSignedIn(null)).toBe(false);
    expect(isSignedIn(guestSession())).toBe(true);
  });
});

describe('StoredSessionRepository', () => {
  it('has no session on a fresh install', async () => {
    const repository = new StoredSessionRepository(createMemoryKeyValueStore());
    expect(await repository.get()).toBeNull();
  });

  it('reads back what Start wrote', async () => {
    const repository = new StoredSessionRepository(createMemoryKeyValueStore());
    const session = guestSession(new Date('2026-03-01T07:30:00.000Z'));
    await repository.put(session);
    expect(await repository.get()).toEqual(session);
  });

  it('shows the screen again rather than throwing on a corrupt blob', async () => {
    const repository = new StoredSessionRepository(withStored('{not json'));
    expect(await repository.get()).toBeNull();
  });
});
