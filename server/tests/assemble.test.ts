import { describe, expect, it } from 'vitest';
import { assembleAnalysis, type AssembleParams } from '../src/engine/assemble.js';
import { recalc, removeComp } from '../src/service/recalcService.js';
import { defaultDealInputs } from '../src/config/knobs.js';
import { makeComp, makeKnobs, makeSelection, makeSubject } from './factories.js';
import type { RepairEstimate } from '../src/types.js';

function baseParams(): AssembleParams {
  const comps = [
    makeComp('c0', 300_000),
    makeComp('c1', 310_000),
    makeComp('c2', 320_000),
  ];
  const repairs: RepairEstimate = {
    lineItems: [{ category: 'kitchen', scope: 'full', cost: 40_000 }],
    subtotal: 40_000,
    contingencyPct: 0.1,
    total: 44_000,
    confidence: 'medium',
  };
  return {
    subject: makeSubject(),
    comps,
    selections: comps.map((c) => makeSelection(c.providerId)),
    repairs,
    knobs: makeKnobs(),
    dealInputs: { ...defaultDealInputs() },
    meta: { provider: 'test', deepMode: false, tokenUsage: {}, generatedAt: 't0' },
  };
}

describe('assembleAnalysis → full AnalysisResult', () => {
  it('produces valuation, pricing, and all five deal types', () => {
    const a = assembleAnalysis(baseParams());
    expect(a.valuation.arv).toBe(310_000); // equal-weight mean of in-band comps
    expect(a.valuation.asIsValue).toBe(266_000); // 310000 - 44000
    expect(a.pricing.marketList).toBe(309_900);
    expect(a.deals.wholesale.buyerMAO).toBe(310_000 * 0.7 - 44_000);
    expect(a.deals).toHaveProperty('brrrr');
    expect(a.deals).toHaveProperty('novation');
    // Novation projected sale is wired to the three-tier marketList.
    expect(a.deals.novation.projectedSale).toBe(a.pricing.marketList);
  });
});

describe('recalc is pure and recomputes on edits', () => {
  it('changing maoPercent changes deal math but not valuation', () => {
    const a = assembleAnalysis(baseParams());
    const b = recalc(a, { dealInputs: { maoPercent: 0.6 } });
    expect(b.valuation.arv).toBe(a.valuation.arv); // comps unchanged
    expect(b.deals.wholesale.buyerMAO).toBe(310_000 * 0.6 - 44_000);
    expect(b.deals.wholesale.buyerMAO).toBeLessThan(a.deals.wholesale.buyerMAO);
  });

  it('editing repairs flows into As-Is and deal math', () => {
    const a = assembleAnalysis(baseParams());
    const newRepairs: RepairEstimate = {
      lineItems: [{ category: 'gut', scope: 'full', cost: 80_000 }],
      subtotal: 80_000,
      contingencyPct: 0,
      total: 80_000,
      confidence: 'low',
    };
    const b = recalc(a, { repairs: newRepairs });
    expect(b.valuation.asIsValue).toBe(310_000 - 80_000);
    expect(b.deals.wholesale.buyerMAO).toBe(310_000 * 0.7 - 80_000);
  });

  it('removing a comp re-reconciles the value', () => {
    const a = assembleAnalysis(baseParams());
    const b = removeComp(a, 'c2'); // drop the 320k comp
    // Remaining in-band comps are 300k and 310k → mean 305k.
    expect(b.valuation.arv).toBe(305_000);
    expect(b.comps.included).toHaveLength(2);
  });
});
