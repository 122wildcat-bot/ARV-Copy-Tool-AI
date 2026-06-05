/**
 * Recalc service (BuildSpec §11) — PURE and fast. Reconstructs the comps +
 * selections from a stored AnalysisResult and re-runs the deterministic
 * assembler with edited repairs / knobs / deal inputs / comp set. No data pull,
 * no LLM call — this is what makes "change a number → everything updates"
 * instant (BuildSpec §0.5).
 */
import { assembleAnalysis } from '../engine/assemble.js';
import type {
  AdjustedComp,
  AnalysisResult,
  CompProperty,
  DealInputs,
  EngineKnobs,
  RepairEstimate,
  SelectedComp,
} from '../types.js';

const ENGINE_KNOB_KEYS: (keyof EngineKnobs)[] = [
  'compRadiusMiles', 'compRadiusMaxMiles', 'compMonthsBack', 'compTargetCount',
  'compCandidateCount', 'outlierThresholdPct', 'glaAdjPerSqft', 'lotRatePerSqft',
  'bedAdj', 'bathAdj', 'maoPercent', 'quickSaleDiscount', 'testMarketPremium',
  'roundToEnding', 'cacheTtlHours',
];

const DEAL_INPUT_KEYS: (keyof Omit<DealInputs, 'arv' | 'repairs' | 'novationProjectedSale'>)[] = [
  'maoPercent', 'assignmentFee', 'desiredProfit', 'holdingCosts', 'closingCostsPct',
  'sellingCostsPct', 'financingCosts', 'refiLTV', 'monthlyRent', 'vacancyPct',
  'monthlyOpEx', 'annualDebtService', 'sellerPayoff', 'lightRehab', 'concessions',
  'novationFee', 'purchaseOverride',
];

function extract<T extends object>(source: Record<string, unknown>, keys: (keyof T)[]): T {
  const out = {} as T;
  for (const k of keys) {
    const v = source[k as string];
    if (v !== undefined) (out as Record<string, unknown>)[k as string] = v;
  }
  return out;
}

/** A selection is fully reconstructable from a stored AdjustedComp. */
function toSelection(a: AdjustedComp): SelectedComp {
  return {
    providerId: a.comp.providerId,
    similarityScore: a.similarityScore,
    adjustments: a.adjustments,
    adjustmentRationale: a.adjustmentRationale,
    isOutlierCandidate: a.isOutlierCandidate,
  };
}

export interface RecalcEdits {
  repairs?: RepairEstimate;
  knobs?: Partial<EngineKnobs>;
  dealInputs?: Partial<Omit<DealInputs, 'arv' | 'repairs' | 'novationProjectedSale'>>;
  /** Full replacement comp set (used by comp add/remove). */
  comps?: { comps: CompProperty[]; selections: SelectedComp[] };
}

export function recalc(analysis: AnalysisResult, edits: RecalcEdits = {}): AnalysisResult {
  const merged = analysis.knobs as unknown as Record<string, unknown>;
  const knobs: EngineKnobs = { ...extract<EngineKnobs>(merged, ENGINE_KNOB_KEYS), ...edits.knobs };
  const dealInputs = {
    ...extract<Omit<DealInputs, 'arv' | 'repairs' | 'novationProjectedSale'>>(merged, DEAL_INPUT_KEYS),
    ...edits.dealInputs,
  };

  const all: AdjustedComp[] = [...analysis.comps.included, ...analysis.comps.excluded];
  const comps = edits.comps?.comps ?? all.map((a) => a.comp);
  const selections = edits.comps?.selections ?? all.map(toSelection);

  return assembleAnalysis({
    subject: analysis.subject,
    comps,
    selections,
    repairs: edits.repairs ?? analysis.repairs,
    knobs,
    dealInputs,
    meta: { ...analysis.meta, generatedAt: new Date().toISOString() },
  });
}

/** Add a manual comp (BuildSpec §11 /comps/add). */
export function addComp(analysis: AnalysisResult, comp: CompProperty, selection: SelectedComp): AnalysisResult {
  const all: AdjustedComp[] = [...analysis.comps.included, ...analysis.comps.excluded];
  const comps = [...all.map((a) => a.comp), comp];
  const selections = [...all.map(toSelection), selection];
  return recalc(analysis, { comps: { comps, selections } });
}

/** Remove a comp by providerId (BuildSpec §11 /comps/remove). */
export function removeComp(analysis: AnalysisResult, providerId: string): AnalysisResult {
  const all: AdjustedComp[] = [...analysis.comps.included, ...analysis.comps.excluded].filter(
    (a) => a.comp.providerId !== providerId,
  );
  return recalc(analysis, {
    comps: { comps: all.map((a) => a.comp), selections: all.map(toSelection) },
  });
}
