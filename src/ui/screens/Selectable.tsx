import type { ReactNode } from 'react';

/**
 * ListRow is an anchor, because a list of rides is a list of links. Phase 2 has no
 * router, so the href stays as the row's real address for focus and keyboard activation
 * and this intercepts the navigation. When a router lands, this wrapper goes.
 */
export function Selectable({
  onSelect,
  children,
}: {
  /** Null for a row that is not selectable, which still renders but does nothing. */
  onSelect: (() => void) | null;
  children: ReactNode;
}) {
  if (onSelect === null) return <div>{children}</div>;
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
