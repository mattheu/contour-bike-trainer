# 0003. Bluetooth behind an interface, with a fake implementation

- **Status:** Accepted
- **Date:** 2026-09-30

## Context

The trainer and heart rate monitor speak Web Bluetooth, which has two properties that are fatal
to testing if the app talks to it directly.

Playwright cannot drive Web Bluetooth at all: there is no device to grant permission to and no
chooser to click. And a CI runner has no trainer paired to it, so any code path that assumes a
real device cannot run there. Even with hardware present, a real trainer produces different
numbers on every run, so an exported TCX could never be asserted against.

There is a day-to-day cost as well. Checking a layout change should not require being sat on the
bike in cycling shoes.

## Decision

All BLE access sits behind two interfaces in `src/ble/types.ts` — `Trainer` and
`HeartRateMonitor` — from phase 1, before anything is built on top of them.

- `FtmsTrainer` is the real Web Bluetooth implementation.
- The FTMS byte-level encode and decode lives in `ftms.ts` as **pure functions**, tested against
  captured byte fixtures, separate from the Web Bluetooth plumbing that calls it.
- `FakeTrainer` implements the same interface and emits a scripted power, cadence and speed
  series instead of talking Bluetooth. It is selected with `?fake=<script>` in the URL. Scripts:
  `constant` (steady 200 W), `ramp`, `intervals` (for the phase 3 workout runner), and `dropout`,
  which goes silent mid-ride then returns, exercising the 10-second grace period and reconnect
  handling without unplugging hardware.
- In ERG mode the fake moves its reported power toward the last target it was given rather than
  ignoring commands, so the workout runner has something realistic to work against.

Nothing else in the app knows which implementation it holds. The connection is created once at
startup and passed down through context.

## Consequences

- Integration tests exist at all, and produce byte-identical output on every run.
- The fake is a second implementation of a real protocol, and it will drift from the hardware's
  actual behaviour. It is a stand-in for the _interface_, not a simulator of the trainer: every
  test that passes against the fake still proves nothing about FTMS itself. That is what the
  byte-fixture tests on `ftms.ts` and the manual test plan are for.
- Anything the real trainer does that the interface does not express — an odd indication
  response, a refusal under sustained writes, drift over a long session — is invisible to the
  test suite by construction.
- `?fake=` is a real code path shipped in the production bundle. It is read-only and harmless,
  but it is there.
- Adding a capability means changing the interface and both implementations, which is friction
  by design: it keeps the surface small.
- If the trainer turns out not to speak FTMS, the damage is contained to one implementation —
  add `wahoo.ts` behind the same interface. That contingency is the main reason the seam is
  where it is.
