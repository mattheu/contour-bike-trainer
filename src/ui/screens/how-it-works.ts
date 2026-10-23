/**
 * What the How it works screen says, separated from how it draws it.
 *
 * Here rather than inline in the JSX because the copy is the screen: three columns of it,
 * read once by someone who has not signed in yet, and a wording change should be a diff
 * in a list of strings rather than one threaded through layout.
 *
 * The pictures live in public/how-it-works/ and are named here beside the words they
 * belong to, so this file stays free of React and the copy can be read and checked
 * without one. They are named for what they show rather than for the column they sit in,
 * because the columns have moved once already.
 *
 * All three are pictograms in the same hand: a drawing of a screen reads as what the
 * screen is for, where a photograph of one reads as a photograph. Each shows the thing
 * its column is about — the whole rig for About, a session for Ride, and the panel that
 * pairs for Set up, which is the one the connect steps beside it describe.
 */

export interface ColumnImage {
  /** Served from public/, drawn at 2:1 across the full width of the column. */
  src: string;
  /** Short: the sentences beside the picture already carry what it is for. */
  alt: string;
}

/**
 * A label and what sits under it: one sentence, or numbered steps where the order is the
 * point. A union rather than two optional fields, so an entry cannot be written with both
 * and silently drop one.
 */
export type ColumnEntry = { label: string; sentence: string } | { label: string; steps: string[] };

export interface Column {
  title: string;
  image: ColumnImage;
  entries: ColumnEntry[];
}

/**
 * Three columns, in the order a stranger meets them: what the app is, what there is to
 * ride, and what it takes to set up.
 *
 * About leads because nobody checks whether their trainer is compatible with something
 * they have not been told about yet. Read down, the three are a decision rather than a
 * procedure — is this for me, what would I do with it, what do I need — which is also
 * why the numbers beside them are derived from position in the row and not written here.
 * They mark order on the page, not steps to take.
 *
 * Set up is kit and pairing together rather than two columns. They are one errand — kit
 * you either own or do not, and the two minutes of pairing that follow — and splitting
 * them put a numbered 1-2-3 beside a kit list, which reads as six steps when there are
 * three things to own and one thing to do.
 */
