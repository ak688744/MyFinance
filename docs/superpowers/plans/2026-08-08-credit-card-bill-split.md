# Credit-Card Bill Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user upload a credit-card statement PDF from a detected CC-bill transaction and split that opaque bill row into individually-categorized child transactions, excluded-from-double-counting, reconciled against the statement's own total.

**Architecture:** One additive self-FK column (`parent_transaction_id`) carries the whole parent/child split relationship — no status columns (states derive from "has children"). Detection is read-only in the UI (existing `categoryId==='credit_card_bill'` or a `credit_card_bill` tag). PDF text is extracted with `pdfjs-dist` (optional password, never persisted) then sent to an LLM (`cc_statement_parse` task) via the existing `LlmGateway`, which returns signed line items + the statement's printed total. A new `POST /transactions/:id/split-from-statement` orchestrates parse → atomic child insert (auto-categorized via the frozen pure `resolveCategoryFromRules`) → reconciliation. `summary()` excludes any parent that has children.

**Tech Stack:** TypeScript monorepo (pnpm workspaces), Drizzle + better-sqlite3 (core), Fastify (api), Zod (agents), `pdfjs-dist` (new), Vitest, React 19 + TanStack Query + Tailwind (web), Mastra (agent-harness). Run via `tsx` (never compile).

## Global Constraints

- **Tier T2** (user override of T1): keep `packages/core/src/domain/categorize.ts` **byte-identical** and do not edit an existing validated parser. Calling the pure `resolveCategoryFromRules` is allowed; editing it is not.
- **Groww golden-master must stay 6/6 green** (standing guardrail) even though nothing financial is touched.
- **Node 22** — every command prefix: `source ~/.nvm/nvm.sh && nvm use 22`.
- **NEVER run bare `pnpm install`** (crashes on this machine). Install via: `node ~/.cache/node/corepack/v1/pnpm/10.4.1/dist/pnpm.cjs install --config.manage-package-manager-versions=false` (run from repo root). Build/test via `node_modules/.bin/{tsc,vitest}`.
- **Typecheck via `tsc --build`** (composite project refs) — graph order: core → agents → api → agent-harness → web. Build core FIRST.
- **Run via `tsx`**, never compile to dist.
- **Money/amount columns are REAL** (float) — L0 decision.
- **Migration numbering:** next is `0009` (0008 exists). Hand-write the `.sql` + a `_journal.json` entry (idx 8 exists → new idx is **8**? NO — journal idx values are 0-based and 0008 has idx 8; the new one is **idx 9**). Verify the last idx in `packages/core/drizzle/meta/_journal.json` and increment by 1.
- **Seam invariant:** no `drizzle`/`better-sqlite3` import in `core/domain`, `agents/src`, `agent-harness/src`, or `mcp/src`.
- **Worktree:** `.claude/worktrees/credit-card-split`, branch `feat/credit-card-bill-split`, based on `feat/agent-response-calibration` (carries Feature B: tags, expense agent, `tag_transaction`, migrations through 0008). Push via `gh auth switch --user ak688744`.
- **Commit after every task.** Never commit a secret/password.

---

## File Structure

**core (`packages/core/`)**
- `drizzle/0009_credit_card_split.sql` (create) — `ALTER TABLE transactions ADD COLUMN parent_transaction_id INTEGER REFERENCES transactions(id);` + index.
- `drizzle/meta/_journal.json` (modify) — append migration entry.
- `src/db/schema.ts` (modify) — add `parentTransactionId` column + `idxTransactionsParent` index.
- `src/data/starterCategories.ts` (modify) — add `credit_card_bill` starter category.
- `src/repositories/types.ts` (modify) — extend `ExpenseTransactionRepo` (`insertChild`, `listChildren`, `parentId` on `query`, `parentTransactionId` on `ExpenseTransactionRow`) + summary exclusion note.
- `src/repositories/expenseTransactionRepo.ts` (modify) — implement the above.

**agents (`packages/agents/`)**
- `src/tasks.ts` (modify) — add `cc_statement_parse` task.
- `src/ccStatement/schema.ts` (create) — Zod + JSON schema for the parse output.
- `src/ccStatement/prompt.ts` (create) — `buildCcStatementPrompt(text)`.
- `src/ccStatement/parseCcStatement.ts` (create) — `parseCcStatement(complete, text)` (retry-once, reconciliation-free; returns raw parsed payload).
- `src/index.ts` (modify) — export the new symbols.

**api (`packages/api/`)**
- `package.json` (modify) — add `pdfjs-dist`.
- `src/lib/pdfText.ts` (create) — `extractPdfText(buffer, password?)` + typed errors.
- `src/lib/ccSplit.ts` (create) — pure reconciliation helper `reconcile(lineItems, detectedTotal, parentAmount)`.
- `src/routes/transactions.ts` (modify) — add `POST /transactions/:id/split-from-statement`; extend signature to accept `{ gateway }`; add `parentId` passthrough on `GET /transactions` is NOT needed (list unchanged).
- `src/server.ts` (modify) — pass `gateway` to `transactionRoutes`.

**agent-harness (`packages/agent-harness/`)**
- `src/expenseAgent.ts` (modify) — one instruction line: tag CC bills `credit_card_bill`.

**web (`apps/web/src/`)**
- `types.ts` (modify) — `ExpenseRow.parentTransactionId`; new `SplitResult`/`SplitChild` types.
- `lib/hooks.ts` (modify) — `useSplitFromStatement`.
- `components/ui/icons.tsx` (modify) — `UploadIcon`.
- `features/expenses/SplitStatementModal.tsx` (create) — upload + password modal.
- `features/expenses/SplitPanel.tsx` (create) — inline reconciliation + line-item review.
- `features/expenses/ExpensesPage.tsx` (modify) — CC badge + upload button + container row + wire modal/panel.

---

## Task 0: Dependencies & migration scaffold

**Files:**
- Modify: `packages/api/package.json`
- Create: `packages/core/drizzle/0009_credit_card_split.sql`
- Modify: `packages/core/drizzle/meta/_journal.json`
- Modify: `packages/core/src/db/schema.ts`

**Interfaces:**
- Produces: `transactions.parent_transaction_id` column; Drizzle `transactions.parentTransactionId` field; `pdfjs-dist` installed.

- [ ] **Step 1: Add `pdfjs-dist` to api deps**

In `packages/api/package.json`, add to `dependencies` (alphabetical, after `@myfinance/core`):
```json
    "pdfjs-dist": "^4.7.76",
```

- [ ] **Step 2: Install**

Run from repo root:
```bash
source ~/.nvm/nvm.sh && nvm use 22 && node ~/.cache/node/corepack/v1/pnpm/10.4.1/dist/pnpm.cjs install --config.manage-package-manager-versions=false
```
Expected: install completes; `node_modules/pdfjs-dist` exists. If this exact command fails, STOP and report — do not try bare `pnpm install`.

- [ ] **Step 3: Verify pdfjs-dist imports under tsx (legacy build, no worker)**

Run:
```bash
cd packages/api && source ~/.nvm/nvm.sh && nvm use 22 && node_modules/.bin/tsx -e "import('pdfjs-dist/legacy/build/pdf.mjs').then(m=>console.log('OK', typeof m.getDocument))"
```
Expected: `OK function`. (We use the `legacy` build — no DOM/worker deps in Node. If the path differs, note the working import path; the rest of the plan references `pdfjs-dist/legacy/build/pdf.mjs`.)

- [ ] **Step 4: Write the migration SQL**

Check the last `idx` in `packages/core/drizzle/meta/_journal.json` (should be 8 for `0008_expense_insight_triage`). Create `packages/core/drizzle/0009_credit_card_split.sql`:
```sql
ALTER TABLE `transactions` ADD `parent_transaction_id` integer REFERENCES transactions(id);
--> statement-breakpoint
CREATE INDEX `idx_transactions_parent` ON `transactions` (`parent_transaction_id`);
```

- [ ] **Step 5: Append the journal entry**

In `packages/core/drizzle/meta/_journal.json`, append to the `entries` array (increment idx from the last one; use a `when` timestamp larger than the previous, e.g. `1785000000000`):
```json
    {
      "idx": 9,
      "version": "6",
      "when": 1785000000000,
      "tag": "0009_credit_card_split",
      "breakpoints": true
    }
```

- [ ] **Step 6: Add the column to schema.ts**

In `packages/core/src/db/schema.ts`, inside the `transactions` table columns (after `accountId`, before `dedupeKey`):
```ts
    parentTransactionId: integer('parent_transaction_id').references(
      (): any => transactions.id,
    ),
```
And add to the table's index block (in the `(table) => ({ ... })`):
```ts
    idxTransactionsParent: index('idx_transactions_parent').on(
      table.parentTransactionId,
    ),
```

- [ ] **Step 7: Build core to verify schema compiles + migration is discovered**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 && cd packages/core && node_modules/.bin/tsc --build 2>&1 | tail -20
```
Expected: no errors.

- [ ] **Step 8: Verify migration applies on a fresh in-memory DB**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 && cd packages/core && node_modules/.bin/tsx -e "import('./src/db/migrate.ts').then(async m => { const {sqlite}=m.runMigrations(':memory:'); const cols=sqlite.prepare('PRAGMA table_info(transactions)').all().map(c=>c.name); console.log('parent_transaction_id present:', cols.includes('parent_transaction_id')); sqlite.close(); })"
```
Expected: `parent_transaction_id present: true`. (If the migrate entrypoint differs, use the export the codebase provides — `runMigrations` from `@myfinance/core`.)

- [ ] **Step 9: Commit**

```bash
git add packages/api/package.json packages/core/drizzle packages/core/src/db/schema.ts pnpm-lock.yaml
git commit -m "feat(cc-split): add parent_transaction_id column + pdfjs-dist dep (migration 0009)"
```

---

## Task 1: Seed `credit_card_bill` category

