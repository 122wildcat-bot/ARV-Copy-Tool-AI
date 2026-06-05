/**
 * Test factories. Build a subject + comps that match exactly on quantitative
 * fields so adjusted price == sale price unless a test intentionally varies
 * something. This isolates each behaviour under test.
 */
import type {
  CompAdjustments,
  CompProperty,
  EngineKnobs,
  SelectedComp,
  SubjectProperty,
} from '../src/types.js';

export function makeSubject(over: Partial<SubjectProperty> = {}): SubjectProperty {
  return {
    providerId: 'subject',
    standardizedAddress: '123 Test St, Town, PA 17000',
    lat: 39.9,
    lng: -76.7,
    beds: 3,
    baths: 2,
    gla: 2000,
    lotSizeSqft: 8000,
    yearBuilt: 1990,
    propertyType: 'single_family',
    stories: 2,
    garageSpaces: 2,
    pool: false,
    basement: 'unfinished',
    county: 'York',
    zip: '17000',
    lastSaleDate: null,
    lastSalePrice: null,
    conditionSignals: [],
    raw: null,
    ...over,
  };
}

export function makeComp(
  providerId: string,
  salePrice: number,
  over: Partial<CompProperty> = {},
): CompProperty {
  const base = makeSubject({ providerId, standardizedAddress: `${providerId} St` });
  return {
    ...base,
    saleDate: '2026-03-01',
    salePrice,
    distanceMiles: 0.5,
    daysOnMarket: 20,
    dataSource: 'mls',
    ...over,
  };
}

export function zeroAdjustments(over: Partial<CompAdjustments> = {}): CompAdjustments {
  return {
    gla: 0,
    lot: 0,
    beds: 0,
    baths: 0,
    garage: 0,
    condition: 0,
    age: 0,
    pool: 0,
    basement: 0,
    other: 0,
    ...over,
  };
}

export function makeSelection(
  providerId: string,
  over: Partial<SelectedComp> = {},
): SelectedComp {
  return {
    providerId,
    similarityScore: 1,
    adjustments: zeroAdjustments(),
    adjustmentRationale: 'test',
    isOutlierCandidate: false,
    ...over,
  };
}

export function makeKnobs(over: Partial<EngineKnobs> = {}): EngineKnobs {
  return {
    compRadiusMiles: 1,
    compRadiusMaxMiles: 5,
    compMonthsBack: 6,
    compTargetCount: 6,
    compCandidateCount: 50,
    outlierThresholdPct: 0.2,
    glaAdjPerSqft: 55,
    lotRatePerSqft: 2,
    bedAdj: 5000,
    bathAdj: 7500,
    maoPercent: 0.7,
    quickSaleDiscount: 0.0675,
    testMarketPremium: 0.055,
    roundToEnding: 9900,
    cacheTtlHours: 72,
    ...over,
  };
}
