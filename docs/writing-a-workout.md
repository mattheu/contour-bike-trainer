# Writing a workout

A workout is a YAML file: a name, an optional warmup and cooldown, and a list of steps. It is
meant to be written by hand, and the app stores exactly the text you wrote — comments, blank
lines and all — so editing one gives you back your own file rather than a machine's idea of it.

The five workouts that ship with the app are the shortest way in. Open any of them in the
**Workouts** tab and read it alongside this page.

## The shape of a file

```yaml
name: 2x20 threshold
description: Two long blocks at threshold with five easy between.
ftp: 250

warmup: { duration: 10m, ramp: [50%, 75%] }

steps:
  - repeat: 2
    steps:
      - { duration: 20m, power: 95%, cadence: 90, name: Threshold }
      - { duration: 5m, power: 55%, name: Easy }
  - { duration: 3m, power: 65% }

cooldown: { duration: 10m, ramp: [60%, 40%] }
```

Only `name` and `steps` are required. Any other key at the top level is rejected rather than
ignored, because a key that is silently dropped is a workout that quietly does something else.

| Key           | What it is                                                                      |
| ------------- | ------------------------------------------------------------------------------- |
| `name`        | What the list and the ride screen call it.                                      |
| `description` | A line of prose. Shown on the row, never used for anything else.                |
| `ftp`         | Ride this workout against a fixed FTP instead of the one in your rider profile. |
| `warmup`      | One step, always ridden first whatever the file does.                           |
| `steps`       | The body: steps and repeat blocks, in order.                                    |
| `cooldown`    | One step, always ridden last.                                                   |

`warmup` and `cooldown` are ordinary steps that happen to have their own keys. They are written
the same way as anything in `steps` and are labelled **Warmup** and **Cooldown** without you
naming them.

## Steps

A step is a duration and a target.

```yaml
- { duration: 5m, power: 55%, name: Easy }
```

**Duration** is `90s`, `10m`, `1h30m` — hours, minutes and seconds in that order, any of them
left out. Up to four hours.

**Power** is one of three things, and a step holds exactly one of them:

- `power: 95%` — a percentage of FTP, resolved when you ride it.
- `power: 250W` — watts, fixed whatever your FTP says.
- `power: free` — no target at all. The trainer comes out of ERG for the length of the step and
  you push whatever you like. Use it for sprints and for openers.

**Ramp** replaces `power` when the target should move across the step:

```yaml
- { duration: 8m, ramp: [50%, 180W] }
```

The two ends may mix percentages and watts. `free` is not a ramp end — there is nothing to ramp
to or from.

**Cadence** is a target you are shown, never something written to the trainer. `cadence: 90` or
`cadence: [85, 95]`. Resistance does not change when you drift off it.

**Name** is what the Steps panel shows. Leave it out when the target already says everything
there is to say; a block called _Threshold_ earns its label, one called _95%_ does not.

The numeric ceilings are generous and exist to catch a typo rather than to express a view: four
hours a step, 300 % of FTP, 2,000 W, 200 rpm.

## Repeats

```yaml
- repeat: 3
  steps:
    - { duration: 3m, power: 115%, name: VO2 }
    - { duration: 3m, power: 50%, name: Recovery }
```

A repeat block holds its own steps, and those may themselves be repeats — a set of sets:

```yaml
- repeat: 2
  steps:
    - repeat: 2
      steps:
        - { duration: 1m, power: 100%, cadence: 95, name: Percent }
        - { duration: 1m, power: 150W, cadence: [85, 95], name: Watts }
    - { duration: 1m, ramp: [60%, 180W], name: Mixed ramp }
```

Repeats are flattened before you ride, so the block above is ten steps rather than the three
written — each one listed in the panel and counted in the header. A count runs from 1 to 100,
nesting is capped at ten deep, and the whole expansion at 1,000 steps — limits there to catch a
typo, not to express a view on training.

## What the numbers mean

**Length** is the sum of every expanded step.

**TSS** is Coggan's training stress score, computed from the workout's own target series:
one hour at FTP scores 100. It uses the workout's `ftp` if it has one and your profile's FTP
otherwise, so changing your FTP changes the TSS a percentage-based workout shows — which is the
point. A `free` block contributes nothing to the score while still occupying its time, because
there is no target to score.

**The sparkline** on each row is the target plotted against time. It is the fastest way to tell
a threshold session from an over-under at a glance. A `free` block leaves a gap rather than a
line along the floor, because no target is not the same as nought watts.

Two filters sit above the list, length and load. A workout that will not parse is exempt from
both — no filter can hide the one row you need to reach.

## Riding one

Pick a workout and it rides on its own, with no route — that is the default and always
available. The trainer is held in ERG at the step's target and changes itself as the steps
advance; you choose the gear and the cadence, the trainer handles the watts.

**ERG or manual.** By default the trainer holds the target and you choose the gear and the cadence.
Switch to **Manual** in the header and it stops holding: the targets are still shown, and hitting
them is down to your gears and legs on a flat road. Reach for it when ERG is fighting you — a
cadence that sags makes it push harder, which makes the cadence sag — or when you want to practise
pacing, which is a skill ERG does for you. You can switch either way mid-step.

Trainer difficulty does nothing in manual: there is no route gradient to scale, so the control
says so rather than sitting there inert. The ride records which way you rode it, because a session
the trainer held and one you held are not the same session.

Two more controls change a session in progress:

- **Intensity** scales every target, ramps included, in 5 % presses between 50 % and 150 %.
  Reach for it when the day is not going the way the plan assumed. A `free` step has no target,
  so intensity does nothing to it. The scale you finished on is recorded with the ride.
- **Skip step** moves to the next one. The step you left is shortened to what you actually rode,
  so the session's remaining time shrinks to match rather than pretending you rode it all.

On a `free` step ERG releases and the trainer goes back to simulating a gradient, so the step
feels like riding rather than pushing against a wall that will not move.

## When it does not parse

The editor validates on save and will not store a file it cannot read. Errors carry a line and a
column and name what is wrong at the point it is wrong — `step 3 has an unreadable duration:
write it as 90s, 10m or 1h30m` — rather than reporting failure at the top of the file.

An unknown key is an error, not a warning. `powre: 95%` would otherwise be a step with no target
that rode as something else entirely.

A workout already stored whose text no longer parses still appears in the list, showing its
error instead of its figures, and opens in the editor so you can fix it. Storing the source text
rather than a parsed tree is what makes that possible.

## Adding one

**New workout** opens the editor on a short, valid file. Save it and it joins the list. A
condensed format reference sits beside the text box, so you need this page for the detail
rather than for the basics.

The five that ship with the app cannot be changed or deleted. **View** opens one to read — the YAML
with its comments, beside the format reference — and **Duplicate** gives you a copy that is yours,
to edit and delete like anything you wrote. They are refreshed from the project on every launch, so
a correction to one reaches you.

That is the whole difference between a built-in workout and your own: you can read one and copy it,
but the original stays as it shipped.

**Download** on a row gives you that workout's YAML, exactly as you wrote it. Below the list,
**Download all workouts** gives you the whole library as one file, each workout separated by a
`---` line, with every comment and blank line intact — it is an ordinary YAML file you can read,
edit and keep. **Import workouts** reads a file of that shape back in.

Import always creates new workouts rather than replacing any you have, so importing the same file
twice gives you two copies. That is deliberate: nothing you have edited can be overwritten by an
import. A document that will not parse is skipped and counted, and the rest still arrive.