**Files:**
- Modify: `packages/core/src/data/starterCategories.ts`
- Test: `packages/core/test/unit/seed.creditCard.test.ts`

**Interfaces:**
- Produces: a `credit_card_bill` row in `categories` after `seedDatabase`.

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/unit/seed.creditCard.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { runMigrations } from '../../src/db/migrate';
import { seedDatabase } from '../../src/db/seed';
import { makeCategoryRepo } from '../../src/repositories/categoryRepo';

describe('seed credit_card_bill category', () => {
  it('seeds a credit_card_bill starter category', () => {
    const { db, sqlite } = runMigrations(':memory:');
    seedDatabase(db);
    const ids = makeCategoryRepo(db).list().map((c) => c.id);
    expect(ids).toContain('credit_card_bill');
    sqlite.close();
  });
});
```
(If `runMigrations`/`makeCategoryRepo`/`seed` import paths differ, match the paths the existing `packages/core/test` files use — check a sibling test.)

- [ ] **Step 2: Run to verify it fails**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 && cd packages/core && node_modules/.bin/vitest run test/unit/seed.creditCard.test.ts 2>&1 | tail -15
```
Expected: FAIL (`credit_card_bill` not in ids).

- [ ] **Step 3: Add the starter category**

In `packages/core/src/data/starterCategories.ts`, add to the `starterCategories` array (after `transfer`):
```ts
  { id: 'credit_card_bill', name: 'Credit Card Bill', icon: '💳' },
```

- [ ] **Step 4: Run to verify it passes**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 && cd packages/core && node_modules/.bin/vitest run test/unit/seed.creditCard.test.ts 2>&1 | tail -15
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/data/starterCategories.ts packages/core/test/unit/seed.creditCard.test.ts
git commit -m "feat(cc-split): seed credit_card_bill starter category"
```

---

## Task 2: Repo — `insertChild`, `listChildren`, `parentTransactionId` on rows, `parentId` query filter

**Files:**
- Modify: `packages/core/src/repositories/types.ts`
- Modify: `packages/core/src/repositories/expenseTransactionRepo.ts`
- Test: `packages/core/test/unit/expenseTxRepo.children.test.ts`

**Interfaces:**
- Consumes: `ExpenseTransactionRepo` (existing).
- Produces:
  - `ExpenseTransactionRow` gains `parentTransactionId: number | null`.
  - `insertChild(parentId: number, tx: { transactionDate: string; description: string; amount: number; direction: 'debit' | 'credit'; categoryId: string | null; categorySource: string | null; accountId: number | null; }): number` — inserts a child, returns id, sets `sourceType='cc_statement'`, unique `dedupeKey`.
  - `listChildren(parentId: number): ExpenseTransactionRow[]`.
  - `query({ parentId })` filter (number) — returns only children of that parent.

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/unit/expenseTxRepo.children.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { runMigrations } from '../../src/db/migrate';
import { makeExpenseTransactionRepo } from '../../src/repositories/expenseTransactionRepo';

function setup() {
  const { db, sqlite } = runMigrations(':memory:');
  const repo = makeExpenseTransactionRepo(db);
  return { repo, sqlite };
}

describe('expenseTxRepo children (split)', () => {
  it('inserts children linked to a parent and lists them', () => {
    const { repo, sqlite } = setup();
    const parentId = repo.insertManual({
      transactionDate: '2026-06-15', description: 'HDFC CC PAYMENT',
      amount: 8000, direction: 'debit',
    });
    const c1 = repo.insertChild(parentId, {
      transactionDate: '2026-06-02', description: 'SWIGGY', amount: 500,
      direction: 'debit', categoryId: 'food', categorySource: 'manual', accountId: null,
    });
    const c2 = repo.insertChild(parentId, {
      transactionDate: '2026-06-05', description: 'REFUND AMAZON', amount: 200,
      direction: 'credit', categoryId: 'shopping', categorySource: 'manual', accountId: null,
    });
    expect(c1).toBeGreaterThan(0);
    expect(c2).toBeGreaterThan(0);

    const kids = repo.listChildren(parentId);
    expect(kids.map((k) => k.id).sort()).toEqual([c1, c2].sort());
    expect(kids.every((k) => k.parentTransactionId === parentId)).toBe(true);

    // parent row exposes parentTransactionId === null
    const page = repo.query({ from: '2026-06-01', to: '2026-06-30' });
    const parent = page.find((r) => r.id === parentId)!;
    expect(parent.parentTransactionId).toBeNull();

    // query parentId filter returns only children
    const filtered = repo.query({ parentId });
    expect(filtered.map((r) => r.id).sort()).toEqual([c1, c2].sort());
    sqlite.close();
  });

  it('gives each child a unique dedupe key (no collision)', () => {
    const { repo, sqlite } = setup();
    const parentId = repo.insertManual({ transactionDate: '2026-06-15', description: 'CC', amount: 100, direction: 'debit' });
    const a = repo.insertChild(parentId, { transactionDate: '2026-06-02', description: 'X', amount: 50, direction: 'debit', categoryId: null, categorySource: null, accountId: null });
    const b = repo.insertChild(parentId, { transactionDate: '2026-06-02', description: 'X', amount: 50, direction: 'debit', categoryId: null, categorySource: null, accountId: null });
    expect(a).not.toEqual(b);
    expect(repo.listChildren(parentId).length).toBe(2);
    sqlite.close();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 && cd packages/core && node_modules/.bin/vitest run test/unit/expenseTxRepo.children.test.ts 2>&1 | tail -20
```
Expected: FAIL (`insertChild is not a function`).

- [ ] **Step 3: Extend the repo interface**

In `packages/core/src/repositories/types.ts`:
- Add to `ExpenseTransactionRow`: `parentTransactionId: number | null;` (after `accountId`).
- Add `parentId?: number;` to the `query` filter object.
- Add to the `ExpenseTransactionRepo` interface (after `insertManual`):
```ts
  /**
   * Insert a split child transaction linked to `parentId`. sourceType='cc_statement',
   * self-generated unique dedupeKey. Used by the CC-bill split flow.
   */
  insertChild(parentId: number, tx: {
    transactionDate: string;
    description: string;
    amount: number;
    direction: 'debit' | 'credit';
    categoryId: string | null;
    categorySource: string | null;
    accountId: number | null;
  }): number;
  /** All child transactions of a split parent, ordered by transaction_date. */
  listChildren(parentId: number): ExpenseTransactionRow[];
```

- [ ] **Step 4: Implement in the repo**

In `packages/core/src/repositories/expenseTransactionRepo.ts`:
- Add `parentTransactionId: transactions.parentTransactionId,` to the `query()` select object (both the row select and, if separate, keep consistent). Ensure the returned row includes it.
- Add `parentId` handling in `query()` conds:
```ts
      if (filters.parentId !== undefined) conds.push(eq(transactions.parentTransactionId, filters.parentId));
```
- Implement `insertChild`:
```ts
    insertChild(parentId, tx) {
      const dedupeKey = `cc_${parentId}_${tx.transactionDate}_${tx.description}_${tx.amount}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const result = db.insert(transactions).values({
        transactionDate: tx.transactionDate,
        valueDate: null,
        referenceNumber: null,
        description: tx.description,
        normalizedDescription: tx.description.toLowerCase().trim(),
        merchantKey: null,
        upiNoteKeyword: null,
        amount: tx.amount,
        direction: tx.direction,
        categoryId: tx.categoryId,
        categorySource: tx.categorySource,
        aiKeyword: null,
        note: null,
        balance: null,
        sourceType: 'cc_statement',
        importHistoryId: null,
        dedupeKey,
        accountId: tx.accountId ?? null,
        parentTransactionId: parentId,
      }).run();
      return Number(result.lastInsertRowid);
    },
    listChildren(parentId) {
      const rows = db
        .select({
          id: transactions.id,
          transactionDate: transactions.transactionDate,
          description: transactions.description,
          amount: transactions.amount,
          direction: transactions.direction,
          categoryId: transactions.categoryId,
          categorySource: transactions.categorySource,
          aiKeyword: transactions.aiKeyword,
          note: transactions.note,
          tags: transactions.tags,
          accountId: transactions.accountId,
          balance: transactions.balance,
          parentTransactionId: transactions.parentTransactionId,
        })
        .from(transactions)
        .where(eq(transactions.parentTransactionId, parentId))
        .orderBy(asc(transactions.transactionDate), asc(transactions.id))
        .all();
      return rows.map((r) => ({ ...r, tags: parseTags(r.tags as string | null) }));
    },
```
Also add `parentTransactionId: transactions.parentTransactionId,` to the `query()` select so page rows carry it, and map it through the existing `rows.map`.

- [ ] **Step 5: Run to verify it passes**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 && cd packages/core && node_modules/.bin/vitest run test/unit/expenseTxRepo.children.test.ts 2>&1 | tail -20
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/repositories/types.ts packages/core/src/repositories/expenseTransactionRepo.ts packages/core/test/unit/expenseTxRepo.children.test.ts
git commit -m "feat(cc-split): repo insertChild/listChildren + parentId query + parentTransactionId on rows"
```

---

## Task 3: `summary()` excludes split parents

**Files:**
- Modify: `packages/core/src/repositories/expenseTransactionRepo.ts`
- Test: `packages/core/test/unit/expenseTxRepo.summaryExcludeParent.test.ts`

**Interfaces:**
- Consumes: `summary()` (existing), `insertChild` (Task 2).
- Produces: `summary()` no longer counts any transaction that has children.

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/unit/expenseTxRepo.summaryExcludeParent.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { runMigrations } from '../../src/db/migrate';
import { makeExpenseTransactionRepo } from '../../src/repositories/expenseTransactionRepo';

