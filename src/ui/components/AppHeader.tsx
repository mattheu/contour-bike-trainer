import type { ReactNode } from 'react';
import { CONTROL_GAP } from './control';
import { IconButton } from './IconButton';
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
}

export function AppHeader({ nav, action, onSettings }: AppHeaderProps) {
  return (
    <header className="flex items-center justify-between">
      <div className="flex items-center gap-[28px]">
        <Logo />
        {nav}
      </div>
      <div className={`flex items-center ${CONTROL_GAP}`}>
        {action}
        {onSettings !== undefined && (
          <IconButton label="Rider profile" onClick={onSettings}>
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.25"
              aria-hidden="true"
            >
              <circle cx="9" cy="9" r="2.5" />
              <path d="M9,1.5 V4 M9,14 V16.5 M1.5,9 H4 M14,9 H16.5 M3.7,3.7 L5.5,5.5 M12.5,12.5 L14.3,14.3 M3.7,14.3 L5.5,12.5 M12.5,5.5 L14.3,3.7" />
            </svg>
          </IconButton>
        )}
      </div>
    </header>
  );
}
