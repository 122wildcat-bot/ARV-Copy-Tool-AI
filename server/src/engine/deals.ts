/**
 * Deal engine (BuildSpec §10) — DETERMINISTIC. No LLM calls. Pure functions.
 *
 * All five deal types are computed from ARV + repairs + knobs. Every knob is
 * configurable per request; changing a knob and re-running is the entire
 * "change a number → everything updates" mechanism (BuildSpec §0.5, §11).
 */
import type {
  BrrrrResult,
  BuyHoldResult,
  DealInputs,
  DealResults,
  FlipResult,
  NovationResult,
  WholesaleResult,
} from '../types.js';
import { safeDiv } from './math.js';

/** 70% rule / MAO — the flip buyer's maximum allowable offer (BuildSpec §10). */
export function buyerMAO(arv: number, maoPercent: number, repairs: number): number {
  return arv * maoPercent - repairs;
}

export function computeWholesale(i: DealInputs): WholesaleResult {
  const mao = buyerMAO(i.arv, i.maoPercent, i.repairs);
  const offerToSeller = mao - i.assignmentFee;
  return {
    buyerMAO: mao,
    offerToSeller,
    assignmentFee: i.assignmentFee,
    spread: i.assignmentFee, // spread == assignment fee by construction
  };
}

/**
 * Flip P&L. Purchase defaults to the wholesale offer-to-seller unless the user
 * supplies an explicit `purchaseOverride`.
 */
export function computeFlip(i: DealInputs): FlipResult {
  const purchase = i.purchaseOverride ?? computeWholesale(i).offerToSeller;
  const sellingCosts = i.arv * i.sellingCostsPct;
  const closingCosts = purchase * i.closingCostsPct;
  const totalCost =
    purchase + i.repairs + i.holdingCosts + closingCosts + i.financingCosts + sellingCosts;
  const projectedProfit = i.arv - totalCost;
  // ROI denominator excludes selling costs (capital deployed into the project).
  const investedBasis =
    purchase + i.repairs + i.holdingCosts + closingCosts + i.financingCosts;
  const roi = safeDiv(projectedProfit, investedBasis);

  return {
    purchase,
    repairs: i.repairs,
    holdingCosts: i.holdingCosts,
    closingCosts,
    financingCosts: i.financingCosts,
    sellingCosts,
    totalCost,
    projectedProfit,
    roi,
    meetsDesiredProfit: projectedProfit >= i.desiredProfit,
  };
}

export function computeBuyHold(i: DealInputs): BuyHoldResult {
  const purchase = i.purchaseOverride ?? computeWholesale(i).offerToSeller;
  const gsi = i.monthlyRent * 12;
  const egi = gsi * (1 - i.vacancyPct);
  const noi = egi - i.monthlyOpEx * 12;
  const capRate = safeDiv(noi, purchase);
  const cashFlowMonthly = (noi - i.annualDebtService) / 12;
  const dscr = safeDiv(noi, i.annualDebtService);

  // Cash invested ≈ down payment + repairs + closing (approximation: all-in
  // less the implied loan from annual debt service is not derivable here, so
  // we use purchase + repairs + closing as the cash basis when no financing
  // detail is supplied). Kept explicit and overridable upstream.
  const closingCosts = purchase * i.closingCostsPct;
  const cashInvested = purchase + i.repairs + closingCosts;
  const cashOnCash = safeDiv(noi - i.annualDebtService, cashInvested);

  return {
    purchase,
    gsi,
    egi,
    noi,
    capRate,
    cashFlowMonthly,
    dscr,
    cashInvested,
    cashOnCash,
  };
}

export function computeBrrrr(i: DealInputs): BrrrrResult {
  const purchase = i.purchaseOverride ?? computeWholesale(i).offerToSeller;
  const closingCosts = purchase * i.closingCostsPct;
  const allIn = purchase + i.repairs + i.holdingCosts + closingCosts + i.financingCosts;
  const refiLoan = i.arv * i.refiLTV;
  const cashLeftIn = Math.max(0, allIn - refiLoan);
  const cashPulledOut = Math.max(0, refiLoan - allIn);

  // Cash-on-cash on the cash left in, using rental NOI net of debt service.
  const gsi = i.monthlyRent * 12;
  const egi = gsi * (1 - i.vacancyPct);
  const noi = egi - i.monthlyOpEx * 12;
  const cashOnCash = safeDiv(noi - i.annualDebtService, cashLeftIn);

  return { allIn, refiLoan, cashLeftIn, cashPulledOut, cashOnCash };
}

export function computeNovation(i: DealInputs): NovationResult {
  // Projected sale defaults to ARV; the assembler passes the three-tier
  // marketList here (BuildSpec §10). Independent of `purchaseOverride`.
  const projectedSale = i.novationProjectedSale ?? i.arv;
  const sellerPayoff = i.sellerPayoff ?? 0;
  const lightRehab = i.lightRehab ?? 0;
  const concessions = i.concessions ?? 0;
  const fee = i.novationFee ?? 0;
  const novationProfit = projectedSale - sellerPayoff - lightRehab - concessions - fee;

  return { projectedSale, sellerPayoff, lightRehab, concessions, fee, novationProfit };
}

export function computeDeals(i: DealInputs): DealResults {
  return {
    wholesale: computeWholesale(i),
    flip: computeFlip(i),
    buyAndHold: computeBuyHold(i),
    brrrr: computeBrrrr(i),
    novation: computeNovation(i),
  };
}
