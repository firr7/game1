// js/rng.js — Seeded pseudo-random number generator (mulberry32 variant)

/**
 * Create a seeded RNG function that returns values in [0, 1).
 * @param {number} seed - Integer seed value.
 * @returns {() => number}
 */
export function createRNG(seed) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
