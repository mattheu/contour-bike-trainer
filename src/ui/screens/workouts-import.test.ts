import { describe, expect, it } from 'vitest';

import { workoutImportAlert, type WorkoutImportResult } from './workouts-import';

function done(
  overrides: Partial<Extract<WorkoutImportResult, { status: 'done' }>> = {},
): WorkoutImportResult {
  return {
    status: 'done',
    imported: 0,
    skippedExisting: 0,
    skippedInvalid: 0,
    reasons: [],
    ...overrides,
  };
}

describe('workoutImportAlert', () => {
  it('is info and names the count when every document landed', () => {
    expect(workoutImportAlert(done({ imported: 3 }))).toEqual({
      level: 'info',
      message: 'Imported 3 workouts.',
    });
  });

  it('says one workout, not 1 workouts', () => {
    expect(workoutImportAlert(done({ imported: 1 })).message).toBe('Imported 1 workout.');
  });

  it('warns rather than informs when a document was skipped, and reports both counts', () => {
    // The rider picked a file expecting all of it to arrive. A count that quietly omits
    // the ones that did not is the version of this message that cannot be trusted.
    expect(workoutImportAlert(done({ imported: 2, skippedInvalid: 1 }))).toEqual({
      level: 'warning',
      message: 'Imported 2 workouts. Skipped 1 document that could not be read.',
    });
  });

  it('pluralises the skipped documents too', () => {
    expect(workoutImportAlert(done({ imported: 0, skippedInvalid: 2 })).message).toBe(
      'Imported no workouts. Skipped 2 documents that could not be read.',
    );
  });

  it('names the workouts that were already in the library', () => {
    expect(workoutImportAlert(done({ imported: 2, skippedExisting: 1 }))).toEqual({
      level: 'warning',
      message: 'Imported 2 workouts. Skipped 1 workout already in your library.',
    });
  });

  it('says what happened when the whole file was already in the library', () => {
    // The case this has to get right: nothing was written, and the rider has to be able
    // to tell that from a picker that quietly did nothing.
    expect(workoutImportAlert(done({ skippedExisting: 4 }))).toEqual({
      level: 'warning',
      message: 'Imported no workouts. Skipped 4 workouts already in your library.',
    });
  });

  it('reports both kinds of skip in one line', () => {
    expect(
      workoutImportAlert(done({ imported: 1, skippedExisting: 2, skippedInvalid: 1 })).message,
    ).toBe(
      'Imported 1 workout. Skipped 2 workouts already in your library. Skipped 1 document that could not be read.',
    );
  });

  it('says so plainly when a readable file held nothing', () => {
    expect(workoutImportAlert(done())).toEqual({
      level: 'info',
      message: 'Imported no workouts.',
    });
  });

  it('is a fault when the file itself could not be read', () => {
    expect(workoutImportAlert({ status: 'failed', reason: 'it is 90 MB' })).toEqual({
      level: 'fault',
      message: 'That file could not be read: it is 90 MB',
    });
  });
});
