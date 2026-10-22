/**
 * What the How it works screen says, separated from how it draws it.
 *
 * Here rather than inline in the JSX because the copy is the screen: three columns of it,
 * read once by someone who has not signed in yet, and a wording change should be a diff
 * in a list of strings rather than one threaded through layout.
 *
 * The pictures live in public/how-it-works/ and are named here beside the words they
 * belong to, so this file stays free of React and the copy can be read and checked
 * without one.
 */

export interface ColumnImage {
  /** Served from public/, drawn into a 16:10 frame at 360 px wide. */
  src: string;
  /** Short: the sentences beside the frame already carry what the picture is for. */
  alt: string;
}

export interface ColumnEntry {
  /** 11 px tracked caps, muted. A step number in Connect, a subject elsewhere. */
  label: string;
  sentence: string;
}

export interface Column {
  number: string;
  title: string;
  image: ColumnImage;
  entries: ColumnEntry[];
}

export const COLUMNS: Column[] = [
  {
    number: '1',
    title: 'What you need',
    image: {
      src: '/how-it-works/what-you-need.webp',
      alt: 'A bike on a smart trainer, sending its numbers to a laptop.',
    },
    entries: [
      {
        label: 'Smart trainer',
        sentence:
          'Any trainer that speaks Bluetooth FTMS: Wahoo KICKR, Core, Snap and most others.',
      },
      {
        label: 'Browser',
        sentence:
          'Chrome or Edge on a Mac, Windows or Android device. Web Bluetooth does the pairing; nothing to install.',
      },
      {
        label: 'Heart rate · optional',
        sentence: 'A Bluetooth strap, or an Apple Watch through HeartCast.',
      },
    ],
  },
  {
    number: '2',
    title: 'Connect',
    image: {
      src: '/how-it-works/connect.webp',
      alt: 'The ride settings panel, with Connect beside Trainer and Heart rate.',
    },
    entries: [
      { label: '1', sentence: 'Power the trainer on and wake it with a pedal stroke.' },
      { label: '2', sentence: 'Open Profile, then Devices, and press Connect beside Trainer.' },
      {
        label: '3',
        sentence:
          'Pick the trainer from the browser list, then repeat for heart rate. Contour remembers both and reconnects when they are in range.',
      },
    ],
  },
  {
    number: '3',
    title: 'Ride',
    image: {
      src: '/how-it-works/ride.webp',
      alt: 'The ride screen, with its readings above the route profile.',
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
      { label: 'Pause · End', sentence: 'Stop pedalling to pause. End saves the ride to Rides.' },
    ],
  },
];

/**
 * The two things worth knowing before signing in that are not a step in the three columns.
 * They sit in the foot together: each is a caveat about the ground the app runs on rather
 * than something the rider does.
 *
 * Storage first, because it is the one a rider would otherwise have to guess at. Every
 * record is in this browser — IndexedDB for the libraries, localStorage for the session —
 * and nothing is sent anywhere, so "how long does it last" is a real question with an
 * answer worth printing. Chrome's default tier is best-effort: there is no time limit on
 * it, and in practice it goes when the rider clears site data. (It can also be evicted
 * when the disk is nearly full, which is true, rare, and more words than this band can
 * carry; docs/getting-started.md is where that belongs.)
 *
 * Then the platform: WebKit does not implement Web Bluetooth, so neither Safari nor any
 * iPhone browser can reach a trainer. SPEC.md makes Chrome the platform for the same
 * reason.
 */
export const FOOT_NOTES = [
  'Everything stays in this browser: no account, no server. Chrome keeps it until you clear the site data, and Rides, Routes and Workouts each export to a file you can import back.',
  'Safari and iPhone cannot pair a trainer; use them as a second screen.',
];
