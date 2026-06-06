/**
 * Analyze orchestration (BuildSpec §2 "/api/analyze flow"). Ties the data layer,
 * cache, AI orchestrator, and deterministic engines together:
 *
 *   geocode → getSubject → getCandidateComps → AI (A,B,C) → valuation → deals.
 *
 * Caching (BuildSpec §7.3): subject and comps are cached per address/criteria
 * and reused within CACHE_TTL_HOURS. The deterministic step is delegated to the
 * pure assembler so /recalc can re-run it without any data pull or LLM call.
 */
import { createHash } from 'node:crypto';
import { runAiAnalysis } from '../ai/orchestrator.js';
import { defaultDealInputs, defaultEngineKnobs } from '../config/knobs.js';
import { buildGeocoder } from '../data/Geocoder.js';
import { ProviderRouter } from '../data/ProviderRouter.js';
import { cacheRepo } from '../db/repo.js';
import { assembleAnalysis } from '../engine/assemble.js';
import type {
  AnalysisResult,
  CompProperty,
  CompSearchCriteria,
  DealInputs,
  EngineKnobs,
  SubjectProperty,
} from '../types.js';

export type AnalyzeOverrides = Partial<EngineKnobs> &
  Partial<Omit<DealInputs, 'arv' | 'repairs' | 'novationProjectedSale'>> & { deepMode?: boolean };

function addressKey(address: string): string {
  return address.trim().toLowerCase().replace(/\s+/g, ' ');
}

function criteriaHash(c: CompSearchCriteria): string {
  return createHash('sha256').update(JSON.stringify(c)).digest('hex').slice(0, 16);
}

export interface AnalyzeDeps {
  router?: ProviderRouter;
}

export async function analyzeAddress(
  address: string,
  overrides: AnalyzeOverrides = {},
  userDefaults: Record<string, unknown> = {},
  deps: AnalyzeDeps = {},
): Promise<AnalysisResult> {
  const router = deps.router ?? new ProviderRouter();
  const geocoder = buildGeocoder();

  // Merge knobs: env defaults < per-user defaults < request overrides.
  const knobs: EngineKnobs = { ...defaultEngineKnobs(), ...userDefaults, ...stripUndefined(overrides) };
  const dealInputs: Omit<DealInputs, 'arv' | 'repairs' | 'novationProjectedSale'> = {
    ...defaultDealInputs(),
    ...pickDealInputs(overrides),
  };

  const key = addressKey(address);

  // 1. Subject (cache → provider).
  let provider = 'cache';
  let subject = cacheRepo.getSubject(key, knobs.cacheTtlHours)?.subject ?? null;
  if (!subject) {
    // Geocoding is best-effort: a failure (network, unrecognized address) must
    // not abort the analysis — providers can still resolve from the raw string.
    const geo = await geocoder.geocode(address).catch(() => null);
    const resolved = await router.getSubject(geo?.standardized ?? address);
    if (!resolved) throw new Error(`Could not resolve subject for "${address}"`);
    subject = geo ? { ...resolved, lat: geo.lat, lng: geo.lng, standardizedAddress: geo.standardized } : resolved;
    cacheRepo.putSubject(key, 'national', subject);
  }

  // 2. Candidate comps (cache → provider).
  const criteria: CompSearchCriteria = {
    radiusMiles: knobs.compRadiusMiles,
    monthsBack: knobs.compMonthsBack,
    limit: knobs.compCandidateCount,
  };
  const cHash = criteriaHash(criteria);
  let comps: CompProperty[] | null = cacheRepo.getComps(key, cHash, knobs.cacheTtlHours);
  if (!comps) {
    const result = await router.getCandidateComps(subject, criteria);
    comps = result.comps;
    provider = result.provider;
    cacheRepo.putComps(key, provider, cHash, comps);
  } else {
    provider = 'cache';
  }

  // 3. AI: normalize → select → repairs.
  const ai = await runAiAnalysis(subject, comps, {
    targetCount: knobs.compTargetCount,
    deepMode: overrides.deepMode,
  });

  // 4 & 5. Deterministic valuation + deal math via the pure assembler.
  return assembleAnalysis({
    subject: ai.normalization.subject,
    comps,
    selections: ai.selection.selectedComps,
    repairs: ai.repairs,
    knobs,
    dealInputs,
    meta: {
      provider,
      deepMode: Boolean(overrides.deepMode),
      tokenUsage: ai.tokenUsage as unknown as Record<string, unknown>,
      generatedAt: new Date().toISOString(),
    },
  });
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

const DEAL_INPUT_KEYS: (keyof DealInputs)[] = [
  'maoPercent', 'assignmentFee', 'desiredProfit', 'holdingCosts', 'closingCostsPct',
  'sellingCostsPct', 'financingCosts', 'refiLTV', 'monthlyRent', 'vacancyPct',
  'monthlyOpEx', 'annualDebtService', 'sellerPayoff', 'lightRehab', 'concessions',
  'novationFee', 'purchaseOverride',
];

function pickDealInputs(overrides: AnalyzeOverrides): Partial<DealInputs> {
  const out: Partial<DealInputs> = {};
  for (const k of DEAL_INPUT_KEYS) {
    const v = (overrides as Record<string, unknown>)[k];
    if (typeof v === 'number') (out as Record<string, unknown>)[k] = v;
  }
  return out;
}
