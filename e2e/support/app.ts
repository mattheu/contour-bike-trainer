import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, type Locator, type Page } from '@playwright/test';

/** The ?fake= scripts. Mirrors src/ble/fake-trainer.ts; no spec ever uses a real device. */
export type FakeScript = 'constant' | 'ramp' | 'intervals' | 'dropout';

/** A route handed to the app through the seed hook. Same shape as a manifest entry plus
 * its GPX, which is what src/ride/routes.ts registers. */
export interface SeedRoute {
  id: string;
  name: string;
  region?: string;
  description?: string;
  file: string;
  totalDistanceM: number;
  totalAscentM: number;
  gpx: string;
}

/**
 * The fixture a ride can actually be ridden to completion on: 200 m at a constant −4 %,
 * ridden at the fake's 200 W in about fifteen seconds. ADR-0011 — the bundled routes are
 * 20 and 30 km and exist to be ridden, fixtures exist to be finished inside a test.
 *
 * It is deliberately not in routes/manifest.json, so it never appears in a real session.
 */
export const FIXTURE_ROUTE: SeedRoute = {
  id: 'fixture-descent-200m',
  name: 'Fixture descent 200 m',
  region: 'Fixture',
  description: '200 m at a constant −4 %, for tests that ride a route to its end.',
  file: 'descent-4pct-200m.gpx',
  totalDistanceM: 200,
  totalAscentM: 0,
  gpx: readFileSync(
    fileURLToPath(new URL('../fixtures/descent-4pct-200m.gpx', import.meta.url)),
    'utf8',
  ),
};

/** A bundled route, for the specs that need one long enough not to end mid-test. */
export const RIDE_ROUTE_NAME = 'Rosedale Chimney';

/** A second one, for the specs that check the list has more than a single route on it. */
export const OTHER_ROUTE_NAME = 'Greenhow Hill';

export interface OpenOptions {
  fake?: FakeScript;
  /**
   * In-memory storage, which is also what unlocks the seed hook. Leave it off to get
   * IndexedDB — the only way to test that something survives a reload.
   */
  memoryStorage?: boolean;
  /** Ignored by the app unless memoryStorage is set. */
  seedRoutes?: SeedRoute[];
}

function appUrl({ fake, memoryStorage }: OpenOptions): string {
  const params = new URLSearchParams();
  if (fake !== undefined) params.set('fake', fake);
  if (memoryStorage === true) params.set('storage', 'memory');
  return `/?${params.toString()}`;
}

/** Matches SESSION_KEY in src/storage/session.ts. */
const SESSION_KEY = 'contour.session';

/**
 * A signed-in install, seeded like the routes are: every spec but login.spec.ts is about
 * what a rider does after that first press, and pressing Start in each of them would
 * test the same two clicks sixteen times.
 *
 * Two places because the session is stored wherever the install keeps it: localStorage
 * under IndexedDB, and in memory under ?storage=memory, where only the app's own seed
 * hook can reach it.
 */
async function seedSession(page: Page): Promise<void> {
  await page.addInitScript(
    ([key, session]) => {
      window.localStorage.setItem(key, session);
      const seeded = window as unknown as { __contourSeed?: Record<string, unknown> };
      seeded.__contourSeed = { ...seeded.__contourSeed, session: JSON.parse(session) };
    },
    [SESSION_KEY, JSON.stringify({ mode: 'guest', startedAt: new Date().toISOString() })] as const,
  );
}

/** Boots the app on the Routes list, which is now the cold start: pairing is reachable
 * from the rider profile panel here and from the ride settings panel once something is
 * chosen, so nothing has to happen before picking a route.
 * Seeded routes are installed before any app code runs, so the boot-time route seeding
 * picks them up. */
export async function openApp(page: Page, options: OpenOptions = {}): Promise<void> {
  await seedSession(page);
  if (options.seedRoutes !== undefined) {
    // Merged rather than assigned: the session was seeded into the same payload above.
    await page.addInitScript((routes) => {
      const seeded = window as unknown as { __contourSeed?: Record<string, unknown> };
      seeded.__contourSeed = { ...seeded.__contourSeed, routes };
    }, options.seedRoutes);
  }
  await page.goto(appUrl(options));
  await expect(page.getByRole('link', { name: RIDE_ROUTE_NAME })).toBeVisible();
}

/** The same app with no session seeded: what a rider sees the first time they open it. */
export async function openFreshInstall(page: Page, options: OpenOptions = {}): Promise<void> {
  await page.goto(appUrl(options));
  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
}

/** A device row inside the settings panel. */
export function deviceRow(panel: Locator, device: 'trainer' | 'heart-rate'): Locator {
  return panel.getByTestId(`device-${device}`);
}

/**
 * Not just "Connected": the reading is what proves data is flowing, not only that a
 * state machine moved.
 */
const READING = {
  trainer: /Connected · \d+ W/,
  'heart-rate': /Connected · \d+ bpm/,
} as const;

export async function pairDevice(panel: Locator, device: 'trainer' | 'heart-rate'): Promise<void> {
  const row = deviceRow(panel, device);
  await row.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(row).toContainText(READING[device]);
}

/** Picks a route and lands on the ride screen, armed and paused at 0:00. */
export async function openRoute(page: Page, routeName: string): Promise<void> {
  const row = page.getByRole('link', { name: routeName });
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
}

