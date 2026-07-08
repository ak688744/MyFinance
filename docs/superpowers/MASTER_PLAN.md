# MyFinance Web — Master Plan

> **This is the durable memory of the project.** Chat context is disposable; this
> document and the per-layer specs are ground truth. Every session starts by reading
> this file and ends by updating it.

**Date created:** 2026-06-11
**Status:** L0 + L1 + L1.5 merged to `main` (PR #1, #2, #4); design spike merged (PR #3). **L2 (Web UI) build complete 2026-06-15** on branch `layer/2-web-ui` (`apps/web` Vite/React SPA + read-only `/expenses` endpoints; core 222 + api 45 + web 15 green; Groww golden-master unchanged) → PR pending. Next layer = L3 (MCP Server).

---

## 1. North Star

A self-hosted **personal wealth manager**: one place that ingests and stores all of
my finances (expenses, investments, loans), lets me visualize them, and — the actual
point — gives me a layer of **AI agents** that reason over that data and help me grow
my wealth.

The agents are the product. The backend, UI, and MCP server exist primarily to feed
them. The "Investment Analyzer" (gather MF holdings → compute sector split → fetch
news → tell me what's doing well/badly and what will help/hurt) is the canonical
example; the long-term goal is a **wealth-manager orchestrator** that delegates to
specialist agents (expense / investment / loan) and synthesizes holistic advice.

### Why re-platform from the existing app?
The existing Expo/React Native app (`/Users/vkhandelwal/Documents/MyFinance`,
current local-first version) has clean, working, **validated** business logic but
the mobile runtime **cannot spawn agents, run long background analysis, or reach the
internet** the way a real agent system needs. The business logic is portable; the AI
runtime forces a server. We keep the logic, move it to a Node/TS backend, and build
the agent layer on top.

---

## 2. Locked Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Users / hosting | **Single-user, self-hosted, local-first preserved.** Auth added later if needed. | Keeps v1 lean; no multi-tenancy tax up front. |
| Backend language | **Node + TypeScript** | Existing `features/` logic (parsers, categorization, XIRR, AMFI) ports over as-is; one language across UI/API/agents/tools; shared types end-to-end; TS-first MCP + Agent SDK ecosystem. |
| Agent engine | **Claude Agent SDK (TypeScript)** | Purpose-built for orchestrator + subagent coordination, tool loops, context mgmt — exactly the capability the mobile app lacked. |
| Tool contract | **MCP server wrapping `core` logic** | Agents reach finance data only through MCP tools. Clean, swappable contract. |
| Database | **SQLite now → Postgres + pgvector later**, via **Drizzle ORM** | Local-first start; no raw dialect-specific SQL in business logic so the Postgres+RAG migration is config, not rewrite. |
| RAG (future) | Vectors live in the **same DB** (sqlite-vec now / pgvector later) | Retrieval can join vector similarity with actual finance data; no second system. |

**Greenfield sanity check:** even with no existing code this product (a full-stack app
with an intelligent layer, not a quant/ML research system) would still favor TypeScript;
with the existing TS codebase the choice is decisive.

---

## 3. System Architecture (one-pager)

```
┌─────────────────────────────────────────────────────────┐
│  L4  AI LAYER — Claude Agent SDK                          │
│      Wealth-Manager (orchestrator)                        │
│        ├─ Expense agent   ├─ Investment agent             │
│        └─ Loan agent      + Chat-with-your-data           │
│                  │ calls tools via                        │
├──────────────────┼────────────────────────────────────────┤
│  L3  MCP SERVER — tool contract over finance data         │
├──────────────────┼────────────────────────────────────────┤
│  L2  WEB UI ──────┤ reads REST API                         │
│      Expenses · Investments · Loans (visualize)           │
├──────────────────┼────────────────────────────────────────┤
│  L1  DATA API + INGESTION (REST/JSON)                     │
│      import statements/investments, dedupe, categorize    │
├──────────────────┼────────────────────────────────────────┤
│  L0  FOUNDATION — Node/TS server + shared `core` package  │
│      Drizzle ORM ──► SQLite (now) ──► Postgres+pgvector   │
└─────────────────────────────────────────────────────────┘
   Shared TS types flow top-to-bottom — one source of truth
```

### Proposed repo shape (monorepo)
```
/packages/core      ← ported features/ (parsers, categorization, portfolio/XIRR) + Drizzle schema + shared types
/packages/api       ← L0/L1 REST server
/packages/mcp       ← L3 MCP server (imports core)
/packages/agents    ← L4 Claude Agent SDK agents
/apps/web           ← L2 web UI
/apps/mobile        ← existing RN app (later: calls api instead of local logic)
/docs/superpowers/specs   ← per-layer specs
```
`core` is the keystone: every layer above imports it, so the hard-won logic has exactly
one home.

---

## 4. Build Order (each = its own spec → plan → build cycle)

Build bottom-up; nothing above can be concretely designed until the layer below is pinned.

| Layer | Name | Scope | Status | Spec |
|---|---|---|---|---|
| **L0** | Foundation | Node/TS server skeleton, Drizzle schema + DB, port `features/`→`core`, basic REST API | ✅ Done | [spec](specs/2026-06-12-l0-foundation-design.md) · [plan](plans/2026-06-12-l0-foundation.md) |
| **L1** | Ingestion + Data API | Server-side statement/investment import (MF model), **multi-platform parser registry** (Groww/HDFC now; ET Money etc. drop-in later), **multi-account** ingestion + reads, dedupe, categorize; rule CRUD; the read API for UI + agents | ✅ Done (PR [#2](https://github.com/ak688744/MyFinance/pull/2), branch `layer/1-ingestion`; core 172 + api 28 green) | [spec](specs/2026-06-12-l1-ingestion-design.md) · [plan](plans/2026-06-13-l1-ingestion.md) |
| **L1.5** | Unified Investment Model + first-class Accounts | **Generalize the investment foundation to all asset classes** (mutual funds, stocks, PPF, FD, cash): `accounts` + `assets` (assetClass) + generalized cashflows; per-class **valuation strategy** (market price API / computed interest / manual) and **ingestion strategy** (file-import via L1's registry / manual-entry CRUD); **net-worth rollup** + per-asset insights; migrate existing MF data (Groww golden-master is the safety net). **Also makes `accounts` first-class for EXPENSES** — today the `transactions` table has no account dimension (single implicit account); L1.5 adds it so the user can track multiple bank/expense accounts, sharing one unified accounts model with investments. Reshapes `core` schema → T1 with Groww re-validation. | ✅ Done (PR [#4](https://github.com/ak688744/MyFinance/pull/4), branch `layer/1.5-unified-investment`; core 215 + api 42 green; Groww golden-master unchanged) | [spec](specs/2026-06-14-l1.5-unified-investment-model-design.md) · [plan](plans/2026-06-14-l1.5-unified-investment-model.md) |
| **L2** | Web UI | Web frontend: Expenses, Investments (unified multi-asset net-worth view), Loans visualization; reads the API. Enriched expense reads (date-range/direction/search filters + `/expenses/summary`) designed here against concrete layouts. | ✅ Done (branch `layer/2-web-ui`; `apps/web` Vite/React SPA; core 222 + api 45 + web 15 green; Groww golden-master unchanged) | [spec](specs/2026-06-14-l2-web-ui-design.md) · [plan](plans/2026-06-14-l2-web-ui.md) · UI contract: [frontend spike](specs/2026-06-13-frontend-design-spike-design.md) |
| **L3** | MCP Server | Wraps data layer as MCP tools — the agent tool contract | ⬜ Not started | — |
| **L4** | AI / Wealth Manager | Chat-with-your-data, then specialist agents + orchestrator (Claude Agent SDK) | ⬜ Not started | — |

> Update this table as layers progress. Status legend: ⬜ Not started · 🟡 In progress · ✅ Done · ⛔ Blocked.

---

## 5. SDLC — Tiered by Work Size

**Principle:** specs + this master plan are durable memory; chat context is disposable.
Each layer/feature is a fresh session that re-hydrates from written artifacts, not prior chat.
**Don't pay full-process cost for small work** — triage first, then run the matching tier.

### Triage (the FIRST thing every session does)
A minimal **SessionStart hook** injects: *"Classify this task's tier per the
`myfinance-sdlc` skill, then proceed."* The heavy procedure lazy-loads (via the skill)
only once a tier needs it — T3 bug fixes never pay for it.

Classification rules:
- **Touches `core` financial logic (XIRR, categorization, parsers, portfolio math)? → always T1**, regardless of size, **with Groww re-validation.** This code regresses silently (see project-memory: XIRR convergence, AMFI matching).
- New layer or architectural surface → **T1**.
- Scoped change, a few files, no new contracts → **T2**.
- One obvious localized fix → **T3**.
- **When unsure, round up a tier.** Cheap insurance.

**Confirmation gate:** after classifying, the agent states the chosen tier + the rule
that selected it, then **asks the user to confirm or override before proceeding.** No
brainstorming/planning/coding starts until confirmed. Prevents silent under-tiering.

### Tiers
| Tier | What | Process |
|---|---|---|
| **T1 — Layer / feature build** | A whole layer (L0–L4), substantial feature, OR any core-logic change | **Full discipline:** hydrate → brainstorm (write spec) → writing-plans → branch `layer/<n>-name` → **TDD** → subagent code review → PR → update master plan + project-memory |
| **T2 — Small feature / enhancement** | Scoped change, few files, no new architecture | **Light:** short inline plan (no formal spec) → implement → tests for new logic → self-review |
| **T3 — Bug fix / tweak** | Localized fix, copy change, obvious correction | **Direct:** fix → verify (add/run test if logic changed) → done |

### Discipline rules (apply to T1)
- **One layer per session** — protects context.
- **Spec is the contract** — agents implement to the spec; drift = bug.
- **TDD is non-negotiable** — the test suite is how we trust code the agent wrote.
- **`core` is frozen-ish** — changes require re-validating against Groww.
- **Master plan = the index** — read first, update last, every session.

---

## 6. Orchestration Wiring (how sessions self-govern)

| Piece | Role |
|---|---|
| **SessionStart hook** (minimal) | Deterministically injects "read MASTER_PLAN.md + classify tier per `myfinance-sdlc`" into every session. The linchpin guarantee. |
| **`CLAUDE.md`** | Always-loaded pointer to this plan + the skill (backstop to the hook). |
| **`.claude/skills/myfinance-sdlc/`** | The fat procedure: triage decision tree + the three tier processes. Lazy-loaded only when invoked. |
| **`docs/superpowers/MASTER_PLAN.md`** (this file) | Project state: decisions, build order, layer status, spec links. |
| **`docs/superpowers/specs/`** | Per-layer specs (the contracts). |
| **project-memory MCP** | Decisions + research findings (already wired). Hydrate from it; save decisions at session end. |

> A plugin was considered and rejected (YAGNI): plugins distribute skills across
> projects/people; this is one repo, one person. A local project skill suffices.
> Promote to a plugin only if this SDLC is ever reused elsewhere.

---

## 7. How To Start A New Session (for future me / future agent)

1. Read this file (`docs/superpowers/MASTER_PLAN.md`) fully.
2. Check `mcp__project-memory__get_context` for decisions/findings.
3. Classify the task tier (§5). When unsure, round up.
4. Run the matching process. For a layer build (T1), the next undone layer in §4 is the target.
5. **Before ending:** update the §4 status table, save decisions to project-memory, link any new spec.

---

## 8. Open Items / Next Step

- [x] Build the orchestration wiring (SessionStart hook + `myfinance-sdlc` skill + CLAUDE.md pointer). **Done** (commit 644a23e). Files: `.claude/hooks/sdlc-session-start.js`, `.claude/skills/myfinance-sdlc/SKILL.md`, CLAUDE.md pointer block.
  - ⚠️ The hook is registered in `.claude/settings.local.json`, which is **gitignored**. On a fresh clone / new machine, re-add the SessionStart hook entry pointing at `.claude/hooks/sdlc-session-start.js`. The hook script and skill themselves are committed.
- [x] Brainstorm **L0 — Foundation** spec → `specs/2026-06-12-l0-foundation-design.md`. Plan → `plans/2026-06-12-l0-foundation.md`.
- [x] **L0 build COMPLETE 2026-06-12** on branch `layer/0-foundation` (T1, subagent-driven, 28 commits). All 7 phases done: monorepo scaffold; `packages/core` (Drizzle 8-table schema + CHECKs + migrations + client; 7 repos; domain port — xirr verbatim, returns/portfolio repo-injected, categorize, nav, amfiMatcher; import parsers + orchestration; seed + public index); `packages/api` (Fastify read-only skeleton: /health, /transactions, /investments/summary, /investments/returns). **175 tests green** (core 170 + api 5). Typecheck clean via `tsc --build`. Seam invariant verified (no Drizzle/driver import in domain/import).
  - **T1 core-logic gate PASSED:** Groww golden-master reproduces real per-scheme XIRR within **0.046pp** (worst case) across 6 schemes / 104 real SIP transactions. Final code review: READY TO MERGE, no blocking issues.
  - Decisions logged: money stays REAL/float (paise rejected, id `e7a83f32`); repository-over-Drizzle seam; import ported into L0 (L1 = ingestion API over it); XIRR terminal-flow date uses LOCAL time → deploy with TZ=Asia/Kolkata (id `1a01f88c`). Known minor: `autoMatchAmfiCodes` force-rematch is a no-op (id `4cbcde9d`).
- [x] L0 `layer/0-foundation` merged to `main` (PR #1, merge commit `67d15c6`).
- [x] **L1 (Ingestion + Data API) COMPLETE 2026-06-13** — branch `layer/1-ingestion` (11 commits off `main`), PR [#2](https://github.com/ak688744/MyFinance/pull/2) open into main. Spec [specs/2026-06-12-l1-ingestion-design.md](specs/2026-06-12-l1-ingestion-design.md), plan [plans/2026-06-13-l1-ingestion.md](plans/2026-06-13-l1-ingestion.md). Built via `superpowers:subagent-driven-development` (fresh subagent per task, spec + final code review). **Delivered (packages/api HTTP layer over core, no new package):** 3 multipart import endpoints behind a multi-platform **parser registry** (D6; hdfc+groww, `resolveParser(platform,kind)`), `GET /imports` (new non-financial core `ImportHistoryRepo.listAll()`), expanded investment reads `GET /investments/holdings|allocation|accounts` (multi-account D7 + `?account=` filter), categories `GET` + rule CRUD `POST/PATCH/DELETE /categories/rules` + `POST /recategorize` (registerDb now seeds starter categories). Seams: injected `runInTransaction` (txRunner from `app.sqlite`), injectable `amfiMatch` via `buildServer({amfiMatch})` (offline tests), reused L0 `NavLookup`. D1 server-parses-upload; D2 unmatched_schemes=200 payload. **Tests: core 172 + api 28 green; typecheck clean (`tsc --build`); seam invariant verified (zero drizzle/driver imports in domain/import); smoke-run OK.** Final code review: READY TO MERGE, zero blocking. **No Groww re-validation needed** — the only core change (`listAll` + `ImportRecord` export) is non-financial; no XIRR/portfolio/categorize/NAV math touched. GH push/PR done via `gh auth switch --user ak688744` (vkhandelwal-coursera has no push rights).
- [x] **Frontend / platform DESIGN SPIKE COMPLETE 2026-06-13** — branch `design/frontend-spike`, PR [#3](https://github.com/ak688744/MyFinance/pull/3) **merged to `main`**. Brainstorm-phase-only spike (no code, no `core` changes) per the L1 close-out decision (project-memory `c5a4e601`). Doc: [specs/2026-06-13-frontend-design-spike-design.md](specs/2026-06-13-frontend-design-spike-design.md) + 6 rendered mockups in `specs/mockups/`. **Approved IA** ("three pillars + AI": Net Worth · Investments · Expenses · Loans · Assistant). **Screens:** Net-Worth command center, Unified Investments, Investment Analyzer, Add-Investment (manual/computed FD), Expenses (cash flow + on-demand AI), Loans. **Outputs that feed L1.5 schema (doc §6):** `assetClass` open enum (MF/stocks/PPF/EPF/NPS/FD/gold/real-estate/cash); `valuationStrategy` `market|computed|manual` shown in UI; `ingestionMode` `file_import|manual_entry` (orthogonal); **first-class accounts scoped PER-DOMAIN, not global** (deliberate divergence from the earlier "unified accounts" note); **first-class liabilities** netted into net worth; **two NEW dimensions to bake in before migration — historical net-worth snapshots + budgets.** Platform pattern: **AI embedded + on-demand** (contextual insight card + floating "Ask AI"), not a persistent panel. Terminal state was the doc — did NOT proceed to writing-plans.
- [x] **L1.5 (Unified Investment Model) BRAINSTORM + PLAN COMPLETE 2026-06-14** — T1, docs-only on `main` (spec commit `da7ed7f`, plan commit `13813ee`). **NO code yet.** Spec: [specs/2026-06-14-l1.5-unified-investment-model-design.md](specs/2026-06-14-l1.5-unified-investment-model-design.md) (11 locked decisions D1–D11). Plan: [plans/2026-06-14-l1.5-unified-investment-model.md](plans/2026-06-14-l1.5-unified-investment-model.md) (30 self-contained TDD tasks). project-memory decision id `8658c1ce`.
  - **Design summary:** THREE structural families — (1) transactional/market = MF now, stocks deferred (extend MF pipeline, NOT `assets`); (2) single-value = FD (computed) + gold/RE/cash (manual); (3) contributory/computed = PPF/EPF/NPS (recurring contributions + rate schedule). **MF pipeline UNTOUCHED** (lowest Groww-revalidation risk); net worth = read-time **union projection** (`getAllAssets`) of MF holdings + generic `assets` − liability outstanding. 6 new tables (accounts, assets, asset_contributions, asset_rates, asset_valuations, liabilities) + nullable `transactions.account_id`. Derive-on-read NW history (MF historical NAV = stretch). Per-domain two-level accounts (multi-Groww supported). Insights→L4, budgets→L2 deferred. No data migration (no prod data).
  - **Design summary** (as built): unchanged from the plan above.
- [x] **L1.5 (Unified Investment Model) BUILD COMPLETE 2026-06-14** — T1, branch `layer/1.5-unified-investment`, PR [#4](https://github.com/ak688744/MyFinance/pull/4) into `main`. Executed the 30-task plan via `superpowers:subagent-driven-development`. **Delivered:** 6 new core tables (accounts, assets, asset_contributions, asset_rates, asset_valuations, liabilities) + nullable `transactions.account_id` (migration `drizzle/0001_round_glorian.sql`); valuation engine (`domain/valuation/` — rate-period compound interest for FD/PPF/EPF/NPS, manual stated-value + freshness, `valueAsset` dispatcher); loan amortization (`domain/loans/amortization.ts` — `computeEmi`/`amortizationSchedule`/`loanStatus`); net-worth rollup (`domain/networth/networth.ts` — `getAllAssets` read-time union projection of the **untouched** MF pipeline + generic assets, `getNetWorth` = Σassets−Σliab, `getNetWorthHistory` derive-on-read); 6 new repos; expense `account_id` (insert + `updateAccount`); API routes `/accounts`, `/liabilities`, `/assets` (+sub-resources), `/networth` (+/history); MF import `ensureAccount` (non-financial). **T1 GATE PASSED:** Groww golden-master 6/6 **unchanged**; full core 215 + api 42 tests green; typecheck clean (`tsc --build`); seam invariant verified (no drizzle/driver import in `domain/`); rollup-continuity test (MF-only `getNetWorth.totalAssets == getPortfolioSummary.totalCurrentValue`) + textbook-oracle math tests green. Final code review: **READY TO MERGE** (one minor — unused imports — fixed). **Plan defect found & resolved:** Task-4 computed-valuation test hard-coded whole-year exponents while the spec mandates `yearsBetween`=days/365 (2024 leap year) — fixed the TEST expected-values to days/365 (366/365, 731/365); implementation kept verbatim (project-memory decision). `loanStatus` boundary: a payment due exactly today is the *next* due, not paid.
  - ▶ ~~RESUME HERE: merge PR #4, then L2~~ — **DONE.** PR #4 merged; L2 built (below).
- [x] **L2 (Web UI) BUILD COMPLETE 2026-06-15** — T1, branch `layer/2-web-ui` (off `main`). Spec [specs/2026-06-14-l2-web-ui-design.md](specs/2026-06-14-l2-web-ui-design.md), plan [plans/2026-06-14-l2-web-ui.md](plans/2026-06-14-l2-web-ui.md). Built via `superpowers:subagent-driven-development` (fresh subagent per task + two-stage spec/quality review). **Delivered:** new `apps/web` package — Vite + React 19 + TS + Tailwind SPA, **pure consumer of the Fastify REST API** (no business logic in the browser). Feature-folder + thin typed API client (`lib/apiClient.ts` + TanStack Query hooks) + shared UI kit (`components/ui/*`). Screens: **Net Worth** (hero + asset-class composition donut + Assets−Liabilities KPIs + trend w/ graceful empty state), **Investments** (KPI strip incl. XIRR + asset-class group cards with MARKET/COMPUTED/MANUAL valuation badges) + **Investment Analyzer** (single-holding drill-down), **Expenses** (Total Spent/Income/Saved KPIs + spending donut + month-on-month bars + txn list), **Loans** (cards + amortization drawer), **Assistant** placeholder ("Coming in L4"). **Write flows:** Add-investment (computed/manual per-class form), Add-account, Add-loan (tenure-based), file-import upload (multipart). **Charts use real data only** — honest empty hints where MF historical NAV is unwired (no fabricated data). **One bounded API addition (read-only, no Groww re-validation):** `GET /expenses` (filterable) + `GET /expenses/summary` (KPIs + category breakdown + month-on-month) over new `expenseTxRepo.query/summary` repo methods (pure SQL aggregation; no XIRR/portfolio/categorize/NAV touched). **T1 GATE PASSED:** Groww golden-master **6/6 unchanged**, core 222 + api 45 + web 15 green, `tsc --build` clean across core/api/web, Vite build OK. Final code review: **READY TO MERGE.** Code-review fixes applied (stable React keys, formatDate fallback, computed-asset validation, amortization truncation notice). **Testing:** TDD on the new endpoints + `lib/format`/`lib/transforms`/`apiClient` (pure logic) + a UI-kit smoke test; light frontend tests + a written manual browser test plan (`docs/manual_testing/MANUAL_TEST_PLAN.md`) per the user's decision. **DEFERRED (logged, not built):** edit-transaction-category UI (needs a new per-transaction category endpoint that touches categorization → its own T1); budgets (spike §6.9); MF historical-NAV wiring (the trend-chart follow-up); live stock/gold pricing; Add-loan EMI-mode (tenure-only in v1). **GOTCHAS:** (1) `apps/web/tsconfig.json` keeps `composite:true`+`noEmit:true` as a leaf project referencing `../../packages/core`; build core first so its `.d.ts` resolves. (2) Vite dev proxies `/api/*`→`http://localhost:${API_PORT:-3001}` — no CORS plugin needed; `VITE_API_BASE` defaults to `/api`. (3) local `*.db` now gitignored. (4) one subagent hit a transient AWS-SSO token expiry mid-run but after its commits landed — no work lost.
- [x] **L2 categorization/rules in Expenses ADDED 2026-06-15** (T2, same branch/PR #5) — finished the Expenses categorization UX that L2 deferred. **No categorization algorithm change** (`domain/categorize.ts` byte-identical; Groww golden-master 6/6 + core 227 + api 52 still green — T2 not T1). **Backend (additive):** new `CategoryRepo.create/rename/delete/exists` (delete reassigns tagged txns→null + drops dependent rules, ordered for FK=ON); new endpoints `GET /categories/rules`, `POST /categories`, `PATCH/DELETE /categories/:id`, `PATCH /transactions/:id/category` ({categoryId, createRuleMerchant?} — sets source='manual', optionally derives merchant key via `extractMerchantKey` + `saveCategoryMemoryRule` + recategorize); `ExpenseTransactionRepo.getById` added. **Frontend:** editable `CategoryChip` per txn (click→reassign; null flagged amber "Uncategorized"), the **"Always categorize ‹merchant› as X?" learn prompt** (one-off assign first, rule-on-Yes), and a `ManageCategoriesModal` (categories CRUD + rules CRUD + "Recategorize all"). **Live-verified** the learn loop end-to-end (UPI-SWIGGY txn → reassign+Yes → merchant rule `swiggy→food_dining` created → sibling txn auto-recategorized). **DESIGN NOTE:** the engine is deterministic rule-matching (no confidence score), so the mockup's per-row "✓/✗ is this right?" was dropped in favor of editable chips + flagged-uncategorized work-list — `extractMerchantKey` only pulls keys from structured bank formats (`UPI-`/`ACH`/`POS`), so the learn prompt only creates a rule when a merchant key is derivable. Edit-transaction-category endpoint now exists (was the L2 deferral reason); still **deferred:** category-edit on non-bank-format descriptions won't auto-create rules (no merchant key).
  - ▶ ~~RESUME HERE (next session): push remaining `layer/2-web-ui` commits to PR #5, merge to `main`, then start L3~~ — PR #5 merged. (Note: the expense-redesign commit was stranded off PR #5 and later landed via **PR #6**.)
- [x] **Expense screen redesign landed 2026-07-05 (PR [#6](https://github.com/ak688744/MyFinance/pull/6))** — T2 web/api/core work (month selector, spend excludes investment/transfer via `expenseTxRepo.summary` `excludeFromSpend`/`investmentCategories`, compact MoM bars) that was committed locally during L2 but never pushed before PR #5 merged. Pushed + merged to `main` as a standalone PR so the AI-categorization feature (which depends on the month selector) could build on it. No core financial logic touched.
- [x] **AI-Assisted Expense Categorization BUILT 2026-07-05 — T1, branch `feat/ai-assisted-categorization` (off `main`), READY TO MERGE.** First LLM integration. Spec [specs/2026-07-05-ai-assisted-categorization-design.md](specs/2026-07-05-ai-assisted-categorization-design.md), plan [plans/2026-07-05-ai-assisted-categorization.md](plans/2026-07-05-ai-assisted-categorization.md). Built via `superpowers:subagent-driven-development` (18 tasks, fresh subagent + two-stage review each, broad final whole-branch review). **Delivered:** (1) **core** new `keyword` substring rule type — LAST in the precedence ladder `merchant(exact) → upi_note_keyword(exact) → builtin(substring) → keyword(substring) → null` (enforced by code order; keyword rules priority 50); CHECK-widening migration `drizzle/0002_jazzy_punisher.sql`; new `category_source` values `keyword_rule` + `ai_suggested`. (2) **NEW `packages/agents`** (seeds the reserved L4 slot): dialect-shaped `LlmProvider` (Gemini native adapter, key via `x-goog-api-key` header; `openai-compatible` + `anthropic` **stubs** — DeepSeek/OpenAI later = config only), Zod-gated `categorizeWithAI` (chunk 25, one retry, drops invalid categoryId, blanks non-substring keyword, transient errors → skip / auth → rethrow). (3) **api:** `listUncategorizedInRange` + `categorySource` in `query()`; task-keyed LLM config from env; `buildServer` injectable `llmProvider`; `POST /categories/ai-suggest` (month-bounded, applies `ai_suggested`, cap 200, auth→502); `PATCH /transactions/:id/category` `createRuleKeyword`+`keyword`. (4) **web:** `useAiSuggest`; `CategoryChip` violet `ai_suggested` state (✓ one-off → keyword second-prompt gated on **local** state so it survives the refetch; ✗ reverts); ExpensesPage month-scoped "Suggest with AI" button + review banner + "AI suggested" filter. **T1 GATE PASSED:** Groww golden-master **6/6 unchanged**; full suite **352 green** (core 241 + agents 19 + api 59 + web 33); `tsc --build` clean all packages; seam invariant holds (agents no drizzle; core LLM-free). **Final review found + FIXED 2 blockers:** keyword-prompt erased by confirm's cache-invalidation (→ local-state gating); transient Gemini throw → 500 (→ graceful retry-skip + 502 auth + web surfaces error). **L4 tension (user-approved):** deliberately pulls a thin L4 slice forward (`packages/agents`) **without** the Agent SDK or MCP — those arrive with L3/L4, reusing this `LlmProvider` shape. **DEFERRED (spec §10):** dedicated **AI Settings & Usage surface** (per-section model routing e.g. categorization=flash/taxation=pro + usage/cost dashboard + key management), additional providers (implement the one `openai-compatible` adapter → OpenAI/DeepSeek/Groq/OpenRouter/Ollama), Agent SDK + MCP wrapping, auto-run-on-import, "Confirm all", persisted usage. **KNOWN minor (accepted):** `uncategorizedInMonthCount` disable-guard reflects current page only (endpoint still processes full month). **GOTCHA:** pnpm 11.2.2 **and** 11.10.0 crash on Node 20.20.2 — only `corepack prepare pnpm@10.4.1 --activate` works for installs; build/test via `node_modules/.bin/{tsc,vitest}`.
  - ~~RESUME HERE: push + PR~~ — **DONE.** Merged to `main` via PR #7 (merge commit `02e33a7`).
- [x] **AI Settings & Usage BUILT 2026-07-09 — T1, branch `feat/ai-settings-usage` (off `main`), READY TO MERGE.** Delivers the AI Settings & Usage surface deferred from the AI-categorization build (spec §10). Spec [specs/2026-07-07-ai-settings-usage-design.md](specs/2026-07-07-ai-settings-usage-design.md), plan [plans/2026-07-07-ai-settings-usage.md](plans/2026-07-07-ai-settings-usage.md). Built via `superpowers:subagent-driven-development` (22 tasks, fresh subagent + two-stage review each, broad final whole-branch opus review). **No Groww re-validation triggered** (no financial logic touched) — gate is Groww golden-master **6/6 unchanged**. **Delivered:** (1) **core** — 4 additive tables `ai_providers`/`ai_models`(user-entered pricing)/`ai_task_routes`/`ai_usage_events` (migration `0004_chief_excalibur.sql`); AES-256-GCM `crypto.ts` (secrets encrypted at rest, master key from `MYFINANCE_SECRET_KEY`); 4 repos. (2) **agents** — code `AI_TASKS` registry; `pricing.ts` (`PRICING_HINTS` prefill + `costUsd`); **working Bedrock adapter** (`@anthropic-ai/bedrock-sdk` + `fromSSO`/`providerChainResolver`, JSON via forced tool-use, injectable client for offline tests); `buildProvider` factory; **`LlmGateway`** — the injected choke point: `runTask` resolves each task's provider+model from the DB, decrypts, calls, and records **one aggregated `ai_usage_events` row per invocation** with cost frozen from the model's stored price; `categorizeWithAI` refactored to an injected `complete` fn (output identical). (3) **api** — 4 AI repos + `LlmGateway` wired into `buildServer` (replaces the boot-time `llmProvider`; env `llm.categorization` removed/inert); routes `/ai/providers` `/ai/models` `/ai/tasks` (secret never returned — `hasSecret` only; 409 FK guards; `isAiTask` validation; price `>=0`; 409 on duplicate id) + `/ai/usage/summary|events`; `/categories/ai-suggest` now routes through the gateway. (4) **web** — new **AI** sidebar page, two tabs: *Providers & Routing* (polymorphic provider modal — Bedrock hides the key field, shows region/profile; model modal with pricing prefill; task-routing with amber "Not configured" chip) + *Usage & Cost* (KPI strip, spend bar chart, by-task/by-model tables, honest empty state). **T1 GATE PASSED:** Groww **6/6 unchanged**; full suite **388 green** (core 250 + agents 32 + api 69 + web 37); `tsc --build` clean all packages; seam invariant holds (no drizzle/better-sqlite3 in `agents/src` or `core/domain`). **Final opus review:** no CRITICAL; fixed 2 IMPORTANT (PATCH model-price validation; duplicate-id→409) + 1 MINOR (web usage-event DTO shape) in commit `79a8202`. **KNOWN pre-merge manual item (I3):** the live Bedrock/SSO constructor path (`providerChainResolver`+`fromSSO`) is offline-tested only — must be smoke-tested against a real `aws sso login` session (steps in `docs/manual_testing/MANUAL_TEST_PLAN.md` §B). **DEFERRED:** `openai-compatible` adapter still a stub (per spec — unlock later = config only); persisted-usage retention/pruning; per-model usage budgets/alerts.
  - ▶ **RESUME HERE (next session):** push `feat/ai-settings-usage` + open PR into `main` (`gh auth switch --user ak688744`), then optionally run the §B live-Bedrock manual smoke, merge, and start **L3 (MCP Server)** as a fresh T1. Node 20.
- [ ] **NEW — L1.5 (Unified Investment Model):** before L2. A dedicated brainstorm→spec→plan→build cycle that generalizes the MF-only investment foundation into an **all-asset-class** model so the investment section is a single net-worth view across mutual funds, stocks, PPF, FD, cash. Organizing insight: asset classes differ on two axes — **ingestion** (`file-import` via L1's parser registry vs `manual-entry` CRUD, since PPF/FD/cash are user-entered) and **valuation** (`market` = qty×live price API, `computed` = interest compounding to a date for PPF/FD, `manual` = user-stated). Generalized schema ≈ `accounts` + `assets`(assetClass) + generalized cashflows + per-class valuation/ingestion strategies + net-worth rollup. **Reshapes `core` schema → T1 with Groww re-validation;** existing MF data migrated in, golden-master is the safety net. L1's parser registry + HTTP/multipart layer carry forward; only the investment orchestrators/repos get generalized (expense import untouched). **Decided 2026-06-13:** build L1 on the current MF model first (validated vertical slice) rather than redesigning the foundation up front — L1's ingestion *pattern* survives the generalization, so it is proving ground, not throwaway.
