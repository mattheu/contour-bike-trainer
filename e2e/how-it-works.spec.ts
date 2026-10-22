import { expect, test } from '@playwright/test';
import { openFreshInstall } from './support/app';

/**
 * The one screen reachable before signing in, so this spec seeds no session either — the
 * claim is that a rider who has never pressed Start can read it and get back.
 */
test.describe('how it works', () => {
  test('is reached from the login screen and returns to it', async ({ page }) => {
    await openFreshInstall(page, { memoryStorage: true });

    await page.getByRole('link', { name: 'How it works' }).click();

    await expect(page).toHaveURL(/#\/how-it-works$/);
    await expect(page.getByRole('heading', { name: 'What you need' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Connect' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ride', exact: true })).toBeVisible();

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

    await expect(page.getByRole('heading', { name: 'What you need' })).toBeVisible();
    await expect(page).toHaveURL(/#\/how-it-works$/);

    // The previews are pictures of the ride screen, not a second copy of it: nothing in
    // them is reachable by keyboard or announced, so the screen offers three links.
    await expect(page.getByRole('button')).toHaveCount(0);
  });
});
