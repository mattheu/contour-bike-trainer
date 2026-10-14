import { describe, expect, it } from 'vitest';
import { storageKindFromSearch } from './index';

describe('storageKindFromSearch', () => {
  it('picks the in-memory implementation for ?storage=memory', () => {
    expect(storageKindFromSearch('?storage=memory')).toBe('memory');
    expect(storageKindFromSearch('?fake=constant&storage=memory')).toBe('memory');
  });

  it('picks IndexedDB by default', () => {
    expect(storageKindFromSearch('')).toBe('indexeddb');
    expect(storageKindFromSearch('?fake=constant')).toBe('indexeddb');
  });

  it('picks IndexedDB for any other value, rather than guessing at a typo', () => {
    expect(storageKindFromSearch('?storage=indexeddb')).toBe('indexeddb');
    expect(storageKindFromSearch('?storage=memoryy')).toBe('indexeddb');
    expect(storageKindFromSearch('?storage=')).toBe('indexeddb');
  });
});
