# L0 — Foundation: Design Spec

**Date:** 2026-06-12
**Layer:** L0 (Foundation) — first real layer of the MyFinance Web re-platform
**Tier:** T1 (full discipline) — new layer + new architectural surface, AND ports core
financial logic (XIRR, portfolio math, categorization, parsers) → **Groww re-validation required**
**Master plan:** `docs/superpowers/MASTER_PLAN.md` (§4 build order, this is the L0 row)
**Status:** Approved design — ready for implementation plan

---

## 1. Purpose & Scope

L0 stands up the Node/TS monorepo and builds the **keystone `core` package** plus a
**thin REST API skeleton**. Every layer above (L1 ingestion, L2 web, L3 MCP, L4 agents)
imports `core`, so the hard-won, Groww-validated business logic gets exactly one home on
the server.

L0 is **bottom-up foundation**: it proves the full path `Drizzle → repository → domain
logic → HTTP` works end-to-end, without pre-building L1's ingestion surface.

### In scope
- pnpm monorepo workspace + tsconfig project references; stub the not-yet-built packages.
- `packages/core`: Drizzle schema + migrations + seed, repository layer, ported domain
  logic (XIRR, period returns, portfolio, categorization, AMFI matcher, NAV service),
  **and import parsers/orchestration** (HDFC, transactions, holdings).
- `packages/api`: thin Fastify REST skeleton — health + read-only data endpoints.
- Full test suite: unit (fake repos), characterization (vs. current app), golden-master
  (Groww), repository integration (in-memory SQLite), API (`inject()`).