export const COLUMNS: Column[] = [
  {
    title: 'About',
    image: {
      src: '/how-it-works/trainer-and-browser.webp',
      alt: 'A bike on a smart trainer, sending its numbers to a laptop.',
    },
    entries: [
      {
        /*
         * "Indoor cycling app" rather than a competitor's name, and rather than "bike
         * trainer app", which is neither. It is what SPEC.md, the README and DESIGN.md
         * all call this. What it does leads and the nos follow, so the first thing a
         * reader gets is the thing they would come for rather than a list of what is
         * missing — and the nos name no one: a screen that defines itself against a
         * rival ages the day the rival changes.
         *
         * "Real-world routes" is the same phrase the Routes entry opens with, and the
         * nos pay it off: no virtual world is the one a reader would otherwise wonder
         * about.
         */
        label: 'Why it exists',
        sentence:
          'A simple indoor cycling app for real-world routes and structured workouts. No subscription, no virtual world, no chat.',
      },
      {
        /*
         * Three steps in one line, which is what a reader at this point wants: what do
         * I do. Accounts and a phone mirror are both on the roadmap, and this claims
         * neither — a signed-out screen that sells an unbuilt feature is how onboarding
         * starts lying.
         *
         * Chrome alone here, where Set up says "Chrome or Edge". The shorter claim is
         * for someone deciding whether to read on; the exact one belongs beside the
         * other requirements.
         */
        label: 'In the browser',
        sentence:
          'Open Contour in Chrome, connect your trainer and start riding. No installation or account needed.',
      },
      {
        /*
         * The default storage tier is best-effort: no time limit on it, and in practice
         * the data goes when the rider clears site data. It can also be evicted when the
         * disk is nearly full — true, rare, and more words than a column can carry, so
         * docs/getting-started.md is where that belongs.
         *
         * "Into another browser" is the honest reach of the exports that exist: rides as
         * an archive, routes as GPX, workouts as YAML. A single backup of everything is
         * specified but not built.
         */
        label: 'Your data',
        sentence:
          'Your rides, routes and workouts stay in this browser until you clear its site data. Export them to keep a backup or import them into another browser.',
      },
    ],
  },
  {
    title: 'Ride',
    image: {
      src: '/how-it-works/workout-ride.webp',
      alt: 'A workout in progress: the interval plan above the list of steps.',
    },
    entries: [
      {
        /*
         * Import rather than upload: the file never leaves the machine, and "Import
         * routes" is what the button a rider will go looking for actually says. One GPX can
         * carry several routes and the importer reads them all — see routes-import.ts —
         * which is why the plural is honest here.
         */
        label: 'Routes',
        sentence:
          'Choose a real-world route and start riding. Your trainer simulates the gradient. Import GPX files to ride roads you know.',
      },
      {
        /*
         * Three claims, all checked: targets carry a unit of ftpPercent or watts
         * (workout/types.ts), ERG is a control the rider can switch off mid-step
         * (Workout.tsx > ErgControl, and e2e/workout.spec.ts drives it), and New workout
         * is the Workouts screen's accent control. "Create your own" stops short of naming YAML.
         * ADR-0006 chose it and docs/writing-a-workout.md explains it, so the format is
         * met on the way in rather than on a page read before signing in.
         */
        label: 'Workouts',
        sentence:
          'Train with power targets based on your FTP, or build your own sessions. Let ERG hold the target or control your effort yourself.',
      },
      {
        /*
         * A ride saves itself when it ends, whether the rider pressed End or the route
         * ran out — see savedRideId in ui/store.ts. TCX rather than "export to Strava",
         * because Contour does not talk to Strava: you get a file and upload it, which
         * is what docs/exporting-to-strava.md walks through.
         */
        label: 'Rides',
        sentence: 'Save your rides, browse your history and export TCX files to upload to Strava.',
      },
      {
        /*
         * Last in the column rather than beside Routes, because it is the one entry that
         * needs what the entry above it just established: there is nothing to race until
         * a ride has been saved. It also leaves the column ending on the reason to come
         * back rather than on a file format.
         *
         * The first sentence is the author's own. Two drafts before it missed: one
         * named all three slots and ran to forty words, the next sold the feature and
         * read as copy written from the docs.
         *
         * One sentence, and the shortest entry in the column. Lap-relative racing on a
         * loop is the part a rider would not guess, but the place to meet it is the
         * ride screen rather than a page read before signing in.
         */
        label: 'Ghosts',
        sentence: 'Race against ghosts of your previous rides and see how you compare.',
      },
    ],
  },
  {
    title: 'Set up',
    image: {
      src: '/how-it-works/connect-settings.webp',
      alt: 'The settings panel open over a ride, with Connect beside Trainer and Heart rate.',
    },
    entries: [
      {
        label: 'Smart trainer',
        sentence:
          'Any trainer that speaks Bluetooth FTMS: Wahoo KICKR, Core, Snap and most others.',
      },
      {
        /*
         * Named, and in the words a reader expects to find. Web Bluetooth is
         * Chromium-only: neither Gecko nor WebKit implements it and both have taken a
         * position against it, so Firefox and Safari are not "not yet". iOS is listed as
         * the platform rather than by browser because every browser on it is WebKit
         * underneath — naming Safari alone would leave someone to try Chrome on an
         * iPhone. SPEC.md makes the same point a hard constraint rather than a
         * preference.
         */
        label: 'Browser',
        sentence:
          'Chrome or Edge on a Mac, Windows or Android. Firefox, Safari and iOS are not supported.',
      },
      {
        label: 'Heart rate · optional',
        sentence: 'A Bluetooth strap, or an Apple Watch via HeartCast.',
      },
      {
        /*
         * The short path, which is new: devices moved into the rider profile panel, so
         * pairing no longer waits on a route being open. The ride settings panel still
         * carries the same rows for pairing mid-session — deliberately not mentioned,
         * because a rider meeting the app needs one way in, not both. The strap is not
         * a fourth step for the same reason: the panel pairs it with the identical row,
         * and the entry above already says it is optional.
         */
        label: 'Connect',
        steps: [
          'Power the trainer on and turn the pedals to wake it.',
          'Open Rider profile and press Connect.',
          'Pick your trainer from the browser list.',
        ],
      },
    ],
  },
];

/*
 * The foot carried "Safari and iPhone cannot pair a trainer; use them as a second
 * screen." Both halves have gone: the first is now named in the Browser entry, where
 * someone checking whether they can use this will actually look for it, and the second
 * promised the phone mirror, which SPEC.md puts in phase 5. A screen that sells a
 * feature before it is built is how an onboarding page starts lying.
 */
