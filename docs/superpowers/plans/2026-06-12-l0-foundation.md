# L0 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the pnpm monorepo and build `packages/core` (Drizzle schema + migrations + repositories + ported domain logic + import) plus a thin Fastify read-only API skeleton, proving the `Drizzle → repository → domain → HTTP` path end-to-end with no regression vs. the current app.

**Architecture:** Repository layer owns all Drizzle/SQL; pure `domain/` logic depends on small repo *interfaces* (injected), never Drizzle. Money stays `REAL`/float (faithful port). Imperative `initializeDatabase` becomes Drizzle Kit migrations + a seed step. Only `db/client.ts` + `db/schema.ts` know the SQL dialect, so the future Postgres swap is isolated.

**Tech Stack:** Node + TypeScript, pnpm workspaces, tsconfig project references, Drizzle ORM + Drizzle Kit, better-sqlite3, Fastify, Vitest, tsx, xlsx.

**Spec:** `docs/superpowers/specs/2026-06-12-l0-foundation-design.md`

**Source being ported (read-only reference):** `src/features/**`, `src/db/initializeDatabase.ts`, `src/data/starterCategories.ts`.

---

## Conventions for this plan

- **Verbatim port** = copy the named source file's body into the target, changing ONLY: (a) remove `import type { SQLiteDatabase } from 'expo-sqlite'`, (b) replace `db: SQLiteDatabase` parameters with the injected repo interface specified in the task, (c) fix relative import paths. Logic lines are unchanged — that is what preserves Groww validation.
- Every implementation step that changes logic from the source must be called out explicitly in the task.
- Run tests from repo root with `pnpm -C packages/<pkg> test` unless stated otherwise.
- Commit after every green step.

---

## File Structure

```
pnpm-workspace.yaml
tsconfig.base.json
packages/
  core/
    package.json  tsconfig.json  vitest.config.ts  drizzle.config.ts
    src/
      db/{schema.ts, client.ts, migrate.ts, seed.ts}
      repositories/{types.ts, categoryRepo.ts, categoryRuleRepo.ts, transactionRepo.ts,
                    schemeRepo.ts, investmentTxRepo.ts, holdingsRepo.ts, importHistoryRepo.ts}
      domain/{xirr.ts, returns.ts, portfolio.ts, categorize.ts, amfiMatcher.ts, nav/navService.ts}
      import/{hdfcParser.ts, transactionParser.ts, holdingsParser.ts,
              importTransactions.ts, importHoldings.ts, importInvestmentTransactions.ts}
      data/starterCategories.ts
      types.ts  index.ts
    drizzle/            ← generated migration SQL
    test/{fixtures/, characterization/, golden/, integration/}
  api/
    package.json  tsconfig.json  vitest.config.ts
    src/{server.ts, config.ts, plugins/db.ts, routes/{health.ts,transactions.ts,investments.ts}, errors.ts}
    test/
  mcp/    (stub)  agents/ (stub)
apps/
  web/    (stub)  mobile/ (stub)
```

---

## Phase 0 — Monorepo scaffold

### Task 0.1: pnpm workspace + root tsconfig + stub packages

**Files:**
- Create: `pnpm-workspace.yaml`, `tsconfig.base.json`
- Create stubs: `packages/{mcp,agents}/package.json`, `apps/{web,mobile}/package.json` (+ one-line READMEs)

- [ ] **Step 1: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - 'packages/*'
  - 'apps/*'
```

- [ ] **Step 2: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "composite": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

- [ ] **Step 3: Create stub packages.** For each of `packages/mcp`, `packages/agents`, `apps/web`, `apps/mobile` create a `package.json` like (adjust name) and a `README.md` with one line "Stub — built in L<n>.":

```json
{
  "name": "@myfinance/mcp",
  "version": "0.0.0",
  "private": true
}
```

- [ ] **Step 4: Verify pnpm sees the workspace**

Run: `pnpm install`
Expected: completes, creates root `pnpm-lock.yaml`, no package errors.

- [ ] **Step 5: Commit**

```bash
git add pnpm-workspace.yaml tsconfig.base.json packages apps pnpm-lock.yaml
git commit -m "chore: scaffold pnpm monorepo workspace + stub packages"
```

### Task 0.2: `packages/core` package skeleton + Vitest

**Files:**
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/vitest.config.ts`, `packages/core/src/index.ts`

- [ ] **Step 1: `packages/core/package.json`**

```json
{
  "name": "@myfinance/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx src/db/migrate.ts"
  },
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "drizzle-orm": "^0.36.0",
    "xlsx": "^0.18.5"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "drizzle-kit": "^0.28.0",
    "tsx": "^4.0.0",
    "typescript": "~5.9.2",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: `packages/core/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: `packages/core/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { globals: true, include: ['test/**/*.test.ts'] } });
```

