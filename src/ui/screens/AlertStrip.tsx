import { useEffect } from 'react';
import type { AlertState } from '../store';
import { Alert } from '../components/Alert';

/** design/DESIGN.md > Alerts: info is passing news and clears itself after five seconds. */
const INFO_LIFETIME_MS = 5000;

interface AlertStripProps {
  alert: AlertState | null;
  onDismiss: () => void;
  onRetry: () => void;
}

/**
 * The strip under the header. The Alert component deliberately owns no timer, so the
 * five-second info life sits here — one level up from the paint, one level below the
 * engine that decided there was something to say.
 */
export function AlertStrip({ alert, onDismiss, onRetry }: AlertStripProps) {
  const expiring = alert?.level === 'info';
  const message = alert?.message;

  useEffect(() => {
    if (!expiring) return;
    const timer = setTimeout(onDismiss, INFO_LIFETIME_MS);
    return () => clearTimeout(timer);
    // The message is a dependency so a second piece of news restarts the clock.
  }, [expiring, message, onDismiss]);

  if (alert === null) return null;

  return (
    // shrink-0: the strip is a fixed row in a full-height column and must not be
    // squeezed out by the chart row that flexes beside it.
    <div className="mt-[20px] shrink-0">
      <Alert
        // Remounting on a new message replays the slide, which is what makes a second
        // alert read as a new event rather than a relabelled old one.
        key={`${alert.level}:${alert.message}`}
        level={alert.level}
        message={alert.message}
        onDismiss={alert.level === 'warning' ? onDismiss : undefined}
        onRetry={alert.level === 'fault' ? onRetry : undefined}
      />
    </div>
  );
}
