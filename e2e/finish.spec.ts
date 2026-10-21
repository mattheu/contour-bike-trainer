import { expect, test } from '@playwright/test';
import {
  FIXTURE_ROUTE,
  TCX_FILE_NAME,
  downloadTcx,
  openApp,
  parseTcx,
  readNumber,
  startRide,
} from './support/app';

/**
 * The path a browser session cannot reach by hand: the route runs out, the engine
 * finishes itself, the ride is saved and its id published, and the summary opens on
 * that id rather than on whatever happens to be newest in storage.
 *
 * This is the whole reason a 200 m fixture exists (ADR-0011).
 */
test.describe('riding a route to its end', () => {
  test('finishes, saves the ride, and exports it as TCX from both places', async ({ page }) => {
    await openApp(page, { fake: 'constant', memoryStorage: true, seedRoutes: [FIXTURE_ROUTE] });
    await startRide(page, FIXTURE_ROUTE.name, { heartRate: true });

    // Nobody presses End: 200 m at a constant −4 % on the fake's 200 W runs out in about
    // fourteen seconds, and the summary appears on its own.
    const download = page.getByRole('button', { name: 'Download TCX' });
    await expect(download).toBeVisible({ timeout: 45_000 });

    // The ride that was just ridden, not another: the route it was on, the full route
    // distance, and no "ended early" — the engine sets finished only when the route ran out.
    await expect(page.getByText(FIXTURE_ROUTE.name)).toBeVisible();
    await expect(page.getByText('ended early')).toHaveCount(0);
    expect(await readNumber(page, 'summary-distance')).toBe(0.2);
    expect(await readNumber(page, 'summary-avg-power')).toBeGreaterThan(150);
    expect(await readNumber(page, 'summary-avg-heart-rate')).toBeGreaterThan(100);

    const summaryFile = await downloadTcx(page, download);
    expect(summaryFile.fileName).toMatch(TCX_FILE_NAME);

    const tcx = await parseTcx(page, summaryFile.xml);
    expect(tcx.root).toBe('TrainingCenterDatabase');
    expect(tcx.sport).toBe('Biking');
    expect(tcx.laps).toBe(1);
    expect(tcx.notes).toBe(FIXTURE_ROUTE.name);

    // One sample a second over roughly fourteen seconds, plus the one pinned to the
    // finish line. Every one carries a position and a distance.
    expect(tcx.trackpoints).toBeGreaterThanOrEqual(10);
    expect(tcx.trackpoints).toBeLessThanOrEqual(25);
    expect(tcx.withPosition).toBe(tcx.trackpoints);
    expect(tcx.withDistance).toBe(tcx.trackpoints);
    // All but the sample at t=0, which the engine emits before the first Indoor Bike Data
    // notification reaches it. Absent power is omitted rather than written as nought, so
    // that trackpoint carries no Watts — a coasting rider and a silent meter differ.
    expect(tcx.withWatts).toBeGreaterThanOrEqual(tcx.trackpoints - 1);

    // The track starts at the start line and ends at the finish line, not a second short.
    expect(tcx.firstDistanceM).toBe(0);
    expect(tcx.lastDistanceM).toBeGreaterThanOrEqual(199.9);
    expect(tcx.lastDistanceM).toBeLessThanOrEqual(200.1);

    // The same ride, exported again from its row in the history.
    await page.getByRole('button', { name: 'Done' }).click();
    const row = page.getByRole('link', { name: FIXTURE_ROUTE.name });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('0.2');

    const listFile = await downloadTcx(
      page,
      page.getByRole('button', { name: `Download ${FIXTURE_ROUTE.name} as TCX` }),
    );
    expect(listFile.fileName).toBe(summaryFile.fileName);
    // Byte for byte: both routes through the app read the same two records.
    expect(listFile.xml).toBe(summaryFile.xml);
  });
});
