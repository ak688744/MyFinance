# L1 — Ingestion + Data API — Design Spec

**Date:** 2026-06-12
**Layer:** L1 (Ingestion + Data API)
**Tier:** T1 (new layer / new architectural surface)
**Status:** Approved — ready for implementation plan
**Depends on:** L0 Foundation (merged to `main`, commit `67d15c6`)

---

## 1. Goal

Expose the already-ported, Groww-validated `packages/core` import + read logic over
HTTP. L1 adds a **write surface (ingestion)** — server-side import of HDFC expense
statements and Groww investment files, built behind a **multi-platform parser registry**
(D6) so other platforms (ET Money, other brokers) drop in later — and **expands the read
surface** (including **multi-account** support, D7) the L2 Web UI and (later) L4 agents
will consume. No new package; L1 is purely the Fastify HTTP layer on `packages/api` over
`core`. **`core` itself is not modified** except one minor, non-financial additive repo
method (`ImportHistoryRepo.listAll()`).

> **L1 is mutual-fund-model only.** The unified all-asset-class investment model (stocks,
> PPF, FD, cash) and first-class accounts for expenses are **L1.5** (see §2 scope boundary
> and MASTER_PLAN §4). L1's parser registry + multipart layer are designed to carry forward.

### Non-goals (deferred)
- **Enriched expense reads — deferred to L2.** L1 keeps L0's basic `GET /transactions`
  (paginated, `categoryId` filter) unchanged. Richer expense surface — date-range /
  direction / search filters on the list, and a `GET /expenses/summary` aggregation
  (period totals + per-category breakdown) — is **designed in L2** against concrete web
  layouts, so the API is shaped by real intuitive-UI needs rather than guessed. (The
  existing `GET /transactions` is still exercised in L1 only to verify rule-CRUD
  recategorization.)
- Parse-then-confirm preview flow — L2 holds the preview client-side and re-uploads on confirm.
- Auth / multi-user.
- Category create / rename / delete (still deferred per L0; needs `CategoryRepo` extension).
- Generic discriminator endpoint or JSON-body parsing fallback (YAGNI for single-user v1).

---

## 2. Locked Decisions (from brainstorming)

| # | Decision | Rationale |
|---|---|---|
| D1 | **Server parses raw uploads.** Client POSTs the raw `.xls` via `multipart/form-data`; server runs the core parser (ArrayBuffer) then the orchestrator. | One source of truth for parsing; agents/MCP can trigger imports later without shipping parser logic to clients. |
| D2 | **Unmatched-schemes is a 200 status payload**, not an error. `200 {data:{status:'unmatched_schemes', unmatchedSchemes:[...]}}`. | Faithful pass-through of the core return union. "Import holdings first" is a normal workflow branch, not an error. Matches RN app behavior. |
| D3 | **One endpoint per import type** (resource-oriented), not a generic `/imports` discriminator. | Mirrors the existing "one route file per resource" convention and core's three distinct orchestrators; keeps each handler small and independently testable; response shapes already differ per type. |
| D4 | **All four new read endpoints** ship in L1: holdings, allocation, categories, import history. | UI + agents need them; the underlying core functions already exist. |
| D5 | **Rule CRUD + recategorize endpoints ship in L1.** | Core logic already exists; front-loads the write surface. |
| D6 | **Multi-platform parser registry.** Import endpoints take a `platform` form field; a registry maps `(platform, kind)` → a parser that emits the **same normalized `ParsedData`** shape the orchestrators already consume. Groww + HDFC ship now; ET Money / other brokers are drop-in registry modules later with **zero** endpoint/orchestrator change. | User wants to import from multiple platforms (Groww, ET Money, …). Decoupling "which platform's file format" from "how it's stored" via a normalized shape is the extensibility seam. Low cost now, avoids reopening the import layer per platform. |
| D7 | **Accounts are first-class in ingestion + reads.** Investment imports already carry `accountName` + `investmentApp`; L1 treats them as required, validated inputs and adds `GET /investments/accounts`. Multiple MF accounts = distinct `accountName`; different platforms = distinct `investmentApp`. | User holds the same asset class across multiple accounts/platforms. Schema already supports it (cols on every investment table + core `getAccounts()`); L1 just surfaces it. |

