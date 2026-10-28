import type { ReactNode } from 'react';
import { CONTROL_GAP } from './control';
import { IconButton } from './IconButton';
import { SettingsIcon } from './icons';
import { Logo } from './Wordmark';

interface AppHeaderProps {
  /**
   * The Rides · Routes · Workouts Segmented, or a label on a screen that has no nav to
   * carry — How it works is the one of those.
   */
  nav: ReactNode;
  /** One accent action, or the period summary on screens that have no action. */
  action?: ReactNode;
  /**
   * Opens the rider profile. A settings affordance rather than a fourth tab: Rides,
   * Routes and Workouts are collections and a profile is not, and a fourth segment would
   * shift widths the Workouts tab already has to move in phase 3.
   */
  onSettings?: () => void;
  /**
   * Two rows on a phone: the logo and the action above, the nav full width beneath —
   * design/mockups/routes-phone.html. The list screens ask for it because three segments
   * will not share 390 px with a logo and an import button. How it works does not: its
   * nav slot holds a title rather than a control, and a title belongs beside the logo.
   */
  stacked?: boolean;
}

export function AppHeader({ nav, action, onSettings, stacked = false }: AppHeaderProps) {
  // Grid on a phone so each child is placed once rather than drawn twice and hidden: a
  // second copy of the nav is a second set of buttons to anything that reads the page.
  // Above it the display is flex again and the grid placements fall away with it.
  const frame = `flex items-center gap-[28px] ${
    stacked ? 'max-sm:grid max-sm:grid-cols-[auto_1fr] max-sm:gap-x-0 max-sm:gap-y-[18px]' : ''
  }`;

  return (
    <header className={frame}>
      <Logo size="header" />
      {/* Full width on a phone, which means the three segments share it equally. */}
      <div
        className={
          stacked ? 'max-sm:col-span-2 max-sm:row-start-2 max-sm:[&_button]:flex-1' : undefined
        }
      >
        {nav}
      </div>
      <div
        className={`ml-auto flex min-w-0 items-center ${CONTROL_GAP} ${
          stacked ? 'max-sm:col-start-2 max-sm:row-start-1 max-sm:justify-self-end' : ''
        }`}
      >
        {action}
        {onSettings !== undefined && (
          <IconButton label="Rider profile" onClick={onSettings}>
            <SettingsIcon />
          </IconButton>
        )}
      </div>
    </header>
  );
}
