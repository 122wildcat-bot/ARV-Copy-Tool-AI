/**
 * Pure math helpers shared by the valuation and deal engines.
 * No LLM calls, no I/O — unit-tested (BuildSpec §9).
 */

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
  }
  return sorted[mid] as number;
}

export function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

/**
 * Round a price to end in `ending` (default 9900), per Adam's listing
 * convention (BuildSpec §9.4):
 *   roundTo9900(x) = round((x - 9900) / 10000) * 10000 + 9900
 *
 * Generalized for any `ending` < 10000:
 *   round((x - ending) / 10000) * 10000 + ending
 *
 * Acceptance examples: 451234 -> 449900, 456000 -> 459900.
 */
export function roundToEnding(x: number, ending = 9900): number {
  return Math.round((x - ending) / 10000) * 10000 + ending;
}

/** Safe division: returns 0 when the denominator is 0 (avoids Infinity/NaN). */
export function safeDiv(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return numerator / denominator;
}
