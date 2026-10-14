import type { ReactNode } from 'react';

/**
 * ListRow is an anchor, because a list of rides is a list of links. Phase 2 has no
 * router, so the href stays as the row's real address for focus and keyboard activation
 * and this intercepts the navigation. When a router lands, this wrapper goes.
 */
export function Selectable({ onSelect, children }: { onSelect: () => void; children: ReactNode }) {
  return (
    <div
      onClick={(event) => {
        event.preventDefault();
        onSelect();
      }}
    >
      {children}
    </div>
  );
}
