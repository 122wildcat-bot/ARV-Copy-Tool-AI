/**
 * Valuation engine (BuildSpec §9) — DETERMINISTIC. No LLM calls.
 *
 * Takes the subject, the AI-selected comps with proposed adjustments, the
 * engine knobs, and the (editable) repair total, and computes adjusted comp
 * prices, outlier exclusion, the reconciled Market Value / ARV / As-Is, and
 * the three-tier listing pricing.
 *
 * Hard rule (BuildSpec §0.4): the AI proposes selections and SOFT adjustments
 * (condition, age, garage, pool, basement, other). The engine RECOMPUTES the
 * quantitative adjustments (GLA, lot, beds, baths) from configured rates so
 * they are consistent and auditable. The AI's quantitative values are ignored
 * for the final number but kept on the record as a cross-check.
 */
import type {
  AdjustedComp,
  CompAdjustments,
  CompProperty,
  EngineKnobs,
  SelectedComp,
  SubjectProperty,
  ThreeTierPricing,
  Valuation,
} from '../types.js';
import { median, roundToEnding, safeDiv, sum } from './math.js';

export interface ValuationInput {
  subject: SubjectProperty;
  comps: CompProperty[];
  selections: SelectedComp[];
  knobs: EngineKnobs;
  repairsTotal: number;
}

export interface ValuationOutput {
  included: AdjustedComp[];
  excluded: AdjustedComp[];
  valuation: Valuation;
  pricing: ThreeTierPricing;
}

const GROSS_ADJ_WARN = 0.25;
const NET_ADJ_WARN = 0.15;

/** Difference helper that treats either side being null/undefined as "no signal" (0). */
function delta(a: number | null | undefined, b: number | null | undefined): number {
  if (a == null || b == null) return 0;
  return a - b;
}

/**
 * Recompute the adjustment vector for a single comp. Quantitative categories
 * are derived from rates; soft categories pass through from the AI proposal.
 */
function recomputeAdjustments(
  subject: SubjectProperty,
  comp: CompProperty,
  proposed: CompAdjustments,
  knobs: EngineKnobs,
): CompAdjustments {
  return {
    gla: delta(subject.gla, comp.gla) * knobs.glaAdjPerSqft,
    lot: delta(subject.lotSizeSqft, comp.lotSizeSqft) * knobs.lotRatePerSqft,
    beds: delta(subject.beds, comp.beds) * knobs.bedAdj,
    baths: delta(subject.baths, comp.baths) * knobs.bathAdj,
    // Soft categories: trust the AI's dollar proposal.
    garage: proposed.garage,
    condition: proposed.condition,
    age: proposed.age,
    pool: proposed.pool,
    basement: proposed.basement,
    other: proposed.other,
  };
}

function adjustmentValues(adj: CompAdjustments): number[] {
  return [
    adj.gla,
    adj.lot,
    adj.beds,
    adj.baths,
    adj.garage,
    adj.condition,
    adj.age,
    adj.pool,
    adj.basement,
    adj.other,
  ];
}

