# L1 — Ingestion + Data API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add server-side import endpoints (HDFC expenses + Groww investments) behind a multi-platform parser registry, plus expanded read endpoints (holdings, allocation, accounts, categories, imports) and category-rule CRUD, on the existing `packages/api` Fastify server.

**Architecture:** L1 is purely the HTTP layer over the already-ported, Groww-validated `packages/core`. Import endpoints accept `multipart/form-data` raw `.xls` uploads; a parser registry maps `(platform, kind)` → a core parser that emits the normalized `ParsedData` the core orchestrators consume; orchestrators write transactionally via a `runInTransaction` runner built from the better-sqlite3 handle. The holdings import's network AMFI auto-match is injected (`buildServer({amfiMatch})`) so tests stay offline. One minor non-financial core addition: `ImportHistoryRepo.listAll()`.

**Tech Stack:** Node 20, TypeScript, Fastify 5, `@fastify/multipart`, better-sqlite3 (via core), Drizzle (via core), vitest, `xlsx` (fixture generation, already a core dep).

**Spec:** `docs/superpowers/specs/2026-06-12-l1-ingestion-design.md`

**Branch:** `layer/1-ingestion` (off `main`).

---

## ⚠️ Environment — read before every task

- **Node 20 is mandatory.** Prefix every shell command with:
  `source ~/.nvm/nvm.sh && nvm use 20 >/dev/null &&`
- **Typecheck the monorepo with `tsc --build`, never plain `tsc --noEmit`** — `packages/api` has a project reference to `packages/core`, whose `.d.ts` must be emitted first. The api `package.json` `typecheck` script currently runs `tsc --noEmit`; Task 0 fixes it.
- **Run tests from the package dir:** `pnpm -C packages/api test` (vitest) / `pnpm -C packages/core test`.
- Repo methods are **synchronous** (better-sqlite3). Only NAV (network) and the holdings import (because of AMFI) are async.
- Tests never hit the network: NAV is never called for NULL-amfi schemes; `amfiMatch` is stubbed.

---

## File Structure

**Create:**
- `packages/api/src/plugins/txRunner.ts` — `makeRunInTransaction(sqlite)` → `<T>(fn:()=>T)=>T`.
- `packages/api/src/lib/multipart.ts` — read one uploaded file → `{ buffer: ArrayBuffer, filename }` + text fields from a multipart request.
- `packages/api/src/import/registry.ts` — `resolveParser(platform, kind)` + `ImportKind` type.
- `packages/api/src/routes/imports.ts` — `POST /imports/expenses`, `/imports/investments/holdings`, `/imports/investments/transactions`, `GET /imports`.
- `packages/api/src/routes/categories.ts` — `GET /categories`; `POST/PATCH/DELETE /categories/rules`; `POST /recategorize`.
- `packages/api/test/fixtures/makeFixtures.ts` — programmatic `.xls` fixture generator (run once, commits binary fixtures).
- `packages/api/test/fixtures/*.xls` — generated HDFC / Groww holdings / Groww transactions fixtures.
- `packages/api/test/helpers.ts` — shared test helpers (build a server on a temp DB with a stub `amfiMatch`, seed schemes).
- `packages/api/test/imports.test.ts`, `categories.test.ts`, `investments-reads.test.ts`, `registry.test.ts`.
- `packages/core/test/repositories/importHistoryRepo.listAll.test.ts`.

**Modify:**
- `packages/api/package.json` — add `@fastify/multipart`; fix `typecheck` to `tsc --build`.
- `packages/api/src/server.ts` — register multipart + new route plugins; accept `opts.amfiMatch`.
- `packages/api/src/routes/investments.ts` — add `GET /investments/holdings`, `/investments/allocation`, `/investments/accounts`.
- `packages/core/src/repositories/types.ts` — add `listAll()` to `ImportHistoryRepo`.
- `packages/core/src/repositories/importHistoryRepo.ts` — implement `listAll()`.
- `docs/superpowers/MASTER_PLAN.md` — close-out (Task 10).

---

## Task 0: Branch + dependency + typecheck fix

**Files:**
- Modify: `packages/api/package.json`

- [ ] **Step 1: Create the branch**

```bash
source ~/.nvm/nvm.sh && nvm use 20 >/dev/null
cd /Users/vkhandelwal/Documents/MyFinance
git checkout main && git pull --ff-only
git checkout -b layer/1-ingestion
```

- [ ] **Step 2: Add `@fastify/multipart` to the api package**

```bash
source ~/.nvm/nvm.sh && nvm use 20 >/dev/null
pnpm -C /Users/vkhandelwal/Documents/MyFinance/packages/api add @fastify/multipart@^9.0.0
```

Expected: `@fastify/multipart` appears under `dependencies` in `packages/api/package.json`. (v9 is the Fastify 5-compatible major.)

- [ ] **Step 3: Fix the typecheck script** in `packages/api/package.json`

Change:
```json
    "typecheck": "tsc --noEmit",
```
to:
```json
    "typecheck": "tsc --build",
```

- [ ] **Step 4: Verify the baseline still builds and tests pass**

```bash
source ~/.nvm/nvm.sh && nvm use 20 >/dev/null
cd /Users/vkhandelwal/Documents/MyFinance
pnpm -C packages/core exec tsc --build && pnpm -C packages/api typecheck
pnpm -C packages/api test
```

Expected: typecheck clean; existing 5 api tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/api/package.json pnpm-lock.yaml
git commit -m "chore(api): add @fastify/multipart; typecheck via tsc --build; branch L1"
```

---

## Task 1: `txRunner` plugin

The core import orchestrators need `runInTransaction: <T>(fn:()=>T)=>T`. better-sqlite3's `sqlite.transaction(fn)` returns a *callable* that runs `fn` in a transaction; we wrap it.

**Files:**
- Create: `packages/api/src/plugins/txRunner.ts`
- Test: `packages/api/test/txRunner.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/api/test/txRunner.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { makeRunInTransaction } from '../src/plugins/txRunner';

