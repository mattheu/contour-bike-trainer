import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { closeRideSettings, connectDevices, openApp, openRideSettings } from './support/app';

/**
 * The workout flow end to end: a plan written in the editor, ridden until it runs out,
 * and what the screen says while it is running that a route ride never has to say.
 *
 * Every test writes its own plan through New workout rather than riding a bundled one.
 * The starters are half an hour and up — openers is thirty-two minutes — and the seed
 * hook in src/ui/services.ts takes routes only, so the editor is the only way in. A plan
 * measured in seconds is to a workout what the 200 m fixture is to a route (ADR-0011),
 * and writing it is a path a rider takes anyway.
 */

/** Twelve seconds of plan, which is a session a test can sit through to its end. */
const SPRINT = `name: Spec sprint
description: Twelve seconds, so a test can ride it out.

steps:
  - { duration: 6s, power: 60%, name: Steady }
  - { duration: 6s, power: 70%, name: Harder }
`;

/** A target to hold, and then nothing: the free block is long enough that the session
 * cannot end underneath the assertions about it. */
const FREE_BLOCK = `name: Spec free block
description: A target, and then nothing to hold.

steps:
  - { duration: 4s, power: 60%, name: Steady }
  - { duration: 40s, power: free, name: Max effort }
`;

/** One long block, so a mode switch lands in the middle of a step rather than near its end. */
const ERG_BLOCK = `name: Spec erg
description: One long block, to switch modes inside.

steps:
  - { duration: 2m, power: 60%, name: Long block }
`;

/** A minute to skip out of, with half a minute behind it. */
const TWO_BLOCKS = `name: Spec skip
description: A long block, and something after it to land on.

steps:
  - { duration: 1m, power: 60%, name: Long block }
  - { duration: 30s, power: 70%, name: Short block }
`;

/** The plan the editor test breaks. Its line numbers are the point, so it is written out
 * in full rather than built from the others. */
const EDITABLE = `name: Spec editor
description: A plan a test breaks on purpose.

steps:
  - { duration: 5s, power: 60%, name: Steady }
  - { duration: 5s, power: 70%, name: Harder }
`;

/** The same plan with the duration taken off step 2, which is line 6. */
const BROKEN = EDITABLE.replace('  - { duration: 5s, power: 70%', '  - { power: 70%');

/** The workouts list, which is one nav click from the cold start. */
async function openWorkouts(page: Page): Promise<void> {
  await openApp(page, { fake: 'constant', memoryStorage: true });
  await page.getByRole('button', { name: 'Workouts' }).click();
  // The bundled starters are seeded on boot, so the list is never the empty state here.
  await expect(page.getByRole('link', { name: 'Thirty by thirty' })).toBeVisible();
}

/** The textarea, which the editor labels as the workout itself. */
function source(page: Page): Locator {
  return page.getByLabel('Workout', { exact: true });
}

/**
 * New workout, the given plan typed over the starting template, saved. Ends back on the
 * list with the row in it — named by the YAML, which is where a workout's name lives.
 */
async function authorWorkout(page: Page, plan: string, name: string): Promise<void> {
  await page.getByRole('button', { name: 'New workout' }).click();
  await expect(source(page)).toBeVisible();
  await source(page).fill(plan);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(`${name} saved.`)).toBeVisible();

  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('link', { name })).toBeVisible();
}

/** The row itself, which is the Ride control as it is on the routes list: it arms the
 * session on the workout screen at 0:00. */
async function openWorkout(page: Page, name: string): Promise<void> {
  await page.getByRole('link', { name }).click();
  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
}

/** List to a running workout: choose it, pair from the settings panel, press Start. */
async function startWorkout(page: Page, name: string): Promise<void> {
  await openWorkout(page, name);
  await connectDevices(page);
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
}

/**
 * The workout clock's two halves, as seconds. The total is time ridden plus the plan that
 * remains, so a skip shrinks it — which is the claim the skip test makes.
 */
async function readWorkoutClock(page: Page): Promise<{ elapsedS: number; totalS: number }> {
  const text = (await page.getByTestId('workout-clock').textContent()) ?? '';
  const figures = [...text.matchAll(/(?:(\d+):)?(\d+):(\d\d)/g)].map(
    ([, hours, minutes, seconds]) =>
      Number(hours ?? 0) * 3600 + Number(minutes) * 60 + Number(seconds),
  );
  return { elapsedS: figures[0] ?? Number.NaN, totalS: figures[1] ?? Number.NaN };
}

/** The step the panel marks as current, which is where the plan has got to. */
function currentStep(page: Page): Locator {
  return page.getByTestId('workout-steps').locator('[aria-current="step"]');
}

