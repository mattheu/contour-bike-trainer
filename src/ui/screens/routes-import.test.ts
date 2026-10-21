import { describe, expect, it } from 'vitest';

import { routeImportAlert, type RouteImportResult } from './routes-import';

function done(
  overrides: Partial<Extract<RouteImportResult, { status: 'done' }>> = {},
): RouteImportResult {
  return {
    status: 'done',
    imported: 0,
    skippedExisting: 0,
    skippedInvalid: 0,
    reasons: [],
    ...overrides,
  };
}

describe('routeImportAlert', () => {
  it('reports a clean import as information, and clears itself', () => {
    expect(routeImportAlert(done({ imported: 3 }))).toEqual({
      level: 'info',
      message: 'Imported 3 routes.',
    });
  });

  it('counts one route in the singular', () => {
    expect(routeImportAlert(done({ imported: 1 }))).toEqual({
      level: 'info',
      message: 'Imported 1 route.',
    });
  });

  it('warns and stays on screen when something the rider expected did not arrive', () => {
    const alert = routeImportAlert(
      done({
        imported: 2,
        skippedInvalid: 1,
        reasons: ['Track 3 was skipped because it has one point'],
      }),
    );

    expect(alert).toEqual({
      level: 'warning',
      message: 'Imported 2 routes. Skipped 1 track that could not be read.',
    });
  });

  it('says so plainly when a file held nothing readable at all', () => {
    expect(routeImportAlert(done({ skippedInvalid: 2 }))).toEqual({
      level: 'warning',
      message: 'Imported no routes. Skipped 2 tracks that could not be read.',
    });
  });

  it('names the routes that were already there', () => {
    expect(routeImportAlert(done({ imported: 2, skippedExisting: 1 }))).toEqual({
      level: 'warning',
      message: 'Imported 2 routes. Skipped 1 route already in the list.',
    });
  });

  it('says what happened when the whole file was already in the list', () => {
    // The case this has to get right: nothing was written, and the rider has to be able
    // to tell that from a picker that quietly did nothing.
    expect(routeImportAlert(done({ skippedExisting: 6 }))).toEqual({
      level: 'warning',
      message: 'Imported no routes. Skipped 6 routes already in the list.',
    });
  });

  it('reports both kinds of skip in one line', () => {
    expect(
      routeImportAlert(done({ imported: 1, skippedExisting: 2, skippedInvalid: 1 })).message,
    ).toBe(
      'Imported 1 route. Skipped 2 routes already in the list. Skipped 1 track that could not be read.',
    );
  });

  it('faults on a file that would not open, and names the reason', () => {
    expect(routeImportAlert({ status: 'failed', reason: 'GPX has no <gpx> root element' })).toEqual(
      {
        level: 'fault',
        message: 'That file could not be read: GPX has no <gpx> root element',
      },
    );
  });
});
