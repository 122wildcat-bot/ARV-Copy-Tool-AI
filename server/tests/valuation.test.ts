import { describe, expect, it } from 'vitest';
import { roundToEnding, median } from '../src/engine/math.js';
import { runValuation, type ValuationInput } from '../src/engine/valuation.js';
import { makeComp, makeKnobs, makeSelection, makeSubject } from './factories.js';

function valuationInput(
  prices: number[],
  selOver: ((id: string, i: number) => Parameters<typeof makeSelection>[1])[] | null = null,
  repairsTotal = 0,
): ValuationInput {
  const comps = prices.map((p, i) => makeComp(`c${i}`, p));
  const selections = comps.map((c, i) =>
    makeSelection(c.providerId, selOver ? selOver[i]?.(c.providerId, i) : {}),
  );
  return { subject: makeSubject(), comps, selections, knobs: makeKnobs(), repairsTotal };
}

describe('roundToEnding (BuildSpec §9.4 acceptance)', () => {
  it('rounds 451234 down to 449900', () => {
    expect(roundToEnding(451234)).toBe(449900);
  });
  it('rounds 456000 up to 459900', () => {
    expect(roundToEnding(456000)).toBe(459900);
  });
  it('keeps an already-9900 value', () => {
    expect(roundToEnding(449900)).toBe(449900);
  });
});

describe('median helper', () => {
  it('handles odd length', () => expect(median([300, 310, 320])).toBe(310));
  it('handles even length', () => expect(median([300, 320])).toBe(310));
});

describe('valuation — adjusted price', () => {
  it('adjusted price equals sale price when comp matches subject and soft adj are 0', () => {
    const { included } = runValuation(valuationInput([300_000]));
    expect(included[0]!.adjustedPrice).toBe(300_000);
    expect(included[0]!.grossAdjPct).toBe(0);
    expect(included[0]!.netAdjPct).toBe(0);
  });

  it('recomputes GLA adjustment from the configured rate (not the AI value)', () => {
    const subject = makeSubject({ gla: 2100 });
    const comp = makeComp('c0', 300_000, { gla: 2000 });
    // AI proposes a wild GLA number; engine must ignore it and use rate * delta.
    const selection = makeSelection('c0', {
      adjustments: { ...makeSelection('c0').adjustments, gla: 999_999 },
    });
    const { included } = runValuation({
      subject,
      comps: [comp],
      selections: [selection],
      knobs: makeKnobs(),
      repairsTotal: 0,
    });
    // (2100 - 2000) * 55 = 5500 added to the comp.
    expect(included[0]!.adjustments.gla).toBe(5500);
    expect(included[0]!.adjustedPrice).toBe(305_500);
  });

  it('passes soft adjustments (condition, other) through from the AI', () => {
    const selection = makeSelection('c0', {
      adjustments: { ...makeSelection('c0').adjustments, condition: -15_000, other: 2_000 },
    });
    const { included } = runValuation({
      subject: makeSubject(),
      comps: [makeComp('c0', 300_000)],
      selections: [selection],
      knobs: makeKnobs(),
      repairsTotal: 0,
    });
    expect(included[0]!.adjustments.condition).toBe(-15_000);
    expect(included[0]!.adjustedPrice).toBe(287_000);
  });
});

describe('valuation — similarity-weighted reconciliation (BuildSpec §9.3)', () => {
  it('weights adjusted prices by similarity', () => {
    const input = valuationInput([300_000, 310_000, 320_000], [
      () => ({ similarityScore: 1 }),
      () => ({ similarityScore: 1 }),
      () => ({ similarityScore: 0.5 }),
    ]);
    const { valuation } = runValuation(input);
    // (300000*1 + 310000*1 + 320000*0.5) / 2.5 = 770000 / 2.5 = 308000
    expect(valuation.marketValue).toBe(308_000);
    expect(valuation.arv).toBe(308_000);
    expect(valuation.medianValue).toBe(310_000);
  });

  it('As-Is = max(0, ARV - repairs)', () => {
    const { valuation } = runValuation(valuationInput([300_000, 300_000, 300_000], null, 50_000));
    expect(valuation.arv).toBe(300_000);
    expect(valuation.asIsValue).toBe(250_000);
  });

  it('As-Is floors at 0 when repairs exceed ARV', () => {
    const { valuation } = runValuation(valuationInput([100_000, 100_000, 100_000], null, 500_000));
    expect(valuation.asIsValue).toBe(0);
  });
});

describe('valuation — outlier exclusion + floor/ceiling (BuildSpec §9.2)', () => {
  it('excludes a comp outside the median band and reports floor/ceiling across ALL comps', () => {
    const { included, excluded, valuation } = runValuation(
      valuationInput([300_000, 310_000, 320_000, 1_000_000]),
    );
    expect(included).toHaveLength(3);
    expect(excluded).toHaveLength(1);
    expect(excluded[0]!.comp.salePrice).toBe(1_000_000);
    // floor/ceiling span ALL comps including the excluded outlier.
    expect(valuation.valueRange).toEqual([300_000, 1_000_000]);
  });

  it('respects an explicit isOutlierCandidate flag even if in-band', () => {
    // 4 comps so excluding one still leaves >= 3 (no fallback re-inclusion).
    const input = valuationInput([300_000, 305_000, 310_000, 308_000], [
      () => ({}),
      () => ({ isOutlierCandidate: true }),
      () => ({}),
      () => ({}),
    ]);
    const { included, excluded } = runValuation(input);
    expect(excluded.some((c) => c.comp.providerId === 'c1')).toBe(true);
    expect(included).toHaveLength(3);
  });
});

describe('valuation — <3 comp fallback (BuildSpec §9.2)', () => {
  it('keeps the 3 closest-to-median comps and flags low confidence', () => {
    const { included, valuation } = runValuation(valuationInput([100_000, 105_000, 300_000, 310_000]));
    // median = 202500, band ±20% = [162000, 243000] excludes everything,
    // so the fallback keeps the 3 closest to the median.
    expect(included).toHaveLength(3);
    expect(valuation.confidence).toBe('low');
    expect(valuation.adjustmentFlags.some((f) => /confidence is low/i.test(f))).toBe(true);
  });
});

describe('valuation — three-tier pricing (BuildSpec §9.4)', () => {
  it('computes quick-sale / market / test-the-market with 9900 rounding', () => {
    // Force marketValue == 400000 with three identical, equally-weighted comps.
    const { pricing } = runValuation(valuationInput([400_000, 400_000, 400_000]));
    expect(pricing.quickSale).toBe(369_900); // 400000 * 0.9325 = 373000 -> 369900
    expect(pricing.marketList).toBe(399_900); // 400000 -> 399900
    expect(pricing.testTheMarket).toBe(419_900); // 400000 * 1.055 = 422000 -> 419900
  });
});

describe('valuation — guardrail flags (BuildSpec §9.1)', () => {
  it('flags comps with gross adjustments over 25%', () => {
    // Big condition adjustment relative to a small sale price triggers the flag.
    const selection = makeSelection('c0', {
      adjustments: { ...makeSelection('c0').adjustments, condition: 40_000 },
    });
    const { included } = runValuation({
      subject: makeSubject(),
      comps: [makeComp('c0', 100_000)],
      selections: [selection],
      knobs: makeKnobs(),
      repairsTotal: 0,
    });
    expect(included[0]!.grossAdjPct).toBeCloseTo(0.4, 5);
    expect(included[0]!.flags.some((f) => /Gross adjustments/.test(f))).toBe(true);
  });
});
