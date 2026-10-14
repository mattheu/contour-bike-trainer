import type { ReactNode } from 'react';
import { Button } from './Button';
import { CONTROL_GAP } from './control';
import { ButtonGroup } from './ButtonGroup';
import { IconButton } from './IconButton';
import { LABEL } from './styles';
import { Logo } from './Wordmark';

interface RideHeaderProps {
  /** The route name, or the workout name when a workout is loaded. */
  title: string;
  /** The route behind a workout, drawn after a hairline separator. */
  subtitle?: string;
  /** What the one accent control reads now: Start, Pause or Resume. See ride-view. */
  pauseLabel: string;
  /**
   * Controls that belong to what is being ridden rather than to the ride itself, drawn
   * left of the ride group as their own group. The workout difficulty is the one of them.
   */
  actions?: ReactNode;
  onPause: () => void;
  onEnd: () => void;
  onSettings: () => void;
}

export function RideHeader({
  title,
  subtitle,
  pauseLabel,
  actions,
  onPause,
  onEnd,
  onSettings,
}: RideHeaderProps) {
  return (
    <header className="flex items-center justify-between">
      <div className="flex items-center gap-[18px]">
        <Logo />
        <div className={LABEL}>{title}</div>
        {subtitle !== undefined && (
          <>
            <div className={`${LABEL} text-hairline`}>·</div>
            <div className={LABEL}>{subtitle}</div>
          </>
        )}
      </div>
      <div className={`flex items-center ${CONTROL_GAP}`}>
        {actions}
        {/* Start/Pause and End ride are the same kind of thing — what to do with the ride
            in front of you — so they share an edge. The gear is a different kind of thing
            and keeps its gap: a group says "these go together", and a gap too small to
            read as deliberate says nothing at all. */}
        <ButtonGroup label="Ride">
          <Button tone="accent" onClick={onPause}>
            {pauseLabel}
          </Button>
          <Button onClick={onEnd}>End ride</Button>
        </ButtonGroup>
        <IconButton label="Settings" onClick={onSettings}>
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
      </div>
    </header>
  );
}
