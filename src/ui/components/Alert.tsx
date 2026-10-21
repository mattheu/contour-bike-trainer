import { useEffect, useId, useState } from 'react';
import { CONTROL_BOX, TONE } from './control';
import { MONO } from './styles';
import { SLIDE } from './motion';

export type AlertLevel = 'info' | 'warning' | 'fault';

interface AlertProps {
  level: AlertLevel;
  message: string;
  /** The mono aside: device name, age of the last reading, retry state. */
  detail?: string;
  /** Warning only. Info clears itself — the caller owns that timer, not this component. */
  onDismiss?: () => void;
  /** Fault only. */
  onRetry?: () => void;
}

/** Matches the small ghost buttons in design/mockups/alerts.html, which sit at 32 px. */
const SMALL = 'text-caption min-h-[32px] px-[12px] py-[6px]';

/**
 * One 48 px full-width strip under the header, sliding down in 0.3 s. Amber is a system
 * message and never ride data, so nothing here reads a value.
 */
export function Alert({ level, message, detail, onDismiss, onRetry }: AlertProps) {
  const [shown, setShown] = useState(false);
  const hatchId = useId();

  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const fault = level === 'fault';
  const box =
    level === 'info'
      ? 'border-hairline relative border'
      : level === 'warning'
        ? 'border-hairline border-l-alert border border-l-2'
        : 'bg-alert';
  const text = fault ? 'text-ground' : level === 'warning' ? 'text-ink' : 'text-muted';
  const detailTone = fault ? 'text-ground/70' : 'text-muted';

  return (
    <div className="h-[48px] w-full overflow-hidden">
      <div
        className={`h-[48px] w-full ${SLIDE}`}
        style={{ transform: shown ? 'translateY(0)' : 'translateY(-100%)' }}
      >
        <div className={`h-[48px] w-full ${box}`} role={level === 'info' ? 'status' : 'alert'}>
          {level === 'info' && (
            <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
              <defs>
                <pattern
                  id={hatchId}
                  patternUnits="userSpaceOnUse"
                  width="8"
                  height="8"
                  patternTransform="rotate(45)"
                >
                  <line x1="0" y1="0" x2="0" y2="8" stroke="var(--color-muted)" strokeWidth="0.8" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill={`url(#${hatchId})`} opacity="0.3" />
            </svg>
          )}

          <div className="relative flex h-[48px] items-center gap-[14px] px-[18px]">
            <AlertIcon level={level} />
            <div className={`text-label font-sans ${text}`}>{message}</div>
            {detail !== undefined && (
              <div className={`${MONO} text-caption ${detailTone}`}>{detail}</div>
            )}
            <div className="grow" />
            {level === 'warning' && onDismiss && (
              <button type="button" onClick={onDismiss} className={`${TONE.grey} ${SMALL}`}>
                Dismiss
              </button>
            )}
            {fault && onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className={`${CONTROL_BOX} ${SMALL} text-ground border-ground`}
              >
                Retry
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AlertIcon({ level }: { level: AlertLevel }) {
  if (level === 'info') {
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="var(--color-muted)"
        strokeWidth="1.25"
        aria-hidden="true"
      >
        <circle cx="8" cy="8" r="6.5" />
        <path d="M8,7 V11.5 M8,4.6 V5" />
      </svg>
    );
  }

  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke={level === 'fault' ? 'var(--color-ground)' : 'var(--color-alert)'}
      strokeWidth="1.25"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8,2 L14.5,13.5 H1.5 Z" />
      <path d="M8,6.5 V10 M8,12 V12.3" />
    </svg>
  );
}
