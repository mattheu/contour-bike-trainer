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
         */
        label: 'Why it exists',
        sentence:
          'A simple indoor cycling app: real routes and structured workouts, but nothing in the way of them. No subscription, no virtual world, no chat.',
      },
      {
        /*
         * "For now" is doing real work, and it is in the sentence rather than tucked
         * into the label where a reader skimming the prose would miss it. Accounts and a
         * mirror to a second screen are both on the table — SPEC.md already has the
         * phone mirror in phase 5 — so this says what is true now rather than what will
         * always be true. It stops short of announcing either: a signed-out screen that
         * sells an unbuilt feature is how onboarding starts lying.
         */
        label: 'In the browser',
        sentence:
          'For now, Contour is a browser app and nothing more. There is no account to make, and no ride leaves your machine.',
      },
      {
        /*
         * Chrome's default storage tier is best-effort: no time limit on it, and in
         * practice the data goes when the rider clears site data. It can also be evicted
         * when the disk is nearly full — true, rare, and more words than a column can
         * carry, so docs/getting-started.md is where that belongs.
         */
        label: 'Your data',
        sentence:
          'Everything is stored in this browser, and Chrome keeps it until you clear the site data. You can export your rides, routes and workouts, and import them back.',
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
        label: 'Routes',
        sentence:
          'Choose a route and press Start. The trainer follows the gradient; difficulty in settings scales it.',
      },
      {
        label: 'Workouts',
        sentence:
          "Choose a workout and press Start. ERG holds each step's target; pedal and the trainer does the rest.",
      },
      {
        /*
         * A ride saves itself when it ends, whether the rider pressed End or the route
         * ran out — see savedRideId in ui/store.ts. TCX rather than "export to Strava",
         * because Contour does not talk to Strava: you get a file and upload it, which
         * is what docs/exporting-to-strava.md walks through.
         */
        label: 'Rides',
        sentence:
          'Every ride is saved when it ends. Open one to see its summary, or download it as a TCX file for Strava.',
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
         * The real order, which matters and is not obvious: there is no connect screen,
         * so a route or workout has to be open before the panel that pairs even exists.
         * e2e/connect.spec.ts drives exactly this sequence.
         */
        label: 'Connect',
        steps: [
          'Power the trainer on and turn the pedals to wake it.',
          'Choose a route or workout to open the ride.',
          'Press Settings, then Connect beside each device.',
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