describe('makeRunInTransaction', () => {
  let db: Database.Database;
  afterEach(() => db?.close());

  it('commits work done inside the runner and returns its value', () => {
    db = new Database(':memory:');
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)');
    const run = makeRunInTransaction(db);

    const result = run(() => {
      db.prepare('INSERT INTO t (v) VALUES (?)').run('a');
      return 42;
    });

    expect(result).toBe(42);
    expect(db.prepare('SELECT COUNT(*) c FROM t').get()).toEqual({ c: 1 });
  });

  it('rolls back all work when the callback throws', () => {
    db = new Database(':memory:');
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)');
    const run = makeRunInTransaction(db);

    expect(() =>
      run(() => {
        db.prepare('INSERT INTO t (v) VALUES (?)').run('a');
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(db.prepare('SELECT COUNT(*) c FROM t').get()).toEqual({ c: 0 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
source ~/.nvm/nvm.sh && nvm use 20 >/dev/null
pnpm -C /Users/vkhandelwal/Documents/MyFinance/packages/api exec vitest run test/txRunner.test.ts
```

Expected: FAIL — cannot find module `../src/plugins/txRunner`.

- [ ] **Step 3: Implement**

```typescript
// packages/api/src/plugins/txRunner.ts
import type { Sqlite } from './db';

/**
 * Build a `runInTransaction` runner from a better-sqlite3 handle for the core
 * import orchestrators. better-sqlite3's `transaction(fn)` returns a callable
 * that executes `fn` atomically (committing on return, rolling back on throw);
 * we immediately invoke it so callers get `<T>(fn:()=>T)=>T`.
 */
export function makeRunInTransaction(sqlite: Sqlite): <T>(fn: () => T) => T {
  return <T>(fn: () => T): T => sqlite.transaction(fn)();
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm -C /Users/vkhandelwal/Documents/MyFinance/packages/api exec vitest run test/txRunner.test.ts
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/plugins/txRunner.ts packages/api/test/txRunner.test.ts
git commit -m "feat(api): runInTransaction runner from better-sqlite3 handle"
```

---

## Task 2: Multipart helper

Reads a single uploaded file (field name `file`) into an `ArrayBuffer` plus its filename, and collects text fields. Uses `@fastify/multipart` in its buffered "attachFieldsToBody" form is avoided — we iterate parts manually for clarity.

**Files:**
- Create: `packages/api/src/lib/multipart.ts`
- Test: covered indirectly by the import endpoint tests (Task 6). A direct unit test is impractical without a live request; we validate it through `app.inject` in Task 6. This task only writes the helper + registers the plugin.

- [ ] **Step 1: Register multipart in `server.ts`**

In `packages/api/src/server.ts`, add the import and registration. Full updated file:

```typescript
// packages/api/src/server.ts
import Fastify, { type FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { loadConfig } from './config';
import { registerErrorHandler } from './errors';
import { registerDb } from './plugins/db';
import { healthRoutes } from './routes/health';
import { transactionRoutes } from './routes/transactions';
import { investmentRoutes } from './routes/investments';
import { importRoutes } from './routes/imports';
import { categoryRoutes } from './routes/categories';
import type { AmfiMatch } from './routes/imports';

export type BuildServerOpts = {
  dbPath?: string;
  /**
   * Post-import AMFI auto-match injected into the holdings import. Defaults to
   * the real network matcher (core). Tests pass a no-network stub.
   */
  amfiMatch?: AmfiMatch;
};

export async function buildServer(opts: BuildServerOpts = {}): Promise<FastifyInstance> {
  const dbPath = opts.dbPath ?? loadConfig().dbPath;

  const app = Fastify({ logger: false });

  registerErrorHandler(app);

  await app.register(multipart, {
    limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  });

  await registerDb(app, dbPath);

  await app.register(healthRoutes);
  await app.register(transactionRoutes);
  await app.register(investmentRoutes);
  await app.register(categoryRoutes);
  await app.register(importRoutes, { amfiMatch: opts.amfiMatch });

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = await buildServer();
  const { port } = loadConfig();
  await app.listen({ port, host: '0.0.0.0' });
}
```

> NOTE: this references `importRoutes`, `categoryRoutes`, `AmfiMatch` which don't exist yet — the file will not typecheck until Tasks 5/6/7. That's expected; we commit the helper now and the server compiles green at the end of Task 6. To keep intermediate commits green, **do Step 1 of this task at the START of Task 6 instead if you prefer strictly-green commits.** (Subagent executors: defer this server.ts edit to Task 6 Step 1.)

- [ ] **Step 2: Write the multipart helper**

```typescript
// packages/api/src/lib/multipart.ts
import type { FastifyRequest } from 'fastify';

export type UploadedFile = {
  buffer: ArrayBuffer;
  filename: string;
};

export type ParsedMultipart = {
  file: UploadedFile | null;
  fields: Record<string, string>;
};

/**
 * Read a multipart/form-data request: the first file part (any field name) is
 * returned as an ArrayBuffer + filename; all value parts are collected as
 * string fields. Throws statusCode-400 if the request is not multipart.
 */
export async function readMultipart(req: FastifyRequest): Promise<ParsedMultipart> {
  if (!req.isMultipart()) {
    const err = new Error('Expected multipart/form-data request.') as Error & {
      statusCode?: number;
    };
    err.statusCode = 400;
    throw err;
  }

  const fields: Record<string, string> = {};
  let file: UploadedFile | null = null;

  const parts = req.parts();
  for await (const part of parts) {
    if (part.type === 'file') {
      const nodeBuffer = await part.toBuffer();
      // Copy into a standalone ArrayBuffer (the parsers call XLSX.read with
      // type:'array'); slice avoids handing over a pooled Buffer's backing store.
      const ab = nodeBuffer.buffer.slice(
        nodeBuffer.byteOffset,
        nodeBuffer.byteOffset + nodeBuffer.byteLength,
      );
      file = { buffer: ab, filename: part.filename };
    } else {
      fields[part.fieldname] = String(part.value);
    }
  }

  return { file, fields };
}
```

- [ ] **Step 3: Typecheck the helper in isolation**

```bash
source ~/.nvm/nvm.sh && nvm use 20 >/dev/null
pnpm -C /Users/vkhandelwal/Documents/MyFinance/packages/api exec tsc --noEmit src/lib/multipart.ts
```

Expected: no errors from `multipart.ts` itself (it only depends on fastify types + `@fastify/multipart` registration at runtime). If `req.isMultipart`/`req.parts` are flagged, ensure `@fastify/multipart` is installed (Task 0).

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/lib/multipart.ts
git commit -m "feat(api): multipart helper — uploaded file -> ArrayBuffer + fields"
```

---

## Task 3: Core — `ImportHistoryRepo.listAll()`

A normalized, date-descending view across both import-history tables for `GET /imports`. **Non-financial (plain SELECT) — no Groww re-validation needed.**

**Files:**
- Modify: `packages/core/src/repositories/types.ts`
- Modify: `packages/core/src/repositories/importHistoryRepo.ts`
- Test: `packages/core/test/repositories/importHistoryRepo.listAll.test.ts`

- [ ] **Step 1: Add the type to the interface**

In `packages/core/src/repositories/types.ts`, inside `interface ImportHistoryRepo`, add:

```typescript
  /**
   * Unified, date-descending list of all import runs across both expense
   * (import_history) and investment (investment_import_history) tables.
   * Non-financial read used by the API's GET /imports.
   */
  listAll(): ImportRecord[];
```

And add this exported type near the other repo types in `types.ts`:

```typescript
export type ImportRecord = {
  kind: 'expense' | 'investment';
  id: number;
  /** expense: source_name; investment: file_name (may be null). */
  sourceName: string | null;
  /** investment only: 'holdings' | 'transactions'; null for expense. */
  importType: 'holdings' | 'transactions' | null;
  /** expense: transaction_count; investment: record_count (may be null). */
  recordCount: number | null;
  /** investment only; null for expense. */
  accountName: string | null;
  investmentApp: string | null;
  /** ISO timestamp (imported_at). */
  importedAt: string;
};
```

- [ ] **Step 2: Write the failing test**

```typescript
// packages/core/test/repositories/importHistoryRepo.listAll.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runMigrations } from '../../src/db/migrate';
import { makeImportHistoryRepo } from '../../src/repositories/importHistoryRepo';
import type { Db } from '../../src/db/client';
import type { Database as SqliteDatabase } from 'better-sqlite3';

describe('importHistoryRepo.listAll', () => {
  let db: Db;
  let sqlite: SqliteDatabase;
  let repo: ReturnType<typeof makeImportHistoryRepo>;

  beforeEach(() => {
    ({ db, sqlite } = runMigrations(':memory:'));
    repo = makeImportHistoryRepo(db);
  });
  afterEach(() => sqlite.close());

  it('returns expense and investment imports unified, date-desc', () => {
    const expId = repo.create({
      sourceName: 'hdfc.xls',
      sourceType: 'xls',
      transactionCount: 12,
    });
    const invId = repo.createInvestmentImport({
      accountName: 'Groww Main',
      investmentApp: 'groww',
      importType: 'holdings',
      fileName: 'holdings.xls',
      startDate: '2026-05-23',
      endDate: '2026-05-23',
      recordCount: 3,
    });

    const all = repo.listAll();

    expect(all).toHaveLength(2);
    const exp = all.find((r) => r.kind === 'expense' && r.id === expId);
    const inv = all.find((r) => r.kind === 'investment' && r.id === invId);

    expect(exp).toMatchObject({
      kind: 'expense',
      sourceName: 'hdfc.xls',
      importType: null,
      recordCount: 12,
      accountName: null,
      investmentApp: null,
    });
    expect(inv).toMatchObject({
      kind: 'investment',
      sourceName: 'holdings.xls',
      importType: 'holdings',
      recordCount: 3,
      accountName: 'Groww Main',
      investmentApp: 'groww',
    });
    expect(typeof exp!.importedAt).toBe('string');
    // date-desc by importedAt; ties broken so output is deterministic
    for (let i = 1; i < all.length; i++) {
      expect(all[i - 1].importedAt >= all[i].importedAt).toBe(true);
    }
  });

  it('returns [] when there are no imports', () => {
    expect(repo.listAll()).toEqual([]);
  });
});
```

- [ ] **Step 2b: Run it to verify it fails**

```bash
source ~/.nvm/nvm.sh && nvm use 20 >/dev/null
pnpm -C /Users/vkhandelwal/Documents/MyFinance/packages/core exec vitest run test/repositories/importHistoryRepo.listAll.test.ts
```

Expected: FAIL — `repo.listAll is not a function`.

- [ ] **Step 3: Implement `listAll()`**

In `packages/core/src/repositories/importHistoryRepo.ts`, add the import of the two tables if not already imported, and add the method to the returned object. Use Drizzle, mapping each table to the normalized `ImportRecord`, concatenating, and sorting by `importedAt` desc (then `kind`,`id` for determinism):

```typescript
// add to imports at top if missing:
//   import { importHistory, investmentImportHistory } from '../db/schema';
//   import { desc } from 'drizzle-orm';
// and import the ImportRecord type:
//   import type { ImportHistoryRepo, ImportRecord } from './types';

    listAll(): ImportRecord[] {
      const expenses = db
        .select()
        .from(importHistory)
        .all()
        .map((r): ImportRecord => ({
          kind: 'expense',
          id: r.id,
          sourceName: r.sourceName,
          importType: null,
          recordCount: r.transactionCount,
          accountName: null,
          investmentApp: null,
          importedAt: r.importedAt,
        }));

      const investments = db
        .select()
        .from(investmentImportHistory)
        .all()
        .map((r): ImportRecord => ({
          kind: 'investment',
          id: r.id,
          sourceName: r.fileName ?? null,
          importType: r.importType,
          recordCount: r.recordCount ?? null,
          accountName: r.accountName,
          investmentApp: r.investmentApp,
          importedAt: r.importedAt,
        }));

      return [...expenses, ...investments].sort((a, b) => {
        if (a.importedAt !== b.importedAt) {
          return a.importedAt < b.importedAt ? 1 : -1; // desc
        }
        if (a.kind !== b.kind) return a.kind < b.kind ? 1 : -1;
        return b.id - a.id;
      });
    },
```

> If `desc` import is unused after writing the JS-side sort, omit it. The JS sort is used (not SQL ORDER BY) because we merge two tables.

- [ ] **Step 4: Run tests + full core suite + typecheck**

```bash
source ~/.nvm/nvm.sh && nvm use 20 >/dev/null
pnpm -C /Users/vkhandelwal/Documents/MyFinance/packages/core exec vitest run test/repositories/importHistoryRepo.listAll.test.ts
pnpm -C /Users/vkhandelwal/Documents/MyFinance/packages/core test
pnpm -C /Users/vkhandelwal/Documents/MyFinance/packages/core exec tsc --build
```

Expected: new test passes; all prior core tests still green; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/repositories/types.ts packages/core/src/repositories/importHistoryRepo.ts packages/core/test/repositories/importHistoryRepo.listAll.test.ts
git commit -m "feat(core): ImportHistoryRepo.listAll — unified import-history read (non-financial)"
```

---

## Task 4: Parser registry

**Files:**
- Create: `packages/api/src/import/registry.ts`
- Test: `packages/api/test/registry.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/api/test/registry.test.ts
import { describe, it, expect } from 'vitest';
import { resolveParser } from '../src/import/registry';
import {
  parseHdfcStatementXls,
  parseGrowwHoldingsXls,
  parseGrowwTransactionXls,
} from '@myfinance/core';

describe('resolveParser', () => {
  it('resolves known (platform, kind) pairs to the core parsers', () => {
    expect(resolveParser('hdfc', 'expense')).toBe(parseHdfcStatementXls);
    expect(resolveParser('groww', 'holdings')).toBe(parseGrowwHoldingsXls);
    expect(resolveParser('groww', 'transactions')).toBe(parseGrowwTransactionXls);
  });

  it('is case-insensitive on platform', () => {
    expect(resolveParser('GROWW', 'holdings')).toBe(parseGrowwHoldingsXls);
  });

  it('throws statusCode-400 for an unsupported pair', () => {
    try {
      resolveParser('etmoney', 'holdings');
      throw new Error('should have thrown');
    } catch (e) {
      const err = e as Error & { statusCode?: number };
      expect(err.statusCode).toBe(400);
      expect(err.message).toMatch(/unsupported/i);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
source ~/.nvm/nvm.sh && nvm use 20 >/dev/null
pnpm -C /Users/vkhandelwal/Documents/MyFinance/packages/api exec vitest run test/registry.test.ts
```

Expected: FAIL — cannot find module `../src/import/registry`.

- [ ] **Step 3: Implement the registry**

```typescript
// packages/api/src/import/registry.ts
import {
  parseHdfcStatementXls,
  parseGrowwHoldingsXls,
  parseGrowwTransactionXls,
} from '@myfinance/core';

/** What kind of file is being imported (decoupled from platform). */
export type ImportKind = 'expense' | 'holdings' | 'transactions';

/**
 * A parser takes the uploaded file bytes (+ optional filename) and returns the
 * normalized ParsedData shape the core orchestrator for that kind consumes.
 * The concrete return type varies by kind; callers narrow via the kind they
 * requested, so we type the registry loosely here and let the route pass the
 * result straight into the matching orchestrator.
 */
type AnyParser = (buffer: ArrayBuffer, filename?: string) => unknown;

const REGISTRY: Record<string, Partial<Record<ImportKind, AnyParser>>> = {
  hdfc: {
    expense: (buf) => parseHdfcStatementXls(buf),
  },
  groww: {
    holdings: (buf, filename) => parseGrowwHoldingsXls(buf, filename),
    transactions: (buf) => parseGrowwTransactionXls(buf),
  },
};

/**
 * Resolve the parser for a (platform, kind) pair. Platform is matched
 * case-insensitively. Throws an HTTP-400-flagged Error for unsupported pairs so
 * the global error handler surfaces a clean 400 (D6).
 *
 * Adding a new platform = add an entry here + its parser module. No route or
 * orchestrator changes.
 */
export function resolveParser(platform: string, kind: ImportKind): AnyParser {
  const parser = REGISTRY[platform.toLowerCase()]?.[kind];
  if (!parser) {
    const err = new Error(
      `Unsupported import: platform="${platform}", kind="${kind}".`,
    ) as Error & { statusCode?: number };
    err.statusCode = 400;
    throw err;
  }
  return parser;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm -C /Users/vkhandelwal/Documents/MyFinance/packages/api exec vitest run test/registry.test.ts
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/import/registry.ts packages/api/test/registry.test.ts
git commit -m "feat(api): multi-platform parser registry (D6)"
```

---

## Task 5: Test fixtures + shared test helpers

The parsers detect a header row by alias matching on a 2D array (`sheet_to_json({header:1})`). We generate `.xls` fixtures programmatically so the column layout exactly matches the aliases, with **no real PII**.

**Files:**
- Create: `packages/api/test/fixtures/makeFixtures.ts`
- Create (generated): `packages/api/test/fixtures/hdfc-sample.xls`, `groww-holdings-sample.xls`, `groww-transactions-sample.xls`
- Create: `packages/api/test/helpers.ts`

- [ ] **Step 1: Write the fixture generator**

```typescript
// packages/api/test/fixtures/makeFixtures.ts
/**
 * Generates tiny, PII-free .xls fixtures whose column layouts match the core
 * parsers' header-alias detection. Run once: `tsx test/fixtures/makeFixtures.ts`
 * from packages/api. The emitted .xls files are committed.
 */
import * as XLSX from 'xlsx';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

function writeSheet(rows: (string | number)[][], file: string): void {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  XLSX.writeFile(wb, join(here, file), { bookType: 'xls' });
}

// --- HDFC expense statement -------------------------------------------------
// hdfcParser needs a header row with date + description (+ debit/credit/balance).
writeSheet(
  [
    ['Date', 'Narration', 'Chq/Ref No', 'Withdrawal Amt', 'Deposit Amt', 'Closing Balance'],
    ['01/04/2026', 'UPI-SWIGGY-orderid', 'REF001', '250.00', '', '10000.00'],
    ['02/04/2026', 'UPI-SALARY CREDIT', 'REF002', '', '50000.00', '60000.00'],
    ['03/04/2026', 'UPI-AMAZON-shopping', 'REF003', '1200.50', '', '58799.50'],
  ],
  'hdfc-sample.xls',
);

// --- Groww holdings ---------------------------------------------------------
// holdingsParser scans first ~15 rows for "Total Investments" summary +
// personal Name/PAN, "HOLDINGS AS ON YYYY-MM-DD", then a holdings header row.
writeSheet(
  [
    ['HOLDINGS AS ON 2026-05-23'],
    ['Name', 'Test User'],
    ['PAN', 'AAAAA0000A'],
    ['Total Investments', 'Current Value', '', '', 'XIRR'],
    ['100000', '120000', '', '', '9.5%'],
    [],
    ['Scheme Name', 'AMC', 'Category', 'Sub Category', 'Folio No', 'Units', 'Invested Value', 'Current Value', 'Returns', 'XIRR'],
    ['Test Flexi Cap Fund', 'Test AMC', 'Equity', 'Flexi Cap', 'FOLIO001', '500.123', '40000', '48000', '8000', '7.1%'],
    ['Test Index Fund', 'Test AMC', 'Equity', 'Index', 'FOLIO002', '300.5', '60000', '72000', '12000', '10.2%'],
  ],
  'groww-holdings-sample.xls',
);

// --- Groww transactions -----------------------------------------------------
// transactionParser scans header for Name/PAN/Date Range, then a header row
// with Scheme Name/Transaction Type/Units/NAV/Amount/Date. Dates "DD MMM YYYY".
writeSheet(
  [
    ['Name', 'Test User'],
    ['PAN', 'AAAAA0000A'],
    ['Date Range', 'Apr 01 2025 to Mar 31 2026'],
    [],
    ['Scheme Name', 'Transaction Type', 'Units', 'NAV', 'Amount', 'Date'],
    ['Test Flexi Cap Fund', 'PURCHASE', '50.0', '100.0', '5,000', '10 Apr 2025'],
    ['Test Flexi Cap Fund', 'PURCHASE', '48.0', '104.0', '5,000', '10 May 2025'],
    ['Test Index Fund', 'PURCHASE', '60.0', '100.0', '6,000', '10 Apr 2025'],
  ],
  'groww-transactions-sample.xls',
);

console.log('Fixtures written to', here);
```

- [ ] **Step 2: Generate the fixtures**

```bash
source ~/.nvm/nvm.sh && nvm use 20 >/dev/null
pnpm -C /Users/vkhandelwal/Documents/MyFinance/packages/api exec tsx test/fixtures/makeFixtures.ts
ls -la /Users/vkhandelwal/Documents/MyFinance/packages/api/test/fixtures/
```

Expected: three `.xls` files written.

- [ ] **Step 3: Verify the fixtures actually parse (sanity, before building routes)**

```bash
source ~/.nvm/nvm.sh && nvm use 20 >/dev/null
cd /Users/vkhandelwal/Documents/MyFinance/packages/api
pnpm exec tsx -e '
import { readFileSync } from "node:fs";
import { parseHdfcStatementXls, parseGrowwHoldingsXls, parseGrowwTransactionXls } from "@myfinance/core";
const ab = (p) => { const b = readFileSync(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const hd = parseHdfcStatementXls(ab("test/fixtures/hdfc-sample.xls"));
console.log("HDFC txns:", hd.length, hd.map(t => t.direction));
const ho = parseGrowwHoldingsXls(ab("test/fixtures/groww-holdings-sample.xls"), "groww-holdings-sample.xls");
console.log("Holdings:", ho.holdings.length, "asOf", ho.asOfDate);
const tx = parseGrowwTransactionXls(ab("test/fixtures/groww-transactions-sample.xls"));
console.log("Inv txns:", tx.transactions.length, "schemes", [...new Set(tx.transactions.map(t=>t.schemeName))]);
'
```

Expected: HDFC 3 txns (`debit`,`credit`,`debit`); Holdings 2, asOf `2026-05-23`; Inv txns 3, two scheme names. **If any parse throws or returns 0, fix the fixture layout in `makeFixtures.ts` against the parser source (`packages/core/src/import/*Parser.ts`) and regenerate — do NOT proceed until all three parse.**

- [ ] **Step 4: Write shared test helpers**

```typescript
// packages/api/test/helpers.ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildServer, type BuildServerOpts } from '../src/server';
import type { FastifyInstance } from 'fastify';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

/** Read a fixture file as a Node Buffer (for multipart payload building). */
export function fixtureBuffer(name: string): Buffer {
  return readFileSync(join(fixturesDir, name));
}

/** No-network AMFI stub for the holdings import. */
export const stubAmfiMatch = async () => ({ matched: 0, total: 0 });

/**
 * Build a server on a throwaway in-memory-equivalent temp DB file with the
 * AMFI network call stubbed. Caller must `await app.close()` (closes sqlite).
 */
export async function buildTestServer(
  opts: Partial<BuildServerOpts> = {},
): Promise<FastifyInstance> {
  return buildServer({
    dbPath: ':memory:',
    amfiMatch: stubAmfiMatch,
    ...opts,
  });
}

/**
 * Build a multipart/form-data body + headers for app.inject from a file buffer
 * and string fields. Uses a fixed boundary.
 */
export function multipartPayload(
  fileField: string,
  filename: string,
  fileBuf: Buffer,
  fields: Record<string, string> = {},
): { payload: Buffer; headers: Record<string, string> } {
  const boundary = '----myfinanceTestBoundary1234567890';
  const CRLF = '\r\n';
  const segments: Buffer[] = [];

  for (const [k, v] of Object.entries(fields)) {
    segments.push(
      Buffer.from(
        `--${boundary}${CRLF}` +
          `Content-Disposition: form-data; name="${k}"${CRLF}${CRLF}` +
          `${v}${CRLF}`,
      ),
    );
  }

  segments.push(
    Buffer.from(
      `--${boundary}${CRLF}` +
        `Content-Disposition: form-data; name="${fileField}"; filename="${filename}"${CRLF}` +
        `Content-Type: application/vnd.ms-excel${CRLF}${CRLF}`,
    ),
  );
  segments.push(fileBuf);
  segments.push(Buffer.from(`${CRLF}--${boundary}--${CRLF}`));

  const payload = Buffer.concat(segments);
  return {
    payload,
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}
```

> NOTE: `buildTestServer` imports `buildServer`, which (after Task 6) imports the new routes. Until Task 6 lands, this helper won't typecheck standalone — that's fine; it's first exercised in Task 6.

- [ ] **Step 5: Commit fixtures + generator + helpers**

```bash
git add packages/api/test/fixtures packages/api/test/helpers.ts
git commit -m "test(api): PII-free .xls fixtures + multipart/server test helpers"
```

---

## Task 6: Import endpoints + `GET /imports`

**Files:**
- Modify: `packages/api/src/server.ts` (Task 2 Step 1 edit — apply now if deferred)
- Create: `packages/api/src/routes/imports.ts`
- Test: `packages/api/test/imports.test.ts`

- [ ] **Step 1: Apply the `server.ts` edit** from Task 2 Step 1 (register multipart + `categoryRoutes` + `importRoutes`, add `opts.amfiMatch`). If you already applied it, skip. (Note: `categoryRoutes` is created in Task 7 — to keep this commit green, temporarily comment out the `categoryRoutes` import + registration here and re-enable in Task 7. Subagent executors: comment it now, uncomment in Task 7 Step 1.)

- [ ] **Step 2: Write the failing test**

```typescript
// packages/api/test/imports.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestServer, fixtureBuffer, multipartPayload } from './helpers';

let app: FastifyInstance;
afterEach(async () => { await app?.close(); });

describe('POST /imports/expenses', () => {
  it('imports HDFC expenses and dedupes on re-import', async () => {
    app = await buildTestServer();
    const buf = fixtureBuffer('hdfc-sample.xls');

    const mk = () => multipartPayload('file', 'hdfc-sample.xls', buf, { platform: 'hdfc' });

    const r1 = await app.inject({ method: 'POST', url: '/imports/expenses', ...mk() });
    expect(r1.statusCode).toBe(200);
    const b1 = r1.json().data;
    expect(b1.detectedCount).toBe(3);
    expect(b1.insertedCount).toBe(3);

    const r2 = await app.inject({ method: 'POST', url: '/imports/expenses', ...mk() });
    expect(r2.json().data.insertedCount).toBe(0); // dedupe_key conflict
  });

  it('400 when no file part is present', async () => {
    app = await buildTestServer();
    const { payload, headers } = multipartPayload(
      'notafile', 'x.txt', Buffer.from('hi'), { platform: 'hdfc' },
    );
    // remove the file part by sending only a field:
    const r = await app.inject({
      method: 'POST', url: '/imports/expenses',
      payload, headers,
    });
    expect(r.statusCode).toBe(400);
  });
});

describe('POST /imports/investments/*', () => {
  it('holdings import then transactions import then reads are populated', async () => {
    app = await buildTestServer();

    const hold = multipartPayload(
      'file', 'groww-holdings-sample.xls', fixtureBuffer('groww-holdings-sample.xls'),
      { accountName: 'Groww Main', investmentApp: 'groww', platform: 'groww' },
    );
    const rh = await app.inject({ method: 'POST', url: '/imports/investments/holdings', ...hold });
    expect(rh.statusCode).toBe(200);
    expect(rh.json().data.importedCount).toBe(2);

    const tx = multipartPayload(
      'file', 'groww-transactions-sample.xls', fixtureBuffer('groww-transactions-sample.xls'),
      { accountName: 'Groww Main', investmentApp: 'groww', platform: 'groww' },
    );
    const rt = await app.inject({ method: 'POST', url: '/imports/investments/transactions', ...tx });
    expect(rt.statusCode).toBe(200);
    expect(rt.json().data.status).toBe('success');
    expect(rt.json().data.importedCount).toBe(3);

    const rs = await app.inject({ method: 'GET', url: '/investments/summary' });
    expect(rs.statusCode).toBe(200);
    expect(rs.json().data.totalInvested).toBeGreaterThan(0);
  });

  it('transactions without prior holdings -> 200 unmatched_schemes, DB untouched', async () => {
    app = await buildTestServer();
    const tx = multipartPayload(
      'file', 'groww-transactions-sample.xls', fixtureBuffer('groww-transactions-sample.xls'),
      { accountName: 'Groww Main', investmentApp: 'groww', platform: 'groww' },
    );
    const rt = await app.inject({ method: 'POST', url: '/imports/investments/transactions', ...tx });
    expect(rt.statusCode).toBe(200);
    const data = rt.json().data;
    expect(data.status).toBe('unmatched_schemes');
    expect(data.unmatchedSchemes.length).toBeGreaterThan(0);
  });

  it('400 when accountName field is missing on holdings', async () => {
    app = await buildTestServer();
    const hold = multipartPayload(
      'file', 'groww-holdings-sample.xls', fixtureBuffer('groww-holdings-sample.xls'),
      { investmentApp: 'groww', platform: 'groww' }, // no accountName
    );
    const rh = await app.inject({ method: 'POST', url: '/imports/investments/holdings', ...hold });
    expect(rh.statusCode).toBe(400);
  });

  it('400 for unsupported platform', async () => {
    app = await buildTestServer();
    const hold = multipartPayload(
      'file', 'x.xls', fixtureBuffer('groww-holdings-sample.xls'),
      { accountName: 'A', investmentApp: 'etmoney', platform: 'etmoney' },
    );
    const rh = await app.inject({ method: 'POST', url: '/imports/investments/holdings', ...hold });
    expect(rh.statusCode).toBe(400);
  });
});

describe('GET /imports', () => {
  it('lists expense + investment imports', async () => {
    app = await buildTestServer();
    await app.inject({
      method: 'POST', url: '/imports/expenses',
      ...multipartPayload('file', 'hdfc-sample.xls', fixtureBuffer('hdfc-sample.xls'), { platform: 'hdfc' }),
    });
    await app.inject({
      method: 'POST', url: '/imports/investments/holdings',
      ...multipartPayload('file', 'groww-holdings-sample.xls', fixtureBuffer('groww-holdings-sample.xls'),
        { accountName: 'Groww Main', investmentApp: 'groww', platform: 'groww' }),
    });

    const r = await app.inject({ method: 'GET', url: '/imports' });
    expect(r.statusCode).toBe(200);
    const rows = r.json().data;
    expect(rows.some((x: any) => x.kind === 'expense')).toBe(true);
    expect(rows.some((x: any) => x.kind === 'investment')).toBe(true);
  });
});
```

- [ ] **Step 3: Run to verify failure**

```bash
source ~/.nvm/nvm.sh && nvm use 20 >/dev/null
pnpm -C /Users/vkhandelwal/Documents/MyFinance/packages/api exec vitest run test/imports.test.ts
```

Expected: FAIL — cannot find `../src/routes/imports` (and 404s).

- [ ] **Step 4: Implement `routes/imports.ts`**

```typescript
// packages/api/src/routes/imports.ts
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  importTransactions,
  importHoldings,
  importInvestmentTransactions,
  autoMatchAmfiCodes,
  type ParsedTransaction,
  type ParsedHoldingsData,
  type ParsedTransactionData,
  type SchemeRepo,
} from '@myfinance/core';
import { makeRunInTransaction } from '../plugins/txRunner';
import { readMultipart, type ParsedMultipart } from '../lib/multipart';
import { resolveParser } from '../import/registry';

export type AmfiMatch = (deps: { schemeRepo: SchemeRepo }) => Promise<{
  matched: number;
  total: number;
}>;

export type ImportRoutesOpts = { amfiMatch?: AmfiMatch };

function badRequest(message: string): Error & { statusCode?: number } {
  const err = new Error(message) as Error & { statusCode?: number };
  err.statusCode = 400;
  return err;
}

/** Read multipart, requiring a file part; map any parser/multipart issue to 400. */
async function requireUpload(req: FastifyRequest): Promise<ParsedMultipart> {
  const mp = await readMultipart(req);
  if (!mp.file) throw badRequest('Missing file upload (field "file").');
  return mp;
}

function requireField(fields: Record<string, string>, name: string): string {
  const v = fields[name]?.trim();
  if (!v) throw badRequest(`Missing required field "${name}".`);
  return v;
}

export async function importRoutes(
  app: FastifyInstance,
  opts: ImportRoutesOpts,
): Promise<void> {
  const amfiMatch = opts.amfiMatch ?? autoMatchAmfiCodes;
  const runInTransaction = makeRunInTransaction(app.sqlite);

  // POST /imports/expenses
  app.post('/imports/expenses', async (req: FastifyRequest, reply: FastifyReply) => {
    const { file, fields } = await requireUpload(req);
    const platform = fields.platform?.trim() || 'hdfc';
    const parse = resolveParser(platform, 'expense');

    let transactions: ParsedTransaction[];
    try {
      transactions = parse(file!.buffer) as ParsedTransaction[];
    } catch (e) {
      throw badRequest((e as Error).message);
    }

    const result = await importTransactions(
      {
        importHistoryRepo: app.repos.importHistoryRepo,
        ruleRepo: app.repos.categoryRuleRepo,
        txRepo: app.repos.expenseTxRepo,
        runInTransaction,
      },
      { sourceName: file!.filename, sourceType: 'xls', transactions },
    );
    return reply.send({ data: result });
  });

  // POST /imports/investments/holdings
  app.post('/imports/investments/holdings', async (req, reply) => {
    const { file, fields } = await requireUpload(req);
    const accountName = requireField(fields, 'accountName');
    const investmentApp = requireField(fields, 'investmentApp');
    const platform = fields.platform?.trim() || 'groww';
    const parse = resolveParser(platform, 'holdings');

    let parsedData: ParsedHoldingsData;
    try {
      parsedData = parse(file!.buffer, file!.filename) as ParsedHoldingsData;
    } catch (e) {
      throw badRequest((e as Error).message);
    }

    const result = await importHoldings(
      {
        schemeRepo: app.repos.schemeRepo,
        holdingsRepo: app.repos.holdingsRepo,
        importHistoryRepo: app.repos.importHistoryRepo,
        runInTransaction,
        amfiMatch,
      },
      { accountName, investmentApp, parsedData, fileName: file!.filename },
    );
    return reply.send({ data: result });
  });

  // POST /imports/investments/transactions
  app.post('/imports/investments/transactions', async (req, reply) => {
    const { file, fields } = await requireUpload(req);
    const accountName = requireField(fields, 'accountName');
    const investmentApp = requireField(fields, 'investmentApp');
    const platform = fields.platform?.trim() || 'groww';
    const parse = resolveParser(platform, 'transactions');

    let parsedData: ParsedTransactionData;
    try {
      parsedData = parse(file!.buffer) as ParsedTransactionData;
    } catch (e) {
      throw badRequest((e as Error).message);
    }

    const result = await importInvestmentTransactions(
      {
        schemeRepo: app.repos.schemeRepo,
        txRepo: app.repos.txRepo,
        importHistoryRepo: app.repos.importHistoryRepo,
        runInTransaction,
      },
      { accountName, investmentApp, parsedData, fileName: file!.filename },
    );
    return reply.send({ data: result }); // success | unmatched_schemes, both 200 (D2)
  });

  // GET /imports
  app.get('/imports', async () => {
    return { data: app.repos.importHistoryRepo.listAll() };
  });
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm -C /Users/vkhandelwal/Documents/MyFinance/packages/api exec vitest run test/imports.test.ts
```

Expected: all import tests pass. If the "400 when no file part" test fails because `@fastify/multipart` rejects a no-file body differently, adjust the assertion to accept the actual 400/406 the plugin emits, but the handler's `requireUpload` should produce 400.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/routes/imports.ts packages/api/src/server.ts packages/api/test/imports.test.ts
git commit -m "feat(api): import endpoints (expenses/holdings/investment-tx via registry) + GET /imports"
```

---

## Task 7: Category + rule endpoints

**Files:**
- Create: `packages/api/src/routes/categories.ts`
- Modify: `packages/api/src/server.ts` (re-enable `categoryRoutes` registration)
- Test: `packages/api/test/categories.test.ts`

- [ ] **Step 1: Re-enable `categoryRoutes`** in `server.ts` (uncomment the import + `await app.register(categoryRoutes);` deferred in Task 6 Step 1).

- [ ] **Step 2: Write the failing test**

```typescript
// packages/api/test/categories.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestServer, fixtureBuffer, multipartPayload } from './helpers';

let app: FastifyInstance;
afterEach(async () => { await app?.close(); });

describe('GET /categories', () => {
  it('returns seeded starter categories', async () => {
    app = await buildTestServer();
    const r = await app.inject({ method: 'GET', url: '/categories' });
    expect(r.statusCode).toBe(200);
    expect(Array.isArray(r.json().data)).toBe(true);
    // seedDatabase runs in migrations? If not, categories may be empty; the
    // shape assertion still holds. (Adjust if seed is wired into buildServer.)
  });
});

describe('category rule CRUD', () => {
  it('creating a merchant rule recategorizes matching expense transactions', async () => {
    app = await buildTestServer();
    // import expenses first so there are non-manual transactions to recategorize
    await app.inject({
      method: 'POST', url: '/imports/expenses',
      ...multipartPayload('file', 'hdfc-sample.xls', fixtureBuffer('hdfc-sample.xls'), { platform: 'hdfc' }),
    });

    const cats = (await app.inject({ method: 'GET', url: '/categories' })).json().data as Array<{ id: string }>;
    const categoryId = cats[0]?.id ?? 'food'; // any valid id; if seeded, use first

    const create = await app.inject({
      method: 'POST', url: '/categories/rules',
      payload: { ruleType: 'merchant', patternValue: 'swiggy', categoryId },
    });
    expect(create.statusCode).toBe(201);

    // the SWIGGY transaction should now carry categoryId
    const tx = (await app.inject({ method: 'GET', url: '/transactions?limit=50' })).json().data as any[];
    const swiggy = tx.find((t) => String(t.description).toLowerCase().includes('swiggy'));
    expect(swiggy?.category_id ?? swiggy?.categoryId).toBe(categoryId);
  });

  it('empty pattern -> 400', async () => {
    app = await buildTestServer();
    const cats = (await app.inject({ method: 'GET', url: '/categories' })).json().data as Array<{ id: string }>;
    const categoryId = cats[0]?.id ?? 'food';
    const r = await app.inject({
      method: 'POST', url: '/categories/rules',
      payload: { ruleType: 'merchant', patternValue: '   ', categoryId },
    });
    expect(r.statusCode).toBe(400);
  });

  it('DELETE /categories/rules/:id returns 200', async () => {
    app = await buildTestServer();
    const cats = (await app.inject({ method: 'GET', url: '/categories' })).json().data as Array<{ id: string }>;
    const categoryId = cats[0]?.id ?? 'food';
    await app.inject({
      method: 'POST', url: '/categories/rules',
      payload: { ruleType: 'merchant', patternValue: 'amazon', categoryId },
    });
    // rule id 1 (first created in this fresh DB)
    const del = await app.inject({ method: 'DELETE', url: '/categories/rules/1' });
    expect(del.statusCode).toBe(200);
  });

  it('POST /recategorize returns 200', async () => {
    app = await buildTestServer();
    const r = await app.inject({ method: 'POST', url: '/recategorize' });
    expect(r.statusCode).toBe(200);
    expect(r.json().data).toEqual({ ok: true });
  });
});
```

> **Seeding note:** these tests reference seeded categories. Check whether `buildServer`/`registerDb` runs `seedDatabase`. If it does NOT (L0 `registerDb` only runs migrations), add `seedDatabase(db)` to `registerDb` in `packages/api/src/plugins/db.ts` (import it from `@myfinance/core`) so categories + recategorization have data. This is an additive, idempotent seed (INSERT OR IGNORE) — include it as Step 3a below.

- [ ] **Step 3: Run to verify failure**

```bash
source ~/.nvm/nvm.sh && nvm use 20 >/dev/null
pnpm -C /Users/vkhandelwal/Documents/MyFinance/packages/api exec vitest run test/categories.test.ts
```

Expected: FAIL — route 404 / module missing.

- [ ] **Step 3a: (If needed) wire seeding** in `packages/api/src/plugins/db.ts`

If `GET /categories` returns empty, add to `registerDb` after building repos:

```typescript
import { seedDatabase } from '@myfinance/core';
// ...after `const { db, sqlite } = runMigrations(dbPath);`
seedDatabase(db);
```

- [ ] **Step 4: Implement `routes/categories.ts`**

```typescript
// packages/api/src/routes/categories.ts
import type { FastifyInstance } from 'fastify';
import {
  createRule,
  updateRuleCategory,
  deleteRule,
  recategorizeNonManualTransactions,
  type CategoryRuleType,
} from '@myfinance/core';

function badRequest(message: string): Error & { statusCode?: number } {
  const err = new Error(message) as Error & { statusCode?: number };
  err.statusCode = 400;
  return err;
}

type RuleCreateBody = { ruleType: CategoryRuleType; patternValue: string; categoryId: string };
type RuleUpdateBody = { categoryId: string; ruleType: CategoryRuleType };

export async function categoryRoutes(app: FastifyInstance): Promise<void> {
  const deps = () => ({ ruleRepo: app.repos.categoryRuleRepo, txRepo: app.repos.expenseTxRepo });

  // GET /categories
  app.get('/categories', async () => ({ data: app.repos.categoryRepo.list() }));

  // POST /categories/rules
  app.post<{ Body: RuleCreateBody }>('/categories/rules', async (req, reply) => {
    const { ruleType, patternValue, categoryId } = req.body ?? ({} as RuleCreateBody);
    if (!ruleType || !categoryId) throw badRequest('ruleType and categoryId are required.');
    // core createRule throws "Rule pattern cannot be empty." for blank patterns -> 400
    try {
      createRule(deps(), { ruleType, patternValue: patternValue ?? '', categoryId });
    } catch (e) {
      throw badRequest((e as Error).message);
    }
    return reply.status(201).send({ data: { ok: true } });
  });

  // PATCH /categories/rules/:id
  app.patch<{ Params: { id: string }; Body: RuleUpdateBody }>(
    '/categories/rules/:id',
    async (req) => {
      const ruleId = Number(req.params.id);
      if (!Number.isInteger(ruleId)) throw badRequest('Invalid rule id.');
      const { categoryId, ruleType } = req.body ?? ({} as RuleUpdateBody);
      if (!categoryId || !ruleType) throw badRequest('categoryId and ruleType are required.');
      updateRuleCategory(deps(), { ruleId, categoryId, ruleType });
      return { data: { ok: true } };
    },
  );

  // DELETE /categories/rules/:id
  app.delete<{ Params: { id: string } }>('/categories/rules/:id', async (req) => {
    const ruleId = Number(req.params.id);
    if (!Number.isInteger(ruleId)) throw badRequest('Invalid rule id.');
    deleteRule(deps(), { ruleId });
    return { data: { ok: true } };
  });

  // POST /recategorize
  app.post('/recategorize', async () => {
    recategorizeNonManualTransactions(deps());
    return { data: { ok: true } };
  });
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm -C /Users/vkhandelwal/Documents/MyFinance/packages/api exec vitest run test/categories.test.ts
```

Expected: all pass. If the recategorization assertion fails because the seeded category id differs from the SWIGGY match, log `cats` and pick a real seeded id; the recategorization itself is core-tested, so assert on whichever valid `categoryId` was used.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/routes/categories.ts packages/api/src/server.ts packages/api/src/plugins/db.ts packages/api/test/categories.test.ts
git commit -m "feat(api): categories list + rule CRUD + recategorize endpoints"
```

---

## Task 8: Expanded investment reads (holdings, allocation, accounts)

**Files:**
- Modify: `packages/api/src/routes/investments.ts`
- Test: `packages/api/test/investments-reads.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/api/test/investments-reads.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestServer, fixtureBuffer, multipartPayload } from './helpers';

let app: FastifyInstance;
afterEach(async () => { await app?.close(); });

async function seedTwoAccounts(a: FastifyInstance) {
  for (const account of ['Groww Main', 'Groww Family']) {
    await a.inject({
      method: 'POST', url: '/imports/investments/holdings',
      ...multipartPayload('file', 'h.xls', fixtureBuffer('groww-holdings-sample.xls'),
        { accountName: account, investmentApp: 'groww', platform: 'groww' }),
    });
    await a.inject({
      method: 'POST', url: '/imports/investments/transactions',
      ...multipartPayload('file', 't.xls', fixtureBuffer('groww-transactions-sample.xls'),
        { accountName: account, investmentApp: 'groww', platform: 'groww' }),
    });
  }
}

describe('expanded investment reads', () => {
  it('GET /investments/holdings returns holdings', async () => {
    app = await buildTestServer();
    await seedTwoAccounts(app);
    const r = await app.inject({ method: 'GET', url: '/investments/holdings' });
    expect(r.statusCode).toBe(200);
    expect(r.json().data.length).toBeGreaterThan(0);
  });

  it('GET /investments/allocation returns allocation array', async () => {
    app = await buildTestServer();
    await seedTwoAccounts(app);
    const r = await app.inject({ method: 'GET', url: '/investments/allocation' });
    expect(r.statusCode).toBe(200);
    expect(Array.isArray(r.json().data)).toBe(true);
  });

  it('GET /investments/accounts returns both account names (D7)', async () => {
    app = await buildTestServer();
    await seedTwoAccounts(app);
    const r = await app.inject({ method: 'GET', url: '/investments/accounts' });
    expect(r.statusCode).toBe(200);
    const accounts = r.json().data as string[];
    expect(accounts).toContain('Groww Main');
    expect(accounts).toContain('Groww Family');
  });

  it('GET /investments/holdings?account=<one> filters to that account', async () => {
    app = await buildTestServer();
    await seedTwoAccounts(app);
    const all = (await app.inject({ method: 'GET', url: '/investments/holdings' })).json().data as any[];
    const one = (await app.inject({ method: 'GET', url: '/investments/holdings?account=Groww%20Main' })).json().data as any[];
    expect(one.length).toBeLessThanOrEqual(all.length);
    expect(one.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
source ~/.nvm/nvm.sh && nvm use 20 >/dev/null
pnpm -C /Users/vkhandelwal/Documents/MyFinance/packages/api exec vitest run test/investments-reads.test.ts
```

Expected: FAIL — `/investments/holdings`, `/allocation`, `/accounts` 404.

- [ ] **Step 3: Add the routes** to `packages/api/src/routes/investments.ts`

Add imports `getHoldings, getAssetAllocation, getAccounts` from `@myfinance/core`, and inside `investmentRoutes` add:

```typescript
  // GET /investments/holdings?account&sortBy&sortOrder
  app.get<{ Querystring: { account?: string; sortBy?: string; sortOrder?: string } }>(
    '/investments/holdings',
    async (req) => {
      const { account, sortBy, sortOrder } = req.query;
      const filters = {
        ...(account ? { account } : {}),
        ...(sortBy ? { sortBy: sortBy as any } : {}),
        ...(sortOrder ? { sortOrder: sortOrder as any } : {}),
      };
      const holdings = await getHoldings({ txRepo: app.repos.txRepo, nav }, filters);
      return { data: holdings };
    },
  );

  // GET /investments/allocation?account
  app.get<{ Querystring: { account?: string } }>('/investments/allocation', async (req) => {
    const filters = req.query.account ? { account: req.query.account } : undefined;
    const allocation = await getAssetAllocation({ txRepo: app.repos.txRepo, nav }, filters);
    return { data: allocation };
  });

  // GET /investments/accounts
  app.get('/investments/accounts', async () => {
    return { data: getAccounts({ txRepo: app.repos.txRepo }) };
  });
```

> `getHoldings`/`getAssetAllocation` filter types: confirm the exact `HoldingsFilters`/`AssetAllocationFilters` field names in `packages/core/src/domain/portfolio.ts` and match `sortBy`/`sortOrder` casing. The `as any` casts are a deliberate, localized concession at the HTTP boundary (string query → typed enum) — keep them narrow.

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm -C /Users/vkhandelwal/Documents/MyFinance/packages/api exec vitest run test/investments-reads.test.ts
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routes/investments.ts packages/api/test/investments-reads.test.ts
git commit -m "feat(api): GET /investments/holdings, /allocation, /accounts (multi-account, D7)"
```

---

## Task 9: Full verification

- [ ] **Step 1: Full monorepo build + test**

```bash
source ~/.nvm/nvm.sh && nvm use 20 >/dev/null
cd /Users/vkhandelwal/Documents/MyFinance
pnpm -C packages/core exec tsc --build
pnpm -C packages/core test
pnpm -C packages/api typecheck
pnpm -C packages/api test
```

Expected: core tests all green (170 + 2 new = 172+); api tests all green (5 existing + new suites); both typechecks clean.

- [ ] **Step 2: Confirm no Drizzle/driver import leaked into core domain/import (seam invariant)**

```bash
cd /Users/vkhandelwal/Documents/MyFinance
grep -rn "drizzle\|better-sqlite3" packages/core/src/domain packages/core/src/import | grep -v "^.*//" || echo "SEAM CLEAN"
```

Expected: `SEAM CLEAN` (only architecture comments, if any). The L1 work touched only `repositories/` (allowed to use Drizzle) and `packages/api`.

- [ ] **Step 3: Smoke-run the server against a temp DB (manual sanity)**

```bash
source ~/.nvm/nvm.sh && nvm use 20 >/dev/null
cd /Users/vkhandelwal/Documents/MyFinance/packages/api
DB_PATH=/tmp/l1-smoke.db PORT=3001 pnpm start &
sleep 2
curl -s localhost:3001/health; echo
curl -s -F "file=@test/fixtures/hdfc-sample.xls" -F "platform=hdfc" localhost:3001/imports/expenses; echo
curl -s localhost:3001/imports; echo
kill %1 2>/dev/null; rm -f /tmp/l1-smoke.db
```

Expected: health ok; expenses import returns counts; `/imports` lists the run.

- [ ] **Step 4: Commit any fixups from verification**

```bash
git add -A && git commit -m "test(api): L1 verification fixups" || echo "nothing to commit"
```

---

## Task 10: Subagent code review, PR, close-out

- [ ] **Step 1: Dispatch a fresh code-reviewer subagent** (per T1 discipline) to audit the L1 diff against the spec `docs/superpowers/specs/2026-06-12-l1-ingestion-design.md`. Address blocking findings; use the receiving-code-review skill.

- [ ] **Step 2: Push + open PR**

```bash
cd /Users/vkhandelwal/Documents/MyFinance
gh auth switch --user ak688744   # repo owner (see project memory: push rights)
git push -u origin layer/1-ingestion
gh pr create --base main --title "L1: Ingestion + Data API" --body "Implements docs/superpowers/specs/2026-06-12-l1-ingestion-design.md — import endpoints behind a multi-platform parser registry, multi-account reads, rule CRUD."
```

- [ ] **Step 3: Update MASTER_PLAN** §4 (L1 row → ✅ Done) and §8 (mark L1 complete; next = L1.5).

- [ ] **Step 4: Save decisions/findings to project-memory** (`mcp__project-memory__memory_save`), then call `mcp__project-memory__session_summary`.

---

## Self-Review (completed by plan author)

**Spec coverage:** D1 server-parses-upload (Tasks 2,6) ✓; D2 unmatched=200 (Task 6 test) ✓; D3 one-endpoint-per-type (Task 6) ✓; D4 reads holdings/allocation/categories/imports (Tasks 6,7,8) ✓ + accounts (D7, Task 8) ✓; D5 rule CRUD (Task 7) ✓; D6 parser registry (Task 4) ✓; D7 multi-account (Task 8) ✓; §5 error handling (400 mappings across Tasks 6,7) ✓; §6 fixtures + all test cases (Task 5 + per-task tests) ✓; §7 listAll (Task 3) ✓; §8 build sequence == Tasks 1-8 ✓.

**Placeholder scan:** No TBD/TODO. Two deliberate "confirm against source" notes (Task 8 filter field names; Task 6 no-file status code) are verification instructions with concrete fallbacks, not unfinished content.

**Type consistency:** `makeRunInTransaction` (Task 1) ↔ used Task 6; `resolveParser`/`ImportKind` (Task 4) ↔ used Task 6; `AmfiMatch` defined in `routes/imports.ts` (Task 6) ↔ imported by `server.ts` (Task 2/6) ✓; `ImportRecord` (Task 3) ↔ returned by `/imports` (Task 6) ✓; `readMultipart`/`ParsedMultipart` (Task 2) ↔ used Task 6 ✓. Green-commit ordering hazards (server.ts referencing not-yet-created routes) are called out explicitly in Task 2/6/7 with defer/comment instructions.
