# L3 — MCP Server: Design

**Date:** 2026-07-11
**Layer:** L3 (MCP Server) — see [MASTER_PLAN.md](../MASTER_PLAN.md) §4
**Tier:** T1 (new layer / new architectural surface — a new `packages/mcp` package + a new tool contract)
**Groww re-validation:** Not triggered — L3 touches no core financial logic. Standing gate (golden-master 6/6 unchanged) still asserted.

---

## 1. Purpose

L3 exposes the MyFinance finance data as a set of **MCP tools** — the stable tool
contract that the L4 AI agents (wealth-manager orchestrator + expense / investment /
loan specialists + chat-with-your-data) will call to observe and reason over the
user's finances.

The MCP server is a **thin, read-only, task-shaped layer** over the already-tested
`packages/core` domain logic. It adds no business logic of its own — it validates
inputs, calls core, and shapes results into agent-friendly JSON.

### North-star fit
The canonical "Investment Analyzer" agent calls `get_investment_portfolio` **once**
and receives summary + holdings + allocation + XIRR to reason over, instead of
stitching four separate data calls. Tools are shaped around the *questions an agent
asks*, not around the internal data model.

---

## 2. Locked Decisions

| # | Decision | Rationale |
|---|---|---|
| **D1** | **Read-only for L3.** Write tools deferred to L4, but the seam is pre-shaped. | Autonomous write access is a real risk surface (mass mis-categorization, duplicate imports); the UI already covers writes; keeps the Groww gate trivially safe (no core mutation paths touched). |
| **D2** | **Direct-to-core** data access (import `@myfinance/core`, own sqlite connection, wire repos + domain fns in-process). NOT via the REST API. | Mirrors how `packages/api` already consumes core (proven twice). No liveness coupling to a separate API process; no double-hop latency. **Strengthened by the write question:** the future write path becomes a *copy of the read path* (open sqlite → wire repos + `runInTransaction` → call the core orchestrator), whereas via-the-API would force multipart file-upload over an extra HTTP hop. |
| **D3** | **stdio transport** (SDK's `StdioServerTransport`). HTTP deferred. | Single-user, self-hosted, local-first (MASTER_PLAN §2). stdio is the path of least resistance for the L4 Agent SDK consumer and for manual testing (`@modelcontextprotocol/inspector`, Claude Desktop). Tool defs are transport-agnostic, so HTTP is a later one-liner. |
| **D4** | **Task-shaped tool catalog** (~10 tools): domain-aggregate + drill + market-data. NOT a 1:1 mirror of repos. | Context window is the scarce resource, not calls. Repo-mirroring tools (~25) would leak the data model and force multi-call orchestration for one question. Task-shaped tools answer a whole question per call. |
| **D5** | **JSON-in-text-block output** with `structuredContent` alongside; **raw numbers** (not pre-formatted strings); **explicit unit labels** in field names + tool descriptions. | Agent needs precise values to compute with; it formats for the user. Unit labels (`*Inr`, `*Percent`, `xirrFraction`) guard against the known fraction-vs-percent footgun (the UI once rendered XIRR 0.0949 as "0.1%"). |
| **D6** | **Zod-validated inputs**; **`isError: true` result** for bad-input & external-failure; **empty-but-valid** result for no-data. | Keeps failures inside the agent's reasoning loop instead of breaking the MCP protocol. Empty is a legitimate answer, not an error. |
| **D7** | **Injectable `navFetch`** for the two market-data tools. | Offline, deterministic tests; lets us simulate mfapi.in-down → `isError`. Mirrors the API's injectable `amfiMatch` pattern. |
| **D8** | **Write seam pre-shaped but disabled:** tools grouped under `tools/read/*` with an empty reserved `tools/write/*`; the shared context builds a `runInTransaction` runner that is unused in L3. | When L4 wants writes, add `write/*` tools behind an explicit opt-in flag; the transaction runner is already available and the directory structure already signals intent. |

---

## 3. Architecture

New package `packages/mcp` (fills the reserved monorepo slot).

```
packages/mcp/
  package.json          ← @myfinance/mcp; deps: @modelcontextprotocol/sdk, zod, @myfinance/core
  tsconfig.json         ← composite leaf, project-refs ../core (build core first)
  src/
    context.ts          ← THE shared wiring: opens sqlite, runs migrations, builds all
                          repos + NavLookup, holds a (reserved, unused) runInTransaction
                          runner. buildContext({ dbPath, navFetch? }) → Context.
    server.ts           ← buildServer(ctx): creates McpServer, registers all read tools.
    index.ts            ← entrypoint: buildContext() → buildServer() → StdioServerTransport.
    tools/
      read/
        networth.ts     ← get_networth_overview
        investments.ts  ← get_investment_portfolio, get_investment_returns
        expenses.ts     ← get_expense_summary, list_transactions
        loans.ts        ← get_loans_overview, get_loan_amortization
        accounts.ts     ← list_accounts
        market.ts       ← search_schemes, get_scheme_nav
      write/            ← RESERVED (empty in L3)
    shared/
      output.ts         ← JSON content-block builder + isError helper
      units.ts          ← unit-label conventions / field-naming helpers
```

**Seam invariant:** no Drizzle/better-sqlite3 import anywhere outside `core`'s repos.
`mcp` imports only the public `@myfinance/core` surface; the sqlite handle lives in
`context.ts` solely to build repos and the (reserved) tx runner.

---

## 4. The Shared Context (`context.ts`)

`buildContext(opts)` is the single place that touches infrastructure — the `mcp`
analogue of the API's `registerDb` + `txRunner` plugins.

```ts
type BuildContextOpts = {
  dbPath?: string;                 // defaults to the same env-resolved path the API uses
  navFetch?: typeof fetch;         // injectable; defaults to global fetch (D7)
};

type Context = {
  db;                              // Drizzle db
  sqlite;                          // better-sqlite3 handle (owned for process lifetime)
  repos: {
    investmentTx, scheme, holdings, expenseTx, account,
    asset, assetContribution, assetRate, assetValuation, liability,
    category, categoryRule, importHistory,
  };
  nav: NavLookup;                  // getLatestNAV/getNAVForDate, built from navFetch
  runInTransaction;                // built from sqlite.transaction — RESERVED, unused in L3 (D8)
  close(): void;                   // closes sqlite on shutdown
};

function buildContext(opts?: BuildContextOpts): Context;
```

- **DB lifecycle:** the stdio server is a subprocess. `buildContext` runs
  `runMigrations(dbPath)` on boot (same as the API) so a fresh db is valid, opens the
  sqlite handle for the process lifetime, and `close()` shuts it down on exit.
- **Domain functions are NOT stored in the context** — they are pure and imported
  directly by the tools (`getNetWorth`, `getPortfolioSummary`, `getPeriodReturns`,
  `amortizationSchedule`, …). The context carries only the *stateful* deps
  (repos, `nav`, `runInTransaction`) those functions need injected.
- Tools receive the context, call the relevant core fn/repo, and shape the result.
  No tool touches sqlite or Drizzle directly.

---

## 5. Tool Catalog (the contract L4 binds to)

All tools: read-only, Zod-validated inputs, JSON-in-text-block output with explicit
unit labels. Money = raw INR numbers. Dates = ISO `YYYY-MM-DD` strings.

### Naming conventions (applied everywhere)
- `*Inr` suffix → a rupee amount (number).
- `*Percent` → an already-scaled percentage (e.g. `9.49`).
- `xirrFraction` → a raw fraction (`0.0949` = 9.49%). Each tool's description spells
  this out so the agent never repeats the UI's 0.1% bug.
- Every tool `description` states: units are INR, and how XIRR is expressed.

### Domain-aggregate tools

| Tool | Input | Returns (JSON) | Core fn(s) |
|---|---|---|---|
| `get_networth_overview` | *(none)* | `totalAssetsInr`, `totalLiabilitiesInr`, `netWorthInr`, `byAssetClass[]`, `assets[]` (valued) | `getNetWorth` / `getAllAssets` |
| `get_investment_portfolio` | `period?` (`1M`…`ALL`, default `ALL`), `account?` (**account-name string**, not id — matches core's portfolio `account` filter) | `summary{ investedInr, currentValueInr, returnsInr, returnsPercent, xirrFraction }`, `holdings[]`, `allocation[]` | `getPortfolioSummary` / `getHoldings` / `getAssetAllocation` |
| `get_expense_summary` | `from` (date, required), `to` (date, required) | `totalSpentInr`, `totalIncomeInr`, `savedInr`, `investedInr`, `byCategory[]`, `byMonth[]` | `expenseTxRepo.summary` |
| `get_loans_overview` | *(none)* | `loans[]{ id, name, principalInr, outstandingInr, emiInr, ratePercent, nextDueDate, progressPercent }` | `liabilityRepo` + `computeEmi` / `loanStatus` |

### Drill / composable tools

| Tool | Input | Returns | Core fn |
|---|---|---|---|
| `get_investment_returns` | `period` (required, `1M`…`ALL`) | `PeriodReturns{ period, startDate, endDate, startValue, endValue, investedInPeriod, returns, returnsPercent, xirrFraction }` | `getPeriodReturns` |
| `list_transactions` | `from?`, `to?`, `direction?` (`debit`\|`credit`), `search?`, `categoryId?`, `accountId?`, `limit?` (≤200, default 50), `offset?` | `transactions[]`, `total` | `expenseTxRepo.query` |
| `get_loan_amortization` | `liabilityId` (required, number) | `schedule[]{ paymentNo, dateStr, principalInr, interestInr, balanceInr }`, `truncated?` (bool) | `amortizationSchedule` |
| `list_accounts` | `domain?` (`investment`\|`expense`) | `accounts[]{ id, institution, label, domain }` | `accountRepo` |

### Market-data tools (external — hit mfapi.in over the network)

| Tool | Input | Returns | Core fn |
|---|---|---|---|
| `search_schemes` | `query` (required, string) | `schemes[]{ amfiCode, schemeName }` | `searchSchemes` |
| `get_scheme_nav` | `amfiCode` (required, string), `history?` (bool, default false) | `latest{ navInr, dateStr }`, `history?[]{ navInr, dateStr }` | `getLatestNAV` / `getNAVHistory` |

> **Market-data note:** `search_schemes` and `get_scheme_nav` are the **only**
> non-local, network-dependent tools and the only ones that can fail from an external
> outage. The core `navService` already handles caching/TTL, so the server inherits it.

---

## 6. Output & Error Handling

### Output builder (`shared/output.ts`)
Every successful tool returns:
```ts
{
  content: [{ type: 'text', text: JSON.stringify(payload) }],  // compact, no pretty-print (saves tokens)
  structuredContent: payload,                                   // for SDK clients that support it
}
```
The text block is the universal fallback; `structuredContent` is the typed echo.

### Three failure modes (D6)
1. **Bad input** (invalid period, unknown liability id, malformed date) → Zod rejects →
   `{ isError: true, content: [{ type: 'text', text: '<clear, actionable message>' }] }`.
   The agent sees it and can correct. Never throws to protocol level.
2. **External failure** (mfapi.in down — only the two market-data tools) → caught →
   `{ isError: true, content: [{ type: 'text', text: 'Market data temporarily unavailable: <detail>' }] }`
   so the agent treats it as transient and can proceed without it.
3. **Empty data** (no transactions in range, no holdings) → **valid non-error result**
   (`{ holdings: [], ... }` / `{ transactions: [], total: 0 }`). Empty is an answer.

### Unit safety
The `xirrFraction` / `*Inr` / `*Percent` field naming + per-tool descriptions are the
guardrail against the fraction-vs-percent footgun.

---

## 7. Testing (TDD — non-negotiable for T1)

1. **Tool-handler unit tests (the bulk).** Seeded temp sqlite (PII-free synthetic
   fixtures, schemes with NULL amfi_code so no network — same pattern as `packages/api`).
   Invoke each tool handler and assert: correct JSON shape; unit-label fields present;
   Zod rejects bad input → `isError`; empty-data → valid-empty (not error).
2. **Market-data tests with injected `navFetch`.** Offline, deterministic; explicitly
   simulate mfapi-down → `isError`.
3. **One protocol smoke test.** Wire the server through the SDK's in-memory transport,
   `listTools`, call one tool end-to-end — proves registration + transport + serialization.
4. **No re-testing core math.** Groww golden-master + the core suite already cover
   XIRR/portfolio/valuation. Wrapper tests assert shape & plumbing only.

### T1 gate
- Groww golden-master **6/6 unchanged** (mcp touches no core logic).
- Full suite green across all packages (core + agents + api + web + **new mcp**).
- `tsc --build` clean across all packages (mcp is a composite leaf referencing core —
  build core first).
- Seam invariant: no Drizzle/better-sqlite3 import outside core repos holds in `mcp`.

---

## 8. Out of Scope (YAGNI / deferred)

- **Write tools** — seam pre-shaped (`tools/write/*` dir + reserved `runInTransaction`
  in the context), disabled in L3. Added in L4 behind an explicit opt-in flag.
- **HTTP transport** — stdio only; SDK makes HTTP a later addition.
- **Additional tools** (categories/rules listing, import-history, budgets) — add when a
  concrete agent use case needs them.
- **Agent SDK integration + the agents themselves** — that is L4. L3 delivers only the
  tool contract they consume.

---

## 9. Gotchas (carried from prior layers)

- **Node 20 mandatory** — prefix commands `source ~/.nvm/nvm.sh && nvm use 20 && …`.
- **pnpm 11.x crashes on Node 20.20.2** — use `corepack prepare pnpm@10.4.1 --activate`
  for installs; build/test via `node_modules/.bin/{tsc,vitest}`.
- **Typecheck via `tsc --build`** (not plain `--noEmit`) — composite project refs need
  core's `.d.ts` emitted first; build order core → mcp.
- **Repo methods are synchronous** (better-sqlite3); only NAV (fetch) is async.
- **Push/PR** via `gh auth switch --user ak688744` (vkhandelwal-coursera has no push rights).
