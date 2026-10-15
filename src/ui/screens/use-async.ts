import { useEffect, useState } from 'react';

/**
 * A one-shot load, not a subscription: storage is read when a list screen opens and not
 * again. The live ride arrives through useRideStore and nothing here polls.
 */
export function useAsync<T>(load: () => Promise<T>, deps: readonly unknown[]): T | null {
  const [value, setValue] = useState<T | null>(null);

  useEffect(() => {
    let live = true;
    void load().then((result) => {
      if (live) setValue(result);
    });
    return () => {
      live = false;
    };
    // The caller owns the dependency list; `load` is a fresh closure on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return value;
}
