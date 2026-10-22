import { expect, test } from '@playwright/test';
import { RIDE_ROUTE_NAME, openApp, openFreshInstall } from './support/app';

/**
 * The one screen reachable before signing in, so this spec seeds no session either — the
 * claim is that a rider who has never pressed Start can read it and get back.
 */
test.describe('how it works', () => {
  test('is reached from the login screen and returns to it', async ({ page }) => {
    await openFreshInstall(page, { memoryStorage: true });

    await page.getByRole('link', { name: 'How it works' }).click();

    await expect(page).toHaveURL(/#\/how-it-works$/);
    await expect(page.getByRole('heading', { name: 'Set up' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ride', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'About' })).toBeVisible();

    await page.getByRole('link', { name: 'Back' }).click();
    await expect(page).toHaveURL(/#\/login$/);
    await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
  });

  /**
   * Opened cold rather than walked to, which is the case the signed-out gate in App.tsx
   * has to get right: a hash it does not recognise is corrected to the login screen, and
   * this one is not corrected at all.
   */
  test('can be opened directly on an install with no session', async ({ page }) => {
    await page.goto('/?storage=memory#/how-it-works');

    await expect(page.getByRole('heading', { name: 'Set up' })).toBeVisible();
    await expect(page).toHaveURL(/#\/how-it-works$/);

    // Everything pressable here navigates, so the screen is all links and no buttons.
    await expect(page.getByRole('link')).toHaveCount(2);
    await expect(page.getByRole('button')).toHaveCount(0);
  });

  /**
   * Signed in it is reference rather than a pitch: reached from the profile panel, with
   * nothing left to start. The panel has to close on the way, or it would sit over the
   * page the rider just asked to read.
   */
  test('is reachable from the profile panel once signed in', async ({ page }) => {
    await openApp(page, { memoryStorage: true });

    await page.getByRole('button', { name: 'Rider profile' }).click();
    const panel = page.getByRole('complementary', { name: 'Rider profile' });
    await expect(panel).toBeVisible();

    await panel.getByRole('button', { name: 'How it works' }).click();

    await expect(page).toHaveURL(/#\/how-it-works$/);
    await expect(page.getByRole('heading', { name: 'Set up' })).toBeVisible();
    await expect(panel).toHaveCount(0);
    // No Start: pressing it is how the rider got here in the first place.
    await expect(page.getByRole('link', { name: 'Start' })).toHaveCount(0);

    await page.getByRole('link', { name: 'Back' }).click();
    await expect(page.getByRole('link', { name: RIDE_ROUTE_NAME })).toBeVisible();
  });
});
