import { describe, expect, it } from 'vitest';

import { routeImportAlert } from './routes-import';

describe('routeImportAlert', () => {
  it('reports a clean import as information, and clears itself', () => {
    expect(routeImportAlert({ status: 'done', imported: 3, skipped: 0, reasons: [] })).toEqual({
      level: 'info',
      message: 'Imported 3 routes.',
    });
  });

  it('counts one route in the singular', () => {
    expect(routeImportAlert({ status: 'done', imported: 1, skipped: 0, reasons: [] })).toEqual({
      level: 'info',
      message: 'Imported 1 route.',
    });
  });

  it('warns and stays on screen when something the rider expected did not arrive', () => {
    const alert = routeImportAlert({
      status: 'done',
      imported: 2,
      skipped: 1,
      reasons: ['Track 3 was skipped because it has one point'],
    });

    expect(alert).toEqual({
      level: 'warning',
      message: 'Imported 2 routes. Skipped 1 track that could not be read.',
    });
  });

  it('says so plainly when a file held nothing readable at all', () => {
    expect(routeImportAlert({ status: 'done', imported: 0, skipped: 2, reasons: [] })).toEqual({
      level: 'warning',
      message: 'Imported no routes. Skipped 2 tracks that could not be read.',
    });
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