export interface ConnectOptions {
  /** The strap is optional, so only the specs that read heart rate pair it. */
  heartRate?: boolean;
}

/** Opens the settings panel, pairs what was asked for, and closes it again. */
export async function connectDevices(page: Page, options: ConnectOptions = {}): Promise<void> {
  const panel = await openRideSettings(page);
  await pairDevice(panel, 'trainer');
  if (options.heartRate === true) await pairDevice(panel, 'heart-rate');
  await closeRideSettings(page, panel);
}

/**
 * Routes list to a running ride on the named route. Choosing a route only arms the ride
 * — the rider pairs from the settings panel and presses Start once they are on the
 * bike — so this does all three.
 */
export async function startRide(
  page: Page,
  routeName: string,
  options: ConnectOptions = {},
): Promise<void> {
  await openRoute(page, routeName);
  await connectDevices(page, options);
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
}

export async function openRideSettings(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Settings' }).click();
  const panel = page.getByRole('complementary', { name: 'Settings' });
  await expect(panel).toBeVisible();
  return panel;
}

export async function closeRideSettings(page: Page, panel: Locator): Promise<void> {
  await panel.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(panel).toBeHidden();
}

/**
 * The profile panel over whichever list is open, reached from the header. It carries the
 * same device rows as the ride settings panel, so deviceRow and pairDevice work on it too.
 *
 * Exact, because role names otherwise match on substring: openRideSettings asks for
 * "Settings" and would happily take a panel named "Rider profile settings" one rename
 * from now. Both ends of the pair are pinned so neither can drift onto the other.
 */
export async function openRiderProfile(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Rider profile', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Rider profile', exact: true });
  await expect(panel).toBeVisible();
  return panel;
}

/**
 * The first number inside a Stat or Hero. The leading label is stripped because the two
 * share one element: "Distance0.1/0.2km" is what textContent gives back.
 *
 * NaN for an absent reading — the app renders an em dash before the first sample, and a
 * polled assertion should keep waiting for a number rather than blow up on the dash.
 */
export async function readNumber(page: Page, testId: string): Promise<number> {
  const text = (await page.getByTestId(testId).textContent()) ?? '';
  const match = text.replace(/^[A-Za-z ]+/, '').match(/-?\d+(\.\d+)?/);
  return match === null ? Number.NaN : Number(match[0]);
}

/** The elapsed clock, as seconds. Rendered m:ss under an hour, h:mm:ss over. */
export async function readElapsedSeconds(page: Page): Promise<number> {
  const text = (await page.getByTestId('ride-elapsed').textContent()) ?? '';
  const match = /(?:(\d+):)?(\d+):(\d\d)/.exec(text);
  if (match === null) return Number.NaN;
  const [, hours, minutes, seconds] = match;
  return Number(hours ?? 0) * 3600 + Number(minutes) * 60 + Number(seconds);
}

export interface TcxDownload {
  fileName: string;
  xml: string;
}

/** Clicks whatever downloads a TCX and hands back the file's name and contents. */
export async function downloadTcx(page: Page, trigger: Locator): Promise<TcxDownload> {
  const [download] = await Promise.all([page.waitForEvent('download'), trigger.click()]);
  const path = await download.path();
  return { fileName: download.suggestedFilename(), xml: readFileSync(path, 'utf8') };
}

export interface TcxShape {
  root: string;
  sport: string | null;
  laps: number;
  trackpoints: number;
  withPosition: number;
  withDistance: number;
  withWatts: number;
  firstDistanceM: number | null;
  lastDistanceM: number | null;
  notes: string | null;
}

/**
 * Well-formedness and shape in one pass, through the browser's own XML parser rather
 * than a regex: "it parses" is the claim Strava will make about the file, so it is the
 * claim worth asserting.
 */
export async function parseTcx(page: Page, xml: string): Promise<TcxShape> {
  return page.evaluate((source) => {
    const doc = new DOMParser().parseFromString(source, 'application/xml');
    const failure = doc.querySelector('parsererror');
    if (failure !== null) throw new Error(`TCX is not well-formed XML: ${failure.textContent}`);

    const distance = (element: Element | null): number | null => {
      const node = element?.querySelector('DistanceMeters');
      return node === null || node === undefined ? null : Number(node.textContent);
    };
    const points = [...doc.querySelectorAll('Track > Trackpoint')];

    return {
      root: doc.documentElement.nodeName,
      sport: doc.querySelector('Activity')?.getAttribute('Sport') ?? null,
      laps: doc.querySelectorAll('Lap').length,
      trackpoints: points.length,
      withPosition: points.filter((p) => p.querySelector('Position > LatitudeDegrees') !== null)
        .length,
      withDistance: points.filter((p) => p.querySelector('DistanceMeters') !== null).length,
      withWatts: points.filter((p) => p.getElementsByTagName('ns3:Watts').length > 0).length,
      firstDistanceM: distance(points.at(0) ?? null),
      lastDistanceM: distance(points.at(-1) ?? null),
      notes: doc.querySelector('Notes')?.textContent ?? null,
    };
  }, xml);
}

/** contour-YYYY-MM-DD-HHmm.tcx, in the rider's local time. */
export const TCX_FILE_NAME = /^contour-\d{4}-\d{2}-\d{2}-\d{4}\.tcx$/;
