/**
 * AI smoke test (dev tool). Exercises the full AI path — normalize → select →
 * repairs — against the real Anthropic API using a fabricated subject + comps,
 * so it needs ANTHROPIC_API_KEY but NO data-provider key.
 *
 * Usage (do NOT hardcode the key):
 *   ANTHROPIC_API_KEY=sk-... node --import tsx scripts/aiSmoke.ts
 */
import { runAiAnalysis } from '../src/ai/orchestrator.js';
import { assembleAnalysis } from '../src/engine/assemble.js';
import { defaultDealInputs, defaultEngineKnobs } from '../src/config/knobs.js';
import type { CompProperty, SubjectProperty } from '../src/types.js';

const subject: SubjectProperty = {
  providerId: 'subject',
  standardizedAddress: '212 Torrington Dr, York, PA 17402',
  lat: 39.96,
  lng: -76.65,
  beds: 4,
  baths: 2.5,
  gla: 2100,
  lotSizeSqft: 8000,
  yearBuilt: 1995,
  propertyType: 'SFR',
  stories: 2,
  garageSpaces: 2,
  pool: false,
  basement: 'unfinished',
  county: 'York',
  zip: '17402',
  lastSaleDate: null,
  lastSalePrice: null,
  conditionSignals: ['original 1995 kitchen', 'worn carpet', 'roof ~18 years old'],
  raw: null,
};

function comp(id: string, salePrice: number, over: Partial<CompProperty> = {}): CompProperty {
  return {
    ...subject,
    providerId: id,
    standardizedAddress: `${id} Example Dr, York, PA 17402`,
    saleDate: '2025-09-01',
    salePrice,
    distanceMiles: 0.4,
    daysOnMarket: 22,
    dataSource: 'public_record',
    ...over,
  };
}

const comps: CompProperty[] = [
  comp('c1', 365000, { gla: 2150 }),
  comp('c2', 352000, { gla: 2000, baths: 2 }),
  comp('c3', 379000, { gla: 2250, garageSpaces: 2 }),
  comp('c4', 412000, { gla: 2600 }), // likely outlier
  comp('c5', 358000, { gla: 2050 }),
];

async function main() {
  console.log('Running AI analysis (normalize → select → repairs)...\n');
  const ai = await runAiAnalysis(subject, comps, { targetCount: 4 });

  console.log('Condition read:', ai.selection.subjectConditionRead);
  console.log('Selected comps:', ai.selection.selectedComps.map((c) => c.providerId).join(', '));
  console.log('Repair total (engine-computed):', ai.repairs.total, `(${ai.repairs.lineItems.length} line items)`);
  console.log('Token usage:', ai.tokenUsage.total);

  const analysis = assembleAnalysis({
    subject: ai.normalization.subject,
    comps,
    selections: ai.selection.selectedComps,
    repairs: ai.repairs,
    knobs: defaultEngineKnobs(),
    dealInputs: defaultDealInputs(),
    meta: { provider: 'smoke', deepMode: false, tokenUsage: {}, generatedAt: new Date().toISOString() },
  });

  console.log('\n--- Deterministic engine output ---');
  console.log('ARV:', analysis.valuation.arv);
  console.log('As-Is:', analysis.valuation.asIsValue);
  console.log('Confidence:', analysis.valuation.confidence);
  console.log('Three-tier:', analysis.pricing);
  console.log('Wholesale MAO / offer:', analysis.deals.wholesale.buyerMAO, '/', analysis.deals.wholesale.offerToSeller);
  console.log('\nOK ✅');
}

main().catch((err) => {
  console.error('SMOKE FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
});