describe('summary excludes split parents', () => {
  it('counts children, not the parent bill, in totalSpent', () => {
    const { db, sqlite } = runMigrations(':memory:');
    const repo = makeExpenseTransactionRepo(db);
    const parentId = repo.insertManual({
      transactionDate: '2026-06-15', description: 'HDFC CC PAYMENT',
      amount: 8000, direction: 'debit',
    });
    repo.insertChild(parentId, { transactionDate: '2026-06-02', description: 'SWIGGY', amount: 500, direction: 'debit', categoryId: 'food', categorySource: 'manual', accountId: null });
    repo.insertChild(parentId, { transactionDate: '2026-06-05', description: 'AMAZON', amount: 1500, direction: 'debit', categoryId: 'shopping', categorySource: 'manual', accountId: null });

    const s = repo.summary({ from: '2026-06-01', to: '2026-06-30' });
    // parent (8000) excluded; children 500 + 1500 = 2000 counted
    expect(s.totalSpent).toBe(2000);
    const catIds = s.byCategory.map((c) => c.categoryId);
    expect(catIds).toContain('food');
    expect(catIds).toContain('shopping');
    sqlite.close();
  });

  it('leaves an unsplit bill in totals', () => {
    const { db, sqlite } = runMigrations(':memory:');
    const repo = makeExpenseTransactionRepo(db);
    repo.insertManual({ transactionDate: '2026-06-15', description: 'HDFC CC PAYMENT', amount: 8000, direction: 'debit' });
    const s = repo.summary({ from: '2026-06-01', to: '2026-06-30' });
    expect(s.totalSpent).toBe(8000);
    sqlite.close();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 && cd packages/core && node_modules/.bin/vitest run test/unit/expenseTxRepo.summaryExcludeParent.test.ts 2>&1 | tail -20
```
Expected: FAIL (first test: totalSpent is 10000, not 2000).

- [ ] **Step 3: Add the exclusion**

In `packages/core/src/repositories/expenseTransactionRepo.ts` `summary()`:
- Import `inArray` is not needed; build a "has children" exclusion using a correlated `NOT IN` via raw sql. Add a shared condition and append to BOTH `windowConds` (used by totalsRow) AND `spendConds` (used by byCategory/byMonth):
```ts
      // Exclude split PARENTS (rows that have at least one child) — their children
      // carry the real categorized spend, so counting the parent would double-count.
      const notParentCond = sql`${transactions.id} NOT IN (SELECT ${transactions.parentTransactionId} FROM ${transactions} WHERE ${transactions.parentTransactionId} IS NOT NULL)`;
```
Add `windowConds.push(notParentCond);` right after the window conds are built (before the totalsRow query), and `spendConds.push(notParentCond);` after `spendConds` is initialized. (`sql` is already imported in this file.)

- [ ] **Step 4: Run to verify it passes**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 && cd packages/core && node_modules/.bin/vitest run test/unit/expenseTxRepo.summaryExcludeParent.test.ts 2>&1 | tail -20
```
Expected: PASS (both tests).

- [ ] **Step 5: Run the full core suite + Groww guardrail**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 && cd packages/core && node_modules/.bin/vitest run 2>&1 | tail -20
```
Expected: all green, including the Groww golden-master (6/6). If any pre-existing summary test breaks, reconcile — the exclusion must not change totals when there are no children.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/repositories/expenseTransactionRepo.ts packages/core/test/unit/expenseTxRepo.summaryExcludeParent.test.ts
git commit -m "feat(cc-split): exclude split parents from expense summary"
```

---

## Task 4: agents — `cc_statement_parse` task + `parseCcStatement`

**Files:**
- Modify: `packages/agents/src/tasks.ts`
- Create: `packages/agents/src/ccStatement/schema.ts`
- Create: `packages/agents/src/ccStatement/prompt.ts`
- Create: `packages/agents/src/ccStatement/parseCcStatement.ts`
- Modify: `packages/agents/src/index.ts`
- Test: `packages/agents/test/parseCcStatement.test.ts`

**Interfaces:**
- Consumes: `CompleteFn` from `../gateway` (`(input: { prompt: string; jsonSchema: object }) => Promise<{ text: string; usage?: LlmUsage }>`).
- Produces:
  - `CcLineItem = { date: string; merchant: string; amount: number }` (amount signed: purchases positive, refunds negative).
  - `CcStatementParse = { lineItems: CcLineItem[]; detectedTotal: number | null }`.
  - `parseCcStatement(complete: CompleteFn, statementText: string): Promise<CcStatementParse>` — one retry on bad JSON, throws `LlmError` on auth/provider_not_configured, throws a plain Error `'cc_parse_failed'` if still unparseable after retry.

- [ ] **Step 1: Write the failing test**

Create `packages/agents/test/parseCcStatement.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseCcStatement } from '../src/ccStatement/parseCcStatement';
import { LlmError } from '../src/llm/types';

const good = JSON.stringify({
  lineItems: [
    { date: '2026-06-02', merchant: 'SWIGGY', amount: 500 },
    { date: '2026-06-05', merchant: 'AMAZON REFUND', amount: -200 },
  ],
  detectedTotal: 300,
});

describe('parseCcStatement', () => {
  it('returns validated line items (signed) + detectedTotal', async () => {
    const complete = async () => ({ text: good, usage: { inputTokens: 1, outputTokens: 1 } });
    const out = await parseCcStatement(complete, 'STATEMENT TEXT');
    expect(out.lineItems).toHaveLength(2);
    expect(out.lineItems[1].amount).toBe(-200);
    expect(out.detectedTotal).toBe(300);
  });

  it('retries once on bad JSON then succeeds', async () => {
    let n = 0;
    const complete = async () => { n += 1; return { text: n === 1 ? 'not json' : good }; };
    const out = await parseCcStatement(complete, 'x');
    expect(n).toBe(2);
    expect(out.lineItems).toHaveLength(2);
  });

  it('throws cc_parse_failed after retry still bad', async () => {
    const complete = async () => ({ text: '{bad' });
    await expect(parseCcStatement(complete, 'x')).rejects.toThrow('cc_parse_failed');
  });

  it('rethrows auth LlmError without retrying', async () => {
    const complete = async () => { throw new LlmError('auth', 'bad key'); };
    await expect(parseCcStatement(complete, 'x')).rejects.toBeInstanceOf(LlmError);
  });

  it('accepts detectedTotal null', async () => {
    const complete = async () => ({ text: JSON.stringify({ lineItems: [{ date: '2026-06-02', merchant: 'X', amount: 10 }], detectedTotal: null }) });
    const out = await parseCcStatement(complete, 'x');
    expect(out.detectedTotal).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 && cd packages/agents && node_modules/.bin/vitest run test/parseCcStatement.test.ts 2>&1 | tail -15
```
Expected: FAIL (module not found).

- [ ] **Step 3: Create the schema**

Create `packages/agents/src/ccStatement/schema.ts`:
```ts
import { z } from 'zod';

export const CcLineItemSchema = z.object({
  date: z.string(),
  merchant: z.string(),
  amount: z.number(), // signed: purchases/fees/interest positive, refunds negative
});

export const CcStatementParseSchema = z.object({
  lineItems: z.array(CcLineItemSchema),
  detectedTotal: z.number().nullable(),
});

export type CcLineItem = z.infer<typeof CcLineItemSchema>;
export type CcStatementParse = z.infer<typeof CcStatementParseSchema>;

// JSON schema handed to the provider's structured-output mode.
export const CC_STATEMENT_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    lineItems: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          date: { type: 'string' },
          merchant: { type: 'string' },
          amount: { type: 'number' },
        },
        required: ['date', 'merchant', 'amount'],
      },
    },
    detectedTotal: { type: ['number', 'null'] },
  },
  required: ['lineItems', 'detectedTotal'],
} as const;
```

- [ ] **Step 4: Create the prompt**

Create `packages/agents/src/ccStatement/prompt.ts`:
```ts
export function buildCcStatementPrompt(statementText: string): string {
  return [
    'You are extracting the spend line items from a credit-card statement.',
    'Return STRICT JSON matching the schema: { "lineItems": [{ "date": "YYYY-MM-DD", "merchant": string, "amount": number }], "detectedTotal": number | null }.',
    'RULES:',
    '- Include every PURCHASE, fee, and interest charge as a line item with a POSITIVE amount.',
    '- Include REFUNDS / reversals / cashbacks as line items with a NEGATIVE amount (they reduce spend).',
    '- EXCLUDE any "payment received" / "previous bill payment" line (money paying off the last bill) — that is not this cycle\'s spend.',
    '- date is the transaction date in YYYY-MM-DD. If the year is absent, infer it from the statement period.',
    '- merchant is a short human-readable name.',
    '- detectedTotal = the statement\'s own printed total of NEW debits / total purchases for this cycle. If you cannot find a printed total, use null.',
    '- Output ONLY the JSON object. No prose, no markdown fences.',
    '',
    'STATEMENT TEXT:',
    statementText,
  ].join('\n');
}
```

- [ ] **Step 5: Create parseCcStatement**

Create `packages/agents/src/ccStatement/parseCcStatement.ts`:
```ts
import { LlmError, type LlmUsage } from '../llm/types';
import { CcStatementParseSchema, CC_STATEMENT_RESPONSE_SCHEMA, type CcStatementParse } from './schema';
import { buildCcStatementPrompt } from './prompt';

export type CompleteFn = (input: { prompt: string; jsonSchema: object }) => Promise<{ text: string; usage?: LlmUsage }>;

function parse(text: string): CcStatementParse | null {
  let json: unknown;
  try { json = JSON.parse(text); } catch { return null; }
  const r = CcStatementParseSchema.safeParse(json);
  return r.success ? r.data : null;
}

export async function parseCcStatement(complete: CompleteFn, statementText: string): Promise<CcStatementParse> {
  const prompt = buildCcStatementPrompt(statementText);
  let out: CcStatementParse | null = null;
  for (let attempt = 0; attempt < 2 && out === null; attempt += 1) {
    try {
      const res = await complete({ prompt, jsonSchema: CC_STATEMENT_RESPONSE_SCHEMA });
      out = parse(res.text);
    } catch (e) {
      if (e instanceof LlmError && (e.kind === 'auth' || e.kind === 'provider_not_configured')) throw e;
      out = null; // transient / unknown → retry once
    }
  }
  if (out === null) throw new Error('cc_parse_failed');
  return out;
}
```

- [ ] **Step 6: Register the task + exports**

In `packages/agents/src/tasks.ts`, add to `AI_TASKS` (after `wealth_chat`):
```ts
  cc_statement_parse: {
    label: 'Credit-Card Statement Parse',
    description: 'Extract itemized line items from an uploaded credit-card statement PDF',
    defaultDialect: 'gemini',
  },
```
In `packages/agents/src/index.ts`, add:
```ts
export { parseCcStatement } from './ccStatement/parseCcStatement';
export { type CcLineItem, type CcStatementParse, CcStatementParseSchema } from './ccStatement/schema';
```

- [ ] **Step 7: Run to verify it passes**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 && cd packages/agents && node_modules/.bin/vitest run test/parseCcStatement.test.ts 2>&1 | tail -15
```
Expected: PASS (all 5).

- [ ] **Step 8: Typecheck agents**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 && cd packages/core && node_modules/.bin/tsc --build && cd ../agents && node_modules/.bin/tsc --build 2>&1 | tail -15
```
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add packages/agents/src/ccStatement packages/agents/src/tasks.ts packages/agents/src/index.ts packages/agents/test/parseCcStatement.test.ts
git commit -m "feat(cc-split): cc_statement_parse task + parseCcStatement (signed items, statement total)"
```

---

## Task 5: api — `pdfText.ts` (extraction + password + typed errors)

**Files:**
- Create: `packages/api/src/lib/pdfText.ts`
- Test: `packages/api/test/pdfText.test.ts`
- Create (test fixtures): `packages/api/test/fixtures/makePdf.ts` (tiny PDF generator) OR commit a small fixture.

**Interfaces:**
- Produces:
  - `class PdfPasswordRequiredError extends Error` (`name='PdfPasswordRequiredError'`).
  - `class PdfPasswordIncorrectError extends Error` (`name='PdfPasswordIncorrectError'`).
  - `extractPdfText(buffer: ArrayBuffer, password?: string): Promise<string>` — throws the above for encrypted/wrong-password; throws a generic `Error('pdf_extract_failed')` otherwise; never logs the password.

- [ ] **Step 1: Create a tiny PDF fixture generator**

Create `packages/api/test/fixtures/makePdf.ts` — build minimal PDFs in-memory (unencrypted, and password-protected) so tests are self-contained. Use `pdf-lib` if already available; otherwise hand-craft a minimal PDF. Simplest robust path: use `pdfjs-dist` only for READING; for WRITING a fixture, hand-write a minimal single-page PDF with the text "SWIGGY 500". If encryption is hard to fixture, gate the encrypted-path tests on a committed fixture instead:
```ts
// Minimal uncompressed single-page PDF containing the literal text "SWIGGY 500".
export function makeSimplePdf(text = 'SWIGGY 500'): ArrayBuffer {
  const content = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objs: string[] = [];
  objs.push('<< /Type /Catalog /Pages 2 0 R >>');
  objs.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  objs.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>');
  objs.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xrefPos = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((off) => { pdf += `${String(off).padStart(10, '0')} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return new TextEncoder().encode(pdf).buffer as ArrayBuffer;
}
```
NOTE for implementer: if `pdfjs-dist` cannot extract text from this hand-rolled PDF reliably, install `pdf-lib` (add to api devDeps via the documented install command) and generate the fixture with it instead — adjust the test accordingly. The REAL requirement is: an unencrypted PDF whose text contains `SWIGGY 500`, and (for the encrypted tests) a password-protected PDF. Encrypted-PDF fixturing is the hard part — if generating one in-code is impractical, commit a tiny pre-made password-protected PDF (`password: test123`) under `test/fixtures/encrypted.pdf` and load it with `fs.readFileSync`.

- [ ] **Step 2: Write the failing test**

Create `packages/api/test/pdfText.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { extractPdfText, PdfPasswordRequiredError, PdfPasswordIncorrectError } from '../src/lib/pdfText';
import { makeSimplePdf } from './fixtures/makePdf';

describe('extractPdfText', () => {
  it('extracts text from an unencrypted PDF', async () => {
    const text = await extractPdfText(makeSimplePdf('SWIGGY 500'));
    expect(text).toContain('SWIGGY');
  });

  it('throws PdfPasswordRequiredError on an encrypted PDF with no password', async () => {
    // Uses committed fixture test/fixtures/encrypted.pdf (password: test123)
    const fs = await import('node:fs');
    const path = new URL('./fixtures/encrypted.pdf', import.meta.url);
    if (!fs.existsSync(path)) return; // fixture optional; skip if absent
    const buf = fs.readFileSync(path);
    await expect(extractPdfText(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer))
      .rejects.toBeInstanceOf(PdfPasswordRequiredError);
  });

  it('throws PdfPasswordIncorrectError on wrong password', async () => {
    const fs = await import('node:fs');
    const path = new URL('./fixtures/encrypted.pdf', import.meta.url);
    if (!fs.existsSync(path)) return;
    const buf = fs.readFileSync(path);
    await expect(extractPdfText(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, 'wrongpw'))
      .rejects.toBeInstanceOf(PdfPasswordIncorrectError);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 && cd packages/api && node_modules/.bin/vitest run test/pdfText.test.ts 2>&1 | tail -20
```
Expected: FAIL (module not found).

- [ ] **Step 4: Implement pdfText.ts**

Create `packages/api/src/lib/pdfText.ts`:
```ts
// PDF → text extraction, isolated so the pdfjs dependency stays in one place.
// The password is a function argument ONLY — it is never persisted or logged.
import { getDocument, PasswordResponses } from 'pdfjs-dist/legacy/build/pdf.mjs';

export class PdfPasswordRequiredError extends Error {
  constructor(msg = 'PDF is password protected') { super(msg); this.name = 'PdfPasswordRequiredError'; }
}
export class PdfPasswordIncorrectError extends Error {
  constructor(msg = 'Incorrect PDF password') { super(msg); this.name = 'PdfPasswordIncorrectError'; }
}

export async function extractPdfText(buffer: ArrayBuffer, password?: string): Promise<string> {
  const data = new Uint8Array(buffer);
  const loadingTask = getDocument({
    data,
    password,
    // pdfjs will call this when the doc is encrypted / the password is wrong.
    // reason 1 = NEED_PASSWORD, 2 = INCORRECT_PASSWORD (PasswordResponses).
    isEvalSupported: false,
  } as any);

  // pdfjs surfaces password state via a callback on the loading task.
  (loadingTask as any).onPassword = (_updatePassword: (pw: string) => void, reason: number) => {
    if (reason === PasswordResponses.NEED_PASSWORD) {
      loadingTask.destroy();
      throw new PdfPasswordRequiredError();
    }
    if (reason === PasswordResponses.INCORRECT_PASSWORD) {
      loadingTask.destroy();
      throw new PdfPasswordIncorrectError();
    }
  };

  let doc;
  try {
    doc = await loadingTask.promise;
  } catch (e) {
    if (e instanceof PdfPasswordRequiredError || e instanceof PdfPasswordIncorrectError) throw e;
    const name = (e as any)?.name;
    if (name === 'PasswordException') {
      const code = (e as any)?.code;
      if (code === PasswordResponses.INCORRECT_PASSWORD) throw new PdfPasswordIncorrectError();
      throw new PdfPasswordRequiredError();
    }
    throw new Error('pdf_extract_failed');
  }

  const parts: string[] = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    parts.push(content.items.map((it: any) => (typeof it.str === 'string' ? it.str : '')).join(' '));
  }
  await doc.destroy();
  return parts.join('\n');
}
```
NOTE: pdfjs's password handling API can surface EITHER via the `onPassword` callback OR a thrown `PasswordException` depending on version — the code handles both. The implementer should confirm which fires for our pinned version during Step 5 and keep whichever branch works (leave both — they're harmless).

- [ ] **Step 5: Run to verify it passes**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 && cd packages/api && node_modules/.bin/vitest run test/pdfText.test.ts 2>&1 | tail -25
```
Expected: unencrypted test PASS; encrypted tests PASS if a fixture is present (else skipped). If the hand-rolled PDF doesn't extract, switch to `pdf-lib`-generated fixture per Step 1's note.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/lib/pdfText.ts packages/api/test/pdfText.test.ts packages/api/test/fixtures/
git commit -m "feat(cc-split): pdfText extraction with optional password + typed errors"
```

---

## Task 6: api — pure reconciliation helper `ccSplit.ts`

**Files:**
- Create: `packages/api/src/lib/ccSplit.ts`
- Test: `packages/api/test/ccSplit.test.ts`

**Interfaces:**
- Consumes: `CcLineItem`, `CcStatementParse` from `@myfinance/agents`.
- Produces:
```ts
type Reconciliation = {
  parsedTotal: number;      // signed sum of line items
  detectedTotal: number | null;
  matched: boolean;
  reconciledAgainst: 'statementTotal' | 'billAmount';
  carryover: number;        // parentAmount - (detectedTotal ?? parsedTotal)
};
reconcile(lineItems: CcLineItem[], detectedTotal: number | null, parentAmount: number): Reconciliation
```

- [ ] **Step 1: Write the failing test**

Create `packages/api/test/ccSplit.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { reconcile } from '../src/lib/ccSplit';

const items = (amts: number[]) => amts.map((a, i) => ({ date: '2026-06-0' + (i + 1), merchant: 'M' + i, amount: a }));

describe('reconcile', () => {
  it('matches against statement total when parsedTotal ~= detectedTotal', () => {
    const r = reconcile(items([500, -200, 1000]), 1300, 8000);
    expect(r.parsedTotal).toBe(1300);
    expect(r.matched).toBe(true);
    expect(r.reconciledAgainst).toBe('statementTotal');
    expect(r.carryover).toBe(8000 - 1300);
  });

  it('is unmatched when parsed != statement total', () => {
    const r = reconcile(items([500]), 1300, 8000);
    expect(r.matched).toBe(false);
    expect(r.reconciledAgainst).toBe('statementTotal');
  });

  it('falls back to bill amount when detectedTotal is null', () => {
    const r = reconcile(items([8000]), null, 8000);
    expect(r.reconciledAgainst).toBe('billAmount');
    expect(r.matched).toBe(true);
    expect(r.carryover).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 && cd packages/api && node_modules/.bin/vitest run test/ccSplit.test.ts 2>&1 | tail -15
```
Expected: FAIL (module not found).

- [ ] **Step 3: Implement ccSplit.ts**

Create `packages/api/src/lib/ccSplit.ts`:
```ts
import type { CcLineItem } from '@myfinance/agents';

export type Reconciliation = {
  parsedTotal: number;
  detectedTotal: number | null;
  matched: boolean;
  reconciledAgainst: 'statementTotal' | 'billAmount';
  carryover: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function reconcile(lineItems: CcLineItem[], detectedTotal: number | null, parentAmount: number): Reconciliation {
  const parsedTotal = round2(lineItems.reduce((s, li) => s + li.amount, 0));
  const target = detectedTotal ?? parentAmount;
  const reconciledAgainst = detectedTotal !== null ? 'statementTotal' : 'billAmount';
  const matched = Math.abs(parsedTotal - target) < 1;
  const carryover = round2(parentAmount - (detectedTotal ?? parsedTotal));
  return { parsedTotal, detectedTotal, matched, reconciledAgainst, carryover };
}
```

- [ ] **Step 4: Run to verify it passes**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 && cd packages/api && node_modules/.bin/vitest run test/ccSplit.test.ts 2>&1 | tail -15
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/lib/ccSplit.ts packages/api/test/ccSplit.test.ts
git commit -m "feat(cc-split): pure reconciliation helper (statement-total vs bill fallback)"
```

---

## Task 7: api — `POST /transactions/:id/split-from-statement`

**Files:**
- Modify: `packages/api/src/routes/transactions.ts`
- Modify: `packages/api/src/server.ts`
- Test: `packages/api/test/splitFromStatement.test.ts`

**Interfaces:**
- Consumes: `extractPdfText` (Task 5), `parseCcStatement` (Task 4), `reconcile` (Task 6), `insertChild`/`listChildren`/`getById` (repo), `runInTransaction` (`makeRunInTransaction(app.sqlite)`), the injected `gateway` (`runTask(task, fn(complete))`), core `resolveCategoryFromRules` + `createCategorizationInput`, `categoryRuleRepo.getActiveRules()`.
- Produces: `POST /transactions/:id/split-from-statement` returning `{ data: { parentId, parentAmount, detectedTotal, parsedTotal, matched, reconciledAgainst, carryover, children } }`.

- [ ] **Step 1: Write the failing test**

Create `packages/api/test/splitFromStatement.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildServer } from '../src/server';
import type { Gateway } from '../src/plugins/gateway';

// Fake gateway: runTask hands the fn a `complete` that returns canned statement JSON.
function fakeGateway(json: string): Gateway {
  return {
    async runTask<T>(_task: string, fn: (complete: any) => Promise<T>): Promise<T> {
      const complete = async () => ({ text: json, usage: { inputTokens: 1, outputTokens: 1 } });
      return fn(complete);
    },
  } as unknown as Gateway;
}

// Minimal multipart body builder.
function multipart(fields: Record<string, string>, file?: { name: string; content: Buffer }) {
  const boundary = '----t' + Math.random().toString(16).slice(2);
  const chunks: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  }
  if (file) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: application/pdf\r\n\r\n`));
    chunks.push(file.content);
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(chunks), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

const statement = JSON.stringify({
  lineItems: [
    { date: '2026-06-02', merchant: 'SWIGGY', amount: 500 },
    { date: '2026-06-05', merchant: 'AMAZON', amount: 1500 },
  ],
  detectedTotal: 2000,
});

describe('POST /transactions/:id/split-from-statement', () => {
  it('splits a bill into categorized children and reconciles', async () => {
    const app = await buildServer({ dbPath: ':memory:', gateway: fakeGateway(statement) });
    // Insert a parent CC bill via the manual endpoint.
    const created = await app.inject({ method: 'POST', url: '/transactions', payload: { transactionDate: '2026-06-15', description: 'HDFC CC PAYMENT', amount: 8000, direction: 'debit', categoryId: 'credit_card_bill' } });
    const parentId = created.json().data.id;

    // Split it. We stub extractPdfText by uploading any bytes — the fake gateway
    // ignores the text. (extractPdfText must still succeed on the uploaded bytes:
    // upload a real minimal PDF from the fixture.)
    const { makeSimplePdf } = await import('./fixtures/makePdf');
    const pdf = Buffer.from(new Uint8Array(makeSimplePdf('anything')));
    const mp = multipart({}, { name: 'stmt.pdf', content: pdf });
    const res = await app.inject({ method: 'POST', url: `/transactions/${parentId}/split-from-statement`, payload: mp.payload, headers: mp.headers });
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    expect(d.children).toHaveLength(2);
    expect(d.parsedTotal).toBe(2000);
    expect(d.matched).toBe(true);
    expect(d.carryover).toBe(6000);

    // Summary now counts children (2000), not the 8000 parent.
    const sum = await app.inject({ method: 'GET', url: '/expenses/summary?from=2026-06-01&to=2026-06-30' });
    expect(sum.json().data.totalSpent).toBe(2000);
    await app.close();
  });

  it('404 when the parent does not exist', async () => {
    const app = await buildServer({ dbPath: ':memory:', gateway: fakeGateway(statement) });
    const { makeSimplePdf } = await import('./fixtures/makePdf');
    const pdf = Buffer.from(new Uint8Array(makeSimplePdf('x')));
    const mp = multipart({}, { name: 'stmt.pdf', content: pdf });
    const res = await app.inject({ method: 'POST', url: '/transactions/99999/split-from-statement', payload: mp.payload, headers: mp.headers });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('409 when the parent is already split', async () => {
    const app = await buildServer({ dbPath: ':memory:', gateway: fakeGateway(statement) });
    const created = await app.inject({ method: 'POST', url: '/transactions', payload: { transactionDate: '2026-06-15', description: 'CC', amount: 8000, direction: 'debit' } });
    const parentId = created.json().data.id;
    const { makeSimplePdf } = await import('./fixtures/makePdf');
    const pdf = Buffer.from(new Uint8Array(makeSimplePdf('x')));
    const first = await app.inject({ method: 'POST', url: `/transactions/${parentId}/split-from-statement`, payload: multipart({}, { name: 'a.pdf', content: pdf }).payload, headers: multipart({}, { name: 'a.pdf', content: pdf }).headers });
    expect(first.statusCode).toBe(200);
    const second = await app.inject({ method: 'POST', url: `/transactions/${parentId}/split-from-statement`, payload: multipart({}, { name: 'a.pdf', content: pdf }).payload, headers: multipart({}, { name: 'a.pdf', content: pdf }).headers });
    expect(second.statusCode).toBe(409);
    await app.close();
  });

  it('400 when no file is uploaded', async () => {
    const app = await buildServer({ dbPath: ':memory:', gateway: fakeGateway(statement) });
    const created = await app.inject({ method: 'POST', url: '/transactions', payload: { transactionDate: '2026-06-15', description: 'CC', amount: 8000, direction: 'debit' } });
    const parentId = created.json().data.id;
    const mp = multipart({ password: 'x' });
    const res = await app.inject({ method: 'POST', url: `/transactions/${parentId}/split-from-statement`, payload: mp.payload, headers: mp.headers });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
```
NOTE: the 200-path test relies on `extractPdfText` succeeding on the uploaded PDF. If `makeSimplePdf` bytes don't parse, use the same fixture strategy chosen in Task 5.

- [ ] **Step 2: Run to verify it fails**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 && cd packages/api && node_modules/.bin/vitest run test/splitFromStatement.test.ts 2>&1 | tail -25
```
Expected: FAIL (route 404 / not registered).

- [ ] **Step 3: Extend the route signature + wiring**

In `packages/api/src/server.ts`, change:
```ts
  await app.register(transactionRoutes);
```
to:
```ts
  await app.register(transactionRoutes, { gateway });
```

In `packages/api/src/routes/transactions.ts`, change the function signature:
```ts
import type { Gateway } from '../plugins/gateway';
import { makeRunInTransaction } from '../plugins/txRunner';
import { readMultipart } from '../lib/multipart';
import { extractPdfText, PdfPasswordRequiredError, PdfPasswordIncorrectError } from '../lib/pdfText';
import { reconcile } from '../lib/ccSplit';
import { parseCcStatement } from '@myfinance/agents';
import { resolveCategoryFromRules, createCategorizationInput, LlmError } from '@myfinance/core';
// ...
export async function transactionRoutes(app: FastifyInstance, opts: { gateway: Gateway }): Promise<void> {
```
(Confirm `LlmError` is exported from `@myfinance/core`; if not, import from `@myfinance/agents`. `resolveCategoryFromRules`/`createCategorizationInput` are exported from core.)

- [ ] **Step 4: Implement the endpoint**

Add inside `transactionRoutes` (after the tags routes):
```ts
  const runInTransaction = makeRunInTransaction(app.sqlite);

  // POST /transactions/:id/split-from-statement — upload a CC statement PDF, parse it
  // via the LLM, and create categorized child transactions under this bill. The
  // password (optional multipart field) is used only to open the PDF; never stored.
  app.post<{ Params: { id: string } }>('/transactions/:id/split-from-statement', async (req, reply) => {
    const parentId = Number(req.params.id);
    if (!Number.isInteger(parentId)) throw badRequest('Invalid transaction id.');

    const parent = app.repos.expenseTxRepo.getById(parentId);
    if (!parent) throw notFound('Transaction not found.');

    // Read parent amount/account from a full row (getById returns only id+description).
    const parentRow = app.repos.expenseTxRepo.query({ parentId: undefined }).find((r) => r.id === parentId)
      ?? app.repos.expenseTxRepo.listChildren(parentId); // placeholder guard
    // Simpler: fetch via a small dedicated read — use query with a wide window is unreliable.
    // Use the sqlite handle through the repo: add amount+accountId to getById is out of scope,
    // so read the row directly here:
    const full = app.repos.expenseTxRepo.query({}).find((r) => r.id === parentId);
    const parentAmount = full?.amount ?? 0;
    const parentAccountId = full?.accountId ?? null;

    if (app.repos.expenseTxRepo.listChildren(parentId).length > 0) {
      const err = new Error('This transaction is already split.') as Error & { statusCode?: number };
      err.statusCode = 409;
      throw err;
    }

    const mp = await readMultipart(req);
    if (!mp.file) throw badRequest('Missing file upload (field "file").');
    const password = mp.fields.password?.trim() || undefined;

    let text: string;
    try {
      text = await extractPdfText(mp.file.buffer, password);
    } catch (e) {
      if (e instanceof PdfPasswordRequiredError) throw badRequest('This statement is password-protected. Enter the PDF password and try again.');
      if (e instanceof PdfPasswordIncorrectError) throw badRequest("Couldn't open the PDF — the password may be incorrect.");
      throw badRequest("Couldn't read the PDF file.");
    }

    let parsed;
    try {
      parsed = await opts.gateway.runTask('cc_statement_parse', (complete) => parseCcStatement(complete, text));
    } catch (e) {
      if (e instanceof LlmError && (e.kind === 'auth')) { const err = new Error('AI provider auth failed.') as Error & { statusCode?: number }; err.statusCode = 502; throw err; }
      if (e instanceof LlmError && e.kind === 'provider_not_configured') throw badRequest('No AI model is configured for statement parsing. Set it in AI Settings.');
      throw badRequest("Couldn't read line items from this statement.");
    }

    if (!parsed.lineItems.length) throw badRequest("Couldn't read line items from this statement.");

    const rules = app.repos.categoryRuleRepo.getActiveRules();
    const children = runInTransaction(() => {
      const created: { id: number }[] = [];
      for (const li of parsed.lineItems) {
        const direction: 'debit' | 'credit' = li.amount < 0 ? 'credit' : 'debit';
        const res = resolveCategoryFromRules(createCategorizationInput(li.merchant), rules);
        const id = app.repos.expenseTxRepo.insertChild(parentId, {
          transactionDate: li.date,
          description: li.merchant,
          amount: Math.abs(li.amount),
          direction,
          categoryId: res.categoryId,
          categorySource: res.categorySource,
          accountId: parentAccountId,
        });
        created.push({ id });
      }
      return created;
    });

    const rec = reconcile(parsed.lineItems, parsed.detectedTotal, parentAmount);
    return reply.send({
      data: {
        parentId,
        parentAmount,
        detectedTotal: rec.detectedTotal,
        parsedTotal: rec.parsedTotal,
        matched: rec.matched,
        reconciledAgainst: rec.reconciledAgainst,
        carryover: rec.carryover,
        children: app.repos.expenseTxRepo.listChildren(parentId),
      },
    });
  });
```
CLEANUP for implementer: the `parentRow`/placeholder lines above are illustrative of the problem that `getById` returns only `{id,description}`. Replace that block with a clean read of the parent's `amount` + `accountId`. Preferred: extend `getById` is out of T2 scope for categorize; instead add a tiny repo method `getFullById(id)` returning the full `ExpenseTransactionRow | null`, OR reuse `query({})` filtered in JS. **Decision: add `getFullById(id): ExpenseTransactionRow | null` to the repo** (mirrors `query` select, single-row) — do this in Task 2 if revisiting, else inline here. Keep the final implementation to a single clean parent read; delete the placeholder comments.

- [ ] **Step 5: (If needed) add `getFullById` to the repo**

If you chose `getFullById`, add to `types.ts` interface and implement in `expenseTransactionRepo.ts`:
```ts
    getFullById(id) {
      const rows = this.query({}); // small DBs; or write a dedicated single-row select
      return rows.find((r) => r.id === id) ?? null;
    },
```
Prefer a dedicated single-row `select(...).where(eq(transactions.id,id)).get()` mapping the same columns as `query()` for efficiency. Add a one-line unit test in `expenseTxRepo.children.test.ts` asserting it returns `amount`+`accountId`.

- [ ] **Step 6: Run to verify it passes**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 && cd packages/core && node_modules/.bin/tsc --build && cd ../agents && node_modules/.bin/tsc --build && cd ../api && node_modules/.bin/vitest run test/splitFromStatement.test.ts 2>&1 | tail -30
```
Expected: PASS (all 4 cases). If the 200 test fails only on PDF extraction, apply the Task-5 fixture fallback.

- [ ] **Step 7: Run full api suite**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 && cd packages/api && node_modules/.bin/vitest run 2>&1 | tail -20
```
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add packages/api/src/routes/transactions.ts packages/api/src/server.ts packages/api/test/splitFromStatement.test.ts packages/core/src/repositories/*.ts
git commit -m "feat(cc-split): POST /transactions/:id/split-from-statement (parse→children→reconcile)"
```

---

## Task 8: agent-harness — expense-agent tags CC bills

**Files:**
- Modify: `packages/agent-harness/src/expenseAgent.ts`
- Test: `packages/agent-harness/test/expenseAgent.ccInstruction.test.ts`

**Interfaces:**
- Produces: `EXPENSE_INSTRUCTIONS` contains a rule to tag CC bills `credit_card_bill`.

- [ ] **Step 1: Write the failing test**

Create `packages/agent-harness/test/expenseAgent.ccInstruction.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { EXPENSE_INSTRUCTIONS } from '../src/expenseAgent';

describe('expense agent CC-bill instruction', () => {
  it('instructs tagging credit-card bills as credit_card_bill', () => {
    expect(EXPENSE_INSTRUCTIONS).toMatch(/credit_card_bill/);
    expect(EXPENSE_INSTRUCTIONS.toLowerCase()).toMatch(/credit[- ]card bill/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 && cd packages/agent-harness && node_modules/.bin/vitest run test/expenseAgent.ccInstruction.test.ts 2>&1 | tail -15
```
Expected: FAIL.

- [ ] **Step 3: Add the instruction line**

In `packages/agent-harness/src/expenseAgent.ts`, inside `EXPENSE_INSTRUCTIONS`, add after the step-3 block (before `STYLE:`):
```
4. If a transaction looks like a credit-card bill payment (autopay or a bill for a card,
   e.g. narration containing "CC PAYMENT", "CREDIT CARD", "card autopay"), tag it
   credit_card_bill via tag_transaction so the user can upload that card's statement and
   split it into itemized spend.
```

- [ ] **Step 4: Run to verify it passes**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 && cd packages/agent-harness && node_modules/.bin/vitest run test/expenseAgent.ccInstruction.test.ts 2>&1 | tail -15
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/agent-harness/src/expenseAgent.ts packages/agent-harness/test/expenseAgent.ccInstruction.test.ts
git commit -m "feat(cc-split): expense agent tags credit-card bills credit_card_bill"
```

---

## Task 9: web — types, `useSplitFromStatement` hook, UploadIcon

**Files:**
- Modify: `apps/web/src/types.ts`
- Modify: `apps/web/src/lib/hooks.ts`
- Modify: `apps/web/src/components/ui/icons.tsx`
- Test: `apps/web/test/useSplitFromStatement.test.ts` (light — invalidation)

**Interfaces:**
- Produces:
  - `ExpenseRow.parentTransactionId: number | null`.
  - `SplitChild` and `SplitResult` types.
  - `useSplitFromStatement()` — `mutateAsync({ id, file, password? })` → POST multipart → invalidates `['expenses']`, `['expenseInsights']`, `['networth']`.
  - `UploadIcon` component.

- [ ] **Step 1: Add types**

In `apps/web/src/types.ts`:
- Add to `ExpenseRow`: `parentTransactionId: number | null;`
- Append:
```ts
export type SplitChild = ExpenseRow;
export type SplitResult = {
  parentId: number;
  parentAmount: number;
  detectedTotal: number | null;
  parsedTotal: number;
  matched: boolean;
  reconciledAgainst: 'statementTotal' | 'billAmount';
  carryover: number;
  children: SplitChild[];
};
```

- [ ] **Step 2: Write the failing hook test**

Create `apps/web/test/useSplitFromStatement.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/lib/apiClient', () => ({
  apiUpload: vi.fn(async () => ({ parentId: 1, parentAmount: 8000, detectedTotal: 2000, parsedTotal: 2000, matched: true, reconciledAgainst: 'statementTotal', carryover: 6000, children: [] })),
  apiGet: vi.fn(), apiSend: vi.fn(),
}));

import { apiUpload } from '../src/lib/apiClient';
import { useSplitFromStatement } from '../src/lib/hooks';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient();
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('useSplitFromStatement', () => {
  beforeEach(() => vi.clearAllMocks());
  it('uploads multipart to the split endpoint', async () => {
    const { result } = renderHook(() => useSplitFromStatement(), { wrapper });
    const file = new File([new Uint8Array([1, 2, 3])], 'stmt.pdf', { type: 'application/pdf' });
    await result.current.mutateAsync({ id: 42, file });
    await waitFor(() => expect(apiUpload).toHaveBeenCalled());
    const [path, form] = (apiUpload as any).mock.calls[0];
    expect(path).toBe('/transactions/42/split-from-statement');
    expect(form.get('file')).toBeInstanceOf(File);
  });
});
```
(Match the web test harness the repo already uses — check an existing `apps/web/test/*.test.ts` for the exact render/query setup and mirror it.)

- [ ] **Step 3: Run to verify it fails**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 && cd apps/web && node_modules/.bin/vitest run test/useSplitFromStatement.test.ts 2>&1 | tail -15
```
Expected: FAIL (hook not exported).

- [ ] **Step 4: Implement the hook**

In `apps/web/src/lib/hooks.ts`, add (near the other transaction hooks):
```ts
export function useSplitFromStatement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file, password }: { id: number; file: File; password?: string }) => {
      const form = new FormData();
      form.append('file', file);
      if (password) form.append('password', password);
      return apiUpload<import('../types').SplitResult>(`/transactions/${id}/split-from-statement`, form);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['expenseInsights'] });
      qc.invalidateQueries({ queryKey: ['networth'] });
    },
  });
}
```

- [ ] **Step 5: Add UploadIcon**

In `apps/web/src/components/ui/icons.tsx`, add an icon following the existing pattern (24×24, stroke 1.8, round caps). Match the file's existing `base()`/props convention — e.g.:
```tsx
export function UploadIcon(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={props.className} aria-hidden>
      <path d="M12 15V4" />
      <path d="M8 8l4-4 4 4" />
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}
```
(If `icons.tsx` uses a different signature/helper, conform to it exactly.)

- [ ] **Step 6: Run to verify it passes**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 && cd apps/web && node_modules/.bin/vitest run test/useSplitFromStatement.test.ts 2>&1 | tail -15
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/types.ts apps/web/src/lib/hooks.ts apps/web/src/components/ui/icons.tsx apps/web/test/useSplitFromStatement.test.ts
git commit -m "feat(cc-split): web types + useSplitFromStatement hook + UploadIcon"
```

---

## Task 10: web — SplitStatementModal (upload + password)

**Files:**
- Create: `apps/web/src/features/expenses/SplitStatementModal.tsx`
- Test: `apps/web/test/SplitStatementModal.test.tsx`

**Interfaces:**
- Consumes: `Modal` (`components/ui`), `useSplitFromStatement` (Task 9).
- Produces: `<SplitStatementModal txId merchantLabel onClose onSplit={(result: SplitResult)=>void} />` — file drop-zone + optional password input + "Parse statement" button; on success calls `onSplit(result)` and closes; on error shows the message inline.

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/SplitStatementModal.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SplitStatementModal } from '../src/features/expenses/SplitStatementModal';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const wrap = (ui: React.ReactNode) =>
  render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

describe('SplitStatementModal', () => {
  it('renders the upload modal with a parse button and password field', () => {
    wrap(<SplitStatementModal txId={1} merchantLabel="HDFC CC" onClose={vi.fn()} onSplit={vi.fn()} />);
    expect(screen.getByText(/parse statement/i)).toBeTruthy();
    expect(screen.getByPlaceholderText(/password/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 && cd apps/web && node_modules/.bin/vitest run test/SplitStatementModal.test.tsx 2>&1 | tail -15
```
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the modal**

Create `apps/web/src/features/expenses/SplitStatementModal.tsx`. Reuse `Modal` and Tailwind tokens from the handoff (`bg-brand`, dashed drop-zone). Structure:
```tsx
import { useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { useSplitFromStatement } from '../../lib/hooks';
import type { SplitResult } from '../../types';

export function SplitStatementModal({ txId, merchantLabel, onClose, onSplit }: {
  txId: number; merchantLabel: string; onClose: () => void; onSplit: (r: SplitResult) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const split = useSplitFromStatement();

  const submit = async () => {
    if (!file) { setError('Choose a statement PDF first.'); return; }
    setError(null);
    try {
      const r = await split.mutateAsync({ id: txId, file, password: password || undefined });
      onSplit(r);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to parse the statement.');
    }
  };

  return (
    <Modal title="Upload statement" onClose={onClose}>
      <p className="text-sm text-ink-muted mb-3">{merchantLabel} · matched by amount &amp; narration</p>
      <label className="block border-2 border-dashed border-border-strong rounded-lg p-6 text-center cursor-pointer text-[12.5px] text-ink-subtle">
        <input type="file" accept="application/pdf" className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        {file ? file.name : 'Drop statement.pdf or click to browse'}
      </label>
      <input type="password" placeholder="PDF password (if protected)" value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="mt-3 w-full rounded-lg border border-border px-3 py-2 text-sm" />
      {error && <p className="mt-2 text-sm text-loss">{error}</p>}
      <button onClick={submit} disabled={split.isPending}
        className="mt-4 w-full rounded-lg bg-brand text-white py-2 text-sm font-medium disabled:opacity-60">
        {split.isPending ? 'Parsing…' : 'Parse statement'}
      </button>
    </Modal>
  );
}
```
(Conform prop names to the actual `Modal` component — check `components/ui/Modal.tsx` for `title`/`onClose` vs `open`/`children`.)

- [ ] **Step 4: Run to verify it passes**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 && cd apps/web && node_modules/.bin/vitest run test/SplitStatementModal.test.tsx 2>&1 | tail -15
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/expenses/SplitStatementModal.tsx apps/web/test/SplitStatementModal.test.tsx
git commit -m "feat(cc-split): SplitStatementModal (upload + optional password)"
```

---

## Task 11: web — SplitPanel (reconciliation bar + line items)

**Files:**
- Create: `apps/web/src/features/expenses/SplitPanel.tsx`
- Test: `apps/web/test/SplitPanel.test.tsx`

**Interfaces:**
- Consumes: `SplitResult` (Task 9), `CategoryChip` (existing), `formatCompactShort`/`formatINR` (existing `lib/format`).
- Produces: `<SplitPanel result merchantLabel categories onDone />` — reconciliation bar (green matched / amber mismatch), carryover line, line-item rows with `CategoryChip`, "Confirm split" → `onDone()`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/SplitPanel.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SplitPanel } from '../src/features/expenses/SplitPanel';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { SplitResult } from '../src/types';

const result: SplitResult = {
  parentId: 1, parentAmount: 8000, detectedTotal: 2000, parsedTotal: 2000,
  matched: true, reconciledAgainst: 'statementTotal', carryover: 6000,
  children: [
    { id: 2, transactionDate: '2026-06-02', description: 'SWIGGY', amount: 500, direction: 'debit', categoryId: 'food', categorySource: 'manual', aiKeyword: null, note: null, tags: [], accountId: null, balance: null, parentTransactionId: 1 },
  ],
};

const wrap = (ui: React.ReactNode) =>
  render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

describe('SplitPanel', () => {
  it('shows a matched reconciliation bar and the line items', () => {
    wrap(<SplitPanel result={result} merchantLabel="HDFC CC" categories={[{ id: 'food', name: 'Food' }]} onDone={vi.fn()} />);
    expect(screen.getByText(/matched/i)).toBeTruthy();
    expect(screen.getByText(/SWIGGY/)).toBeTruthy();
  });

  it('shows a carryover / not itemized note', () => {
    wrap(<SplitPanel result={result} merchantLabel="HDFC CC" categories={[{ id: 'food', name: 'Food' }]} onDone={vi.fn()} />);
    expect(screen.getByText(/not itemized|carryover/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 && cd apps/web && node_modules/.bin/vitest run test/SplitPanel.test.tsx 2>&1 | tail -15
```
Expected: FAIL (module not found).

- [ ] **Step 3: Implement SplitPanel**

Create `apps/web/src/features/expenses/SplitPanel.tsx`:
```tsx
import { CategoryChip } from './CategoryChip';
import type { SplitResult } from '../../types';
import { formatINR } from '../../lib/format';

export function SplitPanel({ result, merchantLabel, categories, onDone }: {
  result: SplitResult;
  merchantLabel: string;
  categories: { id: string; name: string }[];
  onDone: () => void;
}) {
  const target = result.detectedTotal ?? result.parentAmount;
  return (
    <div className="bg-[#F9FAFB] rounded-lg p-4">
      <div className="text-[11px] uppercase tracking-wide text-ink-subtle mb-2">
        Split statement — {merchantLabel}
      </div>
      <div className={`rounded-lg px-3 py-2 text-sm flex items-center justify-between ${result.matched ? 'bg-gain/10 border border-gain/30 text-gain-800' : 'bg-amber-50 border border-amber-300 text-amber-800'}`}>
        <span>
          {result.matched ? '✓ ' : '⚠ '}
          Parsed {formatINR(result.parsedTotal)} of {formatINR(target)}
          {result.matched ? ' · Matched' : ` · off by ${formatINR(Math.abs(result.parsedTotal - target))}`}
        </span>
        <span>{result.children.length} items</span>
      </div>
      {result.carryover > 0 && (
        <div className="mt-1 text-[12px] text-ink-subtle">
          Carryover / not itemized: {formatINR(result.carryover)}
        </div>
      )}
      <ul className="mt-3 divide-y divide-border">
        {result.children.map((c) => (
          <li key={c.id} className="flex items-center gap-2 py-2">
            <span className="flex-1 text-sm">{c.description}</span>
            <CategoryChip txId={c.id} categoryId={c.categoryId} merchantLabel={c.description}
              categories={categories} categorySource={c.categorySource} />
            <span className={`tabular text-sm ${c.direction === 'credit' ? 'text-gain' : ''}`}>
              {c.direction === 'credit' ? '-' : ''}{formatINR(c.amount)}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex justify-end">
        <button onClick={onDone} className="rounded-lg bg-brand text-white px-4 py-2 text-sm font-medium">
          Confirm split
        </button>
      </div>
    </div>
  );
}
```
(Conform `formatINR` name to the real export in `lib/format.ts`; use `formatCompactShort` if that's the INR formatter. Match `CategoryChip` props exactly — Task's earlier read shows `{ txId, categoryId, merchantLabel, categories, categorySource, aiKeyword }`.)

- [ ] **Step 4: Run to verify it passes**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 && cd apps/web && node_modules/.bin/vitest run test/SplitPanel.test.tsx 2>&1 | tail -15
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/expenses/SplitPanel.tsx apps/web/test/SplitPanel.test.tsx
git commit -m "feat(cc-split): SplitPanel reconciliation + line-item review"
```

---

## Task 12: web — wire detection, upload, panel, and container row into ExpensesPage

**Files:**
- Modify: `apps/web/src/features/expenses/ExpensesPage.tsx`
- Test: `apps/web/test/ExpensesPage.ccBadge.test.tsx` (light render)

**Interfaces:**
- Consumes: `SplitStatementModal` (Task 10), `SplitPanel` (Task 11), `UploadIcon` (Task 9), `useSplitFromStatement`, existing `ExpenseRow.parentTransactionId`.
- Produces: CC badge + upload button on flagged rows; inline split panel after upload; collapsed dashed container row for parents-with-children with expandable indented children.

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/ExpensesPage.ccBadge.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { isCreditCardBill, isSplitContainer } from '../src/features/expenses/ExpensesPage';
import type { ExpenseRow } from '../src/types';

const row = (over: Partial<ExpenseRow>): ExpenseRow => ({
  id: 1, transactionDate: '2026-06-15', description: 'HDFC CC PAYMENT', amount: 8000,
  direction: 'debit', categoryId: null, categorySource: null, aiKeyword: null, note: null,
  tags: [], accountId: null, balance: null, parentTransactionId: null, ...over,
});

describe('CC-bill detection helpers', () => {
  it('detects by category', () => {
    expect(isCreditCardBill(row({ categoryId: 'credit_card_bill' }))).toBe(true);
  });
  it('detects by tag', () => {
    expect(isCreditCardBill(row({ tags: [{ tag: 'credit_card_bill', source: 'agent' }] }))).toBe(true);
  });
  it('is false otherwise', () => {
    expect(isCreditCardBill(row({}))).toBe(false);
  });
  it('isSplitContainer true when another row points to it', () => {
    const rows = [row({ id: 1 }), row({ id: 2, parentTransactionId: 1 })];
    expect(isSplitContainer(rows[0], rows)).toBe(true);
    expect(isSplitContainer(rows[1], rows)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 && cd apps/web && node_modules/.bin/vitest run test/ExpensesPage.ccBadge.test.tsx 2>&1 | tail -15
```
Expected: FAIL (helpers not exported).

- [ ] **Step 3: Add + export the pure helpers**

In `apps/web/src/features/expenses/ExpensesPage.tsx`, add and export near the top:
```ts
import type { ExpenseRow } from '../../types';

export function isCreditCardBill(row: ExpenseRow): boolean {
  return row.categoryId === 'credit_card_bill'
    || row.tags.some((t) => t.tag === 'credit_card_bill');
}

export function isSplitContainer(row: ExpenseRow, allRows: ExpenseRow[]): boolean {
  return allRows.some((r) => r.parentTransactionId === row.id);
}
```

- [ ] **Step 4: Wire the row UI**

In the `TransactionRow` rendering (find where each expense row renders in `ExpensesPage.tsx`):
- Compute `const ccBill = isCreditCardBill(row);` and `const container = isSplitContainer(row, rows);` (pass the visible `rows` array down or compute a `Set` of parent ids once per render for efficiency: `const parentIds = new Set(rows.map(r=>r.parentTransactionId).filter(Boolean));` then `container = parentIds.has(row.id)`).
- **Flagged (ccBill && !container):** render a small badge under the merchant — reuse the badge styling from the handoff (`bg-brand/10 text-brand ring-1 ring-brand/20`, `<ExpensesIcon/>` + "Credit card bill") — and a 32×32 `border border-border rounded-lg` button with `<UploadIcon/>` that sets `splitTargetId = row.id` (opens `SplitStatementModal`).
- **Container:** render a dashed container row (`border border-dashed border-border-strong bg-[#F9FAFB]`) with a chevron toggle (rotate 150ms), "Credit card bill · {childCount} items, split", muted total, and an "excluded from totals" tag; when expanded, render its children (from `rows.filter(r=>r.parentTransactionId===row.id)`) indented with `border-l-2 border-border`, each a normal editable row (reuse the existing row body + `CategoryChip`).
- Add page-level state: `const [splitTargetId, setSplitTargetId] = useState<number|null>(null);` and `const [splitResult, setSplitResult] = useState<SplitResult|null>(null);` and `const [expanded, setExpanded] = useState<Set<number>>(new Set());`.
- Render `<SplitStatementModal>` when `splitTargetId != null` (pass `onSplit={(r)=>{ setSplitResult(r); setSplitTargetId(null); }}`).
- When `splitResult` is set and its `parentId === row.id`, render `<SplitPanel result={splitResult} … onDone={()=>setSplitResult(null)} />` inline beneath that row (the just-split state before the refetch collapses it into a container).

Keep the diff additive; do not restructure existing row rendering beyond adding these branches. If `ExpensesPage.tsx` is large, extract the container/flagged row markup into small local components within the same file.

- [ ] **Step 5: Run to verify it passes**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 && cd apps/web && node_modules/.bin/vitest run test/ExpensesPage.ccBadge.test.tsx 2>&1 | tail -15
```
Expected: PASS.

- [ ] **Step 6: Typecheck web + full web suite**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 && cd packages/core && node_modules/.bin/tsc --build && cd ../../apps/web && node_modules/.bin/tsc --build 2>&1 | tail -20 && node_modules/.bin/vitest run 2>&1 | tail -20
```
Expected: typecheck clean; all web tests green.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/expenses/ExpensesPage.tsx apps/web/test/ExpensesPage.ccBadge.test.tsx
git commit -m "feat(cc-split): ExpensesPage CC badge, upload, inline split panel, container row"
```

---

## Task 13: Full-suite verification + guardrails

**Files:** none (verification only).

- [ ] **Step 1: Build the whole graph**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 && cd packages/core && node_modules/.bin/tsc --build && cd ../agents && node_modules/.bin/tsc --build && cd ../api && node_modules/.bin/tsc --build && cd ../agent-harness && node_modules/.bin/tsc --build && cd ../../apps/web && node_modules/.bin/tsc --build 2>&1 | tail -30
```
Expected: clean across the graph (beyond any pre-existing baseline errors documented on the base branch — record them, don't "fix" unrelated ones).

- [ ] **Step 2: Run every package's tests**

Run each and capture the green counts:
```bash
source ~/.nvm/nvm.sh && nvm use 22
cd packages/core && node_modules/.bin/vitest run 2>&1 | tail -5
cd ../agents && node_modules/.bin/vitest run 2>&1 | tail -5
cd ../api && node_modules/.bin/vitest run 2>&1 | tail -5
cd ../agent-harness && node_modules/.bin/vitest run 2>&1 | tail -5
cd ../mcp && node_modules/.bin/vitest run 2>&1 | tail -5
cd ../../apps/web && node_modules/.bin/vitest run 2>&1 | tail -5
```
Expected: all green.

- [ ] **Step 3: Confirm the T2 guardrail — categorize.ts byte-identical**

Run:
```bash
cd /Users/vkhandelwal/Documents/MyFinance/.claude/worktrees/credit-card-split
git diff feat/agent-response-calibration -- packages/core/src/domain/categorize.ts | head
```
Expected: EMPTY output (no diff). If not empty, revert the change — detection must not touch the frozen matcher.

- [ ] **Step 4: Confirm Groww golden-master 6/6**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 22 && cd packages/core && node_modules/.bin/vitest run test/golden 2>&1 | tail -10
```
Expected: 6/6 pass.

- [ ] **Step 5: Confirm seam invariant**

Run:
```bash
cd /Users/vkhandelwal/Documents/MyFinance/.claude/worktrees/credit-card-split
grep -rE "from 'drizzle|better-sqlite3" packages/agents/src packages/agent-harness/src packages/core/src/domain && echo "SEAM VIOLATION" || echo "seam clean"
```
Expected: `seam clean`.

- [ ] **Step 6: Update MASTER_PLAN + memory (close-out)**

- Mark Feature A done in `docs/superpowers/MASTER_PLAN.md` §8 (the "NEW — Feature A: Credit-card bill upload" checkbox) with a build summary + green counts.
- Save a project-memory decision (`mcp__project-memory__memory_save`, type=decision, category=scope) capturing: T2, worktree rebased onto calibration branch, migration 0009, LLM parse via gateway, reconcile-to-statement-total model, files touched, green counts, deferred items.

- [ ] **Step 7: Final commit**

```bash
git add docs/superpowers/MASTER_PLAN.md
git commit -m "docs(cc-split): mark Feature A built + close-out notes"
```

---

## Self-Review (completed during authoring)

- **Spec coverage:** §3 schema → Task 0/2; §4 detection (category seed + read-only helpers + agent instruction) → Tasks 1/8/12; §5 PDF+LLM parse → Tasks 4/5; §5a reconciliation → Task 6; §6 endpoint + errors → Task 7; §7 totals exclusion → Task 3; §8 frontend → Tasks 9/10/11/12; §9 testing → every task + Task 13. All covered.
- **Type consistency:** `CompleteFn`, `CcLineItem`/`CcStatementParse`, `Reconciliation`, `SplitResult`, `ExpenseTransactionRow.parentTransactionId`, `insertChild`/`listChildren` signatures are consistent across producing/consuming tasks.
- **Known judgment call flagged for the implementer:** Task 7 Step 4 reads the parent's `amount`/`accountId` — the cleanest path is a dedicated single-row repo read (`getFullById`); the plan says to add it rather than lean on `query({})`. Resolve to one clean read.
- **Deferred (unchanged from spec §2):** deterministic per-issuer parser; manual "mark as CC bill / not" toggle; dedicated CC accounts; auto card/last-4 detection; editing confirmed-split membership beyond per-child edit/delete.