- [ ] **Step 4: Placeholder `src/index.ts`**

```ts
export const CORE_VERSION = '0.0.0';
```

- [ ] **Step 5: Install + sanity test**

Run: `pnpm install && pnpm -C packages/core typecheck`
Expected: typecheck passes (no errors).

- [ ] **Step 6: Commit**

```bash
git add packages/core pnpm-lock.yaml
git commit -m "chore(core): package skeleton with vitest + drizzle deps"
```

---

## Phase 1 — Schema, client, migrations

### Task 1.1: Drizzle schema (faithful 8-table port)

**Files:**
- Create: `packages/core/src/db/schema.ts`
- Reference: `src/db/initializeDatabase.ts` (the SQL being translated)
- Test: `packages/core/test/integration/schema.test.ts`

- [ ] **Step 1: Write the failing test** (`test/integration/schema.test.ts`) — asserts all 8 tables exist after migration. (Migration runner created in Task 1.3; for now this test imports the schema and checks table objects are defined.)

```ts
import { describe, it, expect } from 'vitest';
import * as schema from '../../src/db/schema';

describe('schema', () => {
  it('defines all 8 tables', () => {
    for (const t of [
      'categories', 'importHistory', 'transactions', 'categoryRules',
      'investmentSchemes', 'investmentImportHistory', 'investmentHoldings',
      'investmentTransactions',
    ]) {
      expect(schema[t as keyof typeof schema]).toBeDefined();
    }
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `pnpm -C packages/core test schema`
Expected: FAIL (cannot find module `../../src/db/schema`).

- [ ] **Step 3: Write `src/db/schema.ts`.** Translate each `CREATE TABLE` from `src/db/initializeDatabase.ts` into a Drizzle `sqliteTable`. Money/units/nav columns use `real()`. Text PKs use `text().primaryKey()`; integer autoincrement PKs use `integer().primaryKey({ autoIncrement: true })`. Preserve every column, NOT NULL, default, CHECK (via `text({ enum: [...] })` where applicable), UNIQUE, FK, and index. Representative excerpt:

```ts
import { sqliteTable, text, integer, real, index, unique } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const categories = sqliteTable('categories', {
  id: text('id').primaryKey().notNull(),
  name: text('name').notNull(),
  icon: text('icon'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const transactions = sqliteTable('transactions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  transactionDate: text('transaction_date').notNull(),
  valueDate: text('value_date'),
  referenceNumber: text('reference_number'),
  description: text('description').notNull(),
  normalizedDescription: text('normalized_description').notNull(),
  merchantKey: text('merchant_key'),
  upiNoteKeyword: text('upi_note_keyword'),
  amount: real('amount').notNull(),
  direction: text('direction', { enum: ['debit', 'credit'] }).notNull(),
  categoryId: text('category_id').references(() => categories.id),
  categorySource: text('category_source'),
  balance: real('balance'),
  sourceType: text('source_type').notNull(),
  importHistoryId: integer('import_history_id').references(() => importHistory.id),
  dedupeKey: text('dedupe_key').notNull().unique(),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => ({
  byDate: index('idx_transactions_date').on(t.transactionDate),
  byCategory: index('idx_transactions_category').on(t.categoryId),
}));
// ...remaining 6 tables: importHistory, categoryRules, investmentSchemes,
// investmentImportHistory, investmentHoldings, investmentTransactions —
// translate each table + its indexes from initializeDatabase.ts identically.
```

- [ ] **Step 4: Run test, expect PASS**

Run: `pnpm -C packages/core test schema`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/db/schema.ts packages/core/test/integration/schema.test.ts
git commit -m "feat(core): drizzle schema — faithful 8-table port (REAL money)"
```

### Task 1.2: DB client factory (isolated driver)

**Files:**
- Create: `packages/core/src/db/client.ts`
- Test: `packages/core/test/integration/client.test.ts`

- [ ] **Step 1: Failing test** — opens an in-memory DB and runs a trivial query.

```ts
import { describe, it, expect } from 'vitest';
import { createDb } from '../../src/db/client';

describe('createDb', () => {
  it('opens an in-memory database', () => {
    const { db, sqlite } = createDb(':memory:');
    expect(db).toBeDefined();
    const row = sqlite.prepare('SELECT 1 AS one').get() as { one: number };
    expect(row.one).toBe(1);
    sqlite.close();
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `pnpm -C packages/core test client` → cannot find `client`.

- [ ] **Step 3: Implement `src/db/client.ts`** (the ONLY file that names the driver):

```ts
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

export type Db = ReturnType<typeof drizzle<typeof schema>>;

export function createDb(path = 'myfinance.db') {
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
}
```

- [ ] **Step 4: Run, expect PASS** — `pnpm -C packages/core test client`.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/db/client.ts packages/core/test/integration/client.test.ts
git commit -m "feat(core): better-sqlite3 drizzle client factory (driver isolated)"
```

### Task 1.3: Drizzle Kit migrations + runner

**Files:**
- Create: `packages/core/drizzle.config.ts`, `packages/core/src/db/migrate.ts`
- Generated: `packages/core/drizzle/*.sql`
- Test: `packages/core/test/integration/migrate.test.ts`

- [ ] **Step 1: `drizzle.config.ts`**

```ts
import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
});
```

- [ ] **Step 2: `src/db/migrate.ts`** — reusable migration applier:

```ts
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { createDb } from './client';

export function runMigrations(path?: string) {
  const { db, sqlite } = createDb(path);
  migrate(db, { migrationsFolder: new URL('../../drizzle', import.meta.url).pathname });
  return { db, sqlite };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations(process.env.DB_PATH);
  console.log('migrations applied');
}
```

- [ ] **Step 3: Generate migration SQL**

Run: `pnpm -C packages/core db:generate`
Expected: creates `packages/core/drizzle/0000_*.sql` containing all 8 `CREATE TABLE`s + indexes.

- [ ] **Step 4: Failing test** (`test/integration/migrate.test.ts`) — applies migrations to in-memory DB, queries `sqlite_master` for the 8 table names.

```ts
import { describe, it, expect } from 'vitest';
import { runMigrations } from '../../src/db/migrate';

describe('runMigrations', () => {
  it('creates all 8 tables', () => {
    const { sqlite } = runMigrations(':memory:');
    const names = (sqlite.prepare(
      "SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
    ).map((r) => r.name);
    for (const t of ['categories','import_history','transactions','category_rules',
      'investment_schemes','investment_import_history','investment_holdings','investment_transactions']) {
      expect(names).toContain(t);
    }
    sqlite.close();
  });
});
```

- [ ] **Step 5: Run, expect PASS** — `pnpm -C packages/core test migrate`.

- [ ] **Step 6: Commit**

```bash
git add packages/core/drizzle.config.ts packages/core/src/db/migrate.ts packages/core/drizzle packages/core/test/integration/migrate.test.ts
git commit -m "feat(core): drizzle-kit migrations + runner (replaces imperative init)"
```

---

## Phase 2 — Repository layer

> Each repo wraps Drizzle and returns the existing domain types. Method names/signatures are lifted from the current services so domain logic ports unchanged. Repo interfaces live in `repositories/types.ts` so domain code depends on interfaces, not implementations.

### Task 2.1: Repository interfaces + shared types

**Files:**
- Create: `packages/core/src/types.ts` (re-export domain types), `packages/core/src/repositories/types.ts`

- [ ] **Step 1: `src/types.ts`** — move the domain type definitions currently in the services here verbatim: `InvestmentTransaction`, `TransactionType`, `TransactionSummary`, `Scheme`, plus `CashFlow = { date: string; amount: number }`. (Copy from `src/features/investment/services/transactionService.ts` and `schemeService.ts`.)

- [ ] **Step 2: `src/repositories/types.ts`** — declare interfaces matching the methods domain logic needs:

```ts
import type { InvestmentTransaction, Scheme, CashFlow, TransactionType } from '../types';

export interface InvestmentTxRepo {
  getTransactions(filters?: {
    account?: string; schemeId?: number; schemeName?: string;
    type?: TransactionType; startDate?: string; endDate?: string; limit?: number;
  }): InvestmentTransaction[];
  getCashFlows(filters?: {
    account?: string; schemeId?: number; startDate?: string; endDate?: string;
  }): CashFlow[];
  getEarliestTransactionDate(filters: { account?: string; schemeId?: number }): string | null;
  getUnitsPerSchemeUpTo(endDate: string, filters: { account?: string }): Map<number, number>;
}

export interface SchemeRepo {
  getSchemeById(id: number): Scheme | null;
  getSchemesWithAmfi(filters: { account?: string }): { schemeId: number; amfiCode: string }[];
  updateAmfiCode(schemeId: number, amfiCode: string): void;
  matchOrCreateScheme(p: { schemeName: string; amcName?: string;
    category?: Scheme['category']; subCategory?: string }): number;
}

export interface HoldingsRepo {
  getHoldingsValue(filters: { account?: string; schemeId?: number }):
    { currentValue: number; investedValue: number };
}
// CategoryRepo, CategoryRuleRepo, TransactionRepo (expenses), ImportHistoryRepo
// declared the same way, methods mirroring current service functions.
```

- [ ] **Step 3: Typecheck** — `pnpm -C packages/core typecheck` → passes.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/repositories/types.ts
git commit -m "feat(core): repository interfaces + shared domain types"
```

### Task 2.2: investmentTxRepo (Drizzle implementation)

**Files:**
- Create: `packages/core/src/repositories/investmentTxRepo.ts`
- Test: `packages/core/test/integration/investmentTxRepo.test.ts`
- Reference: `src/features/investment/services/transactionService.ts` (SQL → Drizzle), `returnsCalculator.ts` (the `getEarliestTransactionDate` + `calculateUnitsPerScheme` SQL)

- [ ] **Step 1: Failing integration test** — migrate in-memory DB, insert 3 investment_transactions, assert `getCashFlows` returns PURCHASE as negative and REDEMPTION as positive, ordered by date ASC.

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { runMigrations } from '../../src/db/migrate';
import { makeInvestmentTxRepo } from '../../src/repositories/investmentTxRepo';

let repo: ReturnType<typeof makeInvestmentTxRepo>;
let sqlite: any;

beforeEach(() => {
  const m = runMigrations(':memory:'); sqlite = m.sqlite;
  repo = makeInvestmentTxRepo(m.db);
  sqlite.prepare(`INSERT INTO investment_transactions
    (scheme_id,account_name,investment_app,scheme_name,transaction_type,units,nav,amount,transaction_date)
    VALUES (1,'A','groww','X','PURCHASE',10,100,1000,'2024-01-01'),
           (1,'A','groww','X','REDEMPTION',5,120,600,'2024-06-01')`).run();
});

it('cash flows: purchase negative, redemption positive, asc', () => {
  const cf = repo.getCashFlows({ schemeId: 1 });
  expect(cf).toEqual([
    { date: '2024-01-01', amount: -1000 },
    { date: '2024-06-01', amount: 600 },
  ]);
});
```

- [ ] **Step 2: Run, expect FAIL** — module missing.

- [ ] **Step 3: Implement `investmentTxRepo.ts`** as a factory `makeInvestmentTxRepo(db: Db): InvestmentTxRepo`. Each method reproduces the corresponding SQL from `transactionService.ts`/`returnsCalculator.ts` using Drizzle query builder (`and`, `eq`, `gte`, `lte`, `desc`, `sql`). `getCashFlows` maps `PURCHASE`/`SWITCH_IN` → `-amount`, else `+amount`. `getUnitsPerSchemeUpTo` reproduces the units accumulation loop. Map DB rows → `InvestmentTransaction` (camelCase) exactly as `mapDbToTransaction` does.

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Add tests for `getTransactions` filters (account/scheme/date/limit), `getEarliestTransactionDate`, `getUnitsPerSchemeUpTo`. Run green.**

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/repositories/investmentTxRepo.ts packages/core/test/integration/investmentTxRepo.test.ts
git commit -m "feat(core): investmentTxRepo over drizzle + integration tests"
```

### Task 2.3: schemeRepo, holdingsRepo

**Files:**
- Create: `packages/core/src/repositories/schemeRepo.ts`, `holdingsRepo.ts`
- Test: matching `test/integration/*.test.ts`
- Reference: `schemeService.ts`, the `getHoldingsValue`/`getSchemesWithAmfi` SQL in `returnsCalculator.ts`

- [ ] **Step 1: Failing test for schemeRepo** — insert scheme, assert `matchOrCreateScheme` returns existing id on second call (no duplicate), `getSchemeById` maps row→`Scheme`, `updateAmfiCode` persists.

- [ ] **Step 2: Run FAIL → implement `schemeRepo.ts`** (port `matchOrCreateScheme`, `getSchemeById`, `getSchemes`, `findSchemeByName`, `updateSchemeAmfiCode`, `getSchemesWithAmfi` — translate each SQL to Drizzle; preserve the null-AMC matching branch). → Run PASS.

- [ ] **Step 3: Failing test for holdingsRepo** — insert 2 holdings rows, assert `getHoldingsValue` sums `current_value`/`invested_value` with COALESCE→0 semantics and respects account/scheme filters.

- [ ] **Step 4: Run FAIL → implement `holdingsRepo.ts` → Run PASS.**

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/repositories/schemeRepo.ts packages/core/src/repositories/holdingsRepo.ts packages/core/test/integration
git commit -m "feat(core): schemeRepo + holdingsRepo over drizzle + tests"
```

### Task 2.4: categoryRepo, categoryRuleRepo, transactionRepo (expenses), importHistoryRepo

**Files:**
- Create: `packages/core/src/repositories/{categoryRepo,categoryRuleRepo,transactionRepo,importHistoryRepo}.ts`
- Test: matching integration tests
- Reference: `categorizeTransaction.ts` (`getActiveCategoryRules`, rule CRUD), `manageRules.ts`, `manageCategories.ts`, `importTransactions.ts`

- [ ] **Step 1: Failing test** — `categoryRuleRepo.getActiveRules()` returns active rules ordered by priority DESC; `categoryRepo.list()` returns seeded categories; `transactionRepo.list({limit})` paginates expenses; `importHistoryRepo.create()` returns new id.

- [ ] **Step 2: Run FAIL → implement the four repos** (translate each service's SQL to Drizzle; preserve ordering and active/priority semantics). → Run PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/repositories packages/core/test/integration
git commit -m "feat(core): category/rule/transaction/importHistory repos + tests"
```

---

## Phase 3 — Domain logic port

### Task 3.1: xirr.ts (verbatim pure port) + known-answer tests

**Files:**
- Create: `packages/core/src/domain/xirr.ts`
- Test: `packages/core/test/unit/xirr.test.ts`
- Reference: `src/features/investment/returnsCalculator.ts` lines 96–215 (`calculateXIRR` + `bisectionXIRR` + `yearsBetween` + `parseDate`)

- [ ] **Step 1: Failing test** — known-answer XIRR cases:

```ts
import { describe, it, expect } from 'vitest';
import { calculateXIRR } from '../../src/domain/xirr';

describe('calculateXIRR', () => {
  it('returns null for <2 flows', () => {
    expect(calculateXIRR([{ date: '2024-01-01', amount: -100 }])).toBeNull();
  });
  it('returns null without both signs', () => {
    expect(calculateXIRR([
      { date: '2024-01-01', amount: -100 },
      { date: '2024-02-01', amount: -50 },
    ])).toBeNull();
  });
  it('~100% for doubling in one year', () => {
    const r = calculateXIRR([
      { date: '2023-01-01', amount: -1000 },
      { date: '2024-01-01', amount: 2000 },
    ]);
    expect(r).toBeCloseTo(1.0, 2);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Verbatim port** `calculateXIRR`, `bisectionXIRR`, and the helpers `parseDate`/`yearsBetween` from `returnsCalculator.ts` into `domain/xirr.ts`. No logic changes. Export `calculateXIRR` and the `CashFlow` type usage.

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/domain/xirr.ts packages/core/test/unit/xirr.test.ts
git commit -m "feat(core): port XIRR (verbatim) + known-answer tests"
```

### Task 3.2: returns.ts + portfolio.ts (repo-injected port)

**Files:**
- Create: `packages/core/src/domain/returns.ts`, `packages/core/src/domain/portfolio.ts`
- Test: `packages/core/test/unit/returns.test.ts` (fake repos)
- Reference: `returnsCalculator.ts` (`getPeriodReturns`, `getPeriodStartDate`, `calculateUnitsAtDate`, `calculatePortfolioValueAtDate`), `portfolioService.ts`

- [ ] **Step 1: Failing unit test with FAKE repos** — verifies the cohort math without a DB. Build a fake `InvestmentTxRepo`/`SchemeRepo`/`HoldingsRepo` returning fixture arrays; assert `getPeriodReturns(repos, navFn, { period: 'ALL' })` produces expected `investedInPeriod`, `returns`, and a non-null `xirr` for a known scenario.

```ts
import { describe, it, expect } from 'vitest';
import { getPeriodReturns } from '../../src/domain/returns';
// build fakeTxRepo, fakeSchemeRepo, fakeHoldingsRepo, fakeNav per fixtures...
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Port `returns.ts` + `portfolio.ts`.** Lift the bodies of `getPeriodReturns`, `getPeriodStartDate`, `calculateUnitsAtDate`, `calculatePortfolioValueAtDate`, `getEarliestTransactionDate`, `getHoldingsValue`, `getSchemesWithAmfi`, `calculateUnitsPerScheme` from `returnsCalculator.ts`. **Required signature change:** replace `db: SQLiteDatabase` with injected dependencies — pass `{ txRepo, schemeRepo, holdingsRepo }` and a `getNAVForDate`/`getLatestNAV` function (NAV stays a function dep, ported in 3.4). The SQL-running inner helpers (`getEarliestTransactionDate`, `getHoldingsValue`, `getSchemesWithAmfi`, `calculateUnitsPerScheme`) are deleted here and replaced by the repo methods from Phase 2. All arithmetic/branching is unchanged. `calculateXIRR` imported from `./xirr`.

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/domain/returns.ts packages/core/src/domain/portfolio.ts packages/core/test/unit/returns.test.ts
git commit -m "feat(core): port period-returns + portfolio math (repo-injected)"
```

### Task 3.3: categorize.ts (verbatim pure parts + repo-injected rule lookup)

**Files:**
- Create: `packages/core/src/domain/categorize.ts`
- Test: `packages/core/test/unit/categorize.test.ts`
- Reference: `categorizeTransaction.ts`

- [ ] **Step 1: Failing test** — pure functions: `extractMerchantKey`, `extractUpiNoteKeyword`, `createCategorizationInput`, and `resolveCategoryFromRules` precedence (merchant rule > upi keyword > builtin). Use the builtin rules table from the source.

- [ ] **Step 2: Run FAIL.**

- [ ] **Step 3: Port** the pure functions verbatim (`extractMerchantKey`, `extractUpiNoteKeyword`, `createCategorizationInput`, `resolveCategoryFromRules`, the `builtinRules` array, types). For `recategorizeNonManualTransactions`/`saveCategoryMemoryRule`/`getActiveCategoryRules` (DB-touching), change `db: SQLiteDatabase` to the injected `categoryRuleRepo`/`transactionRepo`. Pure matching logic unchanged.

- [ ] **Step 4: Run PASS.**

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/domain/categorize.ts packages/core/test/unit/categorize.test.ts
git commit -m "feat(core): port categorization engine (pure + repo-injected)"
```

### Task 3.4: nav/navService.ts (near-verbatim) + amfiMatcher.ts

**Files:**
- Create: `packages/core/src/domain/nav/navService.ts`, `packages/core/src/domain/amfiMatcher.ts`
- Test: `packages/core/test/unit/navService.test.ts` (mock `fetch`), `test/unit/amfiMatcher.test.ts`
- Reference: `navService.ts`, `amfiMatcher.ts`

- [ ] **Step 1: Failing test for navService** — mock global `fetch` to return a canned mfapi.in response; assert `getLatestNAV` parses the latest entry and `getNAVForDate` resolves DD-MM-YYYY→YYYY-MM-DD correctly; assert in-memory cache prevents a second fetch within TTL.

- [ ] **Step 2: Run FAIL → port `navService.ts` verbatim** (it's already a pure `fetch` client; only remove any RN-specifics if present — there are none). → Run PASS.

- [ ] **Step 3: Failing test for amfiMatcher** — `extractVariant` returns correct `{plan,dist}` for "Direct Growth"/"Regular IDCW"; the matching/scoring picks the right candidate from a mocked `searchSchemes`.

- [ ] **Step 4: Run FAIL → port `amfiMatcher.ts`** — pure variant/scoring logic verbatim; `autoMatchAmfiCodes` takes injected `schemeRepo` instead of `db`, and `searchSchemes`/`getSchemeInfo` imported from `./nav/navService`. → Run PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/domain/nav packages/core/src/domain/amfiMatcher.ts packages/core/test/unit/navService.test.ts packages/core/test/unit/amfiMatcher.test.ts
git commit -m "feat(core): port NAV service + AMFI matcher + tests"
```

---

## Phase 4 — Characterization & golden-master validation

### Task 4.1: Characterization tests (port-equivalence vs current app)

**Files:**
- Create: `packages/core/test/characterization/returns.characterization.test.ts`
- Create: `packages/core/test/fixtures/characterization-portfolio.ts`

- [ ] **Step 1: Generate the oracle.** Write a one-off script (committed under `test/fixtures/`) that runs a representative transaction set through the CURRENT `src/features/investment/returnsCalculator.ts` against a temporary expo-sqlite-compatible DB OR — simpler and dependency-free — hand-build the fixture by computing expected outputs directly: a fixed set of investment transactions + the period-returns outputs the current code produces. Store as a typed fixture: `{ transactions, expected: { period, investedInPeriod, returns, xirr } }[]`.

- [ ] **Step 2: Failing test** — load fixture, run the ported `getPeriodReturns` with repos backed by an in-memory DB seeded from `fixture.transactions`, assert outputs equal `fixture.expected` within tolerance (xirr ±1e-4, money ±0.01).

- [ ] **Step 3: Run.** If mismatch → the port drifted; fix the port (NOT the fixture). Expected end state: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/core/test/characterization packages/core/test/fixtures
git commit -m "test(core): characterization tests pin port to current-app outputs"
```

### Task 4.2: Golden-master (Groww re-validation) — GATED on user data

**Files:**
- Create: `packages/core/test/golden/groww.golden.test.ts`
- Create: `packages/core/test/fixtures/groww-portfolio.json`

> ⚠️ **BLOCKER:** requires real Groww data from the user — a portfolio's transaction list + Groww's displayed XIRR & current value. Confirmed not present in the repo. If unavailable when this task is reached, mark the task blocked, `log` it, and proceed to Phase 5; close the T1 Groww gate before merge.

- [ ] **Step 1: Place the user-provided data** in `test/fixtures/groww-portfolio.json` as `{ transactions: [...], grcurrentValue, growwXirr, navByDate: {...} }`.

- [ ] **Step 2: Failing test** — seed in-memory DB with the transactions, run `getPeriodReturns(..., { period: 'ALL' })` with NAV resolved from `navByDate`, assert `xirr` within ±0.5% (0.005) of `growwXirr` and `endValue` within ±₹1 of `growwCurrentValue`.

- [ ] **Step 3: Run, expect PASS** (within tolerance). If outside tolerance, investigate before proceeding — this is the core-logic gate.

- [ ] **Step 4: Commit**

```bash
git add packages/core/test/golden packages/core/test/fixtures/groww-portfolio.json
git commit -m "test(core): golden-master Groww re-validation for XIRR/portfolio"
```

---

## Phase 5 — Import port + seed + public surface

### Task 5.1: Port import parsers (pure)

**Files:**
- Create: `packages/core/src/import/{hdfcParser,transactionParser,holdingsParser}.ts`, `src/data/starterCategories.ts`
- Test: `packages/core/test/unit/parsers.test.ts`
- Reference: `src/features/import/{hdfcParser,transactionParser,holdingsParser}.ts`, `src/data/starterCategories.ts`

- [ ] **Step 1: Failing test** — feed a small in-memory `xlsx` workbook (built with `XLSX.utils.aoa_to_sheet`) to `parseHdfcStatementXls` and `parseGrowwTransactionXls`/`parseGrowwHoldingsXls`; assert parsed row counts/fields.

- [ ] **Step 2: Run FAIL → verbatim port** the three parsers (`xlsx`-based, already pure — runs on Node) + copy `starterCategories.ts`. Fix import paths only. → Run PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/import packages/core/src/data packages/core/test/unit/parsers.test.ts
git commit -m "feat(core): port import parsers (verbatim) + tests"
```

### Task 5.2: Port import orchestration (repo-injected)

**Files:**
- Create: `packages/core/src/import/{importTransactions,importHoldings,importInvestmentTransactions}.ts`
- Test: `packages/core/test/integration/import.test.ts`
- Reference: `src/features/import/{importTransactions,importHoldings,importInvestmentTransactions}.ts`

- [ ] **Step 1: Failing integration test** — migrate in-memory DB; call `importHoldings` then `importInvestmentTransactions` with parsed fixtures via injected repos; assert rows land in `investment_schemes`/`investment_holdings`/`investment_transactions` and dedupe holds.

- [ ] **Step 2: Run FAIL → port the three orchestrators**, replacing `db: SQLiteDatabase` with injected repos (`schemeRepo`, `investmentTxRepo`, `holdingsRepo`, `importHistoryRepo`, `transactionRepo`). Dedupe/sequence logic unchanged. → Run PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/import packages/core/test/integration/import.test.ts
git commit -m "feat(core): port import orchestration (repo-injected) + tests"
```

### Task 5.3: seed.ts + public index.ts

**Files:**
- Create: `packages/core/src/db/seed.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/integration/seed.test.ts`

- [ ] **Step 1: Failing test** — `seedDatabase(db)` inserts all `starterCategories` (INSERT OR IGNORE semantics: idempotent on second call) and runs recategorization without error.

- [ ] **Step 2: Run FAIL → implement `seed.ts`** — port the seed portion of `initializeDatabase` (insert starter categories via `categoryRepo`, then `recategorizeNonManualTransactions` via injected repos). Idempotent. → Run PASS.

- [ ] **Step 3: Write `index.ts`** exporting the public surface: `createDb`, `runMigrations`, `seedDatabase`, all repo factories, domain functions (`calculateXIRR`, `getPeriodReturns`, portfolio/categorize/amfi/nav), import functions, and re-export `types`.

- [ ] **Step 4: Typecheck + full test run** — `pnpm -C packages/core typecheck && pnpm -C packages/core test` → all green.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/db/seed.ts packages/core/src/index.ts packages/core/test/integration/seed.test.ts
git commit -m "feat(core): seed step + public package surface"
```

---

## Phase 6 — API skeleton (`packages/api`)

### Task 6.1: API package skeleton + config + Fastify server

**Files:**
- Create: `packages/api/package.json`, `tsconfig.json`, `vitest.config.ts`, `src/config.ts`, `src/server.ts`, `src/errors.ts`

- [ ] **Step 1: `package.json`** (depends on `@myfinance/core` via `workspace:*`, plus `fastify`; dev `tsx`, `vitest`, `typescript`). `tsconfig.json` extends base and adds `"references": [{ "path": "../core" }]`.

- [ ] **Step 2: `src/config.ts`** — typed loader reading `DB_PATH` (default `myfinance.db`) and `PORT` (default `3001`).

- [ ] **Step 3: `src/errors.ts`** — Fastify error handler returning `{ error: { message, statusCode } }`.

- [ ] **Step 4: `src/server.ts`** — `buildServer()` that creates a Fastify instance, registers the error handler + db plugin + routes, returns the instance (do NOT auto-listen, so tests can `inject`). A separate `if (import.meta.url === main)` block calls `.listen`.

- [ ] **Step 5: Install + typecheck** — `pnpm install && pnpm -C packages/api typecheck` → passes.

- [ ] **Step 6: Commit**

```bash
git add packages/api pnpm-lock.yaml
git commit -m "chore(api): fastify server skeleton + config + error handler"
```

### Task 6.2: db plugin + /health (inject test)

**Files:**
- Create: `packages/api/src/plugins/db.ts`, `src/routes/health.ts`
- Test: `packages/api/test/health.test.ts`

- [ ] **Step 1: Failing test** — `buildServer()` then `app.inject({ method:'GET', url:'/health' })` → 200, body `{ data: { status: 'ok', db: true } }`.

```ts
import { describe, it, expect } from 'vitest';
import { buildServer } from '../src/server';

it('GET /health ok', async () => {
  const app = await buildServer({ dbPath: ':memory:' });
  const res = await app.inject({ method: 'GET', url: '/health' });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toEqual({ data: { status: 'ok', db: true } });
});
```

- [ ] **Step 2: Run FAIL.**

- [ ] **Step 3: Implement** `plugins/db.ts` (runs migrations on the configured path, decorates `app.db` + repos) and `routes/health.ts` (pings DB via a `SELECT 1`).

- [ ] **Step 4: Run PASS.**

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/plugins packages/api/src/routes/health.ts packages/api/test/health.test.ts
git commit -m "feat(api): db plugin + /health endpoint + inject test"
```

### Task 6.3: read endpoints — /transactions, /investments/*

**Files:**
- Create: `packages/api/src/routes/transactions.ts`, `src/routes/investments.ts`
- Test: `packages/api/test/read-endpoints.test.ts`

- [ ] **Step 1: Failing test** — seed in-memory DB (migrate + insert a few rows via core), then:
  - `GET /transactions?limit=10` → 200, `{ data: [...] }` length ≤ 10.
  - `GET /investments/summary` → 200, `{ data: { ... } }`.
  - `GET /investments/returns?period=1Y` → 200, `{ data: { period:'1Y', xirr, returns, ... } }`.

- [ ] **Step 2: Run FAIL.**

- [ ] **Step 3: Implement routes** calling core repo/domain functions through `app` decorations. Validate `period` against the allowed enum (`1M,3M,6M,1Y,3Y,5Y,ALL`); invalid → 400 via error handler.

- [ ] **Step 4: Run PASS.**

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routes packages/api/test/read-endpoints.test.ts
git commit -m "feat(api): read-only transactions + investments endpoints + tests"
```

---

## Phase 7 — Close out

### Task 7.1: Full workspace verification

- [ ] **Step 1: Run everything**

Run: `pnpm -r typecheck && pnpm -r test`
Expected: all packages typecheck; all unit/integration/characterization/API tests green. (Golden-master green OR explicitly marked blocked-on-user-data.)

- [ ] **Step 2: Confirm seam invariant** — `grep -rEl "drizzle|better-sqlite3|expo-sqlite" packages/core/src/domain packages/core/src/import` returns NOTHING (domain/import must not import the DB driver/ORM). If it does, fix before merge.

### Task 7.2: Subagent code review

- [ ] **Step 1:** Dispatch a fresh `feature-dev:code-reviewer` agent to audit the full L0 diff against the spec (`docs/superpowers/specs/2026-06-12-l0-foundation-design.md`), focusing on: port fidelity of XIRR/returns/portfolio, the repo seam, schema faithfulness, test adequacy.
- [ ] **Step 2:** Triage findings (receiving-code-review skill); fix real issues; re-run tests.

### Task 7.3: PR + master plan + memory

- [ ] **Step 1:** Push branch `layer/0-foundation`, open PR summarizing L0.
- [ ] **Step 2:** Update `MASTER_PLAN.md` §4 (L0 row → ✅, link this spec) and §8 (mark L0 done, set next = L1).
- [ ] **Step 3:** Save decisions to project-memory (`memory_save`): float-money decision, repo-over-Drizzle seam, import-in-L0 scope shift. Then `session_summary`.

---

## Self-Review (completed by author)

- **Spec coverage:** §3 topology → Task 0.1; §4 schema/migrations/seed → 1.1/1.3/5.3; §5 repos → Phase 2, domain → Phase 3, import → Phase 5; §6 API → Phase 6; §7 tests → unit (3.x), characterization (4.1), golden (4.2), integration (2.x/5.2/6.x); §9 success criteria → Phase 7. All sections mapped.
- **Money decision:** schema uses `real()` throughout (Task 1.1) — consistent with the updated spec (float, not paise).
- **Type consistency:** repo interfaces (`InvestmentTxRepo.getCashFlows` → `CashFlow[]`) match domain usage in returns.ts (Task 3.2) and the types defined in 2.1.
- **Known blocker surfaced:** golden-master (4.2) gated on user-provided Groww data; characterization (4.1) is the unblocked equivalence guard so implementation never stalls.
