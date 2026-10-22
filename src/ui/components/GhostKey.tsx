import { SYMBOL_BOX, SYMBOL_STROKE_WIDTH, type GhostSymbol } from '../../ghost/slots';
import { DONE_LABEL, type ActiveGhost } from '../../ghost/state';
import { LABEL, MONO } from './styles';

/**
 * The ghosts end of the bottom band: a symbol, a name and a gap for each one racing.
 *
 * It keeps a finished ghost's row and prints `done` rather than dropping it, because a
 * row that vanished would read as a ghost that was never switched on — the band is how
 * the rider knows what is out there at all, the symbols carrying no legend of their own.
 *
 * Nothing here decides anything: the order, the names and the figures are all settled on
 * the snapshot, so the band and the charts cannot disagree about a race.
 */
export function GhostKey({ ghosts }: { ghosts: readonly ActiveGhost[] }) {
  if (ghosts.length === 0) return null;
  return (
    <div className="ml-auto flex items-center gap-[14px]">
      <div className={`${LABEL} text-micro`}>Ghosts</div>
      {ghosts.map((ghost) => (
        <div key={ghost.slot} className="flex items-center gap-[8px]">
          <GhostMark symbol={ghost.symbol} />
          <div className={`${MONO} text-micro text-muted`}>{ghost.name}</div>
          <div className={`${MONO} text-micro ${ghost.done ? 'text-muted' : 'text-ink'}`}>
            {ghost.gapLabel ?? DONE_LABEL}
          </div>
        </div>
      ))}
    </div>
  );
}

/** The same hollow symbol the charts draw, at the size the paths were drawn against. */
function GhostMark({ symbol }: { symbol: GhostSymbol }) {
  return (
    <svg
      width={SYMBOL_BOX}
      height={SYMBOL_BOX}
      viewBox={`0 0 ${String(SYMBOL_BOX)} ${String(SYMBOL_BOX)}`}
      aria-hidden="true"
    >
      <path
        d={symbol.d}
        fill="var(--color-ground)"
        stroke="var(--color-muted)"
        strokeWidth={SYMBOL_STROKE_WIDTH}
        strokeLinejoin="round"
      />
    </svg>
  );
}