test.describe('riding a workout', () => {
  test('rides a plan to its end, which saves the ride and opens its summary', async ({ page }) => {
    await openWorkouts(page);
    await authorWorkout(page, SPRINT, 'Spec sprint');
    await startWorkout(page, 'Spec sprint');

    // The plan as the screen states it: both steps listed, the first of them current, and
    // the session's name over the top of it.
    await expect(page.getByText('Spec sprint')).toBeVisible();
    await expect(page.getByTestId('workout-steps-heading')).toContainText('2 · ');
    await expect(currentStep(page)).toContainText('Steady');

    // Nobody presses End: twelve seconds of plan runs out and the summary arrives on its
    // own, exactly as a route that reaches its finish line does.
    await expect(page.getByRole('button', { name: 'Download TCX' })).toBeVisible({
      timeout: 45_000,
    });
    await expect(page.getByText('ended early')).toHaveCount(0);
    await expect(page.getByTestId('summary-time')).toContainText(/0:1\d/);

    // The plan names the session: a workout ridden without a route is not a free ride, and
    // the summary titles it from the ride record's workoutName.
    await expect(page.getByText('Spec sprint')).toBeVisible();
    await expect(page.getByText('Free ride')).toHaveCount(0);

    // In storage rather than only on screen: the history is read back from the repository.
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('link', { name: 'Spec sprint' })).toHaveCount(1);
  });

  test('releases ERG on a free step and says so where the rider can see it', async ({ page }) => {
    await openWorkouts(page);
    await authorWorkout(page, FREE_BLOCK, 'Spec free block');
    await openWorkout(page, 'Spec free block');

    // Armed on a step with a target: ERG is holding it, and the hero says what it is.
    await expect(page.getByTestId('workout-erg')).toContainText('engaged');
    await expect(page.getByTestId('workout-power')).toContainText(/target \d+ % FTP/);

    await connectDevices(page);
    await page.getByRole('button', { name: 'Start' }).click();

    // Four seconds in, the plan runs out of targets. This is the one thing a workout does
    // that a route ride cannot: the trainer stops pushing back, and the two places that
    // say so are the indicator and the hero that no longer has a number beside it.
    await expect(currentStep(page)).toContainText('Max effort', { timeout: 20_000 });
    await expect(page.getByTestId('workout-erg')).toContainText('released');
    await expect(page.getByTestId('workout-power')).toContainText('no target');
  });

  test('turns ERG off mid-step and back on, with the targets left where they were', async ({
    page,
  }) => {
    await openWorkouts(page);
    await authorWorkout(page, ERG_BLOCK, 'Spec erg');
    await startWorkout(page, 'Spec erg');

    const mode = page.getByRole('group', { name: 'Trainer control' });
    const target = page.getByTestId('workout-power');

    // ERG on is the default, and the trainer is holding the step's target.
    await expect(mode.getByRole('button', { name: 'ERG' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('workout-erg')).toContainText('engaged');
    await expect(target).toContainText(/target \d+ % FTP/);

    // Off, in the middle of a minute-long block: the trainer stops being held at once
    // rather than at the next step, and the target it is no longer holding is still shown.
    await mode.getByRole('button', { name: 'Manual' }).click();
    await expect(page.getByTestId('workout-erg')).toContainText('released');
    await expect(target).toContainText(/target \d+ % FTP/);
    await expect(currentStep(page)).toContainText('Long block');

    // The slider that is not the resistance says so rather than sitting there dead.
    const panel = await openRideSettings(page);
    await expect(panel.getByLabel('Trainer difficulty')).toBeDisabled();
    await expect(panel.getByText('No effect with ERG off')).toBeVisible();
    await closeRideSettings(page, panel);

    // ...and back on, still mid-step: the trainer takes the target again.
    await mode.getByRole('button', { name: 'ERG' }).click();
    await expect(page.getByTestId('workout-erg')).toContainText('engaged');
    await expect(currentStep(page)).toContainText('Long block');
  });

  test('skips a step: the next one starts, and the session gets shorter', async ({ page }) => {
    await openWorkouts(page);
    await authorWorkout(page, TWO_BLOCKS, 'Spec skip');
    await startWorkout(page, 'Spec skip');

    // A minute and a half of plan, as written, with the long block running.
    expect((await readWorkoutClock(page)).totalS).toBe(90);
    await expect(currentStep(page)).toContainText('Long block');

    await expect
      .poll(async () => (await readWorkoutClock(page)).elapsedS, { timeout: 20_000 })
      .toBeGreaterThanOrEqual(2);
    await page.getByRole('button', { name: 'Skip step' }).click();

    // A skip truncates the step to what was actually ridden, so the session is now those
    // few seconds plus the thirty still to come — not the ninety it was written as.
    await expect(currentStep(page)).toContainText('Short block');
    await expect
      .poll(async () => (await readWorkoutClock(page)).totalS, { timeout: 20_000 })
      .toBeLessThan(45);
  });

  test('names the line a broken plan fails on, and saves once it is fixed', async ({ page }) => {
    await openWorkouts(page);
    await authorWorkout(page, EDITABLE, 'Spec editor');

    // Edit opens its YAML, and it is the text that was written rather than a tree printed
    // back out: the comments and the layout a rider chose survive the trip.
    await page
      .getByRole('group', { name: 'Spec editor actions' })
      .getByRole('button', { name: 'Edit', exact: true })
      .click();
    await expect(source(page)).toHaveValue(EDITABLE);

    await source(page).fill(BROKEN);
    await page.getByRole('button', { name: 'Save' }).click();

    // Line 6 is the step the duration came off. The position is as much of the answer as
    // the message — in a textarea there is nothing else to point with — so the failure
    // carries the line, the column and the rider's own line to show them against.
    const failure = page.getByRole('alert');
    await expect(failure).toContainText('step 2 has no duration');
    await expect(failure).toContainText(/Line 6, column \d+/);
    await expect(failure).toContainText('power: 70%');
    await expect(page.getByText('Spec editor saved.')).toHaveCount(0);

    // Fixed and saved, which is the way out: the error goes and the save is confirmed.
    await source(page).fill(EDITABLE);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Spec editor saved.')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
});

/**
 * A starter, and the file the build bundles it from. A starter is read by riders who are
 * learning the format, so what the editor shows has to be this text, comments and all,
 * rather than a tidied tree re-emitted from the parse (ADR-0014).
 */
const STARTER_NAME = 'Thirty by thirty';
const STARTER_SOURCE = readFileSync(
  fileURLToPath(new URL('../workouts/30-30s.yaml', import.meta.url)),
  'utf8',
);

/** What the rider writes over a copy of the starter, which is the point of taking one. */
const COPY = `name: Spec copy
description: A starter taken as a starting point.

steps:
  - { duration: 6s, power: 60%, name: Steady }
`;

/** A row's controls, by the group the row labels with its own name. Rows are located this
 * way rather than by link, because a copy's name contains the original's. */
function actions(page: Page, name: string): Locator {
  return page.getByRole('group', { name: `${name} actions` });
}

test.describe('a workout that came with the app', () => {
  test('opens to be read, with no way to change it', async ({ page }) => {
    await openWorkouts(page);

    // View, not Edit: the control says what pressing it does.
    await expect(actions(page, STARTER_NAME).getByRole('button', { name: 'Edit' })).toHaveCount(0);
    await actions(page, STARTER_NAME).getByRole('button', { name: 'View' }).click();

    // The bundled file itself, byte for byte. Its comments are what a rider reads it for.
    await expect(source(page)).toHaveValue(STARTER_SOURCE);
    await expect(source(page)).not.toBeEditable();

    // Absent rather than disabled, and one line saying what this workout is.
    await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(0);
    await expect(page.getByText('came with the app')).toBeVisible();

    // The format reference is still beside it: reading one against the other is the job.
    await expect(page.getByRole('heading', { name: 'Format', exact: true })).toBeVisible();
  });

  test("is a starting point: a copy is the rider's own, and the original is untouched", async ({
    page,
  }) => {
    await openWorkouts(page);
    await actions(page, STARTER_NAME).getByRole('button', { name: 'Duplicate' }).click();

    // The editor opens on the copy, which is a workout like any other the rider wrote:
    // the same YAML under a name of its own, and a box that takes typing.
    await expect(source(page)).toHaveValue(
      STARTER_SOURCE.replace('name: Thirty by thirty', 'name: Thirty by thirty copy'),
    );
    await expect(source(page)).toBeEditable();

    await source(page).fill(COPY);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Spec copy saved.')).toBeVisible();
    await page.getByRole('button', { name: 'Done' }).click();

    // Two rows: the rider's, which can be deleted, and the starter, which cannot.
    await expect(actions(page, 'Spec copy').getByRole('button', { name: 'Edit' })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Delete Spec copy' })).toHaveCount(1);
    await expect(page.getByRole('button', { name: `Delete ${STARTER_NAME}` })).toHaveCount(0);

    // The original is exactly as it was: a copy is a copy, not a move.
    await actions(page, STARTER_NAME).getByRole('button', { name: 'View' }).click();
    await expect(source(page)).toHaveValue(STARTER_SOURCE);
  });
});
