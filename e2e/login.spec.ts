import { expect, test } from '@playwright/test';
import { openFreshInstall, ROLLING_ROUTE_NAME } from './support/app';

/**
 * The one spec that does not seed a session, because it is the press itself that is
 * under test. On IndexedDB rather than ?storage=memory: the whole claim is that the
 * session is a record on this install, and in-memory storage starts empty on every boot.
 */
test.describe('the login screen', () => {
  test('is shown on a fresh install, and not again once Start is pressed', async ({ page }) => {
    await openFreshInstall(page, { fake: 'constant' });

    // The lockup and one control. The fields are phase 5's, when there is something to
    // authenticate against — see src/ui/screens/Login.tsx.
    await expect(page.getByRole('img', { name: 'Contour' })).toBeVisible();
    await expect(page.locator('input')).toHaveCount(0);
    await expect(page.getByRole('link', { name: ROLLING_ROUTE_NAME })).toHaveCount(0);

    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByRole('link', { name: ROLLING_ROUTE_NAME })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('link', { name: ROLLING_ROUTE_NAME })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start' })).toHaveCount(0);
  });
});
