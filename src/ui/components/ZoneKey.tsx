import { ZONE_COUNT, ZONE_FRACTIONS, ZONE_NAMES, type PowerZone } from '../../zones/power';
import { ZONE_WASH_OPACITY } from '../charts';
import { LABEL, MONO } from './styles';

export interface ZoneKeyEntry {
  zone: PowerZone;
  name: string;
  /** The zone's share of FTP, unsigned: `< 55`, `55–75`, `> 120`. The row carries the %. */
  band: string;
  /** Ink, 0–1, straight off the scale the chart and the Steps panel draw with. */
  wash: number;
}

/** 0.55 to `55`. Whole numbers, because every boundary in the model is one. */
function pct(fraction: number): string {
  return String(Math.round(fraction * 100));
}

/**
 * `55–75`, and `< 55` or `> 120` at the ends: zone 1 has no floor and zone 6 no ceiling
 * in the model, so pinning one for the key would be a claim the zones do not make.
 */
function bandLabel(lower: number | undefined, upper: number | undefined): string {
  if (lower !== undefined && upper !== undefined) return `${pct(lower)}–${pct(upper)}`;
  if (upper !== undefined) return `< ${pct(upper)}`;
  if (lower !== undefined) return `> ${pct(lower)}`;
  // Unreachable while ZONE_COUNT stays one more than the boundaries between the zones.
  return '';
}

/**
 * The six entries, read off the zone model rather than written out here.
 *
 * Boundaries from ZONE_FRACTIONS, names from ZONE_NAMES, shades from the one wash scale
 * the plan chart's blocks and the Steps panel's rows already use. A key that can disagree
 * with the thing it describes is worse than no key, and derivation is what stops it:
 * moving a boundary or re-pitching the scale moves this with it.
 */
export function zoneKeyEntries(): ZoneKeyEntry[] {
  return Array.from({ length: ZONE_COUNT }, (_, index) => {
    const zone = (index + 1) as PowerZone;
    return {
      zone,
      name: ZONE_NAMES[zone],
      band: bandLabel(ZONE_FRACTIONS[index - 1], ZONE_FRACTIONS[index]),
      wash: ZONE_WASH_OPACITY[zone],
    };
  });
}

/** Wider than tall, like the gradient key's bands, and short enough to sit on one line. */
const SWATCH_WIDTH = 24;
const SWATCH_HEIGHT = 10;

/**
 * Zone 1 is deliberately unwashed — recovery is the absence of work — so it gets a
 * hairline along the foot of its slot rather than a fill.
 *
 * An empty box reads as a fill that failed to paint; the hairline is the same mark the
 * screen already uses for a reading with nothing to show (see Rule in Workout), and says
 * "nothing here, on purpose" where a 1 % wash would say "too faint to see".
 */
function Swatch({ wash }: { wash: number }) {
  return (
    <svg
      width={SWATCH_WIDTH}
      height={SWATCH_HEIGHT}
      viewBox={`0 0 ${String(SWATCH_WIDTH)} ${String(SWATCH_HEIGHT)}`}
      style={{ display: 'block' }}
      aria-hidden="true"
    >
      {wash > 0 ? (
        <rect width={SWATCH_WIDTH} height={SWATCH_HEIGHT} fill="var(--color-ink)" opacity={wash} />
      ) : (
        <rect y={SWATCH_HEIGHT - 1} width={SWATCH_WIDTH} height={1} fill="var(--color-hairline)" />
      )}
    </svg>
  );
}

interface ZoneKeyProps {
  label?: string;
}

/**
 * What the shades on the plan chart and in the Steps panel mean: GradientKey's sibling,
 * in the same band along the bottom of the screen and at the same weight.
 *
 * Named rather than only numbered, because the shade is the thing nothing else on the
 * screen explains — the ladder already gives the rider a zone number. One trailing `% FTP`
 * for all six bands, as the gradient key carries one trailing `%` for its four.
 */
export function ZoneKey({ label = 'Zones' }: ZoneKeyProps) {
  return (
    <div className="flex shrink-0 items-center gap-[14px]" data-testid="workout-zone-key">
      <div className={`${LABEL} text-micro`}>{label}</div>
      <div className="flex items-center gap-[16px]">
        {zoneKeyEntries().map((entry) => (
          <div key={entry.zone} className="flex items-center gap-[7px]">
            <Swatch wash={entry.wash} />
            <div className="text-micro text-muted font-sans">{entry.name}</div>
            <div className={`${MONO} text-micro text-muted`}>{entry.band}</div>
          </div>
        ))}
      </div>
      <div className={`${MONO} text-micro text-muted`}>% FTP</div>
    </div>
  );
}
