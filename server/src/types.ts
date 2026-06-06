/**
 * Shared domain types for ARV Engine.
 *
 * These types are the contract between the data layer, the AI layer, and the
 * deterministic engines. The cardinal rule (BuildSpec §0.4): the AI proposes
 * selections / soft adjustments / repair scopes; the engines compute every
 * final dollar figure.
 */

// ---------------------------------------------------------------------------
// Property shapes (BuildSpec §7.2)
// ---------------------------------------------------------------------------

export type BasementType = 'none' | 'unfinished' | 'finished';

export interface SubjectProperty {
  providerId: string;
  standardizedAddress: string;
  lat: number;
  lng: number;
  beds: number | null;
  baths: number | null; // total baths (e.g. 2.5)
  gla: number | null; // gross living area, sqft
  lotSizeSqft: number | null;
  yearBuilt: number | null;
  propertyType: string | null;
  stories: number | null;
  garageSpaces: number | null;
  pool: boolean | null;
  basement: BasementType | null;
  county: string | null;
  zip: string | null;
  lastSaleDate: string | null;
  lastSalePrice: number | null;
  conditionSignals: string[]; // raw notes/flags the provider exposes, if any
  raw: unknown; // untouched provider payload (for debugging)
}

export type CompDataSource = 'mls' | 'public_record' | 'estimate';

export interface CompProperty extends SubjectProperty {
  saleDate: string; // ISO; must be a SOLD comp
  salePrice: number;
  distanceMiles: number; // from subject
  daysOnMarket: number | null;
  dataSource: CompDataSource;
}

export interface CompSearchCriteria {
  radiusMiles: number;
  monthsBack: number;
  minBeds?: number;
  maxBeds?: number;
  glaTolerancePct?: number; // e.g. 0.30 → ±30% of subject GLA
  propertyTypes?: string[];
  limit: number;
}

// ---------------------------------------------------------------------------
// AI output shapes (BuildSpec §8)
// ---------------------------------------------------------------------------

export type SubjectConditionRead =
  | 'distressed'
  | 'dated'
  | 'average'
  | 'updated'
  | 'renovated';

/** Per-comp, per-category dollar adjustments proposed by the AI (BuildSpec §8.2). */
export interface CompAdjustments {
  gla: number;
  lot: number;
  beds: number;
  baths: number;
  garage: number;
  condition: number;
  age: number;
  pool: number;
  basement: number;
  other: number;
}

export interface SelectedComp {
  providerId: string;
  similarityScore: number; // 0..1
  adjustments: CompAdjustments;
  adjustmentRationale: string;
  isOutlierCandidate: boolean;
}

export interface CompSelectionResult {
  selectedComps: SelectedComp[];
  subjectConditionRead: SubjectConditionRead;
  marketNotes: string;
  floorCeilingNote: string;
}

export interface RepairLineItem {
  category: string;
  scope: string;
  cost: number;
}

export interface RepairEstimate {
  lineItems: RepairLineItem[];
  subtotal: number;
  contingencyPct: number;
  total: number;
  confidence: 'low' | 'medium' | 'high';
}

export interface NormalizationResult {
  subject: SubjectProperty;
  comps: CompProperty[];
  dataQualityNotes: string[];
}

// ---------------------------------------------------------------------------
// Valuation engine outputs (BuildSpec §9)
// ---------------------------------------------------------------------------

/** A comp after the deterministic engine has applied adjustments. */
export interface AdjustedComp {
  comp: CompProperty;
  similarityScore: number;
  adjustments: CompAdjustments;
  adjustmentRationale: string;
  adjustedPrice: number;
  grossAdjPct: number;
  netAdjPct: number;
  isOutlierCandidate: boolean;
  included: boolean;
  flags: string[];
}

export interface Valuation {
  marketValue: number;
  arv: number;
  asIsValue: number;
  medianValue: number;
  valueRange: [number, number]; // [floor, ceiling]
  confidence: 'low' | 'medium' | 'high';
  adjustmentFlags: string[];
}

export interface ThreeTierPricing {
  quickSale: number;
  marketList: number;
  testTheMarket: number;
}

// ---------------------------------------------------------------------------
// Deal engine inputs/outputs (BuildSpec §10)
// ---------------------------------------------------------------------------

export interface DealInputs {
  arv: number;
  repairs: number;
  maoPercent: number; // default 0.70
  assignmentFee: number; // wholesale
  desiredProfit: number; // flip
  holdingCosts: number; // flip/BRRRR
  closingCostsPct: number; // % of price
  sellingCostsPct: number; // % of ARV
  financingCosts: number; // flip/BRRRR
  refiLTV: number; // BRRRR, default 0.75
  monthlyRent: number;
  vacancyPct: number;
  monthlyOpEx: number;
  annualDebtService: number;
  // Novation (optional). projectedSale defaults to the three-tier marketList.
  novationProjectedSale?: number;
  sellerPayoff?: number;
  lightRehab?: number;
  concessions?: number;
  novationFee?: number;
  // Optional explicit purchase override (else derived from wholesale offer)
  purchaseOverride?: number;
}

export interface WholesaleResult {
  buyerMAO: number;
  offerToSeller: number;
  assignmentFee: number;
  spread: number;
}

export interface FlipResult {
  purchase: number;
  repairs: number;
  holdingCosts: number;
  closingCosts: number;
  financingCosts: number;
  sellingCosts: number;
  totalCost: number;
  projectedProfit: number;
  roi: number;
  meetsDesiredProfit: boolean;
}

export interface BuyHoldResult {
  purchase: number;
  gsi: number;
  egi: number;
  noi: number;
  capRate: number;
  cashFlowMonthly: number;
  dscr: number;
  cashInvested: number;
  cashOnCash: number;
}

export interface BrrrrResult {
  allIn: number;
  refiLoan: number;
  cashLeftIn: number;
  cashPulledOut: number;
  cashOnCash: number;
}

export interface NovationResult {
  projectedSale: number;
  sellerPayoff: number;
  lightRehab: number;
  concessions: number;
  fee: number;
  novationProfit: number;
}

export interface DealResults {
  wholesale: WholesaleResult;
  flip: FlipResult;
  buyAndHold: BuyHoldResult;
  brrrr: BrrrrResult;
  novation: NovationResult;
}

// ---------------------------------------------------------------------------
// Engine knobs + top-level result (BuildSpec §5, §11)
// ---------------------------------------------------------------------------

export interface EngineKnobs {
  compRadiusMiles: number;
  compRadiusMaxMiles: number;
  compMonthsBack: number;
  compTargetCount: number;
  compCandidateCount: number;
  outlierThresholdPct: number;
  glaAdjPerSqft: number;
  lotRatePerSqft: number;
  bedAdj: number;
  bathAdj: number;
  maoPercent: number;
  quickSaleDiscount: number;
  testMarketPremium: number;
  roundToEnding: number;
  cacheTtlHours: number;
}

export interface AnalysisResult {
  subject: SubjectProperty;
  comps: { included: AdjustedComp[]; excluded: AdjustedComp[] };
  valuation: Valuation;
  repairs: RepairEstimate;
  pricing: ThreeTierPricing;
  deals: DealResults;
  knobs: DealInputs & EngineKnobs;
  meta: {
    provider: string;
    deepMode: boolean;
    tokenUsage: Record<string, unknown>;
    generatedAt: string;
  };
}