> **Scope boundary (decided 2026-06-13):** L1 covers the **mutual-fund model only** (units × NAV).
> The investment section's evolution into a **unified all-asset-class net-worth view**
> (stocks, PPF, FD, cash — with per-class valuation and manual-entry ingestion) plus
> **first-class accounts for expenses too** is a separate foundation layer, **L1.5 — Unified
> Investment Model**, slotted before L2 (see MASTER_PLAN §4). L1's parser registry + multipart
> HTTP layer carry forward into L1.5; only the investment orchestrators/repos get generalized.

---

## 3. Architecture & Module Boundaries

L1 extends `packages/api`. No new package.

```
packages/api/src/
  server.ts                    ← register new route plugins + @fastify/multipart; accept opts.amfiMatch
  plugins/
    db.ts                      ← (unchanged) decorates app.repos, app.sqlite, app.db
    txRunner.ts                ← NEW: makeRunInTransaction(sqlite) → <T>(fn:()=>T)=>T
  routes/
    health.ts                  ← (unchanged)
    transactions.ts            ← (unchanged) GET /transactions
    investments.ts             ← EXPAND: + GET /investments/holdings, /investments/allocation, /investments/accounts
    categories.ts              ← NEW: GET /categories; POST/PATCH/DELETE /categories/rules; POST /recategorize
    imports.ts                 ← NEW: 3 POST import endpoints + GET /imports
  import/
    registry.ts                ← NEW: parser registry — resolveParser(platform, kind) → parser fn; normalized ParsedData
  lib/
    multipart.ts               ← NEW: read uploaded file → { buffer: ArrayBuffer, filename } + read text fields
```

### Parser registry (D6)
`import/registry.ts` exposes `resolveParser(platform: string, kind: ImportKind)` where
`kind ∈ {'expense', 'holdings', 'transactions'}`. It returns the matching core parser
(which always yields the normalized `ParsedData` the orchestrator consumes), or throws a
`400` if the `(platform, kind)` pair is unsupported. Initial registry entries:

| platform | kind | parser |
|---|---|---|
| `hdfc` | `expense` | `parseHdfcStatementXls` |
| `groww` | `holdings` | `parseGrowwHoldingsXls` |
| `groww` | `transactions` | `parseGrowwTransactionXls` |

Adding ET Money later = add rows to this table + the parser module; **no route or
orchestrator changes.** The endpoint reads `platform` from a form field (defaulting to
`hdfc` for `/imports/expenses` and `groww` for the investment imports, to keep current
single-platform callers working) and looks the parser up here.

### Key seams
- **`runInTransaction`** — core orchestrators take `runInTransaction: <T>(fn:()=>T)=>T`.
  Built once from the better-sqlite3 handle: `sqlite.transaction(fn)()`. `txRunner.ts`
  isolates this construction so routes don't touch the driver.
- **NAV lookup** — read endpoints needing current value (`holdings`, `allocation`,
  `summary`) inject the same `NavLookup` L0 already built from the core nav service.
- **`amfiMatch`** — the holdings import's post-step AMFI auto-match hits the network in
  production (core default `autoMatchAmfiCodes`). `buildServer` gains optional
  `opts.amfiMatch` so tests inject a no-network stub. Default = real matcher.

---

## 4. Endpoint Contracts

### 4.1 Ingestion (writes) — `multipart/form-data`, file field named `file`

All import endpoints resolve their parser via the registry (D6): they read `platform`
(form field, with a sensible default) and call `resolveParser(platform, kind)` rather
than hardcoding a parser. `investmentApp` is the account's platform label and SHOULD
match `platform` for investment imports.

