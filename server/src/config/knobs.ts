/**
 * Engine knob defaults (BuildSpec §5). Every knob is overridable per request;
 * these are the env-backed defaults. Per-user defaults (BuildSpec §6.2) are
 * merged on top of these at request time, then request-level `overrides` win.
 */
import type { DealInputs, EngineKnobs } from '../types.js';

function num(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function defaultEngineKnobs(): EngineKnobs {
  return {
    compRadiusMiles: num('COMP_RADIUS_MILES', 1.0),
    compRadiusMaxMiles: num('COMP_RADIUS_MAX_MILES', 5.0),
    compMonthsBack: num('COMP_MONTHS_BACK', 6),
    compTargetCount: num('COMP_TARGET_COUNT', 6),
    compCandidateCount: num('COMP_CANDIDATE_COUNT', 50),
    outlierThresholdPct: num('OUTLIER_THRESHOLD_PCT', 0.2),
    glaAdjPerSqft: num('GLA_ADJ_PER_SQFT', 55),
    // lotRatePerSqft, bedAdj, bathAdj are AI-suggested per market; these are
    // conservative fallbacks used when the AI does not supply a basis.
    lotRatePerSqft: num('LOT_ADJ_PER_SQFT', 2),
    bedAdj: num('BED_ADJ', 5000),
    bathAdj: num('BATH_ADJ', 7500),
    maoPercent: num('MAO_PERCENT', 0.7),
    quickSaleDiscount: num('QUICK_SALE_DISCOUNT', 0.0675),
    testMarketPremium: num('TEST_MARKET_PREMIUM', 0.055),
    roundToEnding: num('ROUND_TO_ENDING', 9900),
    cacheTtlHours: num('CACHE_TTL_HOURS', 72),
  };
}

/** Deal-engine input defaults (BuildSpec §10). All overridable per request. */
export function defaultDealInputs(): Omit<DealInputs, 'arv' | 'repairs'> {
  return {
    maoPercent: num('MAO_PERCENT', 0.7),
    assignmentFee: num('DEFAULT_ASSIGNMENT_FEE', 10000),
    desiredProfit: num('DEFAULT_DESIRED_PROFIT', 40000),
    holdingCosts: num('DEFAULT_HOLDING_COSTS', 0),
    closingCostsPct: num('DEFAULT_CLOSING_COSTS_PCT', 0.02),
    sellingCostsPct: num('DEFAULT_SELLING_COSTS_PCT', 0.06),
    financingCosts: num('DEFAULT_FINANCING_COSTS', 0),
    refiLTV: num('DEFAULT_REFI_LTV', 0.75),
    monthlyRent: 0,
    vacancyPct: num('DEFAULT_VACANCY_PCT', 0.05),
    monthlyOpEx: 0,
    annualDebtService: 0,
  };
}
