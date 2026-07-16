# L3 MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `packages/mcp` — a read-only, stdio, direct-to-core MCP server exposing 10 task-shaped finance tools for the L4 AI agents.

**Architecture:** Thin wrapper over the already-tested `@myfinance/core` domain logic. A single `buildContext()` opens sqlite (runs migrations), builds all repos + a `NavLookup` + an injectable `marketData` dep + a reserved-but-unused `runInTransaction`. `buildServer(ctx)` registers 10 tools grouped under `src/tools/read/*`; each validates input (SDK Zod protocol layer + handler-level semantic checks returning `isError`), calls core, and returns compact JSON in a text block plus `structuredContent`. Entrypoint wires `StdioServerTransport`.

**Tech Stack:** TypeScript, `@modelcontextprotocol/sdk@^1.29.0`, `zod`, `@myfinance/core`, Vitest. Node 20.

## Global Constraints

- **Node 20 mandatory** — prefix every command with `source ~/.nvm/nvm.sh && nvm use 20 &&`.
- **pnpm 11.x crashes on Node 20.20.2** — installs via `corepack prepare pnpm@10.4.1 --activate && pnpm install`; run build/test via `node_modules/.bin/{tsc,vitest}` (NOT `pnpm`).
- **Typecheck via `tsc --build`** (not `--noEmit`) — `mcp` is a composite leaf referencing `../core`; build core first so its `.d.ts` resolves.
- **Seam invariant:** no `drizzle-orm` / `better-sqlite3` import anywhere in `packages/mcp/src` EXCEPT the sqlite handle type in `context.ts` (derived from core's `runMigrations` return, no direct dep). All data access goes through the public `@myfinance/core` surface.
- **Read-only:** no tool mutates data. `runInTransaction` is built in the context but unused (reserved write seam).
- **Money = raw INR numbers**; unit-labelled field names: `*Inr` = rupee amount, `*Percent` = scaled percentage, `xirrFraction` = raw fraction (0.0949 = 9.49%). Every tool `description` states units + XIRR representation.
- **Output shape:** every tool returns `{ content: [{ type: 'text', text: JSON.stringify(payload) }], structuredContent: payload }`; errors return `{ isError: true, content: [{ type: 'text', text }] }`.
- **Commit** after every task with the exact message shown. Push/PR later via `gh auth switch --user ak688744`.
- **Branch:** all work on `layer/3-mcp` (already created off `main`).

---

## File Structure

```
packages/mcp/
  package.json          ← Task 1
  tsconfig.json         ← Task 1
  vitest.config.ts      ← Task 1
  src/
    shared/
      output.ts         ← Task 2 (ok/errorResult helpers)
    context.ts          ← Task 3 (buildContext)
    server.ts           ← Task 4 (buildServer — grows per tool task)
    index.ts            ← Task 13 (stdio entrypoint)
    tools/
      read/
        networth.ts     ← Task 5  (get_networth_overview)
        investments.ts  ← Task 6  (get_investment_portfolio, get_investment_returns)
        expenses.ts     ← Task 7  (get_expense_summary, list_transactions)
        loans.ts        ← Task 8  (get_loans_overview, get_loan_amortization)
        accounts.ts     ← Task 9  (list_accounts)
        market.ts       ← Task 10 (search_schemes, get_scheme_nav)
      write/            ← reserved, empty (a .gitkeep in Task 1)
  test/
    helpers.ts          ← Task 3 (seedContext / fake marketData)
    output.test.ts      ← Task 2
    context.test.ts     ← Task 3
    networth.test.ts    ← Task 5
    investments.test.ts ← Task 6
    expenses.test.ts    ← Task 7
    loans.test.ts       ← Task 8
    accounts.test.ts    ← Task 9
    market.test.ts      ← Task 10
    server.test.ts      ← Task 11 (registration + protocol smoke)
```

**Design note — tool module signature.** To keep tools independently testable *and*
registerable, every tool module exports (a) a pure `run<Name>(ctx, input)` handler that
returns the `CallToolResult`-shaped object, and (b) a `register<Name>(server, ctx)` that
calls `server.registerTool(...)` delegating to the handler. Unit tests call the `run*`
handler directly (fast, no transport); `server.ts` calls the `register*` fns. This is the
seam that makes both the handler tests (Tasks 5–10) and the protocol smoke test (Task 11)
trivial.

---

### Task 1: Scaffold the `packages/mcp` package

**Files:**
- Create: `packages/mcp/package.json`
- Create: `packages/mcp/tsconfig.json`
- Create: `packages/mcp/vitest.config.ts`
- Create: `packages/mcp/src/tools/write/.gitkeep` (empty — reserved write seam)
- Modify: root `tsconfig.json` (add `{ "path": "packages/mcp" }` to `references` if that array exists)

**Interfaces:**
- Produces: the `@myfinance/mcp` package with `@myfinance/core`, `@modelcontextprotocol/sdk`, `zod` as deps; a composite tsconfig referencing `../core`.

- [ ] **Step 1: Inspect the sibling package to copy conventions**

Run:
```bash
cat packages/api/package.json
cat packages/api/tsconfig.json
cat packages/api/vitest.config.ts 2>/dev/null || echo "no vitest.config in api"
cat tsconfig.json
```
Note the exact `@myfinance/core` version spec (`workspace:*`), the `tsc --build` script form, and the composite/references shape. Match them.

- [ ] **Step 2: Write `packages/mcp/package.json`**

```json
{
  "name": "@myfinance/mcp",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "bin": { "myfinance-mcp": "dist/index.js" },
  "scripts": {
    "build": "tsc --build",
    "typecheck": "tsc --build",
    "test": "vitest run",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@myfinance/core": "workspace:*",
    "@modelcontextprotocol/sdk": "^1.29.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```
> Verify the `zod`, `typescript`, `vitest` version numbers against `packages/api/package.json` and match whatever is already used in the monorepo (do not introduce a new major). Adjust if the repo pins different versions.

- [ ] **Step 3: Write `packages/mcp/tsconfig.json`**

Copy `packages/api/tsconfig.json` verbatim, then ensure it (a) is `composite: true`, (b) has `"references": [{ "path": "../core" }]`, (c) `outDir` to `dist`, `rootDir` to `src`. Typical shape (reconcile with the api copy):
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "dist",
    "rootDir": "src",
    "module": "ESNext",
    "moduleResolution": "Bundler"
  },
  "include": ["src"],
  "references": [{ "path": "../core" }]
}
```
> If `packages/api/tsconfig.json` does NOT extend a base, mirror whatever it does exactly. The only hard requirements: `composite: true` + `references: [{ path: "../core" }]`.

- [ ] **Step 4: Write `packages/mcp/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
});
```

- [ ] **Step 5: Create the reserved write-seam dir**

Run:
```bash
mkdir -p packages/mcp/src/tools/write packages/mcp/src/tools/read packages/mcp/src/shared packages/mcp/test
touch packages/mcp/src/tools/write/.gitkeep
```

- [ ] **Step 6: Add mcp to the root project references (if present)**

Run: `cat tsconfig.json`. If it has a `references` array listing the packages, add `{ "path": "packages/mcp" }`. If the root has no references array, skip this step.

- [ ] **Step 7: Install deps**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 20 && corepack prepare pnpm@10.4.1 --activate && pnpm install
```
Expected: install completes; `packages/mcp/node_modules` (or the workspace root) now resolves `@modelcontextprotocol/sdk`.

- [ ] **Step 8: Verify the package builds (empty src is fine — add a placeholder)**

