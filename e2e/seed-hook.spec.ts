import { expect, test } from '@playwright/test';
import { FIXTURE_ROUTE, RIDE_ROUTE_NAME, openApp } from './support/app';

/**
 * The seeding hook in src/ui/services.ts is the one concession the app makes to this
 * suite, and it is gated on ?storage=memory so it cannot reach a database with real
 * rides in it. A gate nobody tests is a gate that quietly stops working, so this is the
 * test for the gate rather than for anything a rider does.
 */
test.describe('the seed hook', () => {
  test('is ignored without ?storage=memory, whatever is on window', async ({ page }) => {
    // Same payload as every other spec, but against IndexedDB.
    await openApp(page, { fake: 'constant', seedRoutes: [FIXTURE_ROUTE] });

    await expect(page.getByRole('link', { name: RIDE_ROUTE_NAME })).toBeVisible();
    await expect(page.getByRole('link', { name: FIXTURE_ROUTE.name })).toHaveCount(0);
  });
});
