import { describe, expect, it } from 'vitest';

import { importAlert, type ImportResult } from './rides-import';

function done(overrides: Partial<Extract<ImportResult, { status: 'done' }>> = {}): ImportResult {
  return {
    status: 'done',
    restored: 0,
    skippedExisting: 0,
    skippedInvalid: 0,
    reasons: [],
    ...overrides,
  };
}

describe('importAlert', () => {
  it('is info and names the count when everything landed', () => {
    expect(importAlert(done({ restored: 3 }))).toEqual({
      level: 'info',
      message: 'Imported 3 rides.',
    });
  });

  it('says one ride, not 1 rides', () => {
    expect(importAlert(done({ restored: 1 })).message).toBe('Imported 1 ride.');
  });

  it('warns rather than informs when a ride was already in the history', () => {
    expect(importAlert(done({ restored: 2, skippedExisting: 1 }))).toEqual({
      level: 'warning',
      message: 'Imported 2 rides. Skipped 1 ride already in your history.',
    });
  });

  it('warns when a record could not be read', () => {
    expect(importAlert(done({ restored: 2, skippedInvalid: 3 }))).toEqual({
      level: 'warning',
      message: 'Imported 2 rides. Skipped 3 records that could not be read.',
    });
  });

  it('reports both kinds of skip in one line', () => {
    expect(importAlert(done({ restored: 1, skippedExisting: 2, skippedInvalid: 1 })).message).toBe(
      'Imported 1 ride. Skipped 2 rides already in your history. Skipped 1 record that could not be read.',
    );
  });

  it('says so plainly when the same archive is imported twice and nothing is new', () => {
    expect(importAlert(done({ skippedExisting: 4 }))).toEqual({
      level: 'warning',
      message: 'Imported no rides. Skipped 4 rides already in your history.',
    });
  });

  it('is info, not a warning, for an archive that simply held no rides', () => {
    expect(importAlert(done())).toEqual({ level: 'info', message: 'Imported no rides.' });
  });

  it('is a fault when the file could not be read at all, and says why', () => {
    expect(importAlert({ status: 'failed', reason: 'it is not a readable ZIP file' })).toEqual({
      level: 'fault',
      message: 'That file could not be read: it is not a readable ZIP file',
    });
  });
});