Create `packages/mcp/src/index.ts` with a single line `export const MCP_VERSION = '0.0.0';` so `tsc --build` has something to compile.

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 20 && node_modules/.bin/tsc --build packages/mcp
```
Expected: exits 0, emits `packages/mcp/dist/index.js`.

- [ ] **Step 9: Commit**

```bash
git add packages/mcp tsconfig.json
git commit -m "chore(mcp): scaffold @myfinance/mcp package (deps, tsconfig, vitest, reserved write dir)"
```

---

### Task 2: Output helpers (`shared/output.ts`)

**Files:**
- Create: `packages/mcp/src/shared/output.ts`
- Test: `packages/mcp/test/output.test.ts`

**Interfaces:**
- Produces:
  - `type ToolResult = { content: { type: 'text'; text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean }`
  - `ok(payload: Record<string, unknown>): ToolResult` — JSON-stringifies payload into a text block AND sets `structuredContent`.
  - `errorResult(message: string): ToolResult` — `{ isError: true, content: [{ type:'text', text: message }] }`, no `structuredContent`.

- [ ] **Step 1: Write the failing test**

`packages/mcp/test/output.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { ok, errorResult } from '../src/shared/output';

describe('output helpers', () => {
  it('ok() puts compact JSON in a text block and mirrors it to structuredContent', () => {
    const r = ok({ netWorthInr: 1234.5, byAssetClass: [] });
    expect(r.isError).toBeUndefined();
    expect(r.content).toEqual([{ type: 'text', text: '{"netWorthInr":1234.5,"byAssetClass":[]}' }]);
    expect(r.structuredContent).toEqual({ netWorthInr: 1234.5, byAssetClass: [] });
  });

  it('errorResult() sets isError and a plain-text message, no structuredContent', () => {
    const r = errorResult('Liability 99 not found.');
    expect(r.isError).toBe(true);
    expect(r.content).toEqual([{ type: 'text', text: 'Liability 99 not found.' }]);
    expect(r.structuredContent).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && packages/mcp/node_modules/.bin/vitest run test/output.test.ts --root packages/mcp`
Expected: FAIL — cannot find `../src/shared/output`.
> If `packages/mcp/node_modules/.bin/vitest` doesn't exist, use the workspace root binary: `node_modules/.bin/vitest run packages/mcp/test/output.test.ts`. Use whichever resolves; apply the same choice for all later test steps.

- [ ] **Step 3: Write the implementation**

`packages/mcp/src/shared/output.ts`:
```ts
export type ToolResult = {
  content: { type: 'text'; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

/** Success: compact JSON in a text block + typed echo in structuredContent. */
export function ok(payload: Record<string, unknown>): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    structuredContent: payload,
  };
}

/** Recoverable failure the agent should see and react to (D6 handler layer). */
export function errorResult(message: string): ToolResult {
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && packages/mcp/node_modules/.bin/vitest run test/output.test.ts --root packages/mcp`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/mcp/src/shared/output.ts packages/mcp/test/output.test.ts
git commit -m "feat(mcp): output helpers — ok()/errorResult() (compact JSON + structuredContent)"
```

---

### Task 3: Shared context (`context.ts`) + test helpers

**Files:**
- Create: `packages/mcp/src/context.ts`
- Create: `packages/mcp/test/helpers.ts`
- Test: `packages/mcp/test/context.test.ts`

**Interfaces:**
- Consumes: `@myfinance/core` exports — `runMigrations`, `seedDatabase`, all `make*Repo` factories, `getLatestNAV`, `getNAVForDate`, `getNAVHistory`, `searchSchemes`, types `NavLookup`, `SchemeInfo`, `NAVData`.
- Produces:
  - `type MarketData = { searchSchemes(q: string): Promise<SchemeInfo[]>; getLatestNAV(code: string): Promise<number|null>; getNAVHistory(code: string): Promise<NAVData[]> }`
  - `type McpContext = { db; sqlite; repos: {...all 13...}; nav: NavLookup; marketData: MarketData; runInTransaction: <T>(fn:()=>T)=>T; close(): void }`
  - `buildContext(opts?: { dbPath?: string; marketData?: MarketData }): McpContext`
  - Test helper `seedContext(opts?): McpContext` (uses `:memory:`, a non-throwing fake marketData by default) + `fakeMarketData(overrides)`.

- [ ] **Step 1: Confirm the exact core exports exist**

Run:
```bash
grep -n 'getNAVHistory\|searchSchemes\|type SchemeInfo\|type NAVData\|type NavLookup\|seedDatabase' packages/core/src/index.ts
```
Expected: all present (they are exported from the barrel — `getNAVHistory`, `searchSchemes`, `NAVData`, `SchemeInfo` from navService; `NavLookup` from types; `seedDatabase` from db/seed).

- [ ] **Step 2: Write the failing test**

`packages/mcp/test/context.test.ts`:
```ts
import { describe, it, expect, afterEach } from 'vitest';
import { buildContext, type McpContext } from '../src/context';

let ctx: McpContext | undefined;
afterEach(() => { ctx?.close(); ctx = undefined; });

describe('buildContext', () => {
  it('builds an in-memory context with repos, nav, marketData, and a tx runner', () => {
    ctx = buildContext({ dbPath: ':memory:' });
    expect(ctx.repos.liabilityRepo).toBeDefined();
    expect(ctx.repos.expenseTxRepo).toBeDefined();
    expect(ctx.repos.accountRepo).toBeDefined();
    expect(typeof ctx.nav.getLatestNAV).toBe('function');
    expect(typeof ctx.marketData.searchSchemes).toBe('function');
    // reserved write seam is present but unused
    expect(ctx.runInTransaction(() => 42)).toBe(42);
  });

  it('seeds starter categories so a fresh DB is queryable', () => {
    ctx = buildContext({ dbPath: ':memory:' });
    const cats = ctx.repos.categoryRepo.list();
    expect(cats.length).toBeGreaterThan(0);
  });

  it('accepts an injected marketData that overrides the default', async () => {
    const fake = {
      searchSchemes: async () => [{ schemeCode: '1', schemeName: 'X' } as any],
      getLatestNAV: async () => 10,
      getNAVHistory: async () => [],
    };
    ctx = buildContext({ dbPath: ':memory:', marketData: fake });
    expect(await ctx.marketData.getLatestNAV('1')).toBe(10);
  });
});
```
> Verify `categoryRepo.list()` is the correct method name via `grep -n 'list\|getAll' packages/core/src/repositories/categoryRepo.ts`. If the method differs, adjust the test to whatever lists categories.

- [ ] **Step 3: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && packages/mcp/node_modules/.bin/vitest run test/context.test.ts --root packages/mcp`
Expected: FAIL — cannot find `../src/context`.

- [ ] **Step 4: Write `context.ts`**

```ts
import {
  runMigrations,
  seedDatabase,
  makeInvestmentTxRepo,
  makeSchemeRepo,
  makeHoldingsRepo,
  makeCategoryRepo,
  makeCategoryRuleRepo,
  makeExpenseTransactionRepo,
  makeImportHistoryRepo,
  makeAccountRepo,
  makeAssetRepo,
  makeAssetContributionRepo,
  makeAssetRateRepo,
  makeAssetValuationRepo,
  makeLiabilityRepo,
  getLatestNAV,
  getNAVForDate,
  getNAVHistory,
  searchSchemes,
  type Db,
  type NavLookup,
  type SchemeInfo,
  type NAVData,
  type InvestmentTxRepo,
  type SchemeRepo,
  type HoldingsRepo,
  type CategoryRepo,
  type CategoryRuleRepo,
  type ExpenseTransactionRepo,
  type ImportHistoryRepo,
  type AccountRepo,
  type AssetRepo,
  type AssetContributionRepo,
  type AssetRateRepo,
  type AssetValuationRepo,
  type LiabilityRepo,
} from '@myfinance/core';

// Derived from core's runMigrations return type to avoid a direct better-sqlite3
// dependency in the mcp package (seam invariant).
type Sqlite = ReturnType<typeof runMigrations>['sqlite'];

export type MarketData = {
  searchSchemes: (query: string) => Promise<SchemeInfo[]>;
  getLatestNAV: (amfiCode: string) => Promise<number | null>;
  getNAVHistory: (amfiCode: string) => Promise<NAVData[]>;
};

export type McpRepos = {
  investmentTxRepo: InvestmentTxRepo;
  schemeRepo: SchemeRepo;
  holdingsRepo: HoldingsRepo;
  categoryRepo: CategoryRepo;
  categoryRuleRepo: CategoryRuleRepo;
  expenseTxRepo: ExpenseTransactionRepo;
  importHistoryRepo: ImportHistoryRepo;
  accountRepo: AccountRepo;
  assetRepo: AssetRepo;
  assetContributionRepo: AssetContributionRepo;
  assetRateRepo: AssetRateRepo;
  assetValuationRepo: AssetValuationRepo;
  liabilityRepo: LiabilityRepo;
};

export type McpContext = {
  db: Db;
  sqlite: Sqlite;
  repos: McpRepos;
  nav: NavLookup;
  marketData: MarketData;
  /** RESERVED write seam (D8) — built, unused in L3. */
  runInTransaction: <T>(fn: () => T) => T;
  close: () => void;
};

// Real market-data adapter over core's navService (default when not injected).
const realMarketData: MarketData = {
  searchSchemes: (q) => searchSchemes(q),
  getLatestNAV: (code) => getLatestNAV(code),
  getNAVHistory: (code) => getNAVHistory(code),
};

export function buildContext(
  opts: { dbPath?: string; marketData?: MarketData } = {},
): McpContext {
  const { db, sqlite } = runMigrations(opts.dbPath ?? ':memory:');
  seedDatabase(db);

  const repos: McpRepos = {
    investmentTxRepo: makeInvestmentTxRepo(db),
    schemeRepo: makeSchemeRepo(db),
    holdingsRepo: makeHoldingsRepo(db),
    categoryRepo: makeCategoryRepo(db),
    categoryRuleRepo: makeCategoryRuleRepo(db),
    expenseTxRepo: makeExpenseTransactionRepo(db),
    importHistoryRepo: makeImportHistoryRepo(db),
    accountRepo: makeAccountRepo(db),
    assetRepo: makeAssetRepo(db),
    assetContributionRepo: makeAssetContributionRepo(db),
    assetRateRepo: makeAssetRateRepo(db),
    assetValuationRepo: makeAssetValuationRepo(db),
    liabilityRepo: makeLiabilityRepo(db),
  };

  const nav: NavLookup = {
    getNAVForDate: (code, date) => getNAVForDate(code, date),
    getLatestNAV: (code) => getLatestNAV(code),
  };

  return {
    db,
    sqlite,
    repos,
    nav,
    marketData: opts.marketData ?? realMarketData,
    runInTransaction: <T>(fn: () => T): T => sqlite.transaction(fn)(),
    close: () => sqlite.close(),
  };
}
```
> `dbPath` default resolution: the API resolves a real path from config, but for L3 `:memory:` is a safe default; the stdio entrypoint (Task 13) passes the real env path. Confirm the `runMigrations` signature accepts a path string via `grep -n 'export function runMigrations' packages/core/src/db/migrate.ts`.

- [ ] **Step 5: Write the test helper**

`packages/mcp/test/helpers.ts`:
```ts
import { buildContext, type McpContext, type MarketData } from '../src/context';
import type { SchemeInfo, NAVData } from '@myfinance/core';

/** A non-throwing fake marketData with sensible empty defaults; override per test. */
export function fakeMarketData(overrides: Partial<MarketData> = {}): MarketData {
  return {
    searchSchemes: async (): Promise<SchemeInfo[]> => [],
    getLatestNAV: async (): Promise<number | null> => null,
    getNAVHistory: async (): Promise<NAVData[]> => [],
    ...overrides,
  };
}

/** Build an in-memory context with a fake (offline) marketData. Caller calls ctx.close(). */
export function seedContext(overrides: Partial<MarketData> = {}): McpContext {
  return buildContext({ dbPath: ':memory:', marketData: fakeMarketData(overrides) });
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && packages/mcp/node_modules/.bin/vitest run test/context.test.ts --root packages/mcp`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add packages/mcp/src/context.ts packages/mcp/test/context.test.ts packages/mcp/test/helpers.ts
git commit -m "feat(mcp): buildContext — repos + nav + injectable marketData + reserved tx runner"
```

---

### Task 4: Server factory skeleton (`server.ts`)

**Files:**
- Create: `packages/mcp/src/server.ts`
- Test: (covered by Task 11; no standalone test here — this is scaffolding folded into the tool tasks)

**Interfaces:**
- Consumes: `McpContext` from Task 3; `McpServer` from `@modelcontextprotocol/sdk/server/mcp.js`.
- Produces: `buildServer(ctx: McpContext): McpServer` — creates the server and (as tool tasks land) calls each `register*` fn. Ships in this task registering ZERO tools; Tasks 5–10 each add one `register*(server, ctx)` call.

- [ ] **Step 1: Write `server.ts` with no tools yet**

```ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from './context';

/**
 * Build the MyFinance MCP server and register all read tools.
 * Transport-agnostic: the caller connects a transport (stdio in index.ts,
 * in-memory in tests).
 */
export function buildServer(ctx: McpContext): McpServer {
  const server = new McpServer({
    name: 'myfinance-mcp',
    version: '0.0.0',
  });

  // Tool registrations are added by Tasks 5–10, e.g.:
  //   registerNetworthTools(server, ctx);
  // (ctx is intentionally referenced to avoid an unused-parameter error until
  // the first tool lands in Task 5.)
  void ctx;

  return server;
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && node_modules/.bin/tsc --build packages/mcp`
Expected: exits 0.
> If the SDK import path `@modelcontextprotocol/sdk/server/mcp.js` fails to resolve types, confirm the correct subpath: `ls node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.d.ts` and check `node_modules/@modelcontextprotocol/sdk/package.json` "exports" for the `./server/mcp.js` entry. Use the path the package's exports map advertises.

- [ ] **Step 3: Commit**

```bash
git add packages/mcp/src/server.ts
git commit -m "feat(mcp): buildServer skeleton (McpServer, no tools yet)"
```

---

### Task 5: `get_networth_overview` tool

**Files:**
- Create: `packages/mcp/src/tools/read/networth.ts`
- Modify: `packages/mcp/src/server.ts` (call `registerNetworthTools`)
- Test: `packages/mcp/test/networth.test.ts`

**Interfaces:**
- Consumes: `McpContext`; core `getNetWorth`, `getAllAssets`, `getHoldings`, `type NavLookup`. `ok` from `shared/output`.
- Produces:
  - `runNetworthOverview(ctx: McpContext): Promise<ToolResult>` — payload `{ totalAssetsInr, totalLiabilitiesInr, netWorthInr, byAssetClass: {assetClass,valueInr,percentage,count}[], assets: {assetId,assetClass,name,valuationStrategy,currentValueInr,investedInr,returnsInr,asOf}[] }`.
  - `registerNetworthTools(server, ctx): void`.
- Reference — `getNetWorth` returns `NetWorthSummary { totalAssets, totalLiabilities, netWorth, byAssetClass:[{assetClass,value,percentage,count}] }`; `getAllAssets` returns `ValuedAsset[] { assetId, assetClass, accountId, name, valuationStrategy, currentValue, invested, returns, asOf, valuedAt?, ageDays? }`. Both take `NetWorthDeps { assetRepo, contributionRepo, rateRepo, valuationRepo, liabilityRepo, getMfHoldings }` where `getMfHoldings = (filters) => getHoldings({ txRepo, nav }, filters)`.

- [ ] **Step 1: Write the failing test**

`packages/mcp/test/networth.test.ts`:
```ts
import { describe, it, expect, afterEach } from 'vitest';
import { seedContext } from './helpers';
import { runNetworthOverview } from '../src/tools/read/networth';
import type { McpContext } from '../src/context';

let ctx: McpContext;
afterEach(() => ctx?.close());

describe('get_networth_overview', () => {
  it('returns zeros on an empty DB (empty is valid, not an error)', async () => {
    ctx = seedContext();
    const r = await runNetworthOverview(ctx);
    expect(r.isError).toBeUndefined();
    const p = r.structuredContent as any;
    expect(p.totalAssetsInr).toBe(0);
    expect(p.totalLiabilitiesInr).toBe(0);
    expect(p.netWorthInr).toBe(0);
    expect(p.assets).toEqual([]);
    expect(p.byAssetClass).toEqual([]);
  });

  it('projects a manual asset with INR-labelled fields', async () => {
    ctx = seedContext();
    const accountId = ctx.repos.accountRepo.create({
      domain: 'investment', institution: 'SBI', label: 'Gold',
    });
    const assetId = ctx.repos.assetRepo.create({
      accountId, assetClass: 'gold', name: 'Gold bar',
      valuationStrategy: 'manual', ingestionMode: 'manual_entry',
      params: {}, status: 'active',
    });
    ctx.repos.assetValuationRepo.create({
      assetId, value: 200000, valuedAt: '2025-01-01',
    });

    const r = await runNetworthOverview(ctx);
    const p = r.structuredContent as any;
    expect(p.totalAssetsInr).toBe(200000);
    expect(p.netWorthInr).toBe(200000);
    const gold = p.byAssetClass.find((c: any) => c.assetClass === 'gold');
    expect(gold.valueInr).toBe(200000);
    expect(p.assets[0].currentValueInr).toBe(200000);
    expect(p.assets[0].name).toBe('Gold bar');
  });
});
```
> Confirm the exact `assetRepo.create` / `assetValuationRepo.create` argument shapes before running — `grep -n 'create(' packages/core/src/repositories/assetRepo.ts packages/core/src/repositories/assetValuationRepo.ts` and match the field names precisely (e.g. `ingestionMode`, `params`). Adjust the test's create-payloads to the real signatures. This mirrors how `packages/api/test/networth.test.ts` seeds via the API; here we seed via repos directly.

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && packages/mcp/node_modules/.bin/vitest run test/networth.test.ts --root packages/mcp`
Expected: FAIL — cannot find `../src/tools/read/networth`.

- [ ] **Step 3: Write `tools/read/networth.ts`**

```ts
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getNetWorth, getAllAssets, getHoldings } from '@myfinance/core';
import type { McpContext } from '../../context';
import { ok, type ToolResult } from '../../shared/output';

function netWorthDeps(ctx: McpContext) {
  return {
    assetRepo: ctx.repos.assetRepo,
    contributionRepo: ctx.repos.assetContributionRepo,
    rateRepo: ctx.repos.assetRateRepo,
    valuationRepo: ctx.repos.assetValuationRepo,
    liabilityRepo: ctx.repos.liabilityRepo,
    getMfHoldings: (filters: { account?: string }) =>
      getHoldings({ txRepo: ctx.repos.investmentTxRepo, nav: ctx.nav }, filters),
  };
}

export async function runNetworthOverview(ctx: McpContext): Promise<ToolResult> {
  const deps = netWorthDeps(ctx);
  const summary = await getNetWorth(deps);
  const assets = await getAllAssets(deps);
  return ok({
    totalAssetsInr: summary.totalAssets,
    totalLiabilitiesInr: summary.totalLiabilities,
    netWorthInr: summary.netWorth,
    byAssetClass: summary.byAssetClass.map((c) => ({
      assetClass: c.assetClass,
      valueInr: c.value,
      percentage: c.percentage,
      count: c.count,
    })),
    assets: assets.map((a) => ({
      assetId: a.assetId,
      assetClass: a.assetClass,
      name: a.name,
      valuationStrategy: a.valuationStrategy,
      currentValueInr: a.currentValue,
      investedInr: a.invested,
      returnsInr: a.returns,
      asOf: a.asOf,
    })),
  });
}

export function registerNetworthTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'get_networth_overview',
    {
      description:
        'Total net worth: assets minus liabilities, with a per-asset-class breakdown ' +
        'and every valued asset (mutual funds are projected in at read time). All ' +
        'monetary fields are INR (suffix `Inr`). Takes no input.',
      inputSchema: {},
    },
    async () => runNetworthOverview(ctx),
  );
}
```

- [ ] **Step 4: Wire into `server.ts`**

Add the import and call:
```ts
import { registerNetworthTools } from './tools/read/networth';
// ...inside buildServer, replace `void ctx;` with:
registerNetworthTools(server, ctx);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && packages/mcp/node_modules/.bin/vitest run test/networth.test.ts --root packages/mcp`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/mcp/src/tools/read/networth.ts packages/mcp/src/server.ts packages/mcp/test/networth.test.ts
git commit -m "feat(mcp): get_networth_overview tool (assets−liabilities + valued assets, INR-labelled)"
```

---

### Task 6: `get_investment_portfolio` + `get_investment_returns` tools

**Files:**
- Create: `packages/mcp/src/tools/read/investments.ts`
- Modify: `packages/mcp/src/server.ts`
- Test: `packages/mcp/test/investments.test.ts`

**Interfaces:**
- Consumes: `McpContext`; core `getPortfolioSummary`, `getHoldings`, `getAssetAllocation`, `getPeriodReturns`, `type Period`. `ok`, `errorResult`. `z` from `zod`.
- Produces:
  - `runInvestmentPortfolio(ctx, input: { period?: Period; account?: string }): Promise<ToolResult>` — payload `{ summary:{ investedInr, currentValueInr, returnsInr, returnsPercent, xirrFraction }, holdings:[...], allocation:[...] }`.
  - `runInvestmentReturns(ctx, input: { period: Period }): Promise<ToolResult>` — payload `{ period, startDate, endDate, startValueInr, endValueInr, investedInPeriodInr, returnsInr, returnsPercent, xirrFraction }`.
  - `registerInvestmentTools(server, ctx): void`.
- Reference — `getPortfolioSummary({txRepo,nav})` → `PortfolioSummary { totalInvested, totalCurrentValue, totalReturns, totalReturnsPercent, xirr, holdingsCount, totalRedeemed }` (xirr is a fraction). `getPeriodReturns({txRepo,schemeRepo,holdingsRepo,nav},{period})` → `PeriodReturns { period, startDate, endDate, startValue, endValue, investedInPeriod, returns, returnsPercent, xirr }`. `getHoldings`/`getAssetAllocation` take `({txRepo,nav}, filters?)`. Valid periods: `1M,3M,6M,1Y,3Y,5Y,ALL`.

- [ ] **Step 1: Write the failing test**

`packages/mcp/test/investments.test.ts`:
```ts
import { describe, it, expect, afterEach } from 'vitest';
import { seedContext } from './helpers';
import { runInvestmentPortfolio, runInvestmentReturns } from '../src/tools/read/investments';
import type { McpContext } from '../src/context';

let ctx: McpContext;
afterEach(() => ctx?.close());

describe('get_investment_portfolio', () => {
  it('returns an empty-but-valid portfolio on a fresh DB', async () => {
    ctx = seedContext();
    const r = await runInvestmentPortfolio(ctx, {});
    expect(r.isError).toBeUndefined();
    const p = r.structuredContent as any;
    expect(p.summary.investedInr).toBe(0);
    expect(p.summary.currentValueInr).toBe(0);
    expect(p.holdings).toEqual([]);
    expect(p.allocation).toEqual([]);
    // xirrFraction present (null when no cashflows) — name signals it is a fraction
    expect('xirrFraction' in p.summary).toBe(true);
  });
});

describe('get_investment_returns', () => {
  it('returns an ALL-period result with a fraction-named xirr field', async () => {
    ctx = seedContext();
    const r = await runInvestmentReturns(ctx, { period: 'ALL' });
    expect(r.isError).toBeUndefined();
    const p = r.structuredContent as any;
    expect(p.period).toBe('ALL');
    expect('xirrFraction' in p).toBe(true);
    expect('endValueInr' in p).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && packages/mcp/node_modules/.bin/vitest run test/investments.test.ts --root packages/mcp`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `tools/read/investments.ts`**

```ts
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  getPortfolioSummary,
  getHoldings,
  getAssetAllocation,
  getPeriodReturns,
  type Period,
} from '@myfinance/core';
import type { McpContext } from '../../context';
import { ok, type ToolResult } from '../../shared/output';

const PERIODS = ['1M', '3M', '6M', '1Y', '3Y', '5Y', 'ALL'] as const;

export async function runInvestmentPortfolio(
  ctx: McpContext,
  input: { period?: Period; account?: string },
): Promise<ToolResult> {
  const deps = { txRepo: ctx.repos.investmentTxRepo, nav: ctx.nav };
  const filters = input.account ? { account: input.account } : {};
  const summary = await getPortfolioSummary(deps);
  const holdings = await getHoldings(deps, filters);
  const allocation = await getAssetAllocation(deps, input.account ? filters : undefined);
  return ok({
    summary: {
      investedInr: summary.totalInvested,
      currentValueInr: summary.totalCurrentValue,
      returnsInr: summary.totalReturns,
      returnsPercent: summary.totalReturnsPercent,
      xirrFraction: summary.xirr,
    },
    holdings,
    allocation,
  });
}

export async function runInvestmentReturns(
  ctx: McpContext,
  input: { period: Period },
): Promise<ToolResult> {
  const r = await getPeriodReturns(
    {
      txRepo: ctx.repos.investmentTxRepo,
      schemeRepo: ctx.repos.schemeRepo,
      holdingsRepo: ctx.repos.holdingsRepo,
      nav: ctx.nav,
    },
    { period: input.period },
  );
  return ok({
    period: r.period,
    startDate: r.startDate,
    endDate: r.endDate,
    startValueInr: r.startValue,
    endValueInr: r.endValue,
    investedInPeriodInr: r.investedInPeriod,
    returnsInr: r.returns,
    returnsPercent: r.returnsPercent,
    xirrFraction: r.xirr,
  });
}

export function registerInvestmentTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'get_investment_portfolio',
    {
      description:
        'Mutual-fund portfolio: summary (invested / current value / returns / XIRR), ' +
        'per-holding rows, and asset allocation. Optional `period` (1M/3M/6M/1Y/3Y/5Y/ALL, ' +
        'default ALL) and `account` (account-NAME string). Money fields are INR (`Inr`); ' +
        '`xirrFraction` is a raw fraction (0.0949 = 9.49%).',
      inputSchema: {
        period: z.enum(PERIODS).optional(),
        account: z.string().optional(),
      },
    },
    async (input) => runInvestmentPortfolio(ctx, input),
  );

  server.registerTool(
    'get_investment_returns',
    {
      description:
        'Period returns for the MF portfolio over the given window. Required `period` ' +
        '(1M/3M/6M/1Y/3Y/5Y/ALL). Money fields are INR (`Inr`); `xirrFraction` is a raw ' +
        'fraction (0.0949 = 9.49%).',
      inputSchema: { period: z.enum(PERIODS) },
    },
    async (input) => runInvestmentReturns(ctx, input),
  );
}
```

- [ ] **Step 4: Wire into `server.ts`** (`import { registerInvestmentTools }` + call it in `buildServer`).

- [ ] **Step 5: Run test to verify it passes**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && packages/mcp/node_modules/.bin/vitest run test/investments.test.ts --root packages/mcp`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/mcp/src/tools/read/investments.ts packages/mcp/src/server.ts packages/mcp/test/investments.test.ts
git commit -m "feat(mcp): get_investment_portfolio + get_investment_returns (period/account, xirrFraction)"
```

---

### Task 7: `get_expense_summary` + `list_transactions` tools

**Files:**
- Create: `packages/mcp/src/tools/read/expenses.ts`
- Modify: `packages/mcp/src/server.ts`
- Test: `packages/mcp/test/expenses.test.ts`

**Interfaces:**
- Consumes: `McpContext`; `ctx.repos.expenseTxRepo.summary(filters)` and `.query(filters)`. `ok`. `z`.
- Produces:
  - `runExpenseSummary(ctx, input: { from: string; to: string }): Promise<ToolResult>` — payload `{ totalSpentInr, totalIncomeInr, savedInr, investedInr, byCategory:[{categoryId,amountInr}], byMonth:[{month,spentInr}] }`. Applies the same defaults the API uses: `excludeFromSpend: ['investment','transfer']`, `investmentCategories: ['investment']`.
  - `runListTransactions(ctx, input: { from?; to?; direction?; search?; categoryId?; accountId?; limit?; offset? }): Promise<ToolResult>` — payload `{ transactions:[...], count }`.
  - `registerExpenseTools(server, ctx): void`.
- Reference — `expenseTxRepo.summary({from?,to?,accountId?,excludeFromSpend,investmentCategories})` → `{ totalSpent, totalIncome, saved, invested, byCategory:[{categoryId,amount}], byMonth:[{month,spent}] }`. `.query({from?,to?,direction?('in'|'out'),search?,categoryId?,accountId?,limit?,offset?})` → row[] `{id,transactionDate,description,amount,direction,categoryId,categorySource,aiKeyword,accountId,balance}`. NOTE: `.query` returns only the page (no total count); expose `count` = rows returned.

- [ ] **Step 1: Write the failing test**

`packages/mcp/test/expenses.test.ts`:
```ts
import { describe, it, expect, afterEach } from 'vitest';
import { seedContext } from './helpers';
import { runExpenseSummary, runListTransactions } from '../src/tools/read/expenses';
import type { McpContext } from '../src/context';

let ctx: McpContext;
afterEach(() => ctx?.close());

describe('get_expense_summary', () => {
  it('returns zeroed INR-labelled totals on an empty range', async () => {
    ctx = seedContext();
    const r = await runExpenseSummary(ctx, { from: '2025-01-01', to: '2025-12-31' });
    expect(r.isError).toBeUndefined();
    const p = r.structuredContent as any;
    expect(p.totalSpentInr).toBe(0);
    expect(p.totalIncomeInr).toBe(0);
    expect(p.savedInr).toBe(0);
    expect(p.investedInr).toBe(0);
    expect(p.byCategory).toEqual([]);
    expect(p.byMonth).toEqual([]);
  });
});

describe('list_transactions', () => {
  it('returns an empty page on a fresh DB', async () => {
    ctx = seedContext();
    const r = await runListTransactions(ctx, { limit: 10 });
    expect(r.isError).toBeUndefined();
    const p = r.structuredContent as any;
    expect(p.transactions).toEqual([]);
    expect(p.count).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — module not found.

Run: `source ~/.nvm/nvm.sh && nvm use 20 && packages/mcp/node_modules/.bin/vitest run test/expenses.test.ts --root packages/mcp`

- [ ] **Step 3: Write `tools/read/expenses.ts`**

```ts
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from '../../context';
import { ok, type ToolResult } from '../../shared/output';

const EXCLUDE_FROM_SPEND = ['investment', 'transfer'];
const INVESTMENT_CATEGORIES = ['investment'];

export async function runExpenseSummary(
  ctx: McpContext,
  input: { from: string; to: string },
): Promise<ToolResult> {
  const s = ctx.repos.expenseTxRepo.summary({
    from: input.from,
    to: input.to,
    excludeFromSpend: EXCLUDE_FROM_SPEND,
    investmentCategories: INVESTMENT_CATEGORIES,
  });
  return ok({
    totalSpentInr: s.totalSpent,
    totalIncomeInr: s.totalIncome,
    savedInr: s.saved,
    investedInr: s.invested,
    byCategory: s.byCategory.map((c) => ({ categoryId: c.categoryId, amountInr: c.amount })),
    byMonth: s.byMonth.map((m) => ({ month: m.month, spentInr: m.spent })),
  });
}

export async function runListTransactions(
  ctx: McpContext,
  input: {
    from?: string; to?: string; direction?: 'in' | 'out'; search?: string;
    categoryId?: string; accountId?: number; limit?: number; offset?: number;
  },
): Promise<ToolResult> {
  const rows = ctx.repos.expenseTxRepo.query({
    ...(input.from !== undefined ? { from: input.from } : {}),
    ...(input.to !== undefined ? { to: input.to } : {}),
    ...(input.direction !== undefined ? { direction: input.direction } : {}),
    ...(input.search !== undefined ? { search: input.search } : {}),
    ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
    ...(input.accountId !== undefined ? { accountId: input.accountId } : {}),
    limit: input.limit ?? 50,
    ...(input.offset !== undefined ? { offset: input.offset } : {}),
  });
  return ok({ transactions: rows, count: rows.length });
}

export function registerExpenseTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'get_expense_summary',
    {
      description:
        'Expense cash-flow summary for a date range: total spent / income / saved / ' +
        'invested plus by-category and by-month breakdowns. Required `from` and `to` ' +
        '(ISO YYYY-MM-DD). Investment and transfer categories are excluded from "spent"; ' +
        'investment debits are surfaced as `investedInr`. All money fields are INR.',
      inputSchema: {
        from: z.string(),
        to: z.string(),
      },
    },
    async (input) => runExpenseSummary(ctx, input),
  );

  server.registerTool(
    'list_transactions',
    {
      description:
        'List expense/bank transactions (most recent first), paginated. Optional filters: ' +
        '`from`/`to` (ISO date), `direction` ("in"|"out"), `search` (description substring), ' +
        '`categoryId`, `accountId`, `limit` (default 50, max 200), `offset`. Amounts are INR.',
      inputSchema: {
        from: z.string().optional(),
        to: z.string().optional(),
        direction: z.enum(['in', 'out']).optional(),
        search: z.string().optional(),
        categoryId: z.string().optional(),
        accountId: z.number().optional(),
        limit: z.number().int().min(1).max(200).optional(),
        offset: z.number().int().min(0).optional(),
      },
    },
    async (input) => runListTransactions(ctx, input),
  );
}
```
> The `limit` cap (max 200) is enforced by the SDK's `inputSchema` (protocol layer) — a request with `limit: 500` is a malformed call and throws `InvalidParams`, which is acceptable per D6.

- [ ] **Step 4: Wire into `server.ts`.**

- [ ] **Step 5: Run test to verify it passes** (2 tests). Same vitest command with `test/expenses.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add packages/mcp/src/tools/read/expenses.ts packages/mcp/src/server.ts packages/mcp/test/expenses.test.ts
git commit -m "feat(mcp): get_expense_summary + list_transactions (INR-labelled, spend defaults match API)"
```

---

### Task 8: `get_loans_overview` + `get_loan_amortization` tools

**Files:**
- Create: `packages/mcp/src/tools/read/loans.ts`
- Modify: `packages/mcp/src/server.ts`
- Test: `packages/mcp/test/loans.test.ts`

**Interfaces:**
- Consumes: `McpContext`; core `computeEmi`, `loanStatus`, `amortizationSchedule`, `type Liability`. `ok`, `errorResult`. `z`.
- Produces:
  - `runLoansOverview(ctx): Promise<ToolResult>` — payload `{ loans:[{ id, name, loanType, principalInr, outstandingInr, emiInr, ratePercent, nextDueDate, progressPercent }] }`.
  - `runLoanAmortization(ctx, input: { liabilityId: number }): Promise<ToolResult>` — unknown id → `errorResult`. Success payload `{ liabilityId, name, schedule:[{ period, dueDate, emiInr, principalInr, interestInr, balanceInr }], truncated }`.
  - `registerLoanTools(server, ctx): void`.
- Reference — `liabilityRepo.list({status?})` → `Liability[] { id, accountId, name, loanType, principal, annualRate, tenureMonths, emiAmount, startDate, status }`. `liabilityRepo.getById(id)` → `Liability|null`. `computeEmi(principal, annualRate, tenureMonths)` → number. `loanStatus(loan)` → `{ outstanding, paidPrincipal, interestPaid, interestRemaining, monthsRemaining, nextDueDate, progressPercent }`. `amortizationSchedule(loan)` → `AmortizationRow[] { period, dueDate, emi, principalComponent, interestComponent, balance }`. EMI resolution (from API's BUG-005): `emiAmount ?? computeEmi(principal, annualRate, tenureMonths)` when tenure present.

- [ ] **Step 1: Write the failing test**

`packages/mcp/test/loans.test.ts`:
```ts
import { describe, it, expect, afterEach } from 'vitest';
import { seedContext } from './helpers';
import { runLoansOverview, runLoanAmortization } from '../src/tools/read/loans';
import type { McpContext } from '../src/context';

let ctx: McpContext;
afterEach(() => ctx?.close());

function seedHomeLoan(ctx: McpContext): number {
  return ctx.repos.liabilityRepo.create({
    accountId: null, name: 'Home', loanType: 'home',
    principal: 1000000, annualRate: 9, tenureMonths: 120,
    emiAmount: null, startDate: '2024-01-01', status: 'active',
  });
}

describe('get_loans_overview', () => {
  it('returns [] on a fresh DB', async () => {
    ctx = seedContext();
    const p = (await runLoansOverview(ctx)).structuredContent as any;
    expect(p.loans).toEqual([]);
  });

  it('computes EMI + outstanding with INR labels for a tenure loan', async () => {
    ctx = seedContext();
    seedHomeLoan(ctx);
    const p = (await runLoansOverview(ctx)).structuredContent as any;
    expect(p.loans).toHaveLength(1);
    expect(p.loans[0].name).toBe('Home');
    expect(p.loans[0].principalInr).toBe(1000000);
    expect(p.loans[0].emiInr).toBeGreaterThan(0);
    expect(p.loans[0].outstandingInr).toBeGreaterThan(0);
    expect(p.loans[0].ratePercent).toBe(9);
  });
});

describe('get_loan_amortization', () => {
  it('returns isError for an unknown liability id', async () => {
    ctx = seedContext();
    const r = await runLoanAmortization(ctx, { liabilityId: 999 });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('999');
  });

  it('returns a schedule with INR-labelled rows', async () => {
    ctx = seedContext();
    const id = seedHomeLoan(ctx);
    const r = await runLoanAmortization(ctx, { liabilityId: id });
    expect(r.isError).toBeUndefined();
    const p = r.structuredContent as any;
    expect(p.liabilityId).toBe(id);
    expect(p.schedule.length).toBeGreaterThan(0);
    expect(p.schedule[0].emiInr).toBeGreaterThan(0);
    expect(p.schedule[0].balanceInr).toBeGreaterThan(0);
  });
});
```
> Confirm `liabilityRepo.create` arg shape via `grep -n -A15 'create(' packages/core/src/repositories/liabilityRepo.ts` and match field names exactly.

- [ ] **Step 2: Run test to verify it fails** — module not found.

- [ ] **Step 3: Write `tools/read/loans.ts`**

```ts
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { computeEmi, loanStatus, amortizationSchedule, type Liability } from '@myfinance/core';
import type { McpContext } from '../../context';
import { ok, errorResult, type ToolResult } from '../../shared/output';

function resolveEmi(loan: Liability): number | null {
  if (loan.emiAmount != null) return loan.emiAmount;
  if (loan.tenureMonths != null && loan.tenureMonths > 0) {
    return computeEmi(loan.principal, loan.annualRate, loan.tenureMonths);
  }
  return null;
}

export async function runLoansOverview(ctx: McpContext): Promise<ToolResult> {
  const loans = ctx.repos.liabilityRepo.list({ status: 'active' });
  return ok({
    loans: loans.map((l) => {
      const st = loanStatus(l);
      return {
        id: l.id,
        name: l.name,
        loanType: l.loanType,
        principalInr: l.principal,
        outstandingInr: st.outstanding,
        emiInr: resolveEmi(l),
        ratePercent: l.annualRate,
        nextDueDate: st.nextDueDate,
        progressPercent: st.progressPercent,
      };
    }),
  });
}

export async function runLoanAmortization(
  ctx: McpContext,
  input: { liabilityId: number },
): Promise<ToolResult> {
  const loan = ctx.repos.liabilityRepo.getById(input.liabilityId);
  if (!loan) return errorResult(`Liability ${input.liabilityId} not found.`);
  const schedule = amortizationSchedule(loan);
  return ok({
    liabilityId: loan.id,
    name: loan.name,
    schedule: schedule.map((row) => ({
      period: row.period,
      dueDate: row.dueDate,
      emiInr: row.emi,
      principalInr: row.principalComponent,
      interestInr: row.interestComponent,
      balanceInr: row.balance,
    })),
    truncated: false,
  });
}

export function registerLoanTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'get_loans_overview',
    {
      description:
        'All active loans with computed EMI, outstanding balance, next due date and ' +
        'payoff progress. Money fields are INR (`Inr`); `ratePercent` is the annual rate. ' +
        'Takes no input.',
      inputSchema: {},
    },
    async () => runLoansOverview(ctx),
  );

  server.registerTool(
    'get_loan_amortization',
    {
      description:
        'Full amortization schedule (per-payment principal/interest/balance) for one loan. ' +
        'Required `liabilityId` (number). Unknown id returns an error result. Money is INR.',
      inputSchema: { liabilityId: z.number().int() },
    },
    async (input) => runLoanAmortization(ctx, input),
  );
}
```

- [ ] **Step 4: Wire into `server.ts`.**

- [ ] **Step 5: Run test to verify it passes** (4 tests). Same vitest command with `test/loans.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add packages/mcp/src/tools/read/loans.ts packages/mcp/src/server.ts packages/mcp/test/loans.test.ts
git commit -m "feat(mcp): get_loans_overview + get_loan_amortization (EMI/outstanding, unknown id -> isError)"
```

---

### Task 9: `list_accounts` tool

**Files:**
- Create: `packages/mcp/src/tools/read/accounts.ts`
- Modify: `packages/mcp/src/server.ts`
- Test: `packages/mcp/test/accounts.test.ts`

**Interfaces:**
- Consumes: `McpContext`; `ctx.repos.accountRepo.list({domain?})`. `ok`. `z`.
- Produces:
  - `runListAccounts(ctx, input: { domain?: 'investment' | 'expense' }): Promise<ToolResult>` — payload `{ accounts:[{ id, institution, label, domain, assetClass }] }`.
  - `registerAccountTools(server, ctx): void`.
- Reference — `accountRepo.list({domain?})` → `Account[] { id, domain, assetClass, institution, label }`.

- [ ] **Step 1: Write the failing test**

`packages/mcp/test/accounts.test.ts`:
```ts
import { describe, it, expect, afterEach } from 'vitest';
import { seedContext } from './helpers';
import { runListAccounts } from '../src/tools/read/accounts';
import type { McpContext } from '../src/context';

