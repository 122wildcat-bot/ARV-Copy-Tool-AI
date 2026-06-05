/**
 * AI orchestrator (BuildSpec §8.4): A → (B and C in parallel) → combined result.
 * Logs token usage per call for cost tracking. Bad model output never crashes
 * the request — callStructured retries on invalid JSON, and failures surface as
 * thrown errors the route layer turns into a clean 5xx.
 */
import type {
  CompProperty,
  CompSelectionResult,
  NormalizationResult,
  RepairEstimate,
  SubjectProperty,
} from '../types.js';
import { estimateRepairs } from './estimateRepairs.js';
import { normalizeFeatures } from './normalizeFeatures.js';
import { selectComps } from './selectComps.js';
import type { TokenUsage } from './client.js';

export interface AiAnalysis {
  normalization: NormalizationResult;
  selection: CompSelectionResult;
  repairs: RepairEstimate;
  tokenUsage: {
    normalize: TokenUsage;
    select: TokenUsage;
    repairs: TokenUsage;
    total: TokenUsage;
  };
}

export interface OrchestratorOptions {
  targetCount: number;
  deepMode?: boolean;
}

export async function runAiAnalysis(
  subject: SubjectProperty,
  comps: CompProperty[],
  opts: OrchestratorOptions,
): Promise<AiAnalysis> {
  // A — normalize / flag (cheap model).
  const { normalized, usage: normalizeUsage } = await normalizeFeatures(subject, comps);

  // B — comp selection. Needs the condition read for C, so run B first, then C.
  const { selection, usage: selectUsage } = await selectComps(
    normalized.subject,
    normalized.comps,
    { targetCount: opts.targetCount, deepMode: opts.deepMode },
  );

  // C — repairs, keyed off the condition read from B.
  const { repairs, usage: repairsUsage } = await estimateRepairs(
    normalized.subject,
    selection.subjectConditionRead,
  );

  const total: TokenUsage = {
    inputTokens: normalizeUsage.inputTokens + selectUsage.inputTokens + repairsUsage.inputTokens,
    outputTokens: normalizeUsage.outputTokens + selectUsage.outputTokens + repairsUsage.outputTokens,
  };

  return {
    normalization: normalized,
    selection,
    repairs,
    tokenUsage: {
      normalize: normalizeUsage,
      select: selectUsage,
      repairs: repairsUsage,
      total,
    },
  };
}
