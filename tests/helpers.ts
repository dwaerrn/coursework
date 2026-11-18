import type { RandomSource } from '../src/core/types';

/** Small seeded generator (LCG) so random tests are repeatable. */
export function createSeededRandom(seed: number): RandomSource {
  let state = seed >>> 0;
  return (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
