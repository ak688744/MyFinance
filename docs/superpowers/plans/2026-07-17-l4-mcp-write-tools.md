# L4 MCP Write Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ~22 composable mutation tools to `packages/mcp` (over the reserved `tools/write/*` seam) so L4 agents can do everything the user does on the dashboard, with a model-C preview/confirm safety layer for destructive/wide operations.

**Architecture:** Thin MCP-tool wrappers over existing `@myfinance/core` repo/domain methods — **zero core change**. Each write module mirrors the L3 `tools/read/*` pattern: pure `run<Name>(ctx, input)` handlers + a `register<Name>Tools(server, ctx)` registrar. Destructive/wide tools take `confirm?: boolean`; without it they return a stateless preview and mutate nothing. Multi-write handlers wrap their repo calls in the L3-reserved `ctx.runInTransaction`.

**Tech Stack:** TypeScript (run via `tsx`, never compiled), `@modelcontextprotocol/sdk` `McpServer`, Zod input schemas, Vitest (in-memory sqlite via `buildContext({dbPath:':memory:'})`), `@myfinance/core` repos + domain fns.

**Spec:** `docs/superpowers/specs/2026-07-16-l4-mcp-write-tools-design.md`

## Global Constraints

- **Node 20** for all commands. Prefix: `source ~/.nvm/nvm.sh && nvm use 20 && …`.
- **Never compile to JS** — the monorepo runs TypeScript directly via `tsx`. New files use **extensionless** relative imports (e.g. `from '../../context'`). No `dist`.
- **Seam invariant:** NO `drizzle` or `better-sqlite3` import anywhere in `packages/mcp/src`. The sqlite handle is only a derived type in `context.ts`.
- **Test/build commands** (pnpm 11.x crashes on Node 20.20.2 — use the local bins):
  - Test: `packages/mcp/node_modules/.bin/vitest run <file>` (from repo root, or `-C packages/mcp`).
  - Typecheck: `packages/mcp/node_modules/.bin/tsc --build` (build `core` first if its `.d.ts` is stale: `packages/core/node_modules/.bin/tsc --build`).