let ctx: McpContext;
afterEach(() => ctx?.close());

describe('list_accounts', () => {
  it('returns [] on a fresh DB', async () => {
    ctx = seedContext();
    const p = (await runListAccounts(ctx, {})).structuredContent as any;
    expect(p.accounts).toEqual([]);
  });

  it('lists accounts and filters by domain', async () => {
    ctx = seedContext();
    ctx.repos.accountRepo.create({ domain: 'investment', institution: 'Groww', label: 'MF' });
    ctx.repos.accountRepo.create({ domain: 'expense', institution: 'HDFC', label: 'Salary' });

    const all = (await runListAccounts(ctx, {})).structuredContent as any;
    expect(all.accounts).toHaveLength(2);

    const inv = (await runListAccounts(ctx, { domain: 'investment' })).structuredContent as any;
    expect(inv.accounts).toHaveLength(1);
    expect(inv.accounts[0].institution).toBe('Groww');
    expect(inv.accounts[0].domain).toBe('investment');
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — module not found.

- [ ] **Step 3: Write `tools/read/accounts.ts`**

```ts
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from '../../context';
import { ok, type ToolResult } from '../../shared/output';

export async function runListAccounts(
  ctx: McpContext,
  input: { domain?: 'investment' | 'expense' },
): Promise<ToolResult> {
  const accounts = ctx.repos.accountRepo.list(input.domain ? { domain: input.domain } : undefined);
  return ok({
    accounts: accounts.map((a) => ({
      id: a.id,
      institution: a.institution,
      label: a.label,
      domain: a.domain,
      assetClass: a.assetClass,
    })),
  });
}

export function registerAccountTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'list_accounts',
    {
      description:
        'List financial accounts. Optional `domain` filter ("investment" | "expense"). ' +
        'Returns id, institution, label, domain and assetClass for each account.',
      inputSchema: { domain: z.enum(['investment', 'expense']).optional() },
    },
    async (input) => runListAccounts(ctx, input),
  );
}
```

- [ ] **Step 4: Wire into `server.ts`.**

- [ ] **Step 5: Run test to verify it passes** (2 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/mcp/src/tools/read/accounts.ts packages/mcp/src/server.ts packages/mcp/test/accounts.test.ts
git commit -m "feat(mcp): list_accounts tool (domain filter)"
```

---

### Task 10: `search_schemes` + `get_scheme_nav` tools (market data — injected)

**Files:**
- Create: `packages/mcp/src/tools/read/market.ts`
- Modify: `packages/mcp/src/server.ts`
- Test: `packages/mcp/test/market.test.ts`

**Interfaces:**
- Consumes: `McpContext` (uses `ctx.marketData`). `ok`, `errorResult`. `z`.
- Produces:
  - `runSearchSchemes(ctx, input: { query: string }): Promise<ToolResult>` — payload `{ schemes:[{ amfiCode, schemeName }] }`; external throw → `errorResult`.
  - `runSchemeNav(ctx, input: { amfiCode: string; history?: boolean }): Promise<ToolResult>` — payload `{ amfiCode, latest:{ navInr, dateStr }|null, history?:[{ navInr, dateStr }] }`; external throw → `errorResult`.
  - `registerMarketTools(server, ctx): void`.
- Reference — `SchemeInfo` shape: confirm fields with `grep -n -A6 'export type SchemeInfo\|export interface SchemeInfo' packages/core/src/domain/nav/navService.ts` (expected `{ schemeCode: string; schemeName: string }` — map `schemeCode` → `amfiCode`). `NAVData` shape: `grep -n -A6 'export type NAVData\|export interface NAVData' packages/core/src/domain/nav/navService.ts` (expected `{ nav: number; date: string }` or similar — map to `navInr`/`dateStr`). `getLatestNAV` returns `number | null`. `getNAVHistory` returns `NAVData[]`. Adjust the field mapping below to the confirmed real shapes.

- [ ] **Step 1: Confirm the real SchemeInfo / NAVData field names**

Run:
```bash
grep -n -A6 'SchemeInfo\|NAVData' packages/core/src/domain/nav/navService.ts | head -40
```
Record the exact property names and adjust the mappings in Step 3 accordingly (the code below assumes `SchemeInfo.schemeCode`/`schemeName` and `NAVData.date`/`NAVData.nav`).

- [ ] **Step 2: Write the failing test**

`packages/mcp/test/market.test.ts`:
```ts
import { describe, it, expect, afterEach } from 'vitest';
import { buildContext, type McpContext } from '../src/context';
import { fakeMarketData } from './helpers';
import { runSearchSchemes, runSchemeNav } from '../src/tools/read/market';

let ctx: McpContext;
afterEach(() => ctx?.close());

describe('search_schemes', () => {
  it('maps schemeCode -> amfiCode from the (injected) market data', async () => {
    ctx = buildContext({
      dbPath: ':memory:',
      marketData: fakeMarketData({
        searchSchemes: async () => [{ schemeCode: '147482', schemeName: 'Parag Parikh' } as any],
      }),
    });
    const r = await runSearchSchemes(ctx, { query: 'parag' });
    expect(r.isError).toBeUndefined();
    const p = r.structuredContent as any;
    expect(p.schemes).toEqual([{ amfiCode: '147482', schemeName: 'Parag Parikh' }]);
  });

  it('returns isError when the market source throws (mfapi down)', async () => {
    ctx = buildContext({
      dbPath: ':memory:',
      marketData: fakeMarketData({
        searchSchemes: async () => { throw new Error('network down'); },
      }),
    });
    const r = await runSearchSchemes(ctx, { query: 'x' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text.toLowerCase()).toContain('unavailable');
  });
});

describe('get_scheme_nav', () => {
  it('returns latest nav labelled navInr', async () => {
    ctx = buildContext({
      dbPath: ':memory:',
      marketData: fakeMarketData({ getLatestNAV: async () => 84.32 }),
    });
    const r = await runSchemeNav(ctx, { amfiCode: '147482' });
    const p = r.structuredContent as any;
    expect(p.amfiCode).toBe('147482');
    expect(p.latest.navInr).toBe(84.32);
  });

  it('returns isError when NAV lookup throws', async () => {
    ctx = buildContext({
      dbPath: ':memory:',
      marketData: fakeMarketData({
        getLatestNAV: async () => { throw new Error('boom'); },
      }),
    });
    const r = await runSchemeNav(ctx, { amfiCode: '1' });
    expect(r.isError).toBe(true);
  });
});
```

- [ ] **Step 3: Write `tools/read/market.ts`**

```ts
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from '../../context';
import { ok, errorResult, type ToolResult } from '../../shared/output';

export async function runSearchSchemes(
  ctx: McpContext,
  input: { query: string },
): Promise<ToolResult> {
  try {
    const results = await ctx.marketData.searchSchemes(input.query);
    return ok({
      schemes: results.map((s) => ({ amfiCode: s.schemeCode, schemeName: s.schemeName })),
    });
  } catch (err) {
    return errorResult(
      `Market data temporarily unavailable: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export async function runSchemeNav(
  ctx: McpContext,
  input: { amfiCode: string; history?: boolean },
): Promise<ToolResult> {
  try {
    const latest = await ctx.marketData.getLatestNAV(input.amfiCode);
    const payload: Record<string, unknown> = {
      amfiCode: input.amfiCode,
      latest: latest == null ? null : { navInr: latest, dateStr: null },
    };
    if (input.history) {
      const hist = await ctx.marketData.getNAVHistory(input.amfiCode);
      payload.history = hist.map((h) => ({ navInr: h.nav, dateStr: h.date }));
    }
    return ok(payload);
  } catch (err) {
    return errorResult(
      `Market data temporarily unavailable: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export function registerMarketTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'search_schemes',
    {
      description:
        'Search mutual-fund schemes by name; returns matching { amfiCode, schemeName }. ' +
        'Required `query`. Hits an external market-data source — on outage returns an ' +
        'error result (transient).',
      inputSchema: { query: z.string().min(1) },
    },
    async (input) => runSearchSchemes(ctx, input),
  );

  server.registerTool(
    'get_scheme_nav',
    {
      description:
        'Latest NAV (and optional history) for a scheme by AMFI code. Required `amfiCode`; ' +
        'optional `history` (bool). `navInr` is the NAV in INR. External source — on outage ' +
        'returns an error result (transient).',
      inputSchema: {
        amfiCode: z.string().min(1),
        history: z.boolean().optional(),
      },
    },
    async (input) => runSchemeNav(ctx, input),
  );
}
```
> If Step 1 revealed different field names (e.g. `NAVData` uses `{ date, nav }` vs `{ dateStr, value }`), fix the `.map` mappings here to match. The `dateStr: null` on `latest` is because `getLatestNAV` returns only a number; leave it null (documented) or, if you prefer, drop the field — keep it consistent with the test.

- [ ] **Step 4: Run test to verify it fails then passes**

Fail first (module missing), then after writing: `source ~/.nvm/nvm.sh && nvm use 20 && packages/mcp/node_modules/.bin/vitest run test/market.test.ts --root packages/mcp` → PASS (4 tests).

- [ ] **Step 5: Wire into `server.ts`.**

- [ ] **Step 6: Commit**

```bash
git add packages/mcp/src/tools/read/market.ts packages/mcp/src/server.ts packages/mcp/test/market.test.ts
git commit -m "feat(mcp): search_schemes + get_scheme_nav (injected marketData, outage -> isError)"
```

---

### Task 11: Protocol smoke test (registration + in-memory transport)

**Files:**
- Test: `packages/mcp/test/server.test.ts`

**Interfaces:**
- Consumes: `buildServer` (Task 4+), `buildContext`; SDK `Client` + `InMemoryTransport`.
- Produces: proof that all 10 tools register and one round-trips over a transport.

- [ ] **Step 1: Write the test**

`packages/mcp/test/server.test.ts`:
```ts
import { describe, it, expect, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildContext, type McpContext } from '../src/context';
import { fakeMarketData } from './helpers';
import { buildServer } from '../src/server';

let ctx: McpContext;
afterEach(() => ctx?.close());

const EXPECTED_TOOLS = [
  'get_networth_overview',
  'get_investment_portfolio',
  'get_investment_returns',
  'get_expense_summary',
  'list_transactions',
  'get_loans_overview',
  'get_loan_amortization',
  'list_accounts',
  'search_schemes',
  'get_scheme_nav',
];

async function connectedClient(): Promise<Client> {
  ctx = buildContext({ dbPath: ':memory:', marketData: fakeMarketData() });
  const server = buildServer(ctx);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

describe('MCP server (protocol smoke)', () => {
  it('registers all 10 read tools', async () => {
    const client = await connectedClient();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([...EXPECTED_TOOLS].sort());
    await client.close();
  });

  it('round-trips get_networth_overview over the transport', async () => {
    const client = await connectedClient();
    const res = await client.callTool({ name: 'get_networth_overview', arguments: {} });
    // content is the universal channel; parse the JSON text block
    const text = (res.content as any[])[0].text;
    const payload = JSON.parse(text);
    expect(payload.netWorthInr).toBe(0);
    expect(res.isError).toBeFalsy();
    await client.close();
  });

  it('surfaces a semantic error as isError over the transport', async () => {
    const client = await connectedClient();
    const res = await client.callTool({
      name: 'get_loan_amortization',
      arguments: { liabilityId: 999 },
    });
    expect(res.isError).toBe(true);
    await client.close();
  });
});
```
> Confirm the SDK subpaths resolve: `@modelcontextprotocol/sdk/client/index.js` and `@modelcontextprotocol/sdk/inMemory.js`. If not, check the package `exports` map and use the advertised paths (verified present in v1.29.0: `dist/esm/client/index.js`, `dist/esm/inMemory.js`).

- [ ] **Step 2: Run the test**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && packages/mcp/node_modules/.bin/vitest run test/server.test.ts --root packages/mcp`
Expected: PASS (3 tests). If tool count differs, a `register*` call is missing from `server.ts` — add it.

- [ ] **Step 3: Commit**

```bash
git add packages/mcp/test/server.test.ts
git commit -m "test(mcp): protocol smoke — all 10 tools register + round-trip over in-memory transport"
```

---

### Task 12: Full-package typecheck + whole-suite gate

**Files:** none (verification only).

- [ ] **Step 1: Typecheck the whole monorepo build graph**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 20 && node_modules/.bin/tsc --build packages/core packages/mcp
```
Expected: exits 0, no errors. (Add `packages/agents packages/api` if you want the full graph; core+mcp is the L3-relevant subset.)

- [ ] **Step 2: Run the full mcp test suite**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && packages/mcp/node_modules/.bin/vitest run --root packages/mcp`
Expected: all mcp tests green (output ~ 25+ tests across 8 files).

- [ ] **Step 3: Groww gate — prove core is untouched**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && packages/core/node_modules/.bin/vitest run test/golden --root packages/core`
Expected: Groww golden-master 6/6 PASS (unchanged — L3 added no core code).
> If `test/golden` is not the exact path, find it: `find packages/core -name '*golden*'`.

- [ ] **Step 4: Seam-invariant check**

Run:
```bash
grep -rn "better-sqlite3\|drizzle-orm" packages/mcp/src || echo "CLEAN: no direct db driver imports in mcp/src"
```
Expected: CLEAN (the only sqlite reference is the *type* `ReturnType<typeof runMigrations>['sqlite']` in `context.ts`, which is not an import of the driver). If any real import appears, remove it — data access must go through `@myfinance/core`.

- [ ] **Step 5: Commit (if any config tweaks were needed)**

If Steps 1–4 required no changes, skip. Otherwise:
```bash
git add -A && git commit -m "chore(mcp): typecheck + suite + seam-invariant green"
```

---

### Task 13: Stdio entrypoint (`index.ts`) + README

**Files:**
- Modify: `packages/mcp/src/index.ts` (replace the Task-1 placeholder)
- Create/Modify: `packages/mcp/README.md`
- Test: manual (documented) — stdio can't be exercised by the in-memory smoke test; Task 11 already proves the plumbing over a transport.

**Interfaces:**
- Consumes: `buildContext`, `buildServer`, SDK `StdioServerTransport`.
- Produces: a runnable server: `node packages/mcp/dist/index.js` speaks MCP over stdio.

- [ ] **Step 1: Write `src/index.ts`**

```ts
#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildContext } from './context';
import { buildServer } from './server';

async function main(): Promise<void> {
  // DB path from env (same var the API uses); falls back to a local file.
  const dbPath = process.env.MYFINANCE_DB_PATH ?? './myfinance.db';
  const ctx = buildContext({ dbPath });
  const server = buildServer(ctx);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Clean shutdown: close sqlite when the transport/stdin ends.
  const shutdown = (): void => {
    ctx.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  // stderr only — stdout is the MCP channel and must stay protocol-clean.
  process.stderr.write(`myfinance-mcp failed to start: ${String(err)}\n`);
  process.exit(1);
});
```
> Confirm the env var name the API uses for the DB path (`grep -rn "MYFINANCE_DB_PATH\|DB_PATH\|dbPath" packages/api/src/config.ts packages/api/src/server.ts`). Match it exactly so the MCP server and API point at the same DB. If the API uses a different var, use that one here.

- [ ] **Step 2: Build and smoke-check it starts (manual)**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 20 && node_modules/.bin/tsc --build packages/mcp
# Prove it starts and lists tools via the MCP inspector (Ctrl-C to exit), OR just that it boots:
MYFINANCE_DB_PATH=:memory: node packages/mcp/dist/index.js < /dev/null && echo "started+exited cleanly on empty stdin"
```
Expected: no crash on startup. (A full interactive check uses `npx @modelcontextprotocol/inspector node packages/mcp/dist/index.js` — document this in the README; not required to pass CI.)

- [ ] **Step 3: Write `packages/mcp/README.md`**

Include: what the package is (read-only MCP server over MyFinance core), the 10 tools (one line each), how to run (`node dist/index.js` over stdio; `MYFINANCE_DB_PATH` env), how to inspect (`npx @modelcontextprotocol/inspector node packages/mcp/dist/index.js`), and the reserved write seam note (writes come in L4). Keep it ~40 lines.

- [ ] **Step 4: Commit**

```bash
git add packages/mcp/src/index.ts packages/mcp/README.md
git commit -m "feat(mcp): stdio entrypoint + README (runnable myfinance-mcp server)"
```

---

### Task 14: Final review + close-out

**Files:** `docs/superpowers/MASTER_PLAN.md`

- [ ] **Step 1: Dispatch a fresh code-reviewer subagent** over the whole `layer/3-mcp` diff vs `main`, checking against the spec (`docs/superpowers/specs/2026-07-11-l3-mcp-server-design.md`): read-only honored, seam invariant, unit-label naming, error semantics (protocol vs isError), all 10 tools present, no core changes. Fix any blocking findings (each fix = its own TDD cycle if it touches behavior).

- [ ] **Step 2: Re-run the full gate** (Task 12 steps 1–4) after any fixes. All green.

- [ ] **Step 3: Update `MASTER_PLAN.md`** — flip the §4 L3 row to ✅ Done with branch/PR + test counts; add a §8 close-out bullet linking the spec + plan and summarizing what shipped (10 tools, read-only, stdio, direct-to-core, write seam reserved).

- [ ] **Step 4: Commit the master-plan update**

```bash
git add docs/superpowers/MASTER_PLAN.md
git commit -m "docs(master-plan): L3 MCP Server build complete (10 read tools, stdio, Groww 6/6 unchanged)"
```

- [ ] **Step 5: Push + PR**

```bash
gh auth switch --user ak688744
git push -u origin layer/3-mcp
gh pr create --base main --head layer/3-mcp --title "L3: MCP Server (read-only finance tools over core)" --body "<summary + test counts + spec link>"
```

- [ ] **Step 6: Save the L3 decision to project-memory** and call `session_summary`.

---

## Self-Review

**1. Spec coverage** — every spec section maps to tasks:
- §3 architecture / package shape → Task 1.
- §4 shared context (repos, nav, marketData, reserved tx runner, close) → Task 3.
- §5 all 10 tools → Tasks 5–10 (networth 5; investments 6; expenses 7; loans 8; accounts 9; market 10).
- §6 output builder + two-layer validation + empty-valid → Task 2 (helpers), enforced per-tool in 5–10, protocol layer proven in Task 11.
- §7 testing (handler unit tests, injected-marketData market tests, protocol smoke, no core re-test) → Tasks 5–11; T1 gate → Task 12.
- §8 out-of-scope (write seam reserved, stdio only) → Task 1 (`write/.gitkeep`) + Task 13 (stdio); no HTTP task (correctly absent).
- §9 gotchas → Global Constraints.
- Entrypoint (make it runnable) → Task 13. Close-out → Task 14.

**2. Placeholder scan** — no "TBD/TODO"; every code step has complete code. The `> verify …` notes are deliberate guardrails asking the implementer to confirm real repo signatures before running (the plan gives concrete code AND tells them the one thing that could drift), not placeholders.

**3. Type consistency** — `McpContext` field names (`repos.investmentTxRepo`, `repos.expenseTxRepo`, `nav`, `marketData`, `runInTransaction`, `close`) are used identically across Tasks 3, 5–11, 13. `ToolResult`/`ok`/`errorResult` from Task 2 used verbatim everywhere. Tool `run*`/`register*` naming consistent. `xirrFraction`/`*Inr`/`*Percent` labels consistent across networth/investments/expenses/loans. `getMfHoldings` wired identically to the API's networth route.

**4. Known drift point (flagged, not a gap)** — market-data field mapping (`SchemeInfo.schemeCode`, `NAVData.nav/date`) is the one place the exact core property names must be confirmed at implement time; Task 10 Step 1 forces that confirmation before code runs. Everything else was verified against the real core source while writing this plan.
