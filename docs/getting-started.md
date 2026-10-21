# Getting started

## What you need

- **A Wahoo smart trainer**, or any trainer that speaks FTMS — the standard fitness machine
  Bluetooth service. Modern KICKR, CORE and SNAP all do.
- **Google Chrome on a Mac or PC.** Not Safari, not an iPad, not a phone. The app talks to the
  trainer through Web Bluetooth, which only exists in Chrome and Chromium browsers and has never
  existed on iOS. This is a hard limit of the browser, not a gap in the app.
- **A heart rate strap**, optionally. Everything works without one.

Plug the laptop in. Bluetooth plus a screen that has to stay awake for an hour will drain a
battery, and some laptops throttle the browser when they are running on it.

## Opening the app

Start it as described in the project [README](../README.md) and open the address it prints in
Chrome. Nothing is installed and nothing is uploaded anywhere: your routes, your rides and your
settings all live in the browser on this machine.

## Pairing the trainer

The first screen is **Connect**, with a row for the trainer and a row for the heart rate strap.

1. Wake the trainer up — spin the cranks a turn or two. A sleeping trainer does not advertise
   itself and will not appear in the list.
2. **Close anything else that talks to it.** The Wahoo app on a phone in the same room will hold
   the connection, and the pairing here will fail with nothing useful to say. Bluetooth trainers
   generally accept one connection at a time.
3. Press **Connect** on the Trainer row. Chrome shows its own device chooser — this is the
   browser's, not the app's, which is why it looks different from everything else on screen.
4. Pick your trainer and confirm.

The row moves through _Connecting_ to _Connected_ and then starts showing live watts. That
reading is the thing to watch: _Connected_ with no number means the link is up but no data is
coming, which usually means the trainer went back to sleep.

Underneath, the row also lists the Bluetooth services the trainer actually reported. If it says
**No Fitness Machine Service**, the trainer does not speak FTMS and Contour cannot control it.

## Pairing a heart rate strap

Same again on the Heart rate row. Damp the electrodes first — a dry strap either will not appear
or will read nonsense for the first few minutes.

Heart rate is optional. If the strap drops out mid-ride the ride carries on; only the trainer
dropping out pauses anything.

## Then what

Once the trainer is connected, **Choose a route** lights up. That is the only control on this
screen that does anything else, and it takes you to [riding a route](riding-a-route.md).

## If it will not connect

- **The chooser is empty.** The trainer is asleep, out of range, or already connected to
  something else. Spin the cranks, and quit the Wahoo app on your phone.
- **It connects and then drops.** Usually another device grabbing it. Occasionally it is the
  trainer's own firmware; power-cycle it at the wall.
- **Chrome never shows a chooser.** You are not on Chrome, or the page is not served over
  `https://` or `localhost`. Web Bluetooth refuses to run anywhere else.
- **Connected, but no watts.** Pedal. Most trainers report nothing at all until the wheel moves.
