/**
 * Seeded linear congruential generator. Deterministic on purpose: the fakes must
 * produce a byte-identical series on every run so Vitest and Playwright can assert
 * against it. Never Math.random here.
 */
export function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    // Numerical Recipes constants, kept exact with imul.
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

/** Symmetric noise in [-magnitude, +magnitude]. */
export function noise(rng: () => number, magnitude: number): number {
  return (rng() * 2 - 1) * magnitude;
}
