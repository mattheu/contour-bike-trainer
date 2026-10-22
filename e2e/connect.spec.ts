import { expect, test } from '@playwright/test';
import {
  RIDE_ROUTE_NAME,
  closeRideSettings,
  deviceRow,
  openApp,
  openRideSettings,
  openRoute,
  pairDevice,
} from './support/app';

/**
 * Pairing lives in the ride settings panel; there is no connect screen. That makes the
 * order of operations the thing worth testing: pick a route, land on an armed ride at
 * 0:00, pair from the panel, then Start.
 *
 * What the panel shows about FTMS is not testable here — the fake has no device name and
 * no GATT services, which is why connect-view.test.ts owns that naming and the manual
 * plan owns the real pairing.
 */
test.describe('connecting from the ride settings panel', () => {
  test('pairs the trainer and the strap, then starts the ride', async ({ page }) => {
    await openApp(page, { fake: 'constant', memoryStorage: true });

    // The route is chosen first now, and the ride is armed before anything is paired.
    await openRoute(page, RIDE_ROUTE_NAME);
    const panel = await openRideSettings(page);

    await expect(deviceRow(panel, 'trainer')).toContainText('Not connected');
    await expect(deviceRow(panel, 'heart-rate')).toContainText('Not connected');

    // The panel says what is producing the data, which is the difference between a green
    // run and one that quietly tested nothing.
    await expect(panel.getByText('fake:constant')).toBeVisible();

    await pairDevice(panel, 'trainer');
    await pairDevice(panel, 'heart-rate');

    // ?fake=constant holds 200 W with 3 % noise; the strap drifts between 120 and 165.
    const trainer = (await deviceRow(panel, 'trainer').textContent()) ?? '';
    expect(Number(/(\d+) W/.exec(trainer)?.[1])).toBeGreaterThanOrEqual(190);
    expect(Number(/(\d+) W/.exec(trainer)?.[1])).toBeLessThanOrEqual(210);

    const strap = (await deviceRow(panel, 'heart-rate').textContent()) ?? '';
    expect(Number(/(\d+) bpm/.exec(strap)?.[1])).toBeGreaterThanOrEqual(120);
    expect(Number(/(\d+) bpm/.exec(strap)?.[1])).toBeLessThanOrEqual(165);

    // A paired device offers the other half of the control, so a rider can drop a strap
    // that is misreading without leaving the ride.
    await expect(
      deviceRow(panel, 'trainer').getByRole('button', { name: 'Disconnect' }),
    ).toBeVisible();

    await closeRideSettings(page, panel);
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();

    // The heroes read what the devices are sending, which is the whole point of pairing
    // from inside the ride rather than before it.
    await expect(page.getByTestId('ride-power')).toContainText(/\d/);
    await expect(page.getByTestId('ride-heart-rate')).toContainText(/\d/);
  });
});
