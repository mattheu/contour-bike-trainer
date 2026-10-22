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
 * screen is for, where a photograph of one reads as a photograph. There is no pictogram
 * of the pairing panel, so Set up takes the bike and the laptop — which is the kit list
 * above it, drawn.
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
  number: string;
  title: string;
  image: ColumnImage;
  entries: ColumnEntry[];
}

/**
 * Three columns: what to do before the first ride, what there is to ride, and what the
 * app is.
 *
 * Setting up and connecting are one column rather than two. They are one errand — kit you
 * either own or do not, and the two minutes of pairing that follow — and splitting them
 * put a numbered 1-2-3 beside a kit list, which reads as six steps when there are three
 * things to own and one thing to do.
 *
 * The third column is not a step, which is why it is last and why its number is only its
 * position. Where a rider's rides live, and whether anyone else can see them, is the
 * question this screen gets asked that the other two columns cannot answer.
 */
export const COLUMNS: Column[] = [
  {
    number: '1',
    title: 'Set up',
    image: {
      src: '/how-it-works/trainer-and-browser.webp',
      alt: 'A bike on a smart trainer, sending its numbers to a laptop.',
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
  {
    number: '2',
    title: 'Ride',
    image: {
      src: '/how-it-works/route-ride.webp',
      alt: 'A ride in progress: power, cadence and heart rate above the route profile and map.',
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
    ],
  },
  {
    number: '3',
    title: 'About',
    image: {
      src: '/how-it-works/workout-ride.webp',
      alt: 'A workout in progress: the interval plan above the list of steps.',
    },
    entries: [
      {
        /*
         * "Indoor cycling app" rather than a competitor's name, and rather than "bike
         * trainer app", which is neither. It is what SPEC.md, the README and DESIGN.md
         * all call this, and the four nos below say which kind of one without naming
         * anybody: a screen that defines itself against a rival ages the day the rival
         * changes.
         */
        label: 'Why it exists',
        sentence:
          'A simple indoor cycling app: no virtual world, no chat, no group rides, no events. Real routes and structured workouts, and nothing in the way of them.',
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
          'For now, Contour is a browser app and nothing more. There is no account to make, and no ride leaves this machine.',
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
];

/*
 * The foot carried "Safari and iPhone cannot pair a trainer; use them as a second
 * screen." Both halves have gone: the first is now named in the Browser entry, where
 * someone checking whether they can use this will actually look for it, and the second
 * promised the phone mirror, which SPEC.md puts in phase 5. A screen that sells a
 * feature before it is built is how an onboarding page starts lying.
 */
