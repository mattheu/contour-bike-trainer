/**
 * What the How it works screen says, separated from how it draws it.
 *
 * Here rather than inline in the JSX because the copy is the screen: three columns of it,
 * read once by someone who has not signed in yet, and a wording change should be a diff
 * in a list of strings rather than one threaded through layout.
 *
 * The visual each column carries is named rather than drawn — the drawings and the live
 * previews are components, and this file stays free of React so the copy can be read and
 * checked without one.
 */

export type ColumnVisual = 'trainer-drawing' | 'connect-preview' | 'ride-preview';

export interface ColumnEntry {
  /** 11 px tracked caps, muted. A step number in Connect, a subject elsewhere. */
  label: string;
  sentence: string;
}

export interface Column {
  number: string;
  title: string;
  visual: ColumnVisual;
  entries: ColumnEntry[];
}

export const COLUMNS: Column[] = [
  {
    number: '1',
    title: 'What you need',
    visual: 'trainer-drawing',
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
    visual: 'connect-preview',
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
    visual: 'ride-preview',
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
 * The one caveat worth carrying on the screen rather than discovering at the pairing
 * dialog: WebKit does not implement Web Bluetooth, so neither Safari nor any iPhone
 * browser can reach a trainer. SPEC.md makes Chrome the platform for the same reason.
 */
export const PLATFORM_NOTE =
  'Safari and iPhone cannot pair a trainer; use them as a second screen.';
