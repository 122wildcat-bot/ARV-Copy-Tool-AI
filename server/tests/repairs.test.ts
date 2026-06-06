import { describe, expect, it } from 'vitest';
import { normalizeContingency } from '../src/ai/estimateRepairs.js';

describe('normalizeContingency (guards against a runaway repair total)', () => {
  it('passes through a fraction unchanged', () => {
    expect(normalizeContingency(0.12)).toBe(0.12);
  });

  it('converts a whole-number percent to a fraction', () => {
    expect(normalizeContingency(12)).toBe(0.12);
    expect(normalizeContingency(10)).toBe(0.1);
  });

  it('clamps absurd values to 50%', () => {
    expect(normalizeContingency(900)).toBe(0.5); // the live-test bug: 900% -> capped
  });

  it('floors negatives and non-finite at 0', () => {
    expect(normalizeContingency(-5)).toBe(0);
    expect(normalizeContingency(Number.NaN)).toBe(0);
  });
});
