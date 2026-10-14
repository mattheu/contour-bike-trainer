import { defineConfig, devices } from '@playwright/test';

// Not vite's default 4173: a stale preview, or anything else already on the port,
// would be silently tested instead of this build.
const PORT = 4319;
// localhost, not 127.0.0.1: vite preview binds to ::1 and nothing answers on the v4 loopback.
const BASE_URL = `http://localhost:${PORT}`;

/**
 * Integration tests, run against the production build.
 *
 * Chromium only, and not as a default: Web Bluetooth is Chromium-only and SPEC.md makes
 * Chrome on desktop a hard platform constraint, so a Firefox or WebKit run would be
 * testing a browser the app cannot ship on.
 *
 * Every spec drives the app through ?fake= and, where it needs to seed, ?storage=memory.
 * Nothing here touches Bluetooth — Playwright cannot drive it, which is the whole reason
 * FakeTrainer exists (ADR-0003). What is left over is docs/manual-test-plan.md.
 */
export default defineConfig({
  testDir: './e2e',

  // Determinism is the point of this suite, so a retry would paper over exactly the
  // thing it exists to catch. A flake is a bug in the test or in the app, not noise.
  retries: 0,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  workers: process.env.CI ? 2 : undefined,

  // A ride to completion is around fifteen seconds of wall clock, and the dropout spec
  // waits out the fake's 30 s silence and the engine's 10 s grace period on top.
  timeout: 120_000,
  expect: { timeout: 15_000 },

  /**
   * Under coverage/ because it is already ignored by both .gitignore and .prettierignore.
   * Playwright's default playwright-report/ and test-results/ are ignored by neither, so
   * a local run would leave untracked files and a generated HTML report that
   * `prettier --check .` then fails on.
   */
  outputDir: 'coverage/playwright/results',
  reporter: [['list'], ['html', { outputFolder: 'coverage/playwright/report', open: 'never' }]],

  use: {
    baseURL: BASE_URL,
    // On failure only: a trace of a passing run is megabytes nobody reads, and a red
    // Playwright job with no trace is close to useless.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],

  // The built app rather than the dev server: it is what CI builds and what a rider
  // runs, and it takes the module graph and HMR out of the timing.
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    // Never reused, locally or in CI. Reusing whatever answers on the port is how a run
    // goes green against an application that is not this one.
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
