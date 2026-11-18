/** Deterministic pseudo-random helpers so demo data is stable across reloads. */
export function hash01(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** A multiplier in [1 - spread, 1 + spread], stable for a given seed. */
export function noise(seed: string, spread = 0.1): number {
  return 1 - spread + 2 * spread * hash01(seed);
}

export function pick<T>(seed: string, list: readonly T[]): T {
  return list[Math.floor(hash01(seed) * list.length) % list.length];
}