### Out of scope (deferred, with rationale)
- **Write/import HTTP endpoints** → L1. (Import *logic* is ported into core in L0; exposing
  it over HTTP is L1's ingestion API.)
- **AI tools/providers** (`features/ai/`) → L4.
- **Web UI** → L2. **MCP server** → L3.
- **Moving the existing RN app** into `apps/mobile` → deferred (see §3, mobile note).
- **Loans, RAG vectors, sector enrichment** → their own future layers/migrations (see §5).

---

## 2. Locked Decisions (from brainstorm)

| Area | Decision | Rationale |
|---|---|---|
| Port scope | Pure logic + schema + data layer **+ import parsers/orchestration**. AI deferred to L4. | Import logic ported now; the L0/L1 boundary shifts so L1 becomes the server-side ingestion *API* over these parsers. |
| Data layer | **Repository layer over Drizzle.** Domain logic depends on repo *interfaces*, never Drizzle directly. | Clean seam: pure-math unit tests use fake repos; Postgres swap is isolated to client + repos. Honors "no dialect SQL in business logic." |
| Monorepo tooling | **pnpm workspaces + tsconfig project references.** No Turborepo/Nx (YAGNI). | One dev, one repo. Add task orchestration only if build times demand it. |
| Money representation | **Keep `REAL`/float** (faithful port). Money, units, NAV all stay floating as today. | Single-user/single-portfolio app; existing float math is already Groww-validated. Paise conversion's only real benefit (exact aggregates) is cosmetic here (hidden by `.toFixed(2)`) and adds a rounding step that itself risks Groww discrepancy. Revisit as a clean migration only if sub-rupee drift ever bites. (YAGNI.) |
| Primary keys | Keep `INTEGER AUTOINCREMENT` (Drizzle identity on Postgres). | Single-user app; integer PKs simpler than UUIDs, port cleanly. |
| Dates/timestamps | `TEXT` ISO strings (`YYYY-MM-DD` / ISO datetime). | Portable across SQLite/Postgres; matches all existing date handling and XIRR parsing. |
| Schema shape | **Faithful 8-table port** of the existing schema (the validated contract). | Normalization smells (denormalized `scheme_name` alongside `scheme_id`) are kept — portfolio math depends on them and they're Groww-validated. |
| Init mechanism | **Drizzle Kit migrations** + explicit **seed** step, replacing imperative `initializeDatabase` + runtime `PRAGMA` ALTER patching. | Versioned schema state instead of boot-time reconstruction. |
| SQLite driver | **better-sqlite3**, isolated in `db/client.ts`. | Synchronous, standard for Drizzle+SQLite on Node. Postgres swap = 1 file + schema dialect. |
| API framework | **Fastify**. | TS-first, built-in schema validation, lighter than Nest; typed schemas fit shared-types goal. |
| Tests | **Vitest**. | Fast, TS-native, good fake/mocking ergonomics. |

---

## 3. Package Topology

```
/packages/core      ← L0 BUILDS (schema, migrations, seed, repos, domain, import)
/packages/api       ← L0 BUILDS (thin Fastify REST skeleton)
/packages/mcp       ← stub (package.json + README only) — L3
/packages/agents    ← stub — L4
/apps/web           ← stub — L2
/apps/mobile        ← stub — existing RN app relocates here LATER (not in L0)
```

- pnpm workspace (`pnpm-workspace.yaml`) + root `tsconfig.base.json`; `api` project-references `core`.
- Tooling: **Vitest** (test), **tsx** (dev run), **Drizzle Kit** (migrations).

**Mobile note (deliberate):** the existing Expo/RN app at the repo root is the live,
working app. L0 does **not** move or modify it — relocating it into `apps/mobile` risks
breaking the Expo build, which is out of L0 scope. New `packages/` are built alongside the
existing `src/`. Mobile is physically relocated in a later dedicated step.

---

## 4. Database Schema (`packages/core/src/db/schema.ts`)

Faithful Drizzle port of the 8 existing tables from `src/db/initializeDatabase.ts`,
with their indexes, FKs, CHECK and UNIQUE constraints:

1. `categories`
2. `import_history`
3. `transactions`
4. `category_rules`
5. `investment_schemes`
6. `investment_import_history`
7. `investment_holdings`
8. `investment_transactions`

### Money representation: keep `REAL`/float (faithful port)
All numeric money columns stay `REAL` exactly as today — `transactions.amount`/`balance`,
`investment_transactions.amount`, `investment_holdings.invested_value`/`current_value`/
`returns_amount`, and the `investment_import_history` totals — alongside `units`, `nav`,
and the XIRR-rate fields.

**Why not integer paise:** for a single-user/single-portfolio app the only concrete benefit
is exact aggregate sums, which here is cosmetic (sub-rupee drift is hidden by `.toFixed(2)`
display rounding) and the XIRR percentage is float-internal regardless. Worse, a
rupee→paise rounding-on-write step would be a *new* place to diverge from the
already-Groww-validated numbers. Keeping float = exact parity with the validated logic and
zero conversion code. If aggregate drift ever actually bites, paise is a clean additive
migration later. (YAGNI.)

### Init: migrations + seed
- The imperative `CREATE TABLE IF NOT EXISTS` + runtime `PRAGMA table_info` ALTER patching
  is replaced by **Drizzle Kit migrations** (versioned SQL). Schema captures the final
  column set (the old ALTER-added columns `reference_number`, `merchant_key`,
  `upi_note_keyword`, `category_source` are part of the table definition; patch logic dropped).
- **Seed step** (`db/seed.ts`): inserts `starterCategories`, then runs initial
  recategorization (the work currently done inside `initializeDatabase`).

### Deferred schema (recorded, not built)
Added later as clean additive Drizzle migrations when their layer is designed:
- **Loans** — named in the North Star + an L4 agent, but zero loan logic/import/UI exists
  today. Needs its own ingestion brainstorm; building a table now = speculative rework.
- **RAG vectors** (sqlite-vec → pgvector) — additive when L4 retrieval is designed.
- **Sector/asset enrichment** on `investment_schemes` — add the column when the L4
  Investment Analyzer's sector-split feature is designed.

---

## 5. Core Package Layering (`packages/core/src/`)

```
db/
  schema.ts        ← Drizzle tables (§4)
  client.ts        ← Drizzle handle over better-sqlite3 (ONLY file knowing the driver)
  migrate.ts       ← apply migrations
  seed.ts          ← starter categories + initial recategorization
repositories/      ← OWN all Drizzle/SQL; map rows ↔ domain types at boundary
  transactionRepo.ts
  categoryRepo.ts
  categoryRuleRepo.ts
  schemeRepo.ts
  investmentTxRepo.ts
  holdingsRepo.ts
  importHistoryRepo.ts
domain/            ← PURE logic; depends on repo INTERFACES, never Drizzle
  xirr.ts          ← calculateXIRR + bisection fallback (lifted verbatim)
  returns.ts       ← getPeriodReturns (cohort math)
  portfolio.ts     ← portfolio value / units-at-date
  categorize.ts    ← categorization engine (builtin + stored rules)
  amfiMatcher.ts   ← scheme-name → AMFI code variant matching
  nav/navService.ts ← mfapi.in fetch client + in-memory cache
import/            ← parsers + import orchestration (HDFC, transactions, holdings)
types.ts           ← shared TS types (re-exported for upper layers)
index.ts           ← public surface
```

### Seam rules
1. **Repositories own all SQL/Drizzle.** Nothing in `domain/` or `import/` imports Drizzle.
   Repos expose typed methods (e.g. `getCashFlows(filters): CashFlow[]`,
   `getTransactionsUpTo(date, filters): InvestmentTx[]`).
2. **Repos map DB rows → domain types** at the boundary (money stays float rupees as today).
3. **Domain depends on interfaces.** `getPeriodReturns`, currently `(db: SQLiteDatabase, …)`,
   becomes `(repos: PortfolioRepos, …)` where `PortfolioRepos` is the minimal set of repo
   methods it needs. Tests inject fakes.

### Port fidelity per module
- **`xirr.ts`** — lifted **verbatim** (already pure). Guarded by characterization + golden tests.
- **`returns.ts` / `portfolio.ts`** — logic identical; data source changes from inline SQL
  to injected repo methods. **Highest port risk → heaviest test coverage.**
- **`categorize.ts`** — builtin rules verbatim; stored-rule lookup via `categoryRuleRepo`.
- **`navService.ts`** — lifted near-verbatim (fetch + cache; no RN specifics).
- **`amfiMatcher.ts`** — pure variant extraction verbatim; DB writes via `schemeRepo`.
- **import parsers** — `xlsx` parsing is pure (runs on Node); orchestration writes via repos.

---

## 6. REST API Skeleton (`packages/api/src/`)

```
server.ts          ← Fastify instance + plugin registration
config.ts          ← typed env loader (DB path, port)
plugins/db.ts      ← opens core db client, decorates instance
routes/
  health.ts        ← GET /health (process + DB ping)
  transactions.ts  ← GET /transactions (paginated/filtered read)
  investments.ts   ← GET /investments/summary, GET /investments/returns?period=
errors.ts          ← central error handler → consistent JSON envelope
```

- **Read-only only** (writes/import = L1). Endpoints:
  - `GET /health` — process up + DB connectivity.
  - `GET /transactions` — list with basic pagination/filter (via `transactionRepo`).
  - `GET /investments/summary` — portfolio summary (via domain).
  - `GET /investments/returns?period=1Y` — calls `getPeriodReturns`.
- Consistent `{ data }` / `{ error }` envelope.
- Purpose is to prove the `repository → domain → HTTP` wiring so L1 just adds routes.

---

## 7. Testing & Validation Strategy (T1 gate)

All **Vitest**. TDD: tests precede each implementation chunk.

1. **Unit (domain/)** — fake repos inject fixtures. XIRR known-answer cases, period-returns
   cohort math, categorization precedence, AMFI variant extraction. No DB.
2. **Characterization (port-equivalence)** — pin the **current `src/features/` app's**
   outputs as oracle: run representative inputs through existing code, capture outputs as
   fixtures, assert the port reproduces them. Proves **no regression in the move**.
3. **Golden-master (Groww re-validation)** — real portfolio transactions + Groww-reported
   XIRR & current value as fixtures; assert ported math matches **within tolerance**
   (XIRR ±0.5%, value ±₹1). This is the core-logic T1 gate.
   - ⚠️ **External input required from user:** the real Groww data (transaction list +
     Groww's displayed XIRR & current value). Check `.data/` / project-memory first; if
     absent, this is the one input needed before the golden-master step. Characterization
     (layer 2) is self-generated and unblocked.
4. **Repository integration** — real **in-memory SQLite**, migrations applied; verify repo
   reads/writes and row→domain-type mapping.
5. **API** — Fastify `inject()` against a seeded in-memory DB.

**TDD build order:** schema + migrations → repos (integration) → domain port (unit +
characterization) → golden-master validation → API.

---

## 8. Build Sequence (for the implementation plan)

1. Monorepo scaffold: pnpm workspace, tsconfig base + refs, Vitest, stub packages.
2. `core`: Drizzle schema (§4) + Drizzle Kit migrations + `client.ts` + `migrate.ts`.
3. `core`: repository layer (integration tests against in-memory SQLite, incl. row mapping).
4. `core`: `seed.ts` (starter categories + recategorization).
5. `core`: port domain logic (xirr → returns/portfolio → categorize → amfiMatcher → nav),
   unit + characterization tests as each lands.
6. Golden-master validation against Groww fixtures (gated on user-provided data).
7. `core`: port import parsers + orchestration with tests.
8. `core`: public `index.ts` surface + shared `types.ts`.
9. `api`: Fastify skeleton + read-only routes + `inject()` tests.
10. Subagent code review against this spec → PR → update MASTER_PLAN §4/§8 + project-memory.

---

## 9. Success Criteria

- Monorepo builds via pnpm + tsc project refs; `core` and `api` typecheck and test green.
- All domain math reproduces (a) the current app's outputs (characterization) and (b)
  Groww's reported figures within tolerance (golden-master).
- No Drizzle/SQL import anywhere under `domain/` or `import/` (seam enforced).
- `api` serves `/health` + the read endpoints against a seeded DB via `inject()` tests.
- The Postgres-readiness invariant holds: only `db/client.ts` + `schema.ts` know the dialect.
- MASTER_PLAN §4 L0 row → ✅; decisions saved to project-memory; spec linked.
