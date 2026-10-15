import { expect, test } from '@playwright/test';
import {
  ROLLING_ROUTE_NAME,
  openApp,
  openRideSettings,
  readElapsedSeconds,
  startRide,
} from './support/app';

test.describe('the ride settings panel', () => {
  test('changes trainer difficulty mid-ride without stopping the ride', async ({ page }) => {
    await openApp(page, { fake: 'constant', memoryStorage: true });
    await startRide(page, ROLLING_ROUTE_NAME);
    await expect
      .poll(() => readElapsedSeconds(page), { timeout: 20_000 })
      .toBeGreaterThanOrEqual(2);

    const panel = await openRideSettings(page);
    const difficulty = panel.getByLabel('Trainer difficulty');
    await expect(difficulty).toHaveValue('50');

    await difficulty.fill('85');
    await expect(difficulty).toHaveValue('85');
    // The panel's own readout, so the number the rider sees is the one that was stored
    // rather than local state that only looked saved.
    await expect(panel).toContainText('85');

    // The ride never stopped for it: still running, and the clock has moved on.
    const changedAtS = await readElapsedSeconds(page);
    await panel.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
    await expect
      .poll(() => readElapsedSeconds(page), { timeout: 20_000 })
      .toBeGreaterThan(changedAtS);

    // And it survives the panel being reopened.
    const reopened = await openRideSettings(page);
    await expect(reopened.getByLabel('Trainer difficulty')).toHaveValue('85');
  });

  /**
   * IndexedDB rather than ?storage=memory, deliberately: in-memory storage is rebuilt on
   * every boot, so a reload against it would prove nothing about persistence. Each test
   * gets its own browser context, so the database starts empty either way.
   */
  test('persists the three targets across a reload', async ({ page }) => {
    await openApp(page, { fake: 'constant' });
    await startRide(page, ROLLING_ROUTE_NAME);

    const panel = await openRideSettings(page);
    await expect(panel.getByLabel('Power W')).toHaveValue('');
    await panel.getByLabel('Power W').fill('240');
    await panel.getByLabel('Cadence').fill('92');
    await panel.getByLabel('Heart bpm').fill('155');

    await page.reload();
    await expect(page.getByRole('link', { name: ROLLING_ROUTE_NAME })).toBeVisible();
    await startRide(page, ROLLING_ROUTE_NAME);

    const reloaded = await openRideSettings(page);
    await expect(reloaded.getByLabel('Power W')).toHaveValue('240');
    await expect(reloaded.getByLabel('Cadence')).toHaveValue('92');
    await expect(reloaded.getByLabel('Heart bpm')).toHaveValue('155');
  });
});
