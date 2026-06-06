import { describe, expect, it } from 'vitest';
import {
  buyerMAO,
  computeBrrrr,
  computeBuyHold,
  computeDeals,
  computeFlip,
  computeNovation,
  computeWholesale,
} from '../src/engine/deals.js';
import type { DealInputs } from '../src/types.js';

function inputs(over: Partial<DealInputs> = {}): DealInputs {
  return {
    arv: 300_000,
    repairs: 50_000,
    maoPercent: 0.7,
    assignmentFee: 10_000,
    desiredProfit: 40_000,
    holdingCosts: 5_000,
    closingCostsPct: 0.02,
    sellingCostsPct: 0.06,
    financingCosts: 2_000,
    refiLTV: 0.75,
    monthlyRent: 2_000,
    vacancyPct: 0.05,
    monthlyOpEx: 500,
    annualDebtService: 8_000,
    ...over,
  };
}

describe('MAO / 70% rule (BuildSpec §10)', () => {
  it('buyerMAO = arv * maoPercent - repairs', () => {
    expect(buyerMAO(300_000, 0.7, 50_000)).toBe(160_000);
  });
});

describe('wholesale', () => {
  it('offer to seller and spread', () => {
    const w = computeWholesale(inputs());
    expect(w.buyerMAO).toBe(160_000);
    expect(w.offerToSeller).toBe(150_000);
    expect(w.spread).toBe(10_000);
    expect(w.spread).toBe(w.assignmentFee);
  });
});

describe('flip P&L (BuildSpec §10)', () => {
  it('computes total cost, profit and ROI', () => {
    const f = computeFlip(inputs());
    expect(f.purchase).toBe(150_000); // = wholesale offer
    expect(f.sellingCosts).toBe(18_000); // 300000 * 0.06
    expect(f.closingCosts).toBe(3_000); // 150000 * 0.02
    expect(f.totalCost).toBe(228_000); // 150000+50000+5000+3000+2000+18000
    expect(f.projectedProfit).toBe(72_000); // 300000 - 228000
    // ROI on invested basis (excludes selling costs): 72000 / 210000
    expect(f.roi).toBeCloseTo(72_000 / 210_000, 6);
    expect(f.meetsDesiredProfit).toBe(true);
  });

  it('honours an explicit purchase override', () => {
    const f = computeFlip(inputs({ purchaseOverride: 120_000 }));
    expect(f.purchase).toBe(120_000);
  });
});

describe('buy & hold (BuildSpec §10)', () => {
  it('computes GSI/EGI/NOI/cap/DSCR/cash-on-cash', () => {
    const b = computeBuyHold(inputs());
    expect(b.gsi).toBe(24_000); // 2000 * 12
    expect(b.egi).toBe(22_800); // 24000 * 0.95
    expect(b.noi).toBe(16_800); // 22800 - 6000
    expect(b.capRate).toBeCloseTo(16_800 / 150_000, 6);
    expect(b.cashFlowMonthly).toBeCloseTo((16_800 - 8_000) / 12, 6);
    expect(b.dscr).toBeCloseTo(16_800 / 8_000, 6);
    expect(b.cashInvested).toBe(203_000); // 150000 + 50000 + 3000
    expect(b.cashOnCash).toBeCloseTo((16_800 - 8_000) / 203_000, 6);
  });
});

describe('BRRRR (BuildSpec §10)', () => {
  it('computes all-in, refi loan, cash pulled out (cashLeftIn == 0 here)', () => {
    const r = computeBrrrr(inputs());
    expect(r.allIn).toBe(210_000); // 150000+50000+5000+3000+2000
    expect(r.refiLoan).toBe(225_000); // 300000 * 0.75
    expect(r.cashLeftIn).toBe(0);
    expect(r.cashPulledOut).toBe(15_000); // 225000 - 210000
    expect(r.cashOnCash).toBe(0); // safeDiv by 0 cash left in
  });

  it('reports positive cash left in when refi does not cover all-in', () => {
    const r = computeBrrrr(inputs({ refiLTV: 0.6 }));
    expect(r.refiLoan).toBe(180_000);
    expect(r.cashLeftIn).toBe(30_000); // 210000 - 180000
    expect(r.cashPulledOut).toBe(0);
  });
});

describe('novation (BuildSpec §10)', () => {
  it('projectedSale - payoff - rehab - concessions - fee', () => {
    const n = computeNovation(
      inputs({
        novationProjectedSale: 320_000, // assembler passes marketList here
        sellerPayoff: 200_000,
        lightRehab: 10_000,
        concessions: 5_000,
        novationFee: 8_000,
      }),
    );
    expect(n.projectedSale).toBe(320_000);
    expect(n.novationProfit).toBe(97_000);
  });

  it('treats missing optional inputs as 0', () => {
    const n = computeNovation(inputs({ novationProjectedSale: 300_000 }));
    expect(n.novationProfit).toBe(300_000);
  });
});

describe('computeDeals integration', () => {
  it('changing a knob changes outputs (recalc semantics)', () => {
    const base = computeDeals(inputs());
    const cheaper = computeDeals(inputs({ maoPercent: 0.6 }));
    expect(cheaper.wholesale.buyerMAO).toBeLessThan(base.wholesale.buyerMAO);
    // 300000*0.6 - 50000 = 130000
    expect(cheaper.wholesale.buyerMAO).toBe(130_000);
  });
});