- **Zero core change** — if any task feels like it needs to touch `packages/core`, STOP: the method already exists (see the signature reference in each task). Do not modify `core`.
- **Unit-safety labels** (carried from L3): money fields end in `Inr`; rate fields end in `Percent`. Inputs use the same convention (`amountInr`, `annualRatePercent`).
- **Direction vocabulary:** tools expose `direction: 'in' | 'out'` to agents (matching the L3 read tools); map to the repo's `'credit' | 'debit'` internally (`in`→`credit`, `out`→`debit`).
- **Write tools are ALWAYS registered** (spec D6, conscious override of L3's opt-in flag). `buildServer(ctx)` signature is unchanged.
- **Branch:** `layer/4-mcp-write-tools` (already created off `origin/main`; the spec is committed there as `cf55799`).
- Commit after every task. Push/PR at the end via `gh auth switch --user ak688744`.

---

### Task 0: `preview()` output helper

**Files:**
- Modify: `packages/mcp/src/shared/output.ts`
- Test: `packages/mcp/test/output.test.ts` (append)

**Interfaces:**
- Consumes: existing `ToolResult`, `ok`, `errorResult` in `shared/output.ts`.
- Produces: `preview(summary: string, impact?: Record<string, unknown>): ToolResult` — a **non-error** result whose text is `summary` + a standard re-call instruction, and whose `structuredContent` is `{ preview: true, ...impact }`. Used by every gated write tool.

- [ ] **Step 1: Write the failing test** — append to `packages/mcp/test/output.test.ts`:

```ts
import { preview } from '../src/shared/output';

describe('preview', () => {
  it('returns a non-error result with preview:true and impact fields', () => {
    const r = preview('Would delete 3 rules.', { ruleCount: 3 });
    expect(r.isError).toBeUndefined();
    expect(r.structuredContent).toEqual({ preview: true, ruleCount: 3 });
    expect(r.content[0].text).toContain('Would delete 3 rules.');
    expect(r.content[0].text).toContain('confirm: true');
  });

  it('works with no impact object', () => {
    const r = preview('Would do X.');
    expect(r.structuredContent).toEqual({ preview: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `packages/mcp/node_modules/.bin/vitest run test/output.test.ts` (from `packages/mcp`)
Expected: FAIL — `preview is not a function` / import error.

- [ ] **Step 3: Implement** — append to `packages/mcp/src/shared/output.ts`:

```ts
/**
 * Preview (dry-run) result for a gated write tool called without confirm:true.
 * Non-error; states what WOULD change and that nothing was mutated.
 */
export function preview(summary: string, impact: Record<string, unknown> = {}): ToolResult {
  const text = `${summary}\nNo changes made. Re-call with confirm: true to proceed.`;
  return {
    content: [{ type: 'text', text }],
    structuredContent: { preview: true, ...impact },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `packages/mcp/node_modules/.bin/vitest run test/output.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/mcp/src/shared/output.ts packages/mcp/test/output.test.ts
git commit -m "feat(mcp): preview() output helper for gated write tools"
```

---

### Task 1: Transaction write tools

**Files:**
- Create: `packages/mcp/src/tools/write/transactions.ts`
- Modify: `packages/mcp/src/server.ts` (register)
- Test: `packages/mcp/test/write/transactions.test.ts`

**Interfaces:**
- Consumes: `McpContext` (`ctx.repos.expenseTxRepo`, `ctx.repos.categoryRuleRepo`, `ctx.runInTransaction`), `ok`/`errorResult`/`preview`. Core fns `extractMerchantKey`, `saveCategoryMemoryRule`, `recategorizeNonManualTransactions` from `@myfinance/core`. Repo methods (all EXIST — do not add): `insertManual({transactionDate, description, amount, direction:'debit'|'credit', categoryId?, note?, accountId?}): number`, `updateAmount(id, amount)`, `updateNote(id, note)`, `deleteTransaction(id)`, `updateCategory(id, categoryId, categorySource, aiKeyword?)`, `getById(id): {id, description} | null`.
- Produces: `runAddTransaction`, `runUpdateTransaction`, `runDeleteTransaction`, `runCategorizeTransaction` handlers + `registerTransactionWriteTools(server, ctx)`.

- [ ] **Step 1: Write the failing test** — `packages/mcp/test/write/transactions.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { seedContext } from '../helpers';
import {
  runAddTransaction, runUpdateTransaction, runDeleteTransaction, runCategorizeTransaction,
} from '../../src/tools/write/transactions';
import type { McpContext } from '../../src/context';

let ctx: McpContext;
afterEach(() => ctx?.close());

describe('add_transaction', () => {
  it('inserts a manual transaction and returns its id', async () => {
    ctx = seedContext();
    const r = await runAddTransaction(ctx, {
      transactionDate: '2026-01-05', description: 'Coffee', amountInr: 250, direction: 'out',
    });
    expect(r.isError).toBeUndefined();
    const id = (r.structuredContent as any).id as number;
    expect(id).toBeGreaterThan(0);
    const rows = ctx.repos.expenseTxRepo.query({ limit: 10 }) as any[];
    expect(rows.find((x) => x.id === id)).toBeTruthy();
  });

  it('rejects a non-positive amount with isError', async () => {
    ctx = seedContext();
    const r = await runAddTransaction(ctx, {
      transactionDate: '2026-01-05', description: 'X', amountInr: 0, direction: 'out',
    });
    expect(r.isError).toBe(true);
  });
});

describe('update_transaction', () => {
  it('updates amount and note', async () => {
    ctx = seedContext();
    const add = await runAddTransaction(ctx, {
      transactionDate: '2026-01-05', description: 'Coffee', amountInr: 250, direction: 'out',
    });
    const id = (add.structuredContent as any).id;
    const r = await runUpdateTransaction(ctx, { id, amountInr: 300, note: 'tip included' });
    expect(r.isError).toBeUndefined();
    const row = (ctx.repos.expenseTxRepo.query({ limit: 10 }) as any[]).find((x) => x.id === id);
    expect(row.amount).toBe(300);
    expect(row.note).toBe('tip included');
  });

  it('rejects negative amount', async () => {
    ctx = seedContext();
    const add = await runAddTransaction(ctx, {
      transactionDate: '2026-01-05', description: 'C', amountInr: 250, direction: 'out',
    });
    const id = (add.structuredContent as any).id;
    const r = await runUpdateTransaction(ctx, { id, amountInr: -5 });
    expect(r.isError).toBe(true);
  });
});

describe('delete_transaction (preview-gated)', () => {
  it('without confirm returns a preview and does NOT delete', async () => {
    ctx = seedContext();
    const add = await runAddTransaction(ctx, {
      transactionDate: '2026-01-05', description: 'C', amountInr: 250, direction: 'out',
    });
    const id = (add.structuredContent as any).id;
    const r = await runDeleteTransaction(ctx, { id });
    expect(r.isError).toBeUndefined();
    expect((r.structuredContent as any).preview).toBe(true);
    expect((ctx.repos.expenseTxRepo.query({ limit: 10 }) as any[]).find((x) => x.id === id)).toBeTruthy();
  });

  it('with confirm deletes the row', async () => {
    ctx = seedContext();
    const add = await runAddTransaction(ctx, {
      transactionDate: '2026-01-05', description: 'C', amountInr: 250, direction: 'out',
    });
    const id = (add.structuredContent as any).id;
    const r = await runDeleteTransaction(ctx, { id, confirm: true });
    expect(r.isError).toBeUndefined();
    expect((ctx.repos.expenseTxRepo.query({ limit: 10 }) as any[]).find((x) => x.id === id)).toBeUndefined();
  });

  it('unknown id returns isError', async () => {
    ctx = seedContext();
    const r = await runDeleteTransaction(ctx, { id: 9999, confirm: true });
    expect(r.isError).toBe(true);
  });
});

describe('categorize_transaction', () => {
  it('sets category to manual and can learn a merchant rule', async () => {
    ctx = seedContext();
    const add = await runAddTransaction(ctx, {
      transactionDate: '2026-01-05', description: 'UPI-SWIGGY-ORDER', amountInr: 400, direction: 'out',
    });
    const id = (add.structuredContent as any).id;
    const r = await runCategorizeTransaction(ctx, { id, categoryId: 'food_dining', learnRule: 'merchant' });
    expect(r.isError).toBeUndefined();
    const row = (ctx.repos.expenseTxRepo.query({ limit: 10 }) as any[]).find((x) => x.id === id);
    expect(row.categoryId ?? row.category_id).toBe('food_dining');
    // a merchant rule was learned
    expect(ctx.repos.categoryRuleRepo.getActiveRules().some((rl) => rl.categoryId === 'food_dining')).toBe(true);
  });

  it('unknown transaction id returns isError', async () => {
    ctx = seedContext();
    const r = await runCategorizeTransaction(ctx, { id: 9999, categoryId: 'food_dining' });
    expect(r.isError).toBe(true);
  });
});
```

> NOTE: `query()` returns rows with `note` and `categoryId` fields (see `ExpenseTransactionRow`); the test uses `categoryId ?? category_id` defensively. If the field is named differently, adjust the assertion to match the actual `query()` row shape (check `packages/core/src/repositories/types.ts` `ExpenseTransactionRow`) — do NOT change core.

- [ ] **Step 2: Run test to verify it fails**

Run: `packages/mcp/node_modules/.bin/vitest run test/write/transactions.test.ts`
Expected: FAIL — module `../../src/tools/write/transactions` not found.

- [ ] **Step 3: Implement** — `packages/mcp/src/tools/write/transactions.ts`:

```ts
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  extractMerchantKey,
  saveCategoryMemoryRule,
  recategorizeNonManualTransactions,
} from '@myfinance/core';
import type { McpContext } from '../../context';
import { ok, errorResult, preview, type ToolResult } from '../../shared/output';

const dirToRepo = (d: 'in' | 'out'): 'credit' | 'debit' => (d === 'in' ? 'credit' : 'debit');

export async function runAddTransaction(
  ctx: McpContext,
  input: {
    transactionDate: string; description: string; amountInr: number;
    direction: 'in' | 'out'; categoryId?: string | null; note?: string | null; accountId?: number | null;
  },
): Promise<ToolResult> {
  if (!Number.isFinite(input.amountInr) || input.amountInr <= 0) {
    return errorResult('amountInr must be a positive, finite number.');
  }
  const id = ctx.repos.expenseTxRepo.insertManual({
    transactionDate: input.transactionDate,
    description: input.description,
    amount: input.amountInr,
    direction: dirToRepo(input.direction),
    categoryId: input.categoryId ?? null,
    note: input.note ?? null,
    accountId: input.accountId ?? null,
  });
  return ok({ id });
}

export async function runUpdateTransaction(
  ctx: McpContext,
  input: { id: number; amountInr?: number; note?: string | null },
): Promise<ToolResult> {
  const existing = ctx.repos.expenseTxRepo.getById(input.id);
  if (!existing) return errorResult(`Transaction ${input.id} not found.`);
  if (input.amountInr !== undefined) {
    if (!Number.isFinite(input.amountInr) || input.amountInr <= 0) {
      return errorResult('amountInr must be a positive, finite number.');
    }
    ctx.repos.expenseTxRepo.updateAmount(input.id, input.amountInr);
  }
  if (input.note !== undefined) {
    ctx.repos.expenseTxRepo.updateNote(input.id, input.note);
  }
  return ok({ id: input.id, updated: true });
}

export async function runDeleteTransaction(
  ctx: McpContext,
  input: { id: number; confirm?: boolean },
): Promise<ToolResult> {
  const existing = ctx.repos.expenseTxRepo.getById(input.id);
  if (!existing) return errorResult(`Transaction ${input.id} not found.`);
  if (input.confirm !== true) {
    return preview(`Would delete transaction ${input.id} ("${existing.description}").`, {
      transactionId: input.id,
    });
  }
  ctx.repos.expenseTxRepo.deleteTransaction(input.id);
  return ok({ id: input.id, deleted: true });
}

export async function runCategorizeTransaction(
  ctx: McpContext,
  input: { id: number; categoryId: string | null; learnRule?: 'merchant' | 'keyword'; keyword?: string },
): Promise<ToolResult> {
  const txn = ctx.repos.expenseTxRepo.getById(input.id);
  if (!txn) return errorResult(`Transaction ${input.id} not found.`);

  const deps = { ruleRepo: ctx.repos.categoryRuleRepo, txRepo: ctx.repos.expenseTxRepo };

  ctx.runInTransaction(() => {
    ctx.repos.expenseTxRepo.updateCategory(input.id, input.categoryId, 'manual');

    if (input.learnRule && input.categoryId !== null) {
      if (input.learnRule === 'merchant') {
        const merchantKey = extractMerchantKey(txn.description);
        if (merchantKey) {
          saveCategoryMemoryRule(deps, {
            ruleType: 'merchant', patternValue: merchantKey,
            categoryId: input.categoryId, createdFromTransactionId: input.id,
          });
          recategorizeNonManualTransactions(deps);
        }
      } else {
        const pattern = (input.keyword ?? '').trim();
        if (pattern.length >= 2) {
          try {
            saveCategoryMemoryRule(deps, {
              ruleType: 'keyword', patternValue: pattern,
              categoryId: input.categoryId, createdFromTransactionId: input.id,
            });
          } catch (e) {
            if (!/unique/i.test((e as Error).message)) throw e;
          }
          recategorizeNonManualTransactions(deps);
        }
      }
    }
  });

  return ok({ id: input.id, categoryId: input.categoryId });
}

export function registerTransactionWriteTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'add_transaction',
    {
      description:
        'Add a manual expense/income transaction. `amountInr` (positive), `direction` "in"|"out", ' +
        'ISO `transactionDate`, optional `categoryId`/`note`/`accountId`. Returns the new id. ' +
        'RECIPE — SPLIT a transaction: call update_transaction to shrink the original to part A, ' +
        'then add_transaction for the remainder part B (copy date/description/direction/accountId); ' +
        'the two are separate calls (not atomic) — read back with list_transactions to verify. ' +
        'RECIPE — duplicate for next month: add_transaction with the date shifted forward.',
      inputSchema: {
        transactionDate: z.string(),
        description: z.string().min(1),
        amountInr: z.number().positive(),
        direction: z.enum(['in', 'out']),
        categoryId: z.string().nullable().optional(),
        note: z.string().nullable().optional(),
        accountId: z.number().int().nullable().optional(),
      },
    },
    async (input) => runAddTransaction(ctx, input),
  );

  server.registerTool(
    'update_transaction',
    {
      description:
        'Update a transaction\'s `amountInr` and/or `note` (only these are editable — merchant/date/' +
        'direction are import-owned). Unknown id returns an error. To SPLIT: shrink here, then ' +
        'add_transaction for the remainder (see that tool). Read back to verify (the two writes are not atomic).',
      inputSchema: {
        id: z.number().int(),
        amountInr: z.number().positive().optional(),
        note: z.string().nullable().optional(),
      },
    },
    async (input) => runUpdateTransaction(ctx, input),
  );

  server.registerTool(
    'delete_transaction',
    {
      description:
        'Delete one transaction. PREVIEW-GATED: without `confirm:true` returns what would be deleted ' +
        'and changes nothing; re-call with `confirm:true` to delete. Unknown id returns an error.',
      inputSchema: { id: z.number().int(), confirm: z.boolean().optional() },
    },
    async (input) => runDeleteTransaction(ctx, input),
  );

  server.registerTool(
    'categorize_transaction',
    {
      description:
        'Set a transaction\'s category (source=manual). Pass `categoryId:null` to clear it. ' +
        'Optional `learnRule`: "merchant" derives a merchant key from the description (structured ' +
        'UPI/ACH/POS formats only) and creates a rule; "keyword" needs `keyword` (>=2 chars). ' +
        'Learning a rule recategorizes other non-manual transactions. Atomic.',
      inputSchema: {
        id: z.number().int(),
        categoryId: z.string().nullable(),
        learnRule: z.enum(['merchant', 'keyword']).optional(),
        keyword: z.string().optional(),
      },
    },
    async (input) => runCategorizeTransaction(ctx, input),
  );
}
```

- [ ] **Step 4: Register in server.ts** — add the import and call:

```ts
// near the other imports
import { registerTransactionWriteTools } from './tools/write/transactions';
// …inside buildServer, after the read registrations:
registerTransactionWriteTools(server, ctx);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `packages/mcp/node_modules/.bin/vitest run test/write/transactions.test.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 6: Commit**

```bash
git add packages/mcp/src/tools/write/transactions.ts packages/mcp/src/server.ts packages/mcp/test/write/transactions.test.ts
git commit -m "feat(mcp): transaction write tools (add/update/delete/categorize) with delete preview gate"
```

---

### Task 2: Category & rule write tools

**Files:**
- Create: `packages/mcp/src/tools/write/categories.ts`
- Modify: `packages/mcp/src/server.ts` (register)
- Test: `packages/mcp/test/write/categories.test.ts`

**Interfaces:**
- Consumes: `ctx.repos.categoryRepo` (`create({id,name,icon?})`, `rename(id,name)`, `delete(id)` [cascades: reassign txns→null + drop rules, one tx], `exists(id)`, `list()`), `ctx.repos.categoryRuleRepo` (`getActiveRules()`), `ctx.repos.expenseTxRepo` (`query({categoryId})`). Core fns `slugifyCategoryName`, `createRule`, `updateRuleCategory`, `deleteRule`, `recategorizeNonManualTransactions` from `@myfinance/core`. **IMPORTANT:** core `createRule`/`updateRuleCategory`/`deleteRule` (deps `{ruleRepo,txRepo}`) ALREADY call `recategorizeNonManualTransactions` internally — do NOT call it again.
- Produces: `runCreateCategory`, `runRenameCategory`, `runDeleteCategory`, `runCreateRule`, `runUpdateRule`, `runDeleteRule`, `runRecategorizeAll` + `registerCategoryWriteTools(server, ctx)`.

- [ ] **Step 1: Write the failing test** — `packages/mcp/test/write/categories.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { seedContext } from '../helpers';
import {
  runCreateCategory, runRenameCategory, runDeleteCategory,
  runCreateRule, runUpdateRule, runDeleteRule, runRecategorizeAll,
} from '../../src/tools/write/categories';
import { runAddTransaction } from '../../src/tools/write/transactions';
import type { McpContext } from '../../src/context';

let ctx: McpContext;
afterEach(() => ctx?.close());

describe('create_category', () => {
  it('creates a category with a slugified id', async () => {
    ctx = seedContext();
    const r = await runCreateCategory(ctx, { name: 'My Hobbies' });
    expect(r.isError).toBeUndefined();
    const id = (r.structuredContent as any).id;
    expect(ctx.repos.categoryRepo.exists(id)).toBe(true);
  });

  it('duplicate name returns isError', async () => {
    ctx = seedContext();
    await runCreateCategory(ctx, { name: 'My Hobbies' });
    const r = await runCreateCategory(ctx, { name: 'My Hobbies' });
    expect(r.isError).toBe(true);
  });
});

describe('rename_category', () => {
  it('renames an existing category', async () => {
    ctx = seedContext();
    const c = await runCreateCategory(ctx, { name: 'Old' });
    const id = (c.structuredContent as any).id;
    const r = await runRenameCategory(ctx, { id, name: 'New Name' });
    expect(r.isError).toBeUndefined();
    expect(ctx.repos.categoryRepo.list().find((x) => x.id === id)?.name).toBe('New Name');
  });

  it('unknown id returns isError', async () => {
    ctx = seedContext();
    const r = await runRenameCategory(ctx, { id: 'nope', name: 'X' });
    expect(r.isError).toBe(true);
  });
});

describe('delete_category (preview-gated, cascade)', () => {
  it('without confirm previews affected counts and deletes nothing', async () => {
    ctx = seedContext();
    const c = await runCreateCategory(ctx, { name: 'Hobbies' });
    const id = (c.structuredContent as any).id;
    await runAddTransaction(ctx, {
      transactionDate: '2026-01-01', description: 'Model kit', amountInr: 100, direction: 'out', categoryId: id,
    });
    const r = await runDeleteCategory(ctx, { id });
    expect(r.isError).toBeUndefined();
    expect((r.structuredContent as any).preview).toBe(true);
    expect((r.structuredContent as any).transactionCount).toBe(1);
    expect(ctx.repos.categoryRepo.exists(id)).toBe(true);
  });

  it('with confirm deletes and reassigns transactions to null', async () => {
    ctx = seedContext();
    const c = await runCreateCategory(ctx, { name: 'Hobbies' });
    const id = (c.structuredContent as any).id;
    await runAddTransaction(ctx, {
      transactionDate: '2026-01-01', description: 'Model kit', amountInr: 100, direction: 'out', categoryId: id,
    });
    const r = await runDeleteCategory(ctx, { id, confirm: true });
    expect(r.isError).toBeUndefined();
    expect(ctx.repos.categoryRepo.exists(id)).toBe(false);
    expect(ctx.repos.expenseTxRepo.query({ categoryId: id }).length).toBe(0);
  });

  it('unknown id returns isError', async () => {
    ctx = seedContext();
    const r = await runDeleteCategory(ctx, { id: 'nope', confirm: true });
    expect(r.isError).toBe(true);
  });
});

describe('rules', () => {
  it('create_rule adds an active rule', async () => {
    ctx = seedContext();
    const r = await runCreateRule(ctx, { ruleType: 'keyword', patternValue: 'swiggy', categoryId: 'food_dining' });
    expect(r.isError).toBeUndefined();
    expect(ctx.repos.categoryRuleRepo.getActiveRules().some((x) => x.patternValue === 'swiggy')).toBe(true);
  });

  it('create_rule with empty pattern returns isError', async () => {
    ctx = seedContext();
    const r = await runCreateRule(ctx, { ruleType: 'keyword', patternValue: '   ', categoryId: 'food_dining' });
    expect(r.isError).toBe(true);
  });

  it('update_rule changes its category', async () => {
    ctx = seedContext();
    await runCreateRule(ctx, { ruleType: 'keyword', patternValue: 'swiggy', categoryId: 'food_dining' });
    const ruleId = ctx.repos.categoryRuleRepo.getActiveRules().find((x) => x.patternValue === 'swiggy')!.id;
    const r = await runUpdateRule(ctx, { ruleId, categoryId: 'shopping', ruleType: 'keyword' });
    expect(r.isError).toBeUndefined();
    expect(ctx.repos.categoryRuleRepo.getActiveRules().find((x) => x.id === ruleId)?.categoryId).toBe('shopping');
  });

  it('delete_rule (preview-gated) needs confirm', async () => {
    ctx = seedContext();
    await runCreateRule(ctx, { ruleType: 'keyword', patternValue: 'swiggy', categoryId: 'food_dining' });
    const ruleId = ctx.repos.categoryRuleRepo.getActiveRules().find((x) => x.patternValue === 'swiggy')!.id;
    const p = await runDeleteRule(ctx, { ruleId });
    expect((p.structuredContent as any).preview).toBe(true);
    expect(ctx.repos.categoryRuleRepo.getActiveRules().some((x) => x.id === ruleId)).toBe(true);
    const d = await runDeleteRule(ctx, { ruleId, confirm: true });
    expect(d.isError).toBeUndefined();
    expect(ctx.repos.categoryRuleRepo.getActiveRules().some((x) => x.id === ruleId)).toBe(false);
  });
});

describe('recategorize_all (preview-gated)', () => {
  it('without confirm previews and changes nothing; with confirm runs', async () => {
    ctx = seedContext();
    const p = await runRecategorizeAll(ctx, {});
    expect((p.structuredContent as any).preview).toBe(true);
    const r = await runRecategorizeAll(ctx, { confirm: true });
    expect(r.isError).toBeUndefined();
    expect((r.structuredContent as any).recategorized).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `packages/mcp/node_modules/.bin/vitest run test/write/categories.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `packages/mcp/src/tools/write/categories.ts`:

```ts
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  slugifyCategoryName,
  createRule as coreCreateRule,
  updateRuleCategory as coreUpdateRuleCategory,
  deleteRule as coreDeleteRule,
  recategorizeNonManualTransactions,
  type CategoryRuleType,
} from '@myfinance/core';
import type { McpContext } from '../../context';
import { ok, errorResult, preview, type ToolResult } from '../../shared/output';

const rulesDeps = (ctx: McpContext) => ({
  ruleRepo: ctx.repos.categoryRuleRepo,
  txRepo: ctx.repos.expenseTxRepo,
});

export async function runCreateCategory(
  ctx: McpContext,
  input: { name: string; icon?: string | null },
): Promise<ToolResult> {
  const name = input.name.trim();
  if (!name) return errorResult('name is required.');
  const id = slugifyCategoryName(name);
  if (ctx.repos.categoryRepo.exists(id)) return errorResult(`Category '${id}' already exists.`);
  ctx.repos.categoryRepo.create({ id, name, icon: input.icon ?? null });
  return ok({ id });
}

export async function runRenameCategory(
  ctx: McpContext,
  input: { id: string; name: string },
): Promise<ToolResult> {
  const name = input.name.trim();
  if (!name) return errorResult('name is required.');
  if (!ctx.repos.categoryRepo.exists(input.id)) return errorResult(`Category '${input.id}' not found.`);
  ctx.repos.categoryRepo.rename(input.id, name);
  return ok({ id: input.id, name });
}

export async function runDeleteCategory(
  ctx: McpContext,
  input: { id: string; confirm?: boolean },
): Promise<ToolResult> {
  if (!ctx.repos.categoryRepo.exists(input.id)) return errorResult(`Category '${input.id}' not found.`);
  const transactionCount = ctx.repos.expenseTxRepo.query({ categoryId: input.id }).length;
  const ruleCount = ctx.repos.categoryRuleRepo.getActiveRules().filter((r) => r.categoryId === input.id).length;
  if (input.confirm !== true) {
    return preview(
      `Would delete category '${input.id}', reassign ${transactionCount} transaction(s) to Uncategorized, ` +
      `and delete ${ruleCount} dependent rule(s).`,
      { categoryId: input.id, transactionCount, ruleCount },
    );
  }
  ctx.repos.categoryRepo.delete(input.id);
  return ok({ id: input.id, deleted: true, transactionCount, ruleCount });
}

export async function runCreateRule(
  ctx: McpContext,
  input: { ruleType: CategoryRuleType; patternValue: string; categoryId: string },
): Promise<ToolResult> {
  try {
    // core createRule recategorizes internally.
    coreCreateRule(rulesDeps(ctx), {
      ruleType: input.ruleType, patternValue: input.patternValue, categoryId: input.categoryId,
    });
  } catch (e) {
    return errorResult((e as Error).message);
  }
  return ok({ created: true });
}

export async function runUpdateRule(
  ctx: McpContext,
  input: { ruleId: number; categoryId: string; ruleType: CategoryRuleType },
): Promise<ToolResult> {
  // core updateRuleCategory recategorizes internally.
  coreUpdateRuleCategory(rulesDeps(ctx), {
    ruleId: input.ruleId, categoryId: input.categoryId, ruleType: input.ruleType,
  });
  return ok({ ruleId: input.ruleId, updated: true });
}

export async function runDeleteRule(
  ctx: McpContext,
  input: { ruleId: number; confirm?: boolean },
): Promise<ToolResult> {
  const rule = ctx.repos.categoryRuleRepo.getActiveRules().find((r) => r.id === input.ruleId);
  if (!rule) return errorResult(`Rule ${input.ruleId} not found.`);
  if (input.confirm !== true) {
    return preview(
      `Would delete rule ${input.ruleId} ("${rule.patternValue}" → ${rule.categoryId}) and recategorize.`,
      { ruleId: input.ruleId },
    );
  }
  // core deleteRule recategorizes internally.
  coreDeleteRule(rulesDeps(ctx), { ruleId: input.ruleId });
  return ok({ ruleId: input.ruleId, deleted: true });
}

export async function runRecategorizeAll(
  ctx: McpContext,
  input: { confirm?: boolean },
): Promise<ToolResult> {
  if (input.confirm !== true) {
    return preview(
      'Would re-run categorization over all non-manual transactions using the current rules.',
    );
  }
  recategorizeNonManualTransactions(rulesDeps(ctx));
  return ok({ recategorized: true });
}

export function registerCategoryWriteTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'create_category',
    {
      description: 'Create a spending category. `name` required; id is slugified from the name. ' +
        'Duplicate id returns an error. Optional `icon`.',
      inputSchema: { name: z.string().min(1), icon: z.string().nullable().optional() },
    },
    async (input) => runCreateCategory(ctx, input),
  );

  server.registerTool(
    'rename_category',
    {
      description: 'Rename an existing category by `id`. Unknown id returns an error.',
      inputSchema: { id: z.string(), name: z.string().min(1) },
    },
    async (input) => runRenameCategory(ctx, input),
  );

  server.registerTool(
    'delete_category',
    {
      description: 'Delete a category. CASCADE: reassigns its transactions to Uncategorized and drops ' +
        'dependent rules. PREVIEW-GATED: without `confirm:true` returns the affected transaction/rule ' +
        'counts and changes nothing; re-call with `confirm:true` to delete. Unknown id returns an error.',
      inputSchema: { id: z.string(), confirm: z.boolean().optional() },
    },
    async (input) => runDeleteCategory(ctx, input),
  );

  server.registerTool(
    'create_rule',
    {
      description: 'Create a categorization rule. `ruleType`: "merchant" (exact merchant key), ' +
        '"upi_note_keyword" (exact), or "keyword" (substring). `patternValue` non-empty, `categoryId`. ' +
        'Creating a rule recategorizes non-manual transactions. Empty pattern returns an error.',
      inputSchema: {
        ruleType: z.enum(['merchant', 'upi_note_keyword', 'keyword']),
        patternValue: z.string(),
        categoryId: z.string(),
      },
    },
    async (input) => runCreateRule(ctx, input),
  );

  server.registerTool(
    'update_rule',
    {
      description: 'Change a rule\'s target `categoryId` (and `ruleType`) by `ruleId`. Recategorizes ' +
        'non-manual transactions.',
      inputSchema: {
        ruleId: z.number().int(),
        categoryId: z.string(),
        ruleType: z.enum(['merchant', 'upi_note_keyword', 'keyword']),
      },
    },
    async (input) => runUpdateRule(ctx, input),
  );

  server.registerTool(
    'delete_rule',
    {
      description: 'Delete a categorization rule by `ruleId` and recategorize. PREVIEW-GATED: without ' +
        '`confirm:true` returns what would change and does nothing; re-call with `confirm:true`.',
      inputSchema: { ruleId: z.number().int(), confirm: z.boolean().optional() },
    },
    async (input) => runDeleteRule(ctx, input),
  );

  server.registerTool(
    'recategorize_all',
    {
      description: 'Re-run categorization over ALL non-manual transactions using the current rule set ' +
        '(wide blast radius). PREVIEW-GATED: without `confirm:true` describes the operation and does ' +
        'nothing; re-call with `confirm:true` to run.',
      inputSchema: { confirm: z.boolean().optional() },
    },
    async (input) => runRecategorizeAll(ctx, input),
  );
}
```

- [ ] **Step 4: Register in server.ts** — add import + `registerCategoryWriteTools(server, ctx);`.

- [ ] **Step 5: Run test to verify it passes**

Run: `packages/mcp/node_modules/.bin/vitest run test/write/categories.test.ts`
Expected: PASS.

> If `create_rule` empty-pattern test fails because core throws only on fully-empty (whitespace normalized): the core `normalizePatternValue('   ')` returns falsy → throws "Rule pattern cannot be empty." — the `try/catch`→`errorResult` handles it. Confirm the message path.

- [ ] **Step 6: Commit**

```bash
git add packages/mcp/src/tools/write/categories.ts packages/mcp/src/server.ts packages/mcp/test/write/categories.test.ts
git commit -m "feat(mcp): category + rule write tools with delete/recategorize preview gates"
```

---

### Task 3: Account write tool

**Files:**
- Create: `packages/mcp/src/tools/write/accounts.ts`
- Modify: `packages/mcp/src/server.ts` (register)
- Test: `packages/mcp/test/write/accounts.test.ts`

**Interfaces:**
- Consumes: `ctx.repos.accountRepo.ensureAccount({domain:'investment'|'expense', assetClass?, institution, label}): number`, `list({domain?})`, `getById(id)`.
- Produces: `runCreateAccount` + `registerAccountWriteTools(server, ctx)`.

- [ ] **Step 1: Write the failing test** — `packages/mcp/test/write/accounts.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { seedContext } from '../helpers';
import { runCreateAccount } from '../../src/tools/write/accounts';
import type { McpContext } from '../../src/context';

let ctx: McpContext;
afterEach(() => ctx?.close());

describe('create_account', () => {
  it('creates an account and returns its id', async () => {
    ctx = seedContext();
    const r = await runCreateAccount(ctx, { domain: 'expense', institution: 'HDFC', label: 'Savings' });
    expect(r.isError).toBeUndefined();
    const id = (r.structuredContent as any).id;
    expect(ctx.repos.accountRepo.getById(id)).toBeTruthy();
  });

  it('is idempotent (find-or-create by domain/institution/label)', async () => {
    ctx = seedContext();
    const a = await runCreateAccount(ctx, { domain: 'expense', institution: 'HDFC', label: 'Savings' });
    const b = await runCreateAccount(ctx, { domain: 'expense', institution: 'HDFC', label: 'Savings' });
    expect((a.structuredContent as any).id).toBe((b.structuredContent as any).id);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `packages/mcp/node_modules/.bin/vitest run test/write/accounts.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `packages/mcp/src/tools/write/accounts.ts`:

```ts
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from '../../context';
import { ok, type ToolResult } from '../../shared/output';

export async function runCreateAccount(
  ctx: McpContext,
  input: { domain: 'investment' | 'expense'; institution: string; label: string; assetClass?: string | null },
): Promise<ToolResult> {
  const id = ctx.repos.accountRepo.ensureAccount({
    domain: input.domain,
    institution: input.institution,
    label: input.label,
    assetClass: input.assetClass ?? null,
  });
  return ok({ id });
}

export function registerAccountWriteTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'create_account',
    {
      description: 'Create (or find) an account by `domain` ("investment"|"expense"), `institution`, and ' +
        '`label`. Idempotent — returns the existing account id if the triple already exists. Optional ' +
        '`assetClass`. Use before assigning transactions/assets to a new account.',
      inputSchema: {
        domain: z.enum(['investment', 'expense']),
        institution: z.string().min(1),
        label: z.string().min(1),
        assetClass: z.string().nullable().optional(),
      },
    },
    async (input) => runCreateAccount(ctx, input),
  );
}
```

- [ ] **Step 4: Register in server.ts** — add import + `registerAccountWriteTools(server, ctx);`.

- [ ] **Step 5: Run test to verify it passes**

Run: `packages/mcp/node_modules/.bin/vitest run test/write/accounts.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/mcp/src/tools/write/accounts.ts packages/mcp/src/server.ts packages/mcp/test/write/accounts.test.ts
git commit -m "feat(mcp): create_account write tool (idempotent ensureAccount)"
```

---

### Task 4: Asset write tools

**Files:**
- Create: `packages/mcp/src/tools/write/assets.ts`
- Modify: `packages/mcp/src/server.ts` (register)
- Test: `packages/mcp/test/write/assets.test.ts`

**Interfaces:**
- Consumes: `ctx.repos.accountRepo.ensureAccount`, `ctx.repos.assetRepo` (`create({accountId, assetClass, name, valuationStrategy:'computed'|'manual', ingestionMode?, params?, status?, openedAt?}): number`, `update(id, patch)`, `getById(id)`, `delete(id)`), `ctx.repos.assetContributionRepo.insert({assetId, contributionDate, amount, note?}): number`, `ctx.repos.assetValuationRepo.insert({assetId, value, valuedAt, note?}): number`, `ctx.repos.assetRateRepo.insert({assetId, effectiveFrom, rate}): number`. AssetClass enum: `'ppf'|'epf'|'nps'|'fd'|'gold'|'real_estate'|'cash'`.
- Produces: `runAddAsset`, `runUpdateAsset`, `runCloseAsset`, `runAddAssetContribution`, `runAddAssetValuation`, `runAddAssetRate`, `runDeleteAsset` + `registerAssetWriteTools(server, ctx)`.

> **Confirm the AssetClass enum** against `packages/core/src/types.ts` `AssetClass` before writing the Zod enum. Use the exact members. (Values shown above are from the L1.5 build.)

- [ ] **Step 1: Write the failing test** — `packages/mcp/test/write/assets.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { seedContext } from '../helpers';
import {
  runAddAsset, runUpdateAsset, runCloseAsset,
  runAddAssetContribution, runAddAssetValuation, runAddAssetRate, runDeleteAsset,
} from '../../src/tools/write/assets';
import type { McpContext } from '../../src/context';

let ctx: McpContext;
afterEach(() => ctx?.close());

function makeAccount(ctx: McpContext): number {
  return ctx.repos.accountRepo.ensureAccount({ domain: 'investment', institution: 'Self', label: 'PPF' });
}

describe('add_asset', () => {
  it('creates a computed asset and returns its id', async () => {
    ctx = seedContext();
    const accountId = makeAccount(ctx);
    const r = await runAddAsset(ctx, {
      accountId, assetClass: 'ppf', name: 'PPF SBI', valuationStrategy: 'computed',
    });
    expect(r.isError).toBeUndefined();
    const id = (r.structuredContent as any).id;
    expect(ctx.repos.assetRepo.getById(id)).toBeTruthy();
  });
});

describe('update_asset / close_asset', () => {
  it('updates the name', async () => {
    ctx = seedContext();
    const accountId = makeAccount(ctx);
    const id = (await runAddAsset(ctx, { accountId, assetClass: 'gold', name: 'Gold', valuationStrategy: 'manual' })).structuredContent!.id as number;
    const r = await runUpdateAsset(ctx, { id, name: 'Gold Bars' });
    expect(r.isError).toBeUndefined();
    expect(ctx.repos.assetRepo.getById(id)?.name).toBe('Gold Bars');
  });

  it('close_asset sets status to closed', async () => {
    ctx = seedContext();
    const accountId = makeAccount(ctx);
    const id = (await runAddAsset(ctx, { accountId, assetClass: 'fd', name: 'FD', valuationStrategy: 'computed' })).structuredContent!.id as number;
    const r = await runCloseAsset(ctx, { id });
    expect(r.isError).toBeUndefined();
    expect(ctx.repos.assetRepo.getById(id)?.status).toBe('closed');
  });

  it('update_asset unknown id returns isError', async () => {
    ctx = seedContext();
    const r = await runUpdateAsset(ctx, { id: 9999, name: 'X' });
    expect(r.isError).toBe(true);
  });
});

describe('asset sub-resources (append-only)', () => {
  it('adds a contribution, valuation, and rate', async () => {
    ctx = seedContext();
    const accountId = makeAccount(ctx);
    const id = (await runAddAsset(ctx, { accountId, assetClass: 'ppf', name: 'PPF', valuationStrategy: 'computed' })).structuredContent!.id as number;

    const c = await runAddAssetContribution(ctx, { assetId: id, contributionDate: '2026-01-01', amountInr: 5000 });
    expect(c.isError).toBeUndefined();
    expect(ctx.repos.assetContributionRepo.listByAsset(id).length).toBe(1);

    const v = await runAddAssetValuation(ctx, { assetId: id, valueInr: 50000, valuedAt: '2026-01-01' });
    expect(v.isError).toBeUndefined();
    expect(ctx.repos.assetValuationRepo.listByAsset(id).length).toBe(1);

    const rt = await runAddAssetRate(ctx, { assetId: id, effectiveFrom: '2026-01-01', ratePercent: 7.1 });
    expect(rt.isError).toBeUndefined();
    expect(ctx.repos.assetRateRepo.listByAsset(id).length).toBe(1);
  });

  it('contribution on unknown asset returns isError', async () => {
    ctx = seedContext();
    const r = await runAddAssetContribution(ctx, { assetId: 9999, contributionDate: '2026-01-01', amountInr: 100 });
    expect(r.isError).toBe(true);
  });
});

describe('delete_asset (preview-gated)', () => {
  it('needs confirm', async () => {
    ctx = seedContext();
    const accountId = makeAccount(ctx);
    const id = (await runAddAsset(ctx, { accountId, assetClass: 'gold', name: 'Gold', valuationStrategy: 'manual' })).structuredContent!.id as number;
    const p = await runDeleteAsset(ctx, { id });
    expect((p.structuredContent as any).preview).toBe(true);
    expect(ctx.repos.assetRepo.getById(id)).toBeTruthy();
    const d = await runDeleteAsset(ctx, { id, confirm: true });
    expect(d.isError).toBeUndefined();
    expect(ctx.repos.assetRepo.getById(id)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `packages/mcp/node_modules/.bin/vitest run test/write/assets.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `packages/mcp/src/tools/write/assets.ts`:

```ts
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Asset } from '@myfinance/core';
import type { McpContext } from '../../context';
import { ok, errorResult, preview, type ToolResult } from '../../shared/output';

// Keep in sync with core AssetClass (verify in packages/core/src/types.ts).
const ASSET_CLASSES = ['ppf', 'epf', 'nps', 'fd', 'gold', 'real_estate', 'cash'] as const;

export async function runAddAsset(
  ctx: McpContext,
  input: {
    accountId: number; assetClass: Asset['assetClass']; name: string;
    valuationStrategy: 'computed' | 'manual'; ingestionMode?: Asset['ingestionMode'];
    params?: Asset['params']; openedAt?: string | null;
  },
): Promise<ToolResult> {
  if (!ctx.repos.accountRepo.getById(input.accountId)) {
    return errorResult(`Account ${input.accountId} not found.`);
  }
  const id = ctx.repos.assetRepo.create({
    accountId: input.accountId,
    assetClass: input.assetClass,
    name: input.name,
    valuationStrategy: input.valuationStrategy,
    ingestionMode: input.ingestionMode,
    params: input.params,
    openedAt: input.openedAt ?? null,
  });
  return ok({ id });
}

export async function runUpdateAsset(
  ctx: McpContext,
  input: { id: number; name?: string; status?: 'active' | 'closed'; params?: Asset['params']; openedAt?: string | null },
): Promise<ToolResult> {
  if (!ctx.repos.assetRepo.getById(input.id)) return errorResult(`Asset ${input.id} not found.`);
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.status !== undefined) patch.status = input.status;
  if (input.params !== undefined) patch.params = input.params;
  if (input.openedAt !== undefined) patch.openedAt = input.openedAt;
  ctx.repos.assetRepo.update(input.id, patch as any);
  return ok({ id: input.id, updated: true });
}

export async function runCloseAsset(ctx: McpContext, input: { id: number }): Promise<ToolResult> {
  if (!ctx.repos.assetRepo.getById(input.id)) return errorResult(`Asset ${input.id} not found.`);
  ctx.repos.assetRepo.update(input.id, { status: 'closed' });
  return ok({ id: input.id, status: 'closed' });
}

export async function runAddAssetContribution(
  ctx: McpContext,
  input: { assetId: number; contributionDate: string; amountInr: number; note?: string | null },
): Promise<ToolResult> {
  if (!ctx.repos.assetRepo.getById(input.assetId)) return errorResult(`Asset ${input.assetId} not found.`);
  if (!Number.isFinite(input.amountInr)) return errorResult('amountInr must be a finite number.');
  const id = ctx.repos.assetContributionRepo.insert({
    assetId: input.assetId, contributionDate: input.contributionDate, amount: input.amountInr, note: input.note ?? null,
  });
  return ok({ id });
}

export async function runAddAssetValuation(
  ctx: McpContext,
  input: { assetId: number; valueInr: number; valuedAt: string; note?: string | null },
): Promise<ToolResult> {
  if (!ctx.repos.assetRepo.getById(input.assetId)) return errorResult(`Asset ${input.assetId} not found.`);
  if (!Number.isFinite(input.valueInr)) return errorResult('valueInr must be a finite number.');
  const id = ctx.repos.assetValuationRepo.insert({
    assetId: input.assetId, value: input.valueInr, valuedAt: input.valuedAt, note: input.note ?? null,
  });
  return ok({ id });
}

export async function runAddAssetRate(
  ctx: McpContext,
  input: { assetId: number; effectiveFrom: string; ratePercent: number },
): Promise<ToolResult> {
  if (!ctx.repos.assetRepo.getById(input.assetId)) return errorResult(`Asset ${input.assetId} not found.`);
  if (!Number.isFinite(input.ratePercent)) return errorResult('ratePercent must be a finite number.');
  const id = ctx.repos.assetRateRepo.insert({
    assetId: input.assetId, effectiveFrom: input.effectiveFrom, rate: input.ratePercent,
  });
  return ok({ id });
}

export async function runDeleteAsset(
  ctx: McpContext,
  input: { id: number; confirm?: boolean },
): Promise<ToolResult> {
  const asset = ctx.repos.assetRepo.getById(input.id);
  if (!asset) return errorResult(`Asset ${input.id} not found.`);
  if (input.confirm !== true) {
    return preview(`Would delete asset ${input.id} ("${asset.name}") and its contributions/valuations/rates.`, {
      assetId: input.id,
    });
  }
  ctx.repos.assetRepo.delete(input.id);
  return ok({ id: input.id, deleted: true });
}

export function registerAssetWriteTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'add_asset',
    {
      description: 'Add a non-market asset (FD/PPF/EPF/NPS/gold/real_estate/cash). Requires `accountId` ' +
        '(create with create_account first), `assetClass`, `name`, `valuationStrategy` ("computed" for ' +
        'FD/PPF/EPF/NPS, "manual" for gold/real_estate/cash). Optional `params` (JSON: compounding, ' +
        'maturityDate, grams, …), `openedAt`. Then use add_asset_contribution/valuation/rate. Mutual ' +
        'funds are NOT assets here — they come from the MF pipeline.',
      inputSchema: {
        accountId: z.number().int(),
        assetClass: z.enum(ASSET_CLASSES),
        name: z.string().min(1),
        valuationStrategy: z.enum(['computed', 'manual']),
        ingestionMode: z.enum(['manual_entry', 'file_import']).optional(),
        params: z.record(z.any()).optional(),
        openedAt: z.string().nullable().optional(),
      },
    },
    async (input) => runAddAsset(ctx, input as any),
  );

  server.registerTool(
    'update_asset',
    {
      description: 'Update an asset\'s `name`, `status`, `params`, or `openedAt`. Unknown id returns an error.',
      inputSchema: {
        id: z.number().int(),
        name: z.string().optional(),
        status: z.enum(['active', 'closed']).optional(),
        params: z.record(z.any()).optional(),
        openedAt: z.string().nullable().optional(),
      },
    },
    async (input) => runUpdateAsset(ctx, input as any),
  );

  server.registerTool(
    'close_asset',
    {
      description: 'Mark an asset as closed (status="closed"); it stops counting toward net worth. ' +
        'Convenience for update_asset with status:"closed". Unknown id returns an error.',
      inputSchema: { id: z.number().int() },
    },
    async (input) => runCloseAsset(ctx, input),
  );

  server.registerTool(
    'add_asset_contribution',
    {
      description: 'Append a contribution (deposit) to an asset — FD single deposit; PPF/EPF/NPS recurring. ' +
        '`amountInr`, ISO `contributionDate`, optional `note`. Append-only.',
      inputSchema: {
        assetId: z.number().int(), contributionDate: z.string(),
        amountInr: z.number(), note: z.string().nullable().optional(),
      },
    },
    async (input) => runAddAssetContribution(ctx, input),
  );

  server.registerTool(
    'add_asset_valuation',
    {
      description: 'Append a stated valuation to a manual asset (gold/real_estate/cash) — `valueInr` at ' +
        'ISO `valuedAt`, optional `note`. Append-only time series.',
      inputSchema: {
        assetId: z.number().int(), valueInr: z.number(),
        valuedAt: z.string(), note: z.string().nullable().optional(),
      },
    },
    async (input) => runAddAssetValuation(ctx, input),
  );

  server.registerTool(
    'add_asset_rate',
    {
      description: 'Append an interest-rate period to a computed asset (FD/PPF/EPF/NPS). `ratePercent` ' +
        '(annual %) effective from ISO `effectiveFrom`. Multiple periods model rate changes (e.g. PPF resets).',
      inputSchema: {
        assetId: z.number().int(), effectiveFrom: z.string(), ratePercent: z.number(),
      },
    },
    async (input) => runAddAssetRate(ctx, input),
  );

  server.registerTool(
    'delete_asset',
    {
      description: 'Delete an asset and its contributions/valuations/rates. PREVIEW-GATED: without ' +
        '`confirm:true` describes what would be removed and does nothing; re-call with `confirm:true`. ' +
        'Prefer close_asset to retire an asset while keeping its history.',
      inputSchema: { id: z.number().int(), confirm: z.boolean().optional() },
    },
    async (input) => runDeleteAsset(ctx, input),
  );
}
```

- [ ] **Step 4: Register in server.ts** — add import + `registerAssetWriteTools(server, ctx);`.

- [ ] **Step 5: Run test to verify it passes**

Run: `packages/mcp/node_modules/.bin/vitest run test/write/assets.test.ts`
Expected: PASS.

> If `getById` on a deleted asset returns `undefined` rather than `null`, change the test assertion to `.toBeFalsy()`. Match the actual repo return.

- [ ] **Step 6: Commit**

```bash
git add packages/mcp/src/tools/write/assets.ts packages/mcp/src/server.ts packages/mcp/test/write/assets.test.ts
git commit -m "feat(mcp): asset write tools (add/update/close/delete + contribution/valuation/rate)"
```

---

### Task 5: Liability write tools

**Files:**
- Create: `packages/mcp/src/tools/write/liabilities.ts`
- Modify: `packages/mcp/src/server.ts` (register)
- Test: `packages/mcp/test/write/liabilities.test.ts`

**Interfaces:**
- Consumes: `ctx.repos.liabilityRepo` (`create({accountId?, name, loanType, principal, annualRate, tenureMonths?, emiAmount?, startDate, status?}): number`, `update(id, patch)`, `getById(id)`, `delete(id)`). loanType: `'home'|'car'|'personal'|'other'`.
- Produces: `runAddLiability`, `runUpdateLiability`, `runDeleteLiability` + `registerLiabilityWriteTools(server, ctx)`.

- [ ] **Step 1: Write the failing test** — `packages/mcp/test/write/liabilities.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { seedContext } from '../helpers';
import { runAddLiability, runUpdateLiability, runDeleteLiability } from '../../src/tools/write/liabilities';
import type { McpContext } from '../../src/context';

let ctx: McpContext;
afterEach(() => ctx?.close());

describe('add_liability', () => {
  it('creates a tenure-based loan', async () => {
    ctx = seedContext();
    const r = await runAddLiability(ctx, {
      name: 'Home Loan', loanType: 'home', principalInr: 1000000,
      annualRatePercent: 9, tenureMonths: 120, startDate: '2026-01-01',
    });
    expect(r.isError).toBeUndefined();
    const id = (r.structuredContent as any).id;
    expect(ctx.repos.liabilityRepo.getById(id)?.name).toBe('Home Loan');
  });

  it('rejects non-positive principal', async () => {
    ctx = seedContext();
    const r = await runAddLiability(ctx, {
      name: 'X', loanType: 'personal', principalInr: 0, annualRatePercent: 10,
      tenureMonths: 12, startDate: '2026-01-01',
    });
    expect(r.isError).toBe(true);
  });
});

describe('update_liability', () => {
  it('updates rate and can close via status', async () => {
    ctx = seedContext();
    const id = (await runAddLiability(ctx, {
      name: 'Car', loanType: 'car', principalInr: 500000, annualRatePercent: 8,
      tenureMonths: 60, startDate: '2026-01-01',
    })).structuredContent!.id as number;
    const r = await runUpdateLiability(ctx, { id, annualRatePercent: 7.5, status: 'closed' });
    expect(r.isError).toBeUndefined();
    const l = ctx.repos.liabilityRepo.getById(id)!;
    expect(l.annualRate).toBe(7.5);
    expect(l.status).toBe('closed');
  });

  it('unknown id returns isError', async () => {
    ctx = seedContext();
    const r = await runUpdateLiability(ctx, { id: 9999, annualRatePercent: 5 });
    expect(r.isError).toBe(true);
  });
});

describe('delete_liability (preview-gated)', () => {
  it('needs confirm', async () => {
    ctx = seedContext();
    const id = (await runAddLiability(ctx, {
      name: 'Personal', loanType: 'personal', principalInr: 100000, annualRatePercent: 12,
      tenureMonths: 24, startDate: '2026-01-01',
    })).structuredContent!.id as number;
    const p = await runDeleteLiability(ctx, { id });
    expect((p.structuredContent as any).preview).toBe(true);
    expect(ctx.repos.liabilityRepo.getById(id)).toBeTruthy();
    const d = await runDeleteLiability(ctx, { id, confirm: true });
    expect(d.isError).toBeUndefined();
    expect(ctx.repos.liabilityRepo.getById(id)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `packages/mcp/node_modules/.bin/vitest run test/write/liabilities.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `packages/mcp/src/tools/write/liabilities.ts`:

```ts
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Liability } from '@myfinance/core';
import type { McpContext } from '../../context';
import { ok, errorResult, preview, type ToolResult } from '../../shared/output';

export async function runAddLiability(
  ctx: McpContext,
  input: {
    name: string; loanType: Liability['loanType']; principalInr: number; annualRatePercent: number;
    tenureMonths?: number | null; emiAmountInr?: number | null; startDate: string; accountId?: number | null;
  },
): Promise<ToolResult> {
  if (!Number.isFinite(input.principalInr) || input.principalInr <= 0) {
    return errorResult('principalInr must be a positive, finite number.');
  }
  const id = ctx.repos.liabilityRepo.create({
    accountId: input.accountId ?? null,
    name: input.name,
    loanType: input.loanType,
    principal: input.principalInr,
    annualRate: input.annualRatePercent,
    tenureMonths: input.tenureMonths ?? null,
    emiAmount: input.emiAmountInr ?? null,
    startDate: input.startDate,
  });
  return ok({ id });
}

export async function runUpdateLiability(
  ctx: McpContext,
  input: {
    id: number; name?: string; loanType?: Liability['loanType']; principalInr?: number;
    annualRatePercent?: number; tenureMonths?: number | null; emiAmountInr?: number | null;
    startDate?: string; status?: 'active' | 'closed';
  },
): Promise<ToolResult> {
  if (!ctx.repos.liabilityRepo.getById(input.id)) return errorResult(`Liability ${input.id} not found.`);
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.loanType !== undefined) patch.loanType = input.loanType;
  if (input.principalInr !== undefined) patch.principal = input.principalInr;
  if (input.annualRatePercent !== undefined) patch.annualRate = input.annualRatePercent;
  if (input.tenureMonths !== undefined) patch.tenureMonths = input.tenureMonths;
  if (input.emiAmountInr !== undefined) patch.emiAmount = input.emiAmountInr;
  if (input.startDate !== undefined) patch.startDate = input.startDate;
  if (input.status !== undefined) patch.status = input.status;
  ctx.repos.liabilityRepo.update(input.id, patch as any);
  return ok({ id: input.id, updated: true });
}

export async function runDeleteLiability(
  ctx: McpContext,
  input: { id: number; confirm?: boolean },
): Promise<ToolResult> {
  const loan = ctx.repos.liabilityRepo.getById(input.id);
  if (!loan) return errorResult(`Liability ${input.id} not found.`);
  if (input.confirm !== true) {
    return preview(`Would delete liability ${input.id} ("${loan.name}").`, { liabilityId: input.id });
  }
  ctx.repos.liabilityRepo.delete(input.id);
  return ok({ id: input.id, deleted: true });
}

export function registerLiabilityWriteTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'add_liability',
    {
      description: 'Add a loan. `name`, `loanType` (home|car|personal|other), `principalInr` (positive), ' +
        '`annualRatePercent`, ISO `startDate`, and either `tenureMonths` OR `emiAmountInr`. Optional ' +
        '`accountId`. EMI/amortization are computed by the read tools.',
      inputSchema: {
        name: z.string().min(1),
        loanType: z.enum(['home', 'car', 'personal', 'other']),
        principalInr: z.number().positive(),
        annualRatePercent: z.number(),
        tenureMonths: z.number().int().nullable().optional(),
        emiAmountInr: z.number().nullable().optional(),
        startDate: z.string(),
        accountId: z.number().int().nullable().optional(),
      },
    },
    async (input) => runAddLiability(ctx, input as any),
  );

  server.registerTool(
    'update_liability',
    {
      description: 'Update a loan\'s fields by `id` (name/loanType/principalInr/annualRatePercent/' +
        'tenureMonths/emiAmountInr/startDate/status). Set `status:"closed"` to close a paid-off loan. ' +
        'Unknown id returns an error.',
      inputSchema: {
        id: z.number().int(),
        name: z.string().optional(),
        loanType: z.enum(['home', 'car', 'personal', 'other']).optional(),
        principalInr: z.number().positive().optional(),
        annualRatePercent: z.number().optional(),
        tenureMonths: z.number().int().nullable().optional(),
        emiAmountInr: z.number().nullable().optional(),
        startDate: z.string().optional(),
        status: z.enum(['active', 'closed']).optional(),
      },
    },
    async (input) => runUpdateLiability(ctx, input as any),
  );

  server.registerTool(
    'delete_liability',
    {
      description: 'Delete a loan by `id`. PREVIEW-GATED: without `confirm:true` describes what would be ' +
        'deleted and does nothing; re-call with `confirm:true`. Prefer update_liability status:"closed" ' +
        'to retire a paid-off loan.',
      inputSchema: { id: z.number().int(), confirm: z.boolean().optional() },
    },
    async (input) => runDeleteLiability(ctx, input),
  );
}
```

- [ ] **Step 4: Register in server.ts** — add import + `registerLiabilityWriteTools(server, ctx);`.

- [ ] **Step 5: Run test to verify it passes**

Run: `packages/mcp/node_modules/.bin/vitest run test/write/liabilities.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/mcp/src/tools/write/liabilities.ts packages/mcp/src/server.ts packages/mcp/test/write/liabilities.test.ts
git commit -m "feat(mcp): liability write tools (add/update/delete) with delete preview gate"
```

---

### Task 6: Split-recipe integration test + server registration test

**Files:**
- Test: `packages/mcp/test/write/split-recipe.test.ts`
- Modify: `packages/mcp/test/server.test.ts` (extend the tools/list assertion)

**Interfaces:**
- Consumes: `runAddTransaction`, `runUpdateTransaction` (Task 1); `buildServer`, `buildContext` for the tools/list check.

- [ ] **Step 1: Write the split-recipe test** — `packages/mcp/test/write/split-recipe.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { seedContext } from '../helpers';
import { runAddTransaction, runUpdateTransaction } from '../../src/tools/write/transactions';
import type { McpContext } from '../../src/context';

let ctx: McpContext;
afterEach(() => ctx?.close());

describe('split recipe (compose update + add — documented non-atomic)', () => {
  it('shrinking the original + adding the remainder sums to the original', async () => {
    ctx = seedContext();
    // original ₹1000 "out"
    const add = await runAddTransaction(ctx, {
      transactionDate: '2026-02-01', description: 'Combined bill', amountInr: 1000, direction: 'out',
    });
    const id = (add.structuredContent as any).id;

    // step 1: shrink original to part A (₹600)
    await runUpdateTransaction(ctx, { id, amountInr: 600 });
    // step 2: add remainder part B (₹400), copying date/description/direction
    const partB = await runAddTransaction(ctx, {
      transactionDate: '2026-02-01', description: 'Combined bill (split)', amountInr: 400, direction: 'out',
    });
    const bId = (partB.structuredContent as any).id;

    const rows = ctx.repos.expenseTxRepo.query({ limit: 50 }) as any[];
    const a = rows.find((r) => r.id === id);
    const b = rows.find((r) => r.id === bId);
    expect(a.amount + b.amount).toBe(1000);
  });
});
```

- [ ] **Step 2: Run it** — `packages/mcp/node_modules/.bin/vitest run test/write/split-recipe.test.ts` → PASS.

- [ ] **Step 3: Extend the server tools/list test** — in `packages/mcp/test/server.test.ts`, add assertions that write tools are registered. First read the existing test to match its style (it lists tools via an in-memory client or `server` internals). Add, in the same style it already uses to assert the 10 read tools:

```ts
// after the existing read-tool assertions:
const expectedWrites = [
  'add_transaction', 'update_transaction', 'delete_transaction', 'categorize_transaction',
  'create_category', 'rename_category', 'delete_category',
  'create_rule', 'update_rule', 'delete_rule', 'recategorize_all',
  'create_account',
  'add_asset', 'update_asset', 'close_asset',
  'add_asset_contribution', 'add_asset_valuation', 'add_asset_rate', 'delete_asset',
  'add_liability', 'update_liability', 'delete_liability',
];
for (const name of expectedWrites) {
  expect(toolNames).toContain(name);
}
```

> Match `toolNames` to however the existing test extracts registered tool names. If it uses `await client.listTools()`, reuse that; do not invent a new mechanism.

- [ ] **Step 4: Run the server test** — `packages/mcp/node_modules/.bin/vitest run test/server.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/mcp/test/write/split-recipe.test.ts packages/mcp/test/server.test.ts
git commit -m "test(mcp): split-recipe integration + server registers all write tools"
```

---

### Task 7: Full-suite gate, typecheck, seam invariant, stdio smoke

**Files:** none (verification only) — plus a possible `packages/mcp/README.md` note.

- [ ] **Step 1: Full mcp test suite**

Run: `packages/mcp/node_modules/.bin/vitest run` (from `packages/mcp`)
Expected: PASS — the 26 L3 tests + all new write tests.

- [ ] **Step 2: Typecheck the whole graph**

Run (from repo root):
```bash
source ~/.nvm/nvm.sh && nvm use 20 && \
packages/core/node_modules/.bin/tsc --build && \
packages/mcp/node_modules/.bin/tsc --build
```
Expected: clean (no errors). If `@myfinance/core` types are stale, the core build refreshes them.

- [ ] **Step 3: Seam invariant check**

Run: `grep -rnE "better-sqlite3|from 'drizzle|from \"drizzle" packages/mcp/src`
Expected: NO matches in any `.ts` under `packages/mcp/src` (a comment mentioning better-sqlite3 in `context.ts` is fine — the grep targets imports).

- [ ] **Step 4: Groww gate — net diff scope**

Run: `git diff --name-only origin/main...HEAD | grep -v '^docs/' | sort`
Expected: every path is under `packages/mcp/` (plus the spec/plan under `docs/`). **Zero `packages/core/` files.** This is the Groww-safety proof — core is untouched, so the golden-master is trivially 6/6 unchanged. (Optionally run the core golden test to be doubly sure: `packages/core/node_modules/.bin/vitest run test/golden/groww.golden.test.ts` → PASS.)

- [ ] **Step 5: Live stdio smoke** — verify a real write end-to-end through the running server. Create `/tmp/mcp-write-smoke.mjs`:

```js
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'node',
  args: [process.env.TSX, 'src/index.ts'],
  cwd: process.env.MCP_DIR,
});
const client = new Client({ name: 'smoke', version: '0' }, { capabilities: {} });
await client.connect(transport);

const tools = (await client.listTools()).tools.map((t) => t.name);
console.log('add_transaction present:', tools.includes('add_transaction'));

const add = await client.callTool({
  name: 'add_transaction',
  arguments: { transactionDate: '2026-03-01', description: 'Smoke test', amountInr: 123, direction: 'out' },
});
console.log('add result:', add.structuredContent);

const del = await client.callTool({ name: 'delete_transaction', arguments: { id: add.structuredContent.id } });
console.log('delete preview (no confirm):', del.structuredContent);

const list = await client.callTool({ name: 'list_transactions', arguments: {} });
console.log('list count:', list.structuredContent?.count);
await client.close();
```

Run:
```bash
cd packages/mcp && \
MCP_DIR="$PWD" TSX="$PWD/node_modules/.bin/tsx" node /tmp/mcp-write-smoke.mjs
```
Expected: `add_transaction present: true`; `add result:` has an `id`; `delete preview (no confirm):` shows `{ preview: true, ... }`; `list count` ≥ 1 (the smoke server uses a fresh in-memory DB per launch — the added row is visible within the same session).

> If the SDK client stdio args differ from the L3 smoke pattern, mirror whatever `packages/mcp/README.md` or the L3 memory documents for launching the server via `tsx`.

- [ ] **Step 6: Commit any doc note** (if the README lists tools, add the write tools + the write-enable/safety note):

```bash
git add -A packages/mcp
git commit -m "docs(mcp): note write tools + model-C preview safety in README" || echo "no README change"
```

---

### Task 8: Subagent code review + close-out

- [ ] **Step 1: Dispatch a fresh code-reviewer** (`feature-dev:code-reviewer`) against the diff `origin/main...HEAD`, with the spec `docs/superpowers/specs/2026-07-16-l4-mcp-write-tools-design.md` as the contract. Focus: (a) every gated tool leaves the DB unchanged without `confirm` (the critical property), (b) no double-recategorize (core rule fns already recategorize), (c) direction in→credit/out→debit mapping, (d) seam invariant, (e) zero core change, (f) descriptions teach the split recipe.

- [ ] **Step 2: Triage findings** via `superpowers:receiving-code-review` — fix real issues with a regression test each; push back on noise. Re-run the full mcp suite after fixes.

- [ ] **Step 3: Push + PR**

```bash
gh auth switch --user ak688744
git push -u origin layer/4-mcp-write-tools
gh pr create --base main --title "L4: MCP write tools (composable mutation primitives + model-C safety)" \
  --body "Implements docs/superpowers/specs/2026-07-16-l4-mcp-write-tools-design.md. ~22 composable write tools over packages/mcp; delete/wide ops preview-gated; zero core change; Groww 6/6 unchanged."
```

- [ ] **Step 4: Update MASTER_PLAN.md** — mark the L4 write-tools brainstorm/plan/build item in §8; add a one-line status. Save a project-memory decision (build complete, tool list, gotchas). Call `session_summary`.

---

## Self-Review

**Spec coverage:**
- §3 architecture (write dir, module pattern, direct-to-core, runInTransaction, always-registered) → Tasks 0–6.
- §4 catalog — every tool mapped: transactions (T1), categories/rules/recategorize (T2), account (T3), assets+sub-resources (T4), liabilities (T5). ✅ 22 tools.
- §5 decisions: D1/D2 preview gate → T1/T2/T4/T5 gated tools + T0 helper; D3 no split tool + D4 recipe → T1 descriptions + T6 integration test; D6 always-registered → T6 server test; D7 no cap → recategorize_all has none; D8 runInTransaction → categorize_transaction (T1); D9 money sanity → T1/T4/T5 handlers; D10 insert-only sub-resources → T4. ✅
- §6 validation model → Zod schemas (all tasks) + errorResult semantic failures + preview flow. ✅
- §7 testing: per-tool happy/failure/preview-gate/atomicity → each task; split-recipe → T6; standing gates (Groww/suite/typecheck/seam/stdio/review) → T7/T8. ✅

**Placeholder scan:** No TBD/TODO. Every code step has full code. Three explicit "confirm against real repo shape" notes (query() row field names, AssetClass enum, getById null-vs-undefined, server.test tool-name extraction) are verification instructions, not placeholders — each says exactly what to check and how to adjust without touching core.

**Type consistency:** Handler names (`run<Name>`) and registrar names (`register<Domain>WriteTools`) consistent across tasks and the T6 server test. `preview()` signature matches T0 definition. Direction mapping `in→credit/out→debit` stated in Global Constraints and used in T1. Repo method names match the verified signatures in `packages/core/src/repositories/types.ts`.