/** Build the adjusted-comp records for every selection that resolves to a comp. */
export function buildAdjustedComps(input: ValuationInput): AdjustedComp[] {
  const { subject, comps, selections, knobs } = input;
  const byId = new Map(comps.map((c) => [c.providerId, c]));
  const adjusted: AdjustedComp[] = [];

  for (const sel of selections) {
    const comp = byId.get(sel.providerId);
    if (!comp) continue; // selection referenced an unknown comp; skip safely

    const adjustments = recomputeAdjustments(subject, comp, sel.adjustments, knobs);
    const values = adjustmentValues(adjustments);
    const totalAdj = sum(values);
    const adjustedPrice = comp.salePrice + totalAdj;
    const grossAdjPct = safeDiv(
      sum(values.map((v) => Math.abs(v))),
      comp.salePrice,
    );
    const netAdjPct = safeDiv(Math.abs(totalAdj), comp.salePrice);

    const flags: string[] = [];
    if (grossAdjPct > GROSS_ADJ_WARN) {
      flags.push(
        `Gross adjustments ${(grossAdjPct * 100).toFixed(0)}% exceed ${(GROSS_ADJ_WARN * 100).toFixed(0)}% on ${comp.standardizedAddress}`,
      );
    }
    if (netAdjPct > NET_ADJ_WARN) {
      flags.push(
        `Net adjustments ${(netAdjPct * 100).toFixed(0)}% exceed ${(NET_ADJ_WARN * 100).toFixed(0)}% on ${comp.standardizedAddress}`,
      );
    }

    adjusted.push({
      comp,
      similarityScore: clamp01(sel.similarityScore),
      adjustments,
      adjustmentRationale: sel.adjustmentRationale,
      adjustedPrice,
      grossAdjPct,
      netAdjPct,
      isOutlierCandidate: sel.isOutlierCandidate,
      included: true, // refined in applyOutlierExclusion
      flags,
    });
  }

  return adjusted;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/**
 * Apply Adam's outlier convention (BuildSpec §9.2). Mutates `included` on each
 * record. Returns the median used and floor/ceiling across ALL comps.
 */
export function applyOutlierExclusion(
  adjusted: AdjustedComp[],
  knobs: EngineKnobs,
): { medianAdjusted: number; floor: number; ceiling: number; lowConfidence: boolean } {
  if (adjusted.length === 0) {
    return { medianAdjusted: 0, floor: 0, ceiling: 0, lowConfidence: true };
  }

  const prices = adjusted.map((a) => a.adjustedPrice);
  const med = median(prices);
  const lower = med * (1 - knobs.outlierThresholdPct);
  const upper = med * (1 + knobs.outlierThresholdPct);
  const floor = Math.min(...prices);
  const ceiling = Math.max(...prices);

  for (const a of adjusted) {
    a.included = a.adjustedPrice >= lower && a.adjustedPrice <= upper && !a.isOutlierCandidate;
  }

  let lowConfidence = false;
  const includedCount = adjusted.filter((a) => a.included).length;
  if (includedCount < 3) {
    // Fallback: keep the 3 closest to the median, flag low confidence.
    const byCloseness = [...adjusted].sort(
      (a, b) => Math.abs(a.adjustedPrice - med) - Math.abs(b.adjustedPrice - med),
    );
    for (const a of adjusted) a.included = false;
    for (const a of byCloseness.slice(0, 3)) a.included = true;
    lowConfidence = true;
  }

  return { medianAdjusted: med, floor, ceiling, lowConfidence };
}

function gradeConfidence(
  includedCount: number,
  lowConfidence: boolean,
  adjustmentFlags: string[],
  includedComps: AdjustedComp[],
): 'low' | 'medium' | 'high' {
  if (lowConfidence || includedCount < 3) return 'low';

  let score = 2; // start at "high"
  if (includedCount < 4) score -= 1;
  if (adjustmentFlags.length > 0) score -= 1;

  const hasNonMls = includedComps.some((c) => c.comp.dataSource !== 'mls');
  if (hasNonMls) score -= 1;

  if (score >= 2) return 'high';
  if (score >= 1) return 'medium';
  return 'low';
}

/**
 * Reconcile included comps to Market Value / ARV / As-Is and produce the
 * three-tier listing pricing (BuildSpec §9.3, §9.4).
 */
export function runValuation(input: ValuationInput): ValuationOutput {
  const { knobs, repairsTotal } = input;
  const adjusted = buildAdjustedComps(input);
  const { medianAdjusted, floor, ceiling, lowConfidence } = applyOutlierExclusion(
    adjusted,
    knobs,
  );

  const included = adjusted.filter((a) => a.included);
  const excluded = adjusted.filter((a) => !a.included);

  // Similarity-weighted reconciliation over INCLUDED comps.
  const weightSum = sum(included.map((a) => a.similarityScore));
  const weighted = sum(included.map((a) => a.adjustedPrice * a.similarityScore));
  // If similarity weights are all zero, fall back to a simple mean.
  const marketValue =
    weightSum > 0
      ? weighted / weightSum
      : included.length > 0
        ? sum(included.map((a) => a.adjustedPrice)) / included.length
        : 0;

  const medianValue = median(included.map((a) => a.adjustedPrice));
  const arv = marketValue;
  const asIsValue = Math.max(0, arv - repairsTotal);

  const adjustmentFlags = adjusted.flatMap((a) => a.flags);
  if (lowConfidence) {
    adjustmentFlags.push('Fewer than 3 comps in the outlier band — confidence is low.');
  }

  const valuation: Valuation = {
    marketValue,
    arv,
    asIsValue,
    medianValue,
    valueRange: [floor, ceiling],
    confidence: gradeConfidence(included.length, lowConfidence, adjustmentFlags, included),
    adjustmentFlags,
  };

  const pricing: ThreeTierPricing = {
    quickSale: roundToEnding(marketValue * (1 - knobs.quickSaleDiscount), knobs.roundToEnding),
    marketList: roundToEnding(marketValue, knobs.roundToEnding),
    testTheMarket: roundToEnding(marketValue * (1 + knobs.testMarketPremium), knobs.roundToEnding),
  };

  // medianAdjusted is exposed for tests/debugging via the included set; kept
  // internal to avoid widening the public Valuation shape.
  void medianAdjusted;

  return { included, excluded, valuation, pricing };
}
