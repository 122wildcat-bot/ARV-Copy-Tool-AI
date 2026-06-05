# ARV Engine *(working title)*

AI-driven comp + valuation + offer tool for **Adam Druck Group**. Type a US
address → AI-selected sold comps with line-item adjustments → a defensible ARV,
As-Is value, and editable repair estimate → offer math for five deal types →
three-tier listing pricing → a branded report.

> **Core architectural rule (non-negotiable):** the AI *selects and reasons*;
> deterministic, unit-tested TypeScript *computes every dollar figure*. The LLM
> never produces a final number. See `docs/BuildSpec.md`.

## Monorepo layout

```
docs/BuildSpec.md     # single source of truth (phased plan + formulas)
server/               # Express + TypeScript API
  src/
    config/           # env + engine knob defaults (§5)
    data/             # PropertyDataProvider interface, providers, router, geocoder (§7)
    ai/               # normalize / selectComps / estimateRepairs / orchestrator (§8)
    engine/           # valuation.ts, deals.ts, assemble.ts — PURE money math (§9, §10)
    prompts/          # cmaSystemPrompt.ts — ported ADG methodology (§16)
    db/               # node:sqlite client + schema + repos (§7.3)
    auth/             # email/password + signed session cookies (§6.1)
    routes/           # analyze, deals, reports, auth (§11)
    reports/          # HTML render for investor + listing modes (§12)
    service/          # analyzeService (data→AI→engine) + recalcService (pure)
  tests/              # vitest — valuation, deals, assemble/recalc
client/               # React + Vite SPA (Phase 8 starting point, §13)
```

## Build status vs the phased plan (BuildSpec §14)

| Phase | Scope | Status |
|------|-------|--------|
| 0 | Scaffold, DB client + migrations, `/health`, env | ✅ done |
| 1 | Auth & accounts (email/password + sessions; Google OAuth scaffolded) | ✅ core done · ⏳ Google OAuth callback TODO |
| 2 | Data layer + provider (interface, RentCast + ATTOM impls, router, geocoder, cache + TTL) | ✅ RentCast + ATTOM + cache done · ⏳ Bright MLS mapping stubbed |
| 3 | AI orchestration (forced-tool JSON + zod + retry, A/B/C, token logging) | ✅ done |
| 4 | Valuation engine + full unit tests | ✅ done (exact `roundTo9900`, outlier band, <3 fallback, weighting) |
| 5 | Deal engine + unit tests (all five deal types) | ✅ done |
| 6 | API + persistence + pure fast recalc + comp add/remove | ✅ done |
| 7 | Reports (investor + listing HTML + Playwright PDF) | ✅ done (run `npx playwright install chromium` for PDF) |
| 8 | Frontend (auth → address → results → live recalc) | ✅ lean scaffold |
| 9 | Bright MLS provider + deep mode | ⏳ provider stubbed, deep-mode toggle wired |
| C | Stripe billing / Postgres | ⏳ not started (optional) |

Deterministic engines, the pure recalc path, the ATTOM mapping, and the report
renderer are fully unit-tested (37 tests). The AI and live-data paths require
`ANTHROPIC_API_KEY` and a data-provider key.

## Running / test run

```bash
cp .env.example .env          # fill in keys (see below)
npm install                   # installs workspaces (+ Playwright)
npm test                      # 37 server tests, no keys needed

# For a real analyze run you need:
#   ANTHROPIC_API_KEY=...                 (AI comp selection + repairs)
#   DATA_PROVIDER=attom  ATTOM_API_KEY=...  (or rentcast + RENTCAST_API_KEY)
#   SESSION_SECRET=<any long random string>
# For PDF reports (one-time):
npx playwright install chromium --workspace @arv-engine/server

# Dev
npm run dev:server            # Express on :3000 (uses node:sqlite)
npm run dev:client            # Vite on :5173, proxies /api → :3000
```

Then open http://localhost:5173 → sign up → enter an address → Analyze.
`/health` returns `{ status: "ok", db: "connected" }`. All `/api/*` engine
routes require an authenticated session cookie. Report PDFs come from
`POST /api/reports/:id { "format": "pdf", "mode": "investor" | "listing" }`
(returns the report HTML with `"format": "html"`, or if Chromium isn't
installed yet).

## Key endpoints (BuildSpec §11)

| Method | Route | Notes |
|--------|-------|-------|
| POST | `/api/auth/signup` · `/login` · `/logout` · GET `/me` | session cookie auth |
| POST | `/api/analyze` | `{ address, overrides? }` → full `AnalysisResult`, persists a deal |
| GET | `/api/deals` · `/api/deals/:id` | list / fetch |
| POST | `/api/deals/:id/recalc` | **pure & fast** — no data pull, no LLM |
| POST | `/api/deals/:id/comps/add` · `/comps/remove` | re-reconciles |
| POST | `/api/reports/:id` | `{ mode: investor \| listing }` → branded HTML |

## Decisions still pending (BuildSpec §17)

Product name/domain, internal-vs-SaaS, MVP data provider (RentCast vs ATTOM),
Bright MLS feed approval, SQLite-vs-Postgres, Gmail send-offer, shareable links.
