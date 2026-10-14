import { MONO } from './styles';
import { SLIDE } from './motion';

const ZONES = [1, 2, 3, 4, 5] as const;
const SEGMENT = 100 / ZONES.length;

interface TargetBand {
  /** Fraction of the ladder, 0–1. */
  from: number;
  to: number;
}

interface ZoneLadderProps {
  /** The lit zone, 1–5. */
  zone: number;
  /** Where the tick sits, 0–1. src/zones supplies this; the ladder does not compute it. */
  marker: number;
  /** The accent window to aim at, as fractions of the ladder. */
  target?: TargetBand;
  label?: string;
}

const clamp = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
/** Keeps float noise out of the style attribute, so the DOM does not churn on every tick. */
const pct = (fraction: number) => `${(fraction * 100).toFixed(4)}%`;

/**
 * Five equal segments over a hairline, one lit. Absolutely-positioned divs rather than
 * SVG: the ladder sits in the text flow beside a hero and has to share its width.
 * Marker and band slide by transform, so nothing animates layout.
 */
export function ZoneLadder({ zone, marker, target, label }: ZoneLadderProps) {
  const tick = clamp(marker);
  const from = target ? clamp(target.from) : 0;
  const width = target ? Math.max(0, clamp(target.to) - from) : 0;

  return (
    <div
      className="relative h-[30px]"
      role="img"
      aria-label={label ?? `Zone ${zone} of ${ZONES.length}`}
    >
      <div className="bg-hairline absolute top-[5px] right-0 left-0 h-px" />

      {ZONES.map((z) => (
        <div key={z}>
          <div
            className="bg-ink absolute top-[4px] h-[3px]"
            style={{
              left: `${(z - 1) * SEGMENT}%`,
              width: `${SEGMENT}%`,
              opacity: z === zone ? 0.45 : 0.1,
            }}
          />
          <div
            className={`${MONO} text-micro text-muted absolute top-[17px] -translate-x-1/2`}
            style={{ left: `${(z - 0.5) * SEGMENT}%`, opacity: z === zone ? 0.9 : 0.45 }}
          >
            {z}
          </div>
        </div>
      ))}

      {target && (
        <div
          className={`absolute top-[3px] left-0 w-full ${SLIDE}`}
          style={{ transform: `translateX(${pct(from)})` }}
        >
          <div className="bg-accent h-[5px]" style={{ width: pct(width) }} />
        </div>
      )}

      <div
        className={`absolute top-0 left-0 w-full ${SLIDE}`}
        style={{ transform: `translateX(${pct(tick)})` }}
      >
        <div className="bg-ink h-[12px] w-[2px]" />
      </div>
    </div>
  );
}