| Method · Path | Form fields | Core pipeline | Success response |
|---|---|---|---|
| `POST /imports/expenses` | `file`, `platform` (default `hdfc`) | `resolveParser(platform,'expense')(buf)` → `importTransactions({importHistoryRepo, ruleRepo, txRepo, runInTransaction}, {sourceName:<filename>, sourceType:'xls', transactions})` | `200 {data:{importHistoryId, detectedCount, insertedCount, skippedCount}}` |
| `POST /imports/investments/holdings` | `file`, `accountName`, `investmentApp`, `platform` (default `groww`) | `resolveParser(platform,'holdings')(buf, filename)` → `importHoldings({schemeRepo, holdingsRepo, importHistoryRepo, runInTransaction, amfiMatch}, {accountName, investmentApp, parsedData, fileName})` | `200 {data:{importedCount, deletedCount, importHistoryId, amfiMatched, amfiTotal}}` |
| `POST /imports/investments/transactions` | `file`, `accountName`, `investmentApp`, `platform` (default `groww`) | `resolveParser(platform,'transactions')(buf)` → `importInvestmentTransactions({schemeRepo, txRepo, importHistoryRepo, runInTransaction}, {accountName, investmentApp, parsedData, fileName})` | `200 {data:{status:'success', importedCount, deletedCount, importHistoryId}}` **OR** `200 {data:{status:'unmatched_schemes', unmatchedSchemes:[...]}}` (D2) |

**Two-step dependency (preserved from RN):** investment-transactions import pre-flight
resolves every scheme via `findSchemeByName`; if any is missing it returns
`unmatched_schemes` **without touching the DB**. Holdings import (which creates/matches
schemes) must run first. This ordering is the user's responsibility / the UI's flow — L1
faithfully surfaces the state.

### 4.2 Reads (new)

| Method · Path | Query | Core/repo call | Response |
|---|---|---|---|
| `GET /investments/holdings` | optional `account`, `sortBy`, `sortOrder` | `getHoldings({txRepo, nav}, filters)` | `{data: Holding[]}` |
| `GET /investments/allocation` | optional `account` | `getAssetAllocation({txRepo, nav}, filters)` | `{data: AssetAllocation[]}` |
| `GET /investments/accounts` | — | `getAccounts({txRepo})` | `{data: string[]}` (distinct account names) — supports the multi-account UI (D7) |
| `GET /categories` | — | `categoryRepo.list()` | `{data: {id,name,icon}[]}` |
| `GET /imports` | — | `importHistoryRepo.listAll()` *(new method)* | `{data: ImportRecord[]}` — normalized expense + investment runs, date-desc, with `kind` discriminator (see §7) |

`getHoldings` / `getAssetAllocation` take `PortfolioDeps {txRepo, nav}` — identical to the
L0 `/investments/summary` wiring.

### 4.3 Rule CRUD + recategorize (writes, JSON body)

| Method · Path | Body | Core call | Response |
|---|---|---|---|
| `POST /categories/rules` | `{ruleType, patternValue, categoryId}` | `createRule({ruleRepo, txRepo}, input)` | `201 {data:{ok:true}}` (empty pattern → core throws → `400`) |
| `PATCH /categories/rules/:id` | `{categoryId, ruleType}` | `updateRuleCategory({ruleRepo, txRepo}, {ruleId, ...})` | `200 {data:{ok:true}}` |
| `DELETE /categories/rules/:id` | — | `deleteRule({ruleRepo, txRepo}, {ruleId})` | `200 {data:{ok:true}}` |
| `POST /recategorize` | — | `recategorizeNonManualTransactions({ruleRepo, txRepo})` | `200 {data:{ok:true}}` |

`createRule`/`updateRuleCategory`/`deleteRule` each re-run
`recategorizeNonManualTransactions` internally (core behavior) — non-manual transactions
are re-categorized on every rule change. No new wrapping logic in L1.

---

## 5. Error Handling

Uniform L0 envelope: success `{data:...}`; error `{error:{message, statusCode}}`.

| Condition | Status |
|---|---|
| Missing `file` part, or missing/empty required form field (`accountName`, `investmentApp`) | `400` (handler throws `Error` with `statusCode=400`) |
| Unsupported `(platform, kind)` in the parser registry (D6) | `400` — `resolveParser` throws with `statusCode=400` |
| Parser throws (bad / empty / wrong-format file) | `400` — handler catches the parser throw and re-throws with `statusCode=400` (parser errors are client-input errors, must not default to 500) |
| `createRule` empty-pattern throw (core) | `400` |
| Invalid `:id` (non-numeric) | `400` |
| Unexpected | `500` (existing default) |

