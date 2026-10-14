import { expect, test, type Page } from '@playwright/test';
import {
  FIXTURE_ROUTE,
  ROLLING_ROUTE_NAME,
  openApp,
  openRoute,
  readElapsedSeconds,
  startRide,
} from './support/app';

/**
 * Deleting a ride is the one action in the app that destroys something, so the claim
 * worth testing is not that a row disappeared: it is that the right ride left storage and
 * the other one did not.
 *
 * The two rides are ridden rather than written straight into storage: the seed hook takes
 * routes only, and a ride that went through the recorder is the only kind that carries
 * samples for the cascade to take with it. That the cascade reaches the samples is
 * src/storage/memory/index.test.ts; what this spec owns is the path the rider takes.
 */

/**
 * A second ride in the same session. Not startRide: the trainer is still connected from
 * the first one, so its row offers Disconnect and there is nothing left to pair.
 */
async function rideAgain(page: Page, routeName: string): Promise<void> {
  await openRoute(page, routeName);
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
}

/** Ends a ride a few seconds in and lands on its summary. */
async function endRide(page: Page): Promise<void> {
  await expect.poll(() => readElapsedSeconds(page), { timeout: 20_000 }).toBeGreaterThanOrEqual(2);
  await page.getByRole('button', { name: 'End ride' }).click();
  await expect(page.getByRole('button', { name: 'Download TCX' })).toBeVisible();
}

/**
 * A nav button, scoped to the nav. The rides list's Type filter offers Routes and
 * Workouts too, so an unscoped name matches twice on that screen.
 */
function nav(page: Page, section: string) {
  return page.getByRole('group', { name: 'Section' }).getByRole('button', { name: section });
}

/** A row in the history, by the route it was ridden on. */
function rideRow(page: Page, routeName: string) {
  return page.getByRole('link', { name: routeName });
}

test.describe('deleting a ride', () => {
  test('deletes one ride and leaves the other alone', async ({ page }) => {
    await openApp(page, { fake: 'constant', memoryStorage: true, seedRoutes: [FIXTURE_ROUTE] });

    // Two rides on two routes, so the rows can be told apart by name.
    await startRide(page, FIXTURE_ROUTE.name);
    await endRide(page);
    await page.getByRole('button', { name: 'Done' }).click();

    await nav(page, 'Routes').click();
    await rideAgain(page, ROLLING_ROUTE_NAME);
    await endRide(page);
    await page.getByRole('button', { name: 'Done' }).click();

    await expect(rideRow(page, FIXTURE_ROUTE.name)).toHaveCount(1);
    await expect(rideRow(page, ROLLING_ROUTE_NAME)).toHaveCount(1);

    // First press arms the row rather than deleting it, and says why it is asking.
    await page.getByRole('button', { name: `Delete ${FIXTURE_ROUTE.name}` }).click();
    await expect(page.getByText("Sure? Can't be undone")).toBeVisible();
    await expect(rideRow(page, FIXTURE_ROUTE.name)).toHaveCount(1);

    // The way out is a control, not a click elsewhere, and it leaves the ride where it was.
    await page.getByRole('button', { name: 'Keep', exact: true }).click();
    await expect(page.getByText("Sure? Can't be undone")).toHaveCount(0);
    await expect(rideRow(page, FIXTURE_ROUTE.name)).toHaveCount(1);

    // Arming the other row moves the question rather than arming two.
    await page.getByRole('button', { name: `Delete ${FIXTURE_ROUTE.name}` }).click();
    await page.getByRole('button', { name: `Delete ${ROLLING_ROUTE_NAME}` }).click();
    await expect(page.getByText("Sure? Can't be undone")).toHaveCount(1);
    await expect(page.getByRole('button', { name: `Delete ${FIXTURE_ROUTE.name}` })).toHaveCount(1);

    // Second press on the armed row is the one that destroys it.
    await page.getByRole('button', { name: 'Keep', exact: true }).click();
    await page.getByRole('button', { name: `Delete ${FIXTURE_ROUTE.name}` }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();

    await expect(page.getByText(`${FIXTURE_ROUTE.name} deleted.`)).toBeVisible();
    await expect(rideRow(page, FIXTURE_ROUTE.name)).toHaveCount(0);
    await expect(rideRow(page, ROLLING_ROUTE_NAME)).toHaveCount(1);

    // Storage, not the rendered list: leaving the screen and coming back re-reads both
    // repositories, so a ride that only vanished from React state would be back here.
    await nav(page, 'Routes').click();
    await nav(page, 'Rides').click();
    await expect(rideRow(page, ROLLING_ROUTE_NAME)).toHaveCount(1);
    await expect(rideRow(page, FIXTURE_ROUTE.name)).toHaveCount(0);

    // And from the summary of the survivor, which is where you decide a ride was a
    // mistake. Reached from the history, so it is a deletion and says so.
    await rideRow(page, ROLLING_ROUTE_NAME).click();
    await page.getByRole('button', { name: 'Delete ride' }).click();
    await expect(page.getByText("Sure? Can't be undone")).toBeVisible();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();

    // Back on the history, which is now empty.
    await expect(page.getByText('No rides match these filters')).toBeVisible();
    await expect(rideRow(page, ROLLING_ROUTE_NAME)).toHaveCount(0);
  });

  test('discards the ride just finished and goes back to the routes', async ({ page }) => {
    await openApp(page, { fake: 'constant', memoryStorage: true, seedRoutes: [FIXTURE_ROUTE] });
    await startRide(page, FIXTURE_ROUTE.name);
    await endRide(page);

    // The same operation, a different act: the rider was on this ride a moment ago, so it
    // asks rather than warns, and there is no mention of deleting a historic ride.
    await expect(page.getByRole('button', { name: 'Delete ride' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Discard ride' }).click();
    await expect(page.getByText('Discard?')).toBeVisible();
    await page.getByRole('button', { name: 'Discard', exact: true }).click();

    // Routes, not Rides: what the rider wants next is something to ride.
    await expect(nav(page, 'Routes')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('link', { name: FIXTURE_ROUTE.name })).toBeVisible();

    await nav(page, 'Rides').click();
    await expect(page.getByText('No rides match these filters')).toBeVisible();
  });
});
