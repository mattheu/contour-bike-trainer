import { createIndexedDbStorage } from './indexeddb';
import { createMemoryStorage } from './memory';
import type { Storage } from './types';

export type StorageKind = 'memory' | 'indexeddb';

/** Playwright seeds the in-memory implementation before the page boots. */
export function storageKindFromSearch(search: string): StorageKind {
  return new URLSearchParams(search).get('storage') === 'memory' ? 'memory' : 'indexeddb';
}

/**
 * The one place that knows which implementation is live. Constructed once at start-up
 * and passed down; nothing above this line can tell the difference.
 */
export function createStorage(search: string = window.location.search): Storage {
  return storageKindFromSearch(search) === 'memory'
    ? createMemoryStorage()
    : createIndexedDbStorage();
}
