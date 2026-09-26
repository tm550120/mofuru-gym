import type { Rng } from './types';

export const defaultRng: Rng = Math.random;

export function shuffle<T>(a: T[], rng: Rng = defaultRng): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const die = (rng: Rng = defaultRng): number => 1 + Math.floor(rng() * 6);
