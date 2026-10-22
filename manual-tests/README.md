# Manual test material

Files you load into the running app by hand, to check it against something a bundled starter
would not exercise. They are not seeded and never appear in a rider's list: a workout that
exists to prove the app works is not a workout anyone wants in their library.

`docs/manual-test-plan.md` says when to reach for each one.

| File               | What it is for                                                                                                                                                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `format-test.yaml` | Fifteen minutes using every part of the workout format — the free block that releases ERG, a mixed-unit ramp, nested repeats, a cadence range and absolute watts. Section 5 of the test plan, and the only way to ride all of that against real hardware in one sitting. |

Paste one into **New workout** in the Workouts tab, save, ride. It is yours like anything else
you wrote, so delete it afterwards or keep it — nothing here is refreshed from the project.

## These are read by the suite too

`src/workout/format.test.ts` parses `format-test.yaml` and asserts it still uses every feature
of the grammar; `src/ui/charts/plan-chart.test.ts` reads it for a workout that declares its own
FTP. That is deliberate. Material only a person ever opens drifts out of date quietly, and the
cost of finding out is an evening on the turbo rather than a red suite. If you change a file
here, run `npm test`.

Unit-test fixtures are a different thing and live in `test/fixtures/` — small synthetic GPX with
answers you can compute by hand, never loaded by a person. ADR-0011 has the reasoning.
