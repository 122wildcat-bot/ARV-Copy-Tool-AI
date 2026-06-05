/**
 * Analysis assembler — the PURE recompute core (BuildSpec §11).
 *
 * Given the subject, comps, AI selections, repair estimate, and all knobs,
 * this runs the deterministic valuation and deal engines and assembles the
 * full AnalysisResult. It performs no data pull and no LLM call, which is what
 * makes `/api/deals/:id/recalc` instant and free — edit a comp, a repair line,
 * or a knob and re-run this function.
 */
import type {
  AnalysisResult,
  CompProperty,
  DealInputs,
  EngineKnobs,
  RepairEstimate,
  SelectedComp,
  SubjectProperty,
} from '../types.js';
import { computeDeals } from './deals.js';
import { runValuation } from './valuation.js';

export interface AssembleParams {
  subject: SubjectProperty;
  comps: CompProperty[];
  selections: SelectedComp[];
  repairs: RepairEstimate;
  knobs: EngineKnobs;
  /** Deal-engine inputs minus arv/repairs, which are derived here. */
  dealInputs: Omit<DealInputs, 'arv' | 'repairs' | 'novationProjectedSale'>;
  meta: {
    provider: string;
    deepMode: boolean;
    tokenUsage: Record<string, unknown>;
    generatedAt: string;
  };
}

export function assembleAnalysis(params: AssembleParams): AnalysisResult {
  const { subject, comps, selections, repairs, knobs, dealInputs, meta } = params;

  const { included, excluded, valuation, pricing } = runValuation({
    subject,
    comps,
    selections,
    knobs,
    repairsTotal: repairs.total,
  });

  const fullDealInputs: DealInputs = {
    ...dealInputs,
    arv: valuation.arv,
    repairs: repairs.total,
    novationProjectedSale: pricing.marketList,
  };

  const deals = computeDeals(fullDealInputs);

  return {
    subject,
    comps: { included, excluded },
    valuation,
    repairs,
    pricing,
    deals,
    knobs: { ...fullDealInputs, ...knobs },
    meta,
  };
}
