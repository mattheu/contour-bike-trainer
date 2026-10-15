import { expect, test, type Page } from '@playwright/test';
import {
  FIXTURE_ROUTE,
  connectDevices,
  openApp,
  readElapsedSeconds,
  readNumber,
  startRide,
} from './support/app';

/** Where the rider dot sits on the elevation profile, in chart pixels. The 200 m fixture
 * is drawn across 944 px, so a second of riding moves it by about seventy. */
async function riderX(page: Page): Promise<number> {
  return Number(await page.getByTestId('profile-rider').getAttribute('cx'));
}

/** The rider dot on the map. The fixture runs due north, so riding moves it up the
 * screen and y falls. */
async function mapRiderY(page: Page): Promise<number> {
  return Number(await page.getByTestId('map-rider').getAttribute('cy'));
}

test.describe('riding a route', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page, { fake: 'constant', memoryStorage: true, seedRoutes: [FIXTURE_ROUTE] });
  });

  test('picks a route from the list, and the numbers and charts advance', async ({ page }) => {
    // The routes list is the cold start, so the bundled routes and the seeded fixture are
    // the first thing on screen, each with its own totals.
    await expect(page.getByRole('link', { name: 'Test Route 1 — Rolling' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Test Route 2 — Mixed' })).toBeVisible();
    const fixture = page.getByRole('link', { name: FIXTURE_ROUTE.name });
    await expect(fixture).toContainText('0.2');

    // The ride screen arrives armed, not running: charts drawn, clock at zero, and the
    // one accent control offering Start rather than Pause.
    await fixture.click();
    await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
    await expect(page.getByText(FIXTURE_ROUTE.name)).toBeVisible();
    expect(await readElapsedSeconds(page)).toBe(0);
    await expect(page.getByTestId('profile-rider')).toBeVisible();

    // The trainer is paired from the settings panel, on the ride screen, before Start.
    await connectDevices(page);
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();

    const startedAtX = await riderX(page);
    const startedAtMapY = await mapRiderY(page);
    expect(startedAtX).toBeLessThan(200);

    // The real route grade, not the difficulty-scaled one written to the trainer (ADR-0008).
    await expect
      .poll(() => readNumber(page, 'ride-gradient'), { timeout: 20_000 })
      .toBeLessThan(-3);

    // The clock, the distance and both charts all move.
    await expect
      .poll(() => readElapsedSeconds(page), { timeout: 20_000 })
      .toBeGreaterThanOrEqual(4);
    await expect.poll(() => riderX(page), { timeout: 20_000 }).toBeGreaterThan(startedAtX + 100);
    await expect.poll(() => mapRiderY(page), { timeout: 20_000 }).toBeLessThan(startedAtMapY);
    await expect
      .poll(() => readNumber(page, 'ride-distance'), { timeout: 25_000 })
      .toBeGreaterThan(0);

    // Speed is solved from power against that grade, so downhill it is well clear of the
    // 34 km/h the same 200 W buys on the flat.
    expect(await readNumber(page, 'ride-speed')).toBeGreaterThan(40);
  });

  test('pauses and resumes: the clock stops, and the distance does not jump', async ({ page }) => {
    await startRide(page, FIXTURE_ROUTE.name);
    await expect
      .poll(() => readElapsedSeconds(page), { timeout: 20_000 })
      .toBeGreaterThanOrEqual(2);

    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();

    const pausedAtS = await readElapsedSeconds(page);
    const pausedAtX = await riderX(page);

    // Four seconds of wall clock with nothing moving. A pause that keeps accumulating
    // distance is the failure this exists to catch.
    await page.waitForTimeout(4000);
    expect(await readElapsedSeconds(page)).toBe(pausedAtS);
    expect(await riderX(page)).toBe(pausedAtX);

    await page.getByRole('button', { name: 'Resume' }).click();
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();

    // Moving time, so the four paused seconds are not in it. One second of slack for the
    // tick that may land between the click and the read.
    expect(await readElapsedSeconds(page)).toBeLessThanOrEqual(pausedAtS + 1);

    await expect.poll(() => riderX(page), { timeout: 20_000 }).toBeGreaterThan(pausedAtX);
    await expect
      .poll(() => readElapsedSeconds(page), { timeout: 20_000 })
      .toBeGreaterThan(pausedAtS);
  });
});