---

## 6. Testing (TDD)

All tests run offline + deterministic via `app.inject()`, following L0's pattern.

### Fixtures
Raw Groww/HDFC files are gitignored (PII). L1 commits **tiny synthetic `.xls` fixtures**
under `packages/api/test/fixtures/` — a few rows in the exact column layout each parser
expects, no real PII. Layouts verified against parser source when authored.

- `hdfc-sample.xls` — a handful of expense rows (debit + credit).
- `groww-holdings-sample.xls` — 2–3 holdings.
- `groww-transactions-sample.xls` — a few SIP purchase rows for those same schemes.

### Test cases
1. **`POST /imports/expenses`** with `hdfc-sample.xls` → inserts; counts match; dedupe on re-import (second import `insertedCount=0`).
2. **`POST /imports/investments/holdings`** with stubbed `amfiMatch` → `importedCount` matches fixture; `GET /investments/holdings` then non-empty.
3. **Round-trip:** holdings → transactions → `GET /investments/summary` and `/investments/holdings` return populated, consistent data. Proves ingestion+read loop end-to-end.
4. **Unmatched schemes:** `POST /imports/investments/transactions` **without** prior holdings → `200 {data:{status:'unmatched_schemes', unmatchedSchemes:[...]}}`, DB untouched.
5. **Rule CRUD:** `POST /categories/rules` → matching non-manual transactions recategorized (verify via `GET /transactions`); empty pattern → `400`; `DELETE` → recategorized back.
6. **Read endpoints:** `/investments/holdings`, `/investments/allocation`, `/investments/accounts`, `/categories`, `/imports` each return `{data:...}` with expected shape.
7. **Error paths:** missing file → 400; missing `accountName` on holdings → 400; bad file bytes → 400; unsupported `platform` → 400.
8. **Parser registry (D6):** `resolveParser('groww','holdings')` returns the Groww holdings parser; `resolveParser('hdfc','expense')` the HDFC parser; unknown pair throws `statusCode=400`. Unit-tested directly + via an endpoint sending an unsupported `platform`.
9. **Multi-account (D7):** import holdings/transactions under two distinct `accountName`s → `GET /investments/accounts` returns both; `GET /investments/holdings?account=<one>` filters to that account.

`amfiMatch` is injected per-server via `buildServer({dbPath, amfiMatch})`; tests pass a
stub returning `{matched:0, total:0}` so no network is hit (mirrors L0's NAV approach).

---

## 7. Core Change (minor, non-financial)

`ImportHistoryRepo.listAll()` — plain `SELECT`s over **both** import-history tables
(`import_history` for expenses, `investment_import_history` for investments) for
`GET /imports`. Returns a single normalized, date-descending list with a discriminating
`kind: 'expense' | 'investment'` field plus the columns common/relevant to each (id,
kind, sourceName/fileName, importType where applicable, recordCount, createdAt). The
exact normalized shape is fixed in the plan against the two table schemas. **Touches no
XIRR / categorization / portfolio / NAV math → no Groww re-validation required.** If
implementation reveals it touches money math (it should not), it escalates to a
core-logic change with re-validation.

---

## 8. Build Sequence (for the plan)

1. Add `@fastify/multipart`; `lib/multipart.ts` helper; `plugins/txRunner.ts`.
2. `buildServer` accepts `opts.amfiMatch`; register multipart + new route plugins.
3. Core: `ImportHistoryRepo.listAll()` + repo test.
4. `import/registry.ts` — parser registry (D6) + unit test.
5. Synthetic `.xls` fixtures (verify layouts against parsers).
6. TDD `routes/imports.ts` (3 POST via registry + GET /imports).
7. TDD `routes/categories.ts` (GET + rule CRUD + recategorize).
8. TDD expand `routes/investments.ts` (holdings, allocation, accounts).
9. Full suite + typecheck (`tsc --build` — core first); subagent code review; PR; update MASTER_PLAN §4/§8 + project-memory.

---

## 9. Open Questions

None. All contracts settled in brainstorming.
