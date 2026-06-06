# ARV Engine *(working title — rename)*

## Build Specification for Claude Code — Standalone Application

**Owner:** Adam Druck — Adam Druck Group (Real Estate · Investment Analysis)
**Type:** Brand-new, standalone web application (independent of FlipIQ)
**Goal:** Build a self-contained AI-driven comp + valuation + offer tool that replicates the ChatARV capability set (find comps → value → generate offer/report) and layers Adam's proprietary valuation methodology, using Adam's own MLS data where available.

**Scope assumption:** Built first for Adam Druck Group's own use as a standalone tool. Multi-seat billing / public free-trial / commercialization is an **optional track (Phase C)** that can be switched on later without reworking the core. This document is the single source of truth — upload it to Claude Code and build in the phase order in §14.

> **How to use this doc in Claude Code:** Start a fresh repo. Put this file at `/docs/BuildSpec.md`. Build in phase order; each phase has acceptance criteria — treat them as gates. Ask before adding infra beyond what's specified. The core architectural rule is non-negotiable: **the AI selects and reasons; deterministic TypeScript computes every dollar figure.**

-----

## 0. Design principles (read first)

1. **Standalone and self-contained.** New repo, own database, own auth, own deployment. No dependency on FlipIQ.
2. **Port reusable assets, don't recreate** (see §16): Adam's CMA template, `cmaSystemPrompt.ts` methodology, PDF approach, and ADG branding come over as starting material.
3. **Provider-agnostic data layer.** All property/comp data flows through one interface (`PropertyDataProvider`). Vendors are swappable. Business logic never calls a vendor SDK directly.
4. **AI selects and reasons; deterministic code computes the money.** The LLM ranks comps, proposes adjustments, and estimates repairs. Every final figure (ARV, MAO, three-tier pricing, deal math) is computed in plain, unit-tested TypeScript. Never let the model do the final arithmetic.
5. **Everything is editable and recalculates instantly.** Add/remove a comp, edit a repair line, or change MAO% / assignment fee → the whole analysis recomputes via a pure function with no new data pull and no required LLM call.
6. **Two outputs from one engine.** Investor side: ARV → MAO / wholesale / flip / BRRRR / buy-and-hold. Agent side: Market Value → Adam's three-tier listing pricing (Quick Sale / Market Value / Test the Market).
7. **Cost-conscious model routing.** Cheap model for extraction, mid model for the reasoning that matters, premium model only on demand.

See the full specification body in the project task description. This file is the canonical reference for the phased build plan (§14), the deterministic engine formulas (§9, §10), the data-layer interface (§7.2), and the AI orchestration contract (§8).

-----

## Engine formula reference (canonical)

### Valuation (§9)
- `adjustedPrice = comp.salePrice + sum(all adjustments)`
- `grossAdjPct = sum(abs(adjustments)) / comp.salePrice`; `netAdjPct = abs(sum(adjustments)) / comp.salePrice`
- Guardrails (flag, don't block): `grossAdjPct > 0.25` or `netAdjPct > 0.15`
- Outlier band: `[median*(1-OUTLIER_THRESHOLD_PCT), median*(1+OUTLIER_THRESHOLD_PCT)]`; `included` = adjustedPrice in band AND not isOutlierCandidate
- `floor = min(adjustedPrice all comps)`, `ceiling = max(adjustedPrice all comps)`
- If included < 3, keep the 3 closest-to-median, flag low confidence
- `marketValue = sum(adjustedPrice_i * similarity_i)/sum(similarity_i)` over INCLUDED comps
- `ARV = marketValue`; `asIsValue = max(0, ARV - repairs)`
- `roundTo9900(x) = round((x - 9900)/10000)*10000 + 9900`
- `quickSale = roundTo9900(marketValue*(1-QUICK_SALE_DISCOUNT))`
- `marketList = roundTo9900(marketValue)`
- `testTheMarket = roundTo9900(marketValue*(1+TEST_MARKET_PREMIUM))`

### Deals (§10)
- MAO: `buyerMAO = arv*maoPercent - repairs`
- Wholesale: `offerToSeller = buyerMAO - assignmentFee`; `spread = assignmentFee`
- Flip: `sellingCosts = arv*sellingCostsPct`; `closingCosts = purchase*closingCostsPct`; `totalCost = purchase + repairs + holdingCosts + closingCosts + financingCosts + sellingCosts`; `projectedProfit = arv - totalCost`; `roi = projectedProfit/(purchase+repairs+holdingCosts+closingCosts+financingCosts)`
- Buy & Hold: `gsi = monthlyRent*12`; `egi = gsi*(1-vacancyPct)`; `noi = egi - monthlyOpEx*12`; `capRate = noi/purchase`; `cashFlowMo = (noi-annualDebtService)/12`; `dscr = noi/annualDebtService`; `cashOnCash = (noi-annualDebtService)/cashInvested`
- BRRRR: `allIn = purchase+repairs+holdingCosts+closingCosts+financingCosts`; `refiLoan = arv*refiLTV`; `cashLeftIn = max(0, allIn-refiLoan)`; `cashPulledOut = max(0, refiLoan-allIn)`
- Novation: `novationProfit = projectedSale - sellerPayoff - lightRehab - concessions - fee`
