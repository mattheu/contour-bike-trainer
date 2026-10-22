import { expect, test, type Page } from '@playwright/test';
import { RIDE_ROUTE_NAME, openApp, openRoute, readElapsedSeconds, startRide } from './support/app';

/**
 * The routing itself (ADR-0018), which is the one thing the rest of the suite cannot
 * cover: every other spec navigates by clicking and will go on doing so, because a suite
 * built on deep links passes over a broken path to the screen.
 *
 * So these tests do the opposite of the others on purpose — they read the bar, reload it,
 * and press back — and they are the only ones that open a URL the rider could not have
 * clicked their way to.
 */

/** The app on memory storage, which is what the other specs boot and the fastest way in. */
const COLD = '/?fake=constant&storage=memory';

function nav(page: Page, section: 'Routes' | 'Workouts' | 'Rides') {
  return page.getByRole('group', { name: 'Section' }).getByRole('button', { name: section });
}

/** The ridden route's name as its label: a slug of the name, never an id. */
const RIDE_LABEL = '#/ride?route=rosedale-chimney';

test.describe('the hash', () => {
  test('names each list, survives a reload, and goes back and forward between them', async ({
    page,
  }) => {
    await openApp(page, { fake: 'constant', memoryStorage: true });
    // The cold start has no hash at all; the app writes the one it is actually showing.
    await expect(page).toHaveURL(/#\/routes$/);

    await nav(page, 'Workouts').click();
    await expect(page).toHaveURL(/#\/workouts$/);
    await nav(page, 'Rides').click();
    await expect(page).toHaveURL(/#\/rides$/);

    // Where a reload lands is the whole point of putting it in the bar.
    await page.reload();
    await expect(page).toHaveURL(/#\/rides$/);
    await expect(nav(page, 'Rides')).toHaveAttribute('aria-pressed', 'true');

    await page.goBack();
    await expect(page).toHaveURL(/#\/workouts$/);
    await expect(nav(page, 'Workouts')).toHaveAttribute('aria-pressed', 'true');

    await page.goBack();
    await expect(page).toHaveURL(/#\/routes$/);
    await expect(page.getByRole('link', { name: RIDE_ROUTE_NAME })).toBeVisible();

    await page.goForward();
    await expect(page).toHaveURL(/#\/workouts$/);
    await expect(nav(page, 'Workouts')).toHaveAttribute('aria-pressed', 'true');
  });

  test('opens the editor at the workout it is editing, and reopens it on a reload', async ({
    page,
  }) => {
    await openApp(page, { fake: 'constant', memoryStorage: true });
    await nav(page, 'Workouts').click();

    // A starter's id is declared by the manifest rather than minted, so it is the same
    // record after a reload — and a UUID in the bar would be just as correct here.
    await page
      .getByRole('group', { name: 'Thirty by thirty actions' })
      .getByRole('button', { name: 'View' })
      .click();
    await expect(page).toHaveURL(/#\/workouts\/30-30s$/);
    const done = page.getByRole('button', { name: 'Done' });
    await expect(done).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL(/#\/workouts\/30-30s$/);
    await expect(done).toBeVisible();

    await done.click();
    await expect(page).toHaveURL(/#\/workouts$/);
  });

  test('sends a hash it has no screen for to the routes list, and says so in the bar', async ({
    page,
  }) => {
    await openApp(page, { fake: 'constant', memoryStorage: true });

    // Typed into the bar rather than loaded: the correction has to happen in a running
    // app, not only at boot.
    await page.evaluate(() => {
      window.location.hash = '#/nonsense';
    });
    await expect(page).toHaveURL(/#\/routes$/);
    await expect(page.getByRole('link', { name: RIDE_ROUTE_NAME })).toBeVisible();

    // And cold, which is the bookmark someone saved from a build that had such a screen.
    await page.goto(`${COLD}#/workouts/does-not-exist`);
    await expect(page).toHaveURL(/#\/workouts$/);
    await expect(nav(page, 'Workouts')).toHaveAttribute('aria-pressed', 'true');
  });

  test('redirects /ride entered cold, whatever its label claims', async ({ page }) => {
    await openApp(page, { fake: 'constant', memoryStorage: true });

    // There is no engine behind this URL: a bookmark, or a reload after the ride ended.
    // Nothing resolves the label, so nothing starts.
    await page.goto(`${COLD}#/ride?route=greenhow-hill`);
    await expect(page).toHaveURL(/#\/routes$/);
    await expect(page.getByRole('link', { name: RIDE_ROUTE_NAME })).toBeVisible();
  });

  test('labels a ride with what it is, and reloading it does not restart it', async ({ page }) => {
    await openApp(page, { fake: 'constant', memoryStorage: true });
    await openRoute(page, RIDE_ROUTE_NAME);
    await expect(page).toHaveURL(new RegExp(`${RIDE_LABEL.replace('?', '\\?')}$`));

    // The ride is armed, not running, so there is nothing to lose and nothing to confirm.
    // What comes back is the routes list, not a ride restarted from zero.
    await page.reload();
    await expect(page).toHaveURL(/#\/routes$/);
    await expect(page.getByRole('link', { name: RIDE_ROUTE_NAME })).toBeVisible();
  });
});

/**
 * The second guard. `beforeunload` covers reload and tab close; nothing in the browser
 * asks about in-app back, so the app does.
 */
test.describe('back out of a ride', () => {
  /** A ride with samples in it, which is what makes it worth asking about. */
  async function rideUnderway(page: Page): Promise<void> {
    await openApp(page, { fake: 'constant', memoryStorage: true });
    await startRide(page, RIDE_ROUTE_NAME);
    // rideAtRisk is false until the recorder has taken a sample: a dialog over nothing
    // teaches the rider to dismiss it.
    await expect.poll(() => readElapsedSeconds(page)).toBeGreaterThanOrEqual(2);
  }

  test('asks, and stays put when the rider cancels', async ({ page }) => {
    const asked: string[] = [];
    page.on('dialog', (dialog) => {
      asked.push(dialog.message());
      void dialog.dismiss();
    });

    await rideUnderway(page);
    await page.evaluate(() => {
      window.history.back();
    });

    await expect.poll(() => asked.length).toBe(1);
    expect(asked[0]).toContain('Leave this ride?');
    // Where they were: the ride's own URL, pushed back on, and the ride still running.
    await expect(page).toHaveURL(new RegExp(`${RIDE_LABEL.replace('?', '\\?')}$`));
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  });

  test('leaves when the rider means it', async ({ page }) => {
    page.on('dialog', (dialog) => void dialog.accept());

    await rideUnderway(page);
    await page.evaluate(() => {
      window.history.back();
    });

    await expect(page).toHaveURL(/#\/routes$/);
    await expect(page.getByRole('link', { name: RIDE_ROUTE_NAME })).toBeVisible();
  });
});
