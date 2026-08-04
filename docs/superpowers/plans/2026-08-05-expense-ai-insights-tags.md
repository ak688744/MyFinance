# Expense AI Insights + Notes→Tags + Expense Clarity Agent — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add structured tags to transactions, deterministic AI insight cards on the Expenses page, and an insight-scoped Expense Clarity Agent (sidebar chat) that categorizes + tags transactions with confidence-gated AI.

**Architecture:** Three subsystems on one branch. (A) `tags` JSON column on `transactions` + repo/API/MCP/UI. (B) pure `expenseInsights.ts` domain detectors + `GET /expenses/insights` + cards. (C) a new `buildExpenseAgent` (isolated memory, focused toolset, own `expense_agent` AI task) reached via a parameterized `runChat({agent})`, surfaced through an extracted `ChatPanel` in an `ExpensesInsightDrawer`; plus a confidence-gate + leave-blank change to the existing `/categories/ai-suggest` categorization pass.

**Tech Stack:** TypeScript monorepo (pnpm workspaces), better-sqlite3 + Drizzle (core), Fastify (api), `@modelcontextprotocol/sdk` (mcp), Mastra `@mastra/core`/`@mastra/memory`/`@mastra/mcp` (agent-harness), React 19 + Vite + TanStack Query (web), Vitest everywhere.

## Global Constraints

- **Node 22** for all commands: prefix with `source ~/.nvm/nvm.sh && nvm use 22`.
- **pnpm is crash-prone on this machine** — do NOT run `pnpm install` unless adding a dep. Build/test via the workspace binaries: `node_modules/.bin/tsc` and `node_modules/.bin/vitest` (per-package bins also exist, e.g. `packages/mcp/node_modules/.bin/vitest`).
- **Never compile the monorepo to JS** — it runs TypeScript directly via `tsx`. Typecheck only with `tsc --build`.
- **Typecheck order:** `tsc --build` from repo root builds the project graph (core → agents → api / mcp / agent-harness → web). Build core first when in doubt.
- **Seam invariant:** NO `drizzle-orm` or `better-sqlite3` import in `packages/core/src/domain/**`, `packages/agent-harness/src/**`, or `packages/mcp/src/**` (a derived sqlite *type* is fine).
- **Frozen financial logic:** do NOT modify `packages/core/src/domain/categorize.ts`, XIRR, portfolio, parsers, or NAV. The AI-categorization change lives only in `packages/agents` + the api route. **Groww golden-master must stay 6/6 unchanged.**
- **Money/rate/value are REAL (float).**
- **Tags stored lowercase, trimmed, deduped within a row**, as JSON array of `{ tag: string, source: 'user' | 'agent' }`; empty array persists as `NULL`.
- **Confidence threshold** for AI categorization = `0.9` (`AI_CATEGORIZE_MIN_CONFIDENCE`).
- Branch: `feat/expense-ai-insights-tags` off `feat/agent-response-calibration`.
- Commit after every task. Push/PR via `gh auth switch --user ak688744`.
- Starter tag vocabulary (suggestions only; tags are free strings): `recurring`, `one-time`, `subscription`, `reimbursable`, `work`, `personal`.

---

## File Structure

**Subsystem A — Tags**
- Modify `packages/core/src/db/schema.ts` — add `tags TEXT` column.
- Create `packages/core/drizzle/0007_transaction_tags.sql` + journal entry + snapshot.
- Create `packages/core/src/domain/tags.ts` — pure `normalizeTags`, `mergeTags`, `removeTagFrom`, `serializeTags`, `parseTags` (no Drizzle).
- Modify `packages/core/src/repositories/types.ts` — `Tag` type, `tags` on `ExpenseTransactionRow`, 4 tag methods on `ExpenseTransactionRepo`.
- Modify `packages/core/src/repositories/expenseTransactionRepo.ts` — implement methods, add `tags` to `query()`.
- Modify `packages/core/src/index.ts` — export tags helpers + `Tag` type.
- Modify `packages/api/src/routes/transactions.ts` — `PATCH /transactions/:id/tags`, `DELETE /transactions/:id/tags/:tag`.
- Modify `packages/mcp/src/tools/write/transactions.ts` — `tag_transaction` tool.
- Modify `apps/web` — tag chips on Expenses rows + hooks.

**Subsystem B — Insights**
- Create `packages/core/src/domain/insights/expenseInsights.ts` — pure detectors.
- Modify `packages/core/src/index.ts` — export `computeExpenseInsights`, `Insight` types.
- Modify `packages/api/src/routes/expenses.ts` — `GET /expenses/insights`.
- Modify `apps/web` — insight cards + localStorage dismissal + hook.

**Subsystem C — Agent + chat + categorization**
- Modify `packages/agents/src/categorize/aiCategorize.ts` — confidence gate.
- Modify `packages/api/src/routes/categories.ts` — leave-blank apply + learn-rule on confident.
- Modify `packages/agents/src/tasks.ts` — add `expense_agent`.
- Create `packages/mcp/src/tools/read/categories.ts` — `list_categories` read tool.
- Modify `packages/mcp/src/server.ts` — register `list_categories`.
- Create `packages/agent-harness/src/expenseAgent.ts` — `buildExpenseAgent` + `EXPENSE_INSTRUCTIONS` + `EXPENSE_TOOL_ALLOWLIST` + `filterTools`.
- Modify `packages/agent-harness/src/modelResolver.ts` — parameterize task in `resolveWealthRoute` (or add `resolveRoute(task)`).
- Modify `packages/agent-harness/src/runChat.ts` — `agent` param → builder/route/memory-resource selection.
- Modify `packages/agent-harness/src/index.ts` — exports.
- Modify `packages/api/src/routes/agent.ts` — pass `agent` field.
- Create `apps/web/src/features/assistant/ChatPanel.tsx` — extracted chat core.
- Modify `apps/web/src/features/assistant/AssistantPage.tsx` — use `ChatPanel`.
- Modify `apps/web/src/features/assistant/useAgentChat.ts` — options `{ storageKey?, persist?, agent? }`.
- Modify `apps/web/src/lib/apiStream.ts` — `agent` in request.
- Create `apps/web/src/features/expenses/insightSeed.ts` — pure `buildInsightSeed`.
- Create `apps/web/src/features/expenses/ExpensesInsightDrawer.tsx`.
- Create `apps/web/src/features/expenses/InsightCards.tsx`.
- Modify `apps/web/src/features/expenses/ExpensesPage.tsx` — wire cards + drawer + tag chips.

---

## PHASE A — Tags data model

### Task A1: Pure tag helpers (`domain/tags.ts`)

**Files:**
- Create: `packages/core/src/domain/tags.ts`
- Test: `packages/core/test/unit/tags.test.ts`

**Interfaces:**
- Produces:
  - `type Tag = { tag: string; source: 'user' | 'agent' }`
  - `normalizeTags(raw: Tag[]): Tag[]` — lowercase+trim each `tag`, drop empties, dedupe by `tag` (last wins on `source`), preserve first-seen order.
  - `parseTags(json: string | null): Tag[]` — JSON.parse a stored value; return `[]` on null/blank/parse-error/non-array; coerce each entry, drop invalid, then `normalizeTags`.
  - `serializeTags(tags: Tag[]): string | null` — `normalizeTags` then `JSON.stringify`; return `null` when empty.
  - `mergeTags(existing: Tag[], incoming: Tag[]): Tag[]` — `normalizeTags([...existing, ...incoming])` (incoming wins source on collision).
  - `removeTagFrom(existing: Tag[], tag: string): Tag[]` — drop entries whose `tag` equals `tag.toLowerCase().trim()`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { normalizeTags, parseTags, serializeTags, mergeTags, removeTagFrom } from '../../src/domain/tags';

describe('tags helpers', () => {
  it('normalizeTags lowercases, trims, dedupes (last source wins), keeps order', () => {
    expect(normalizeTags([
      { tag: ' Subscription ', source: 'user' },
      { tag: 'recurring', source: 'user' },
      { tag: 'SUBSCRIPTION', source: 'agent' },
      { tag: '  ', source: 'user' },
    ])).toEqual([
      { tag: 'subscription', source: 'agent' },
      { tag: 'recurring', source: 'user' },
    ]);
  });

  it('parseTags handles null, blank, bad json, non-array, invalid entries', () => {
    expect(parseTags(null)).toEqual([]);
    expect(parseTags('')).toEqual([]);
    expect(parseTags('not json')).toEqual([]);
    expect(parseTags('{"a":1}')).toEqual([]);
    expect(parseTags('[{"tag":"work","source":"user"},{"tag":123}]')).toEqual([
      { tag: 'work', source: 'user' },
    ]);
    expect(parseTags('[{"tag":"x","source":"weird"}]')).toEqual([{ tag: 'x', source: 'user' }]);
  });

  it('serializeTags returns null when empty, json otherwise', () => {
    expect(serializeTags([])).toBeNull();
    expect(serializeTags([{ tag: 'Work', source: 'user' }])).toBe('[{"tag":"work","source":"user"}]');
  });

  it('mergeTags unions with incoming source winning; removeTagFrom drops case-insensitively', () => {
    expect(mergeTags(
      [{ tag: 'work', source: 'user' }],
      [{ tag: 'WORK', source: 'agent' }, { tag: 'subscription', source: 'agent' }],
    )).toEqual([
      { tag: 'work', source: 'agent' },
      { tag: 'subscription', source: 'agent' },
    ]);
    expect(removeTagFrom([{ tag: 'work', source: 'user' }, { tag: 'x', source: 'agent' }], 'WORK ')).toEqual([
      { tag: 'x', source: 'agent' },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && packages/core/node_modules/.bin/vitest run test/unit/tags.test.ts --root packages/core`
Expected: FAIL — cannot find module `../../src/domain/tags`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/core/src/domain/tags.ts
export type TagSource = 'user' | 'agent';
export type Tag = { tag: string; source: TagSource };

function coerceSource(s: unknown): TagSource {
  return s === 'agent' ? 'agent' : 'user';
}

export function normalizeTags(raw: Tag[]): Tag[] {
  const out: Tag[] = [];
  const idx = new Map<string, number>();
  for (const t of raw) {
    if (!t || typeof t.tag !== 'string') continue;
    const tag = t.tag.trim().toLowerCase();
    if (!tag) continue;
    const source = coerceSource(t.source);
    const at = idx.get(tag);
    if (at === undefined) { idx.set(tag, out.length); out.push({ tag, source }); }
    else { out[at] = { tag, source }; } // last wins on source, keeps position
  }
  return out;
}

export function parseTags(json: string | null): Tag[] {
  if (!json) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { return []; }
  if (!Array.isArray(parsed)) return [];
  const coerced: Tag[] = [];
  for (const e of parsed) {
    if (e && typeof (e as Tag).tag === 'string') {
      coerced.push({ tag: (e as Tag).tag, source: coerceSource((e as { source?: unknown }).source) });
    }
  }
  return normalizeTags(coerced);
}

export function serializeTags(tags: Tag[]): string | null {
  const n = normalizeTags(tags);
  return n.length ? JSON.stringify(n) : null;
}

export function mergeTags(existing: Tag[], incoming: Tag[]): Tag[] {
  return normalizeTags([...existing, ...incoming]);
}

export function removeTagFrom(existing: Tag[], tag: string): Tag[] {
  const key = tag.trim().toLowerCase();
  return existing.filter((t) => t.tag !== key);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && packages/core/node_modules/.bin/vitest run test/unit/tags.test.ts --root packages/core`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/domain/tags.ts packages/core/test/unit/tags.test.ts
git commit -m "feat(core): pure tag normalization/parse/serialize helpers"
```

---

### Task A2: Schema column + migration `0007`

**Files:**
- Modify: `packages/core/src/db/schema.ts:77` (add after `note`)
- Create: `packages/core/drizzle/0007_transaction_tags.sql`
- Modify: `packages/core/drizzle/meta/_journal.json`
- Create: `packages/core/drizzle/meta/0007_snapshot.json` (copy 0006 shape is not required for runtime — see note)
- Test: `packages/core/test/unit/migrations.tags.test.ts`

**Interfaces:**
- Produces: `transactions.tags` column (nullable TEXT), migration applied by `runMigrations`.

> **Migration mechanism note:** the app applies migrations from the `.sql` files listed in `_journal.json` (Drizzle migrator). A `meta/NNNN_snapshot.json` is only needed for `drizzle-kit generate` diffs, not at runtime. To avoid coupling to `drizzle-kit` (which pnpm-installs), hand-write the `.sql` + journal entry (mirrors how 0005/0006 were added — single `ALTER TABLE`). Do NOT run `drizzle-kit`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { runMigrations } from '../../src/db/client';

describe('migration 0007 tags column', () => {
  it('transactions has a tags column after migration', () => {
    const { sqlite } = runMigrations(':memory:');
    const cols = sqlite.prepare(`PRAGMA table_info(transactions)`).all() as { name: string }[];
    expect(cols.map((c) => c.name)).toContain('tags');
    sqlite.close();
  });
});
```

> Verify the exact export name: `grep -n "export function runMigrations\|export const runMigrations" packages/core/src/db/client.ts`. If the function is named differently (e.g. `createDb`), use that and its returned `{ sqlite }`.

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && packages/core/node_modules/.bin/vitest run test/unit/migrations.tags.test.ts --root packages/core`
Expected: FAIL — `tags` not in column list.

- [ ] **Step 3: Add the schema column**

In `packages/core/src/db/schema.ts`, immediately after the `note: text('note'),` line inside `transactions`:

```ts
    tags: text('tags'),
```

- [ ] **Step 4: Write the migration file**

Create `packages/core/drizzle/0007_transaction_tags.sql`:

```sql
ALTER TABLE transactions ADD COLUMN tags TEXT;
```

- [ ] **Step 5: Register in the journal**

In `packages/core/drizzle/meta/_journal.json`, append to the `entries` array (keep existing entries; bump `idx`):

```json
    {
      "idx": 7,
      "version": "6",
      "when": 1785600000000,
      "tag": "0007_transaction_tags",
      "breakpoints": true
    }
```

(Comma after the previous entry. `when` is any fixed epoch ms greater than 0006's — do not use `Date.now()`.)

- [ ] **Step 6: Run test to verify it passes**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && packages/core/node_modules/.bin/vitest run test/unit/migrations.tags.test.ts --root packages/core`
Expected: PASS.

- [ ] **Step 7: Run the FULL core suite (guard Groww + existing migration tests)**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && packages/core/node_modules/.bin/vitest run --root packages/core`
Expected: all green, including `golden/groww.golden.test.ts` (6/6).

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/db/schema.ts packages/core/drizzle/0007_transaction_tags.sql packages/core/drizzle/meta/_journal.json packages/core/test/unit/migrations.tags.test.ts
git commit -m "feat(core): add transactions.tags column (migration 0007)"
```

---

### Task A3: Repo tag methods + `tags` on `query()`

**Files:**
- Modify: `packages/core/src/repositories/types.ts:130-142` (`ExpenseTransactionRow`), `:144-243` (interface)
- Modify: `packages/core/src/repositories/expenseTransactionRepo.ts` (add methods; add `tags` to `query()` select)
- Test: `packages/core/test/unit/expenseTxRepo.tags.test.ts`

**Interfaces:**
- Consumes: `Tag`, `parseTags`, `serializeTags`, `mergeTags`, `removeTagFrom` from `../domain/tags` (Task A1).
- Produces (added to `ExpenseTransactionRepo`):
  - `getTags(id: number): Tag[]`
  - `setTags(id: number, tags: Tag[]): void`
  - `addTags(id: number, tags: Tag[]): void`
  - `removeTag(id: number, tag: string): void`
  - `ExpenseTransactionRow` gains `tags: Tag[]`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { runMigrations } from '../../src/db/client';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { makeExpenseTransactionRepo } from '../../src/repositories/expenseTransactionRepo';

function seedTxn(repo: ReturnType<typeof makeExpenseTransactionRepo>) {
  return repo.insertManual({ transactionDate: '2026-08-01', description: 'ACME', amount: 100, direction: 'debit' });
}

describe('ExpenseTransactionRepo tags', () => {
  let repo: ReturnType<typeof makeExpenseTransactionRepo>;
  beforeEach(() => {
    const { sqlite } = runMigrations(':memory:');
    repo = makeExpenseTransactionRepo(drizzle(sqlite));
  });

  it('getTags empty by default; setTags then getTags round-trips normalized', () => {
    const id = seedTxn(repo);
    expect(repo.getTags(id)).toEqual([]);
    repo.setTags(id, [{ tag: 'Subscription', source: 'user' }]);
    expect(repo.getTags(id)).toEqual([{ tag: 'subscription', source: 'user' }]);
  });

  it('addTags merges (incoming source wins); removeTag drops one; empty persists as null', () => {
    const id = seedTxn(repo);
    repo.setTags(id, [{ tag: 'work', source: 'user' }]);
    repo.addTags(id, [{ tag: 'WORK', source: 'agent' }, { tag: 'recurring', source: 'agent' }]);
    expect(repo.getTags(id)).toEqual([
      { tag: 'work', source: 'agent' },
      { tag: 'recurring', source: 'agent' },
    ]);
    repo.removeTag(id, 'work');
    expect(repo.getTags(id)).toEqual([{ tag: 'recurring', source: 'agent' }]);
    repo.removeTag(id, 'recurring');
    expect(repo.getTags(id)).toEqual([]);
  });

  it('query() returns parsed tags on each row', () => {
    const id = seedTxn(repo);
    repo.setTags(id, [{ tag: 'subscription', source: 'agent' }]);
    const rows = repo.query({});
    expect(rows.find((r) => r.id === id)?.tags).toEqual([{ tag: 'subscription', source: 'agent' }]);
  });
});
```

> Confirm how existing repo tests construct the repo (`grep -n "makeExpenseTransactionRepo\|drizzle(" packages/core/test/unit/expenseTxRepo.query.test.ts`) and mirror that exact construction instead of the sketch above if it differs.

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && packages/core/node_modules/.bin/vitest run test/unit/expenseTxRepo.tags.test.ts --root packages/core`
Expected: FAIL — `repo.getTags is not a function`.

- [ ] **Step 3: Extend the type + interface**

In `packages/core/src/repositories/types.ts`, add to `ExpenseTransactionRow` (after `note`):

```ts
  tags: Tag[];
```

Add an import at the top: `import type { Tag } from '../domain/tags';` (verify no existing import collision).

Add to the `ExpenseTransactionRepo` interface:

```ts
  /** Parse the JSON tags column for one transaction. [] when null. */
  getTags(id: number): Tag[];
  /** Replace all tags on a transaction (normalized; empty → NULL). */
  setTags(id: number, tags: Tag[]): void;
  /** Merge tags into a transaction's existing set (incoming source wins on collision). */
  addTags(id: number, tags: Tag[]): void;
  /** Remove one tag (case-insensitive) from a transaction. */
  removeTag(id: number, tag: string): void;
```

- [ ] **Step 4: Implement in the repo**

In `packages/core/src/repositories/expenseTransactionRepo.ts`:
- Add imports: `import { parseTags, serializeTags, mergeTags, removeTagFrom, type Tag } from '../domain/tags';`
- Add `tags: transactions.tags,` to the `query()` `.select({...})` object (after `note`), then map rows so `tags` is parsed. Simplest: after `const rows = q.all();` transform `return rows.map((r) => ({ ...r, tags: parseTags(r.tags as string | null) }));`. (Adjust to the existing return statement — currently `return q.all();`. Replace with the mapped version.)
- Add the four methods to the returned object:

```ts
    getTags(id) {
      const row = db.select({ tags: transactions.tags }).from(transactions).where(eq(transactions.id, id)).get();
      return parseTags((row?.tags as string | null) ?? null);
    },
    setTags(id, tags) {
      db.update(transactions).set({ tags: serializeTags(tags), updatedAt: sql`CURRENT_TIMESTAMP` }).where(eq(transactions.id, id)).run();
    },
    addTags(id, tags) {
      const existing = this.getTags(id);
      db.update(transactions).set({ tags: serializeTags(mergeTags(existing, tags)), updatedAt: sql`CURRENT_TIMESTAMP` }).where(eq(transactions.id, id)).run();
    },
    removeTag(id, tag) {
      const existing = this.getTags(id);
      db.update(transactions).set({ tags: serializeTags(removeTagFrom(existing, tag)), updatedAt: sql`CURRENT_TIMESTAMP` }).where(eq(transactions.id, id)).run();
    },
```

> `this` inside `addTags`/`removeTag` refers to the returned repo object literal — confirm the repo is a plain object literal (it is: `return { ... }`). If method-shorthand `this` binding is a concern, extract a local `const readTags = (id) => parseTags(...)` and call it instead.

- [ ] **Step 5: Fix the fake repo in `categorize.test.ts`**

The categorize test uses a hand-written fake `ExpenseTransactionRepo`. Add stubs so it still satisfies the interface:

```ts
    getTags: () => [],
    setTags: () => {},
    addTags: () => {},
    removeTag: () => {},
```

Run `grep -rln "getNonManualForRecategorization" packages/core/test` to find every fake repo needing the stubs; add them to each.

- [ ] **Step 6: Run tags test + full core suite**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && packages/core/node_modules/.bin/vitest run --root packages/core`
Expected: all green (new tags tests + Groww 6/6 + existing query tests, now returning `tags: []`).

- [ ] **Step 7: Export helpers from core**

In `packages/core/src/index.ts` add:

```ts
export { normalizeTags, parseTags, serializeTags, mergeTags, removeTagFrom } from './domain/tags';
export type { Tag, TagSource } from './domain/tags';
```

- [ ] **Step 8: Typecheck**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && node_modules/.bin/tsc --build`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/repositories packages/core/src/index.ts packages/core/test
git commit -m "feat(core): tag repo methods (get/set/add/remove) + tags on query()"
```

---

### Task A4: API tag endpoints

**Files:**
- Modify: `packages/api/src/routes/transactions.ts`
- Test: `packages/api/test/transactions.tags.test.ts`

**Interfaces:**
- Consumes: `app.repos.expenseTxRepo.{getById,setTags,addTags,removeTag,getTags}`.
- Produces:
  - `PATCH /transactions/:id/tags` body `{ tags: string[]; mode: 'add' | 'replace' }` → `{ data: { tags: Tag[] } }`; 404 unknown id; 400 bad body.
  - `DELETE /transactions/:id/tags/:tag` → `{ data: { tags: Tag[] } }`; 404 unknown id.

> Tags written here get `source: 'user'`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { buildServer } from '../src/server';

describe('transaction tags API', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let txId: number;
  beforeEach(async () => {
    app = await buildServer({ dbPath: ':memory:' });
    const res = await app.inject({ method: 'POST', url: '/transactions', payload: { transactionDate: '2026-08-01', description: 'ACME', amountInr: 100, direction: 'out' } });
    txId = (res.json() as { data: { id: number } }).data.id;
  });

  it('PATCH replace then add; DELETE removes; 404 on unknown id', async () => {
    let r = await app.inject({ method: 'PATCH', url: `/transactions/${txId}/tags`, payload: { tags: ['Subscription'], mode: 'replace' } });
    expect(r.statusCode).toBe(200);
    expect((r.json() as any).data.tags).toEqual([{ tag: 'subscription', source: 'user' }]);

    r = await app.inject({ method: 'PATCH', url: `/transactions/${txId}/tags`, payload: { tags: ['recurring'], mode: 'add' } });
    expect((r.json() as any).data.tags).toEqual([
      { tag: 'subscription', source: 'user' },
      { tag: 'recurring', source: 'user' },
    ]);

    r = await app.inject({ method: 'DELETE', url: `/transactions/${txId}/tags/subscription` });
    expect((r.json() as any).data.tags).toEqual([{ tag: 'recurring', source: 'user' }]);

    r = await app.inject({ method: 'PATCH', url: `/transactions/999999/tags`, payload: { tags: ['x'], mode: 'add' } });
    expect(r.statusCode).toBe(404);
  });
});
```

> Confirm the manual-add route + payload key (`amountInr` vs `amount`) by reading `packages/api/src/routes/transactions.ts`; adjust the seed inject to match the real `POST /transactions` contract. If there's no `POST /transactions`, seed via `app.repos.expenseTxRepo.insertManual(...)` directly on the built app.

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && packages/api/node_modules/.bin/vitest run test/transactions.tags.test.ts --root packages/api`
Expected: FAIL (routes 404 / not registered).

- [ ] **Step 3: Implement the routes**

In `packages/api/src/routes/transactions.ts`, add (use the existing `badRequest`/`notFound` helpers — import from `../errors` if that's the pattern in this file; else define locally as neighbors do):

```ts
app.patch<{ Params: { id: string }; Body: { tags?: string[]; mode?: 'add' | 'replace' } }>(
  '/transactions/:id/tags',
  async (req) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw badRequest('Invalid transaction id.');
    const { tags, mode } = req.body ?? {};
    if (!Array.isArray(tags) || (mode !== 'add' && mode !== 'replace')) {
      throw badRequest('Body must be { tags: string[], mode: "add"|"replace" }.');
    }
    if (!app.repos.expenseTxRepo.getById(id)) throw notFound('Transaction not found.');
    const incoming = tags.map((t) => ({ tag: t, source: 'user' as const }));
    if (mode === 'replace') app.repos.expenseTxRepo.setTags(id, incoming);
    else app.repos.expenseTxRepo.addTags(id, incoming);
    return { data: { tags: app.repos.expenseTxRepo.getTags(id) } };
  },
);

app.delete<{ Params: { id: string; tag: string } }>(
  '/transactions/:id/tags/:tag',
  async (req) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw badRequest('Invalid transaction id.');
    if (!app.repos.expenseTxRepo.getById(id)) throw notFound('Transaction not found.');
    app.repos.expenseTxRepo.removeTag(id, decodeURIComponent(req.params.tag));
    return { data: { tags: app.repos.expenseTxRepo.getTags(id) } };
  },
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && packages/api/node_modules/.bin/vitest run test/transactions.tags.test.ts --root packages/api`
Expected: PASS.

- [ ] **Step 5: Full api suite + typecheck**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && packages/api/node_modules/.bin/vitest run --root packages/api && node_modules/.bin/tsc --build`
Expected: all green, clean.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/routes/transactions.ts packages/api/test/transactions.tags.test.ts
git commit -m "feat(api): PATCH/DELETE transaction tags endpoints"
```

---

### Task A5: MCP `tag_transaction` write tool

**Files:**
- Modify: `packages/mcp/src/tools/write/transactions.ts`
- Test: `packages/mcp/test/write/tagTransaction.test.ts`

**Interfaces:**
- Consumes: `ctx.repos.expenseTxRepo.{getById,addTags,setTags,getTags}`; `ok`/`errorResult` from `../../shared/output`.
- Produces:
  - `runTagTransaction(ctx, { id, tags, mode }): Promise<ToolResult>` (writes `source: 'agent'`).
  - Tool `tag_transaction` registered in `registerTransactionWriteTools`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { buildContext } from '../../src/context';
import { runTagTransaction } from '../../src/tools/write/transactions';

describe('tag_transaction tool', () => {
  it('adds agent tags; replace overwrites; unknown id errors', async () => {
    const ctx = buildContext({ dbPath: ':memory:' });
    const id = ctx.repos.expenseTxRepo.insertManual({ transactionDate: '2026-08-01', description: 'NETFLIX', amount: 500, direction: 'debit' });

    let res = await runTagTransaction(ctx, { id, tags: ['Subscription'], mode: 'add' });
    expect(res.isError).toBeFalsy();
    expect(ctx.repos.expenseTxRepo.getTags(id)).toEqual([{ tag: 'subscription', source: 'agent' }]);

    res = await runTagTransaction(ctx, { id, tags: ['recurring'], mode: 'replace' });
    expect(ctx.repos.expenseTxRepo.getTags(id)).toEqual([{ tag: 'recurring', source: 'agent' }]);

    res = await runTagTransaction(ctx, { id: 999999, tags: ['x'], mode: 'add' });
    expect(res.isError).toBe(true);

    ctx.close();
  });
});
```

> Confirm `buildContext` signature + `ctx.close()` by reading `packages/mcp/src/context.ts`; mirror an existing write-tool test (e.g. `test/write/*.test.ts`) for exact import paths and context teardown.

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && packages/mcp/node_modules/.bin/vitest run test/write/tagTransaction.test.ts --root packages/mcp`
Expected: FAIL — `runTagTransaction` not exported.

- [ ] **Step 3: Implement the handler + registration**

In `packages/mcp/src/tools/write/transactions.ts` add:

```ts
export async function runTagTransaction(
  ctx: McpContext,
  input: { id: number; tags: string[]; mode: 'add' | 'replace' },
): Promise<ToolResult> {
  const existing = ctx.repos.expenseTxRepo.getById(input.id);
  if (!existing) return errorResult(`Transaction ${input.id} not found.`);
  const incoming = input.tags.map((t) => ({ tag: t, source: 'agent' as const }));
  if (input.mode === 'replace') ctx.repos.expenseTxRepo.setTags(input.id, incoming);
  else ctx.repos.expenseTxRepo.addTags(input.id, incoming);
  return ok({ id: input.id, tags: ctx.repos.expenseTxRepo.getTags(input.id) });
}
```

Register inside `registerTransactionWriteTools`:

```ts
server.registerTool(
  'tag_transaction',
  {
    description:
      'Attach structured TAGS to a transaction (source recorded as "agent"). Tags capture the ' +
      'NATURE of a spend, orthogonal to its category. Prefer this starter vocabulary when it fits: ' +
      'subscription, recurring, one-time, reimbursable, work, personal (invent others only when ' +
      'genuinely useful). `mode:"add"` merges with existing tags; `mode:"replace"` overwrites all. ' +
      'Tags are lowercased/deduped. Additive and reversible — not preview-gated. Unknown id errors.',
    inputSchema: {
      id: z.number().int(),
      tags: z.array(z.string()).min(1),
      mode: z.enum(['add', 'replace']),
    },
  },
  async (input) => runTagTransaction(ctx, input),
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && packages/mcp/node_modules/.bin/vitest run test/write/tagTransaction.test.ts --root packages/mcp`
Expected: PASS.

- [ ] **Step 5: Full mcp suite + typecheck**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && packages/mcp/node_modules/.bin/vitest run --root packages/mcp && node_modules/.bin/tsc --build`
Expected: green, clean. (If a test asserts the total tool count, bump it 22→23 writes.)

- [ ] **Step 6: Commit**

```bash
git add packages/mcp/src/tools/write/transactions.ts packages/mcp/test/write/tagTransaction.test.ts
git commit -m "feat(mcp): tag_transaction write tool (agent-sourced tags)"
```

---

### Task A6: Web tag chips on Expenses rows

**Files:**
- Modify: `apps/web/src/lib/queryKeys.ts` (if a key is needed — reuse `expenses`)
- Modify: `apps/web/src/lib/hooks.ts` — `useSetTxTags`, `useRemoveTxTag`
- Modify: `apps/web/src/lib/apiClient.ts` — only if a verb is missing (PATCH/DELETE already exist per AI-settings work; verify)
- Create: `apps/web/src/features/expenses/TagChips.tsx`
- Modify: `apps/web/src/features/expenses/ExpensesPage.tsx` — render `TagChips` per row
- Modify: `apps/web/src/lib/apiClient.ts` types / `ExpenseRow` type — add `tags`
- Test: `apps/web/src/features/expenses/TagChips.test.tsx`

**Interfaces:**
- Consumes: `ExpenseRow.tags: { tag: string; source: 'user' | 'agent' }[]` from `GET /expenses`.
- Produces: `TagChips` component; `useSetTxTags()`, `useRemoveTxTag()` mutation hooks that invalidate `['expenses']` + `['expenseInsights']`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TagChips } from './TagChips';

describe('TagChips', () => {
  it('renders user + agent tags with distinct styling and calls onRemove', () => {
    const onRemove = vi.fn();
    render(<TagChips tags={[{ tag: 'subscription', source: 'agent' }, { tag: 'work', source: 'user' }]} onRemove={onRemove} onAdd={() => {}} />);
    expect(screen.getByText('subscription')).toBeInTheDocument();
    expect(screen.getByText('work')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Remove tag subscription'));
    expect(onRemove).toHaveBeenCalledWith('subscription');
  });
});
```

> Mirror the existing `CategoryChip.test.tsx` for render setup, matcher imports, and any test providers.

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && apps/web/node_modules/.bin/vitest run src/features/expenses/TagChips.test.tsx --root apps/web`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `TagChips`**

```tsx
// apps/web/src/features/expenses/TagChips.tsx
type Tag = { tag: string; source: 'user' | 'agent' };
const STARTER = ['recurring', 'one-time', 'subscription', 'reimbursable', 'work', 'personal'];

export function TagChips({ tags, onAdd, onRemove }: {
  tags: Tag[];
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {tags.map((t) => (
        <span
          key={t.tag}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] border ${
            t.source === 'agent' ? 'bg-ai/5 border-ai/30 text-ai' : 'bg-surface border-border text-ink-muted'
          }`}
        >
          {t.tag}
          <button type="button" aria-label={`Remove tag ${t.tag}`} onClick={() => onRemove(t.tag)} className="hover:text-ink cursor-pointer">×</button>
        </span>
      ))}
      {/* Minimal add affordance: a datalist-backed input. Kept simple for v1. */}
      <TagAdd onAdd={onAdd} />
    </div>
  );
}

function TagAdd({ onAdd }: { onAdd: (tag: string) => void }) {
  return (
    <>
      <input
        list="tag-vocab"
        placeholder="+ tag"
        className="w-20 text-[11px] px-1.5 py-0.5 rounded-full border border-dashed border-border bg-transparent"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const v = (e.target as HTMLInputElement).value.trim();
            if (v) { onAdd(v); (e.target as HTMLInputElement).value = ''; }
          }
        }}
      />
      <datalist id="tag-vocab">{STARTER.map((s) => <option key={s} value={s} />)}</datalist>
    </>
  );
}
```

- [ ] **Step 4: Add hooks + `ExpenseRow.tags`**

In `apps/web/src/lib/hooks.ts` (mirror `useUpdateTxCategory`'s invalidation pattern):

```ts
export function useSetTxTags() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, tags, mode }: { id: number; tags: string[]; mode: 'add' | 'replace' }) =>
      apiSend(`/transactions/${id}/tags`, 'PATCH', { tags, mode }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); qc.invalidateQueries({ queryKey: ['expenseInsights'] }); },
  });
}
export function useRemoveTxTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, tag }: { id: number; tag: string }) =>
      apiSend(`/transactions/${id}/tags/${encodeURIComponent(tag)}`, 'DELETE'),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); qc.invalidateQueries({ queryKey: ['expenseInsights'] }); },
  });
}
```

Add `tags: { tag: string; source: 'user' | 'agent' }[]` to the `ExpenseRow` type (find it: `grep -rn "type ExpenseRow" apps/web/src`). Verify `apiSend` signature (`grep -n "export function apiSend\|export const apiSend" apps/web/src/lib/apiClient.ts`) and match it.

- [ ] **Step 5: Render in `ExpensesPage`**

In the transaction row rendering of `ExpensesPage.tsx`, add `<TagChips tags={row.tags} onAdd={(t) => setTags.mutate({ id: row.id, tags: [t], mode: 'add' })} onRemove={(t) => removeTag.mutate({ id: row.id, tag: t })} />` below the merchant/category cell. Instantiate `const setTags = useSetTxTags(); const removeTag = useRemoveTxTag();` near the other hooks.

- [ ] **Step 6: Run test + web suite + typecheck**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && apps/web/node_modules/.bin/vitest run --root apps/web && node_modules/.bin/tsc --build`
Expected: green, clean.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): tag chips on expense rows (agent vs user styling)"
```

---

## PHASE B — Insight detectors

### Task B1: Pure `expenseInsights.ts` detectors

**Files:**
- Create: `packages/core/src/domain/insights/expenseInsights.ts`
- Modify: `packages/core/src/index.ts` — export
- Test: `packages/core/test/unit/expenseInsights.test.ts`

**Interfaces:**
- Produces:
  - Types `InsightType = 'needs_clarity' | 'new_spend' | 'abnormal_spend'`, `Insight` (per spec §4.2).
  - `deriveMerchantName(description: string): string | null` — REUSE the existing one if it lives in core; otherwise the detector takes an injected `deriveMerchantName`. (Check: `grep -rn "deriveMerchantName" packages/core/src apps/web/src`. It currently lives in `apps/web/src/lib/format.ts`. Since the detector is core/server-side, add a **server-side** minimal equivalent OR inject it. **Decision: inject** — `computeExpenseInsights` takes `deriveMerchantName` in its input so core needs no new merchant parser and the web/server can share intent later.)
  - `computeExpenseInsights(input: InsightInput): Insight[]` where:
    ```ts
    type InsightTxn = {
      id: number; transactionDate: string; description: string; amount: number;
      direction: 'debit' | 'credit'; categoryId: string | null; tags: { tag: string }[];
    };
    type InsightInput = {
      month: string;                 // 'YYYY-MM'
      monthTxns: InsightTxn[];       // txns in `month`
      priorTxns: InsightTxn[];       // txns in the LOOKBACK_MONTHS before `month`
      byCategoryThisMonth: { categoryId: string | null; amount: number }[];
      byCategoryPriorMonths: { month: string; categoryId: string | null; amount: number }[];
      deriveMerchantName: (description: string) => string | null;
    };
    ```

> Keeping the detector as a pure function over injected aggregates (not a repo) preserves the seam invariant and makes it fully unit-testable. The API route (Task B2) assembles `InsightInput` from repo reads.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { computeExpenseInsights } from '../../src/domain/insights/expenseInsights';

const derive = (d: string) => (d.startsWith('UPI-') ? d.slice(4).split(/[ /]/)[0] : (/^[A-Z ]+$/.test(d) ? null : d));

function base() {
  return {
    month: '2026-08',
    monthTxns: [] as any[],
    priorTxns: [] as any[],
    byCategoryThisMonth: [] as any[],
    byCategoryPriorMonths: [] as any[],
    deriveMerchantName: derive,
  };
}

describe('computeExpenseInsights', () => {
  it('needs_clarity: flags uncategorized OR vague, skips tagged, one grouped card', () => {
    const input = { ...base(), monthTxns: [
      { id: 1, transactionDate: '2026-08-02', description: 'UPI-SWIGGY', amount: 100, direction: 'debit', categoryId: null, tags: [] },       // uncategorized → flag
      { id: 2, transactionDate: '2026-08-03', description: 'RANDOM NOISE', amount: 50, direction: 'debit', categoryId: 'food', tags: [] },     // vague (derive→null) → flag
      { id: 3, transactionDate: '2026-08-04', description: 'UPI-ZOMATO', amount: 80, direction: 'debit', categoryId: null, tags: [{ tag: 'x' }] }, // tagged → skip
      { id: 4, transactionDate: '2026-08-05', description: 'UPI-AMAZON', amount: 60, direction: 'debit', categoryId: 'shopping', tags: [] },   // clean → skip
    ] };
    const out = computeExpenseInsights(input);
    const clarity = out.filter((i) => i.type === 'needs_clarity');
    expect(clarity).toHaveLength(1);
    expect(clarity[0].transactionIds.sort()).toEqual([1, 2]);
    expect(clarity[0].id).toBe('needs-clarity:2026-08');
  });

  it('new_spend: merchant not in prior months, above floor, capped/sorted by amount', () => {
    const input = { ...base(),
      monthTxns: [
        { id: 10, transactionDate: '2026-08-02', description: 'UPI-ACMEGYM', amount: 2400, direction: 'debit', categoryId: 'fitness', tags: [] },
        { id: 11, transactionDate: '2026-08-03', description: 'UPI-TINYSHOP', amount: 100, direction: 'debit', categoryId: 'shopping', tags: [] }, // below 500 floor
        { id: 12, transactionDate: '2026-08-04', description: 'UPI-SWIGGY', amount: 900, direction: 'debit', categoryId: 'food', tags: [] },       // seen before → not new
      ],
      priorTxns: [
        { id: 1, transactionDate: '2026-07-10', description: 'UPI-SWIGGY', amount: 300, direction: 'debit', categoryId: 'food', tags: [] },
      ],
    };
    const out = computeExpenseInsights(input).filter((i) => i.type === 'new_spend');
    expect(out).toHaveLength(1);
    expect(out[0].transactionIds).toContain(10);
    expect(out[0].id).toContain('ACMEGYM');
  });

  it('abnormal_spend: needs BOTH ratio>1.4 AND absolute jump>=1000', () => {
    const input = { ...base(),
      byCategoryThisMonth: [
        { categoryId: 'food', amount: 6000 },     // avg 3000 → ratio 2.0, jump 3000 → FLAG
        { categoryId: 'coffee', amount: 200 },    // avg 120 → ratio 1.67 but jump 80 < 1000 → no flag
      ],
      byCategoryPriorMonths: [
        { month: '2026-05', categoryId: 'food', amount: 3000 },
        { month: '2026-06', categoryId: 'food', amount: 3000 },
        { month: '2026-07', categoryId: 'food', amount: 3000 },
        { month: '2026-05', categoryId: 'coffee', amount: 120 },
        { month: '2026-06', categoryId: 'coffee', amount: 120 },
        { month: '2026-07', categoryId: 'coffee', amount: 120 },
      ],
    };
    const out = computeExpenseInsights(input).filter((i) => i.type === 'abnormal_spend');
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('abnormal-spend:food:2026-08');
    expect(out[0].severity).toBe('warn');
  });

  it('empty data → []', () => {
    expect(computeExpenseInsights(base())).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && packages/core/node_modules/.bin/vitest run test/unit/expenseInsights.test.ts --root packages/core`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the detectors**

```ts
// packages/core/src/domain/insights/expenseInsights.ts
export type InsightType = 'needs_clarity' | 'new_spend' | 'abnormal_spend';
export type Insight = {
  id: string;
  type: InsightType;
  severity: 'info' | 'warn';
  title: string;
  detail: string;
  transactionIds: number[];
  cta: { label: string };
};

export type InsightTxn = {
  id: number; transactionDate: string; description: string; amount: number;
  direction: 'debit' | 'credit'; categoryId: string | null; tags: { tag: string }[];
};
export type InsightInput = {
  month: string;
  monthTxns: InsightTxn[];
  priorTxns: InsightTxn[];
  byCategoryThisMonth: { categoryId: string | null; amount: number }[];
  byCategoryPriorMonths: { month: string; categoryId: string | null; amount: number }[];
  deriveMerchantName: (description: string) => string | null;
};

export const LOOKBACK_MONTHS = 3;
export const NEW_SPEND_MIN_INR = 500;
export const NEW_SPEND_TOP_N = 5;
export const ABNORMAL_RATIO = 1.4;
export const ABNORMAL_MIN_JUMP_INR = 1000;

const merchantKeyOf = (d: string, derive: (s: string) => string | null): string =>
  (derive(d) ?? d).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

export function computeExpenseInsights(input: InsightInput): Insight[] {
  const out: Insight[] = [];

  // 1) needs_clarity
  const flagged = input.monthTxns.filter((t) =>
    t.direction === 'debit' &&
    (t.tags?.length ?? 0) === 0 &&
    (t.categoryId === null || input.deriveMerchantName(t.description) === null),
  );
  if (flagged.length > 0) {
    out.push({
      id: `needs-clarity:${input.month}`,
      type: 'needs_clarity',
      severity: 'info',
      title: `${flagged.length} transaction${flagged.length === 1 ? '' : 's'} need clarity`,
      detail: 'Uncategorized or unclear transactions this month. Review them so every rupee is understood.',
      transactionIds: flagged.map((t) => t.id),
      cta: { label: 'Review in chat' },
    });
  }

  // 2) new_spend
  const seen = new Set(input.priorTxns.filter((t) => t.direction === 'debit').map((t) => merchantKeyOf(t.description, input.deriveMerchantName)));
  const byMerchant = new Map<string, { total: number; ids: number[]; label: string }>();
  for (const t of input.monthTxns) {
    if (t.direction !== 'debit') continue;
    const key = merchantKeyOf(t.description, input.deriveMerchantName);
    if (!key || seen.has(key)) continue;
    const cur = byMerchant.get(key) ?? { total: 0, ids: [], label: input.deriveMerchantName(t.description) ?? t.description };
    cur.total += t.amount; cur.ids.push(t.id);
    byMerchant.set(key, cur);
  }
  const newCards = [...byMerchant.entries()]
    .filter(([, v]) => v.total >= NEW_SPEND_MIN_INR)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, NEW_SPEND_TOP_N)
    .map(([key, v]): Insight => ({
      id: `new-spend:merchant:${key}`,
      type: 'new_spend',
      severity: 'info',
      title: `New spending: ${v.label}`,
      detail: `₹${Math.round(v.total)} at ${v.label}, not seen in the previous ${LOOKBACK_MONTHS} months.`,
      transactionIds: v.ids,
      cta: { label: 'Review in chat' },
    }));
  out.push(...newCards);

  // 3) abnormal_spend
  const priorByCat = new Map<string, number[]>();
  for (const r of input.byCategoryPriorMonths) {
    if (r.categoryId === null) continue;
    const arr = priorByCat.get(r.categoryId) ?? []; arr.push(r.amount); priorByCat.set(r.categoryId, arr);
  }
  for (const cur of input.byCategoryThisMonth) {
    if (cur.categoryId === null) continue;
    const priors = priorByCat.get(cur.categoryId) ?? [];
    if (priors.length === 0) continue;
    const avg = priors.reduce((a, b) => a + b, 0) / priors.length;
    if (avg <= 0) continue;
    const ratio = cur.amount / avg;
    const jump = cur.amount - avg;
    if (ratio > ABNORMAL_RATIO && jump >= ABNORMAL_MIN_JUMP_INR) {
      const pct = Math.round((ratio - 1) * 100);
      out.push({
        id: `abnormal-spend:${cur.categoryId}:${input.month}`,
        type: 'abnormal_spend',
        severity: 'warn',
        title: `${cur.categoryId} spend is up ${pct}%`,
        detail: `₹${Math.round(cur.amount)} this month vs a ₹${Math.round(avg)} ${LOOKBACK_MONTHS}-month average.`,
        transactionIds: input.monthTxns.filter((t) => t.categoryId === cur.categoryId && t.direction === 'debit').map((t) => t.id),
        cta: { label: 'Review in chat' },
      });
    }
  }

  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && packages/core/node_modules/.bin/vitest run test/unit/expenseInsights.test.ts --root packages/core`
Expected: PASS (4 tests).

- [ ] **Step 5: Export + full core suite + typecheck**

Add to `packages/core/src/index.ts`:

```ts
export { computeExpenseInsights, LOOKBACK_MONTHS, NEW_SPEND_MIN_INR, NEW_SPEND_TOP_N, ABNORMAL_RATIO, ABNORMAL_MIN_JUMP_INR } from './domain/insights/expenseInsights';
export type { Insight, InsightType, InsightTxn, InsightInput } from './domain/insights/expenseInsights';
```

Run: `source ~/.nvm/nvm.sh && nvm use 22 && packages/core/node_modules/.bin/vitest run --root packages/core && node_modules/.bin/tsc --build`
Expected: green (Groww 6/6 unchanged), clean.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/domain/insights packages/core/src/index.ts packages/core/test/unit/expenseInsights.test.ts
git commit -m "feat(core): pure expense-insight detectors (needs_clarity/new_spend/abnormal_spend)"
```

---

### Task B2: `GET /expenses/insights` endpoint

**Files:**
- Modify: `packages/api/src/routes/expenses.ts`
- Test: `packages/api/test/expenses.insights.test.ts`

**Interfaces:**
- Consumes: `computeExpenseInsights` (core), `app.repos.expenseTxRepo.{query,summary}`.
- Produces: `GET /expenses/insights?month=YYYY-MM` → `{ data: Insight[] }`; 400 when `month` missing/malformed.

> The route needs a server-side `deriveMerchantName`. Add a small pure helper `packages/api/src/lib/deriveMerchantName.ts` (port the logic from `apps/web/src/lib/format.ts`) and inject it. Keep it in `api`, not `core`, so `core` gains no merchant parser (matches the inject decision in B1).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { buildServer } from '../src/server';

describe('GET /expenses/insights', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  beforeEach(async () => {
    app = await buildServer({ dbPath: ':memory:' });
    // one uncategorized debit this month → needs_clarity
    app.repos.expenseTxRepo.insertManual({ transactionDate: '2026-08-02', description: 'UPI-UNKNOWNBIZ', amount: 700, direction: 'debit' });
  });

  it('400 without month', async () => {
    const r = await app.inject({ method: 'GET', url: '/expenses/insights' });
    expect(r.statusCode).toBe(400);
  });

  it('returns insights array for the month', async () => {
    const r = await app.inject({ method: 'GET', url: '/expenses/insights?month=2026-08' });
    expect(r.statusCode).toBe(200);
    const data = (r.json() as { data: { type: string }[] }).data;
    expect(Array.isArray(data)).toBe(true);
    expect(data.some((i) => i.type === 'needs_clarity')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && packages/api/node_modules/.bin/vitest run test/expenses.insights.test.ts --root packages/api`
Expected: FAIL (404 / route missing).

- [ ] **Step 3: Implement the route**

In `packages/api/src/routes/expenses.ts` add (compute the month + 3-prior windows, assemble `InsightInput`):

```ts
app.get<{ Querystring: { month?: string } }>('/expenses/insights', async (req) => {
  const month = req.query.month;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) throw badRequest('month=YYYY-MM is required.');

  const [y, m] = month.split('-').map(Number);
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-31`;
  // prior LOOKBACK_MONTHS window
  const priorStartDate = new Date(Date.UTC(y, m - 1 - LOOKBACK_MONTHS, 1));
  const priorStart = `${priorStartDate.getUTCFullYear()}-${String(priorStartDate.getUTCMonth() + 1).padStart(2, '0')}-01`;
  const priorEnd = `${month}-01`; // exclusive-ish; prior rows are < monthStart

  const monthTxns = app.repos.expenseTxRepo.query({ from: monthStart, to: monthEnd });
  const priorAll = app.repos.expenseTxRepo.query({ from: priorStart, to: monthStart });
  const priorTxns = priorAll.filter((t) => t.transactionDate < monthStart);

  const thisMonthSummary = app.repos.expenseTxRepo.summary({ from: monthStart, to: monthEnd });
  // prior byCategory per month: one summary per prior month keeps it simple + correct.
  const byCategoryPriorMonths: { month: string; categoryId: string | null; amount: number }[] = [];
  for (let k = 1; k <= LOOKBACK_MONTHS; k += 1) {
    const d = new Date(Date.UTC(y, m - 1 - k, 1));
    const mm = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const s = app.repos.expenseTxRepo.summary({ from: `${mm}-01`, to: `${mm}-31` });
    for (const c of s.byCategory) byCategoryPriorMonths.push({ month: mm, categoryId: c.categoryId, amount: c.amount });
  }

  const toInsightTxn = (t: (typeof monthTxns)[number]) => ({
    id: t.id, transactionDate: t.transactionDate, description: t.description, amount: t.amount,
    direction: t.direction, categoryId: t.categoryId, tags: t.tags,
  });

  const data = computeExpenseInsights({
    month,
    monthTxns: monthTxns.map(toInsightTxn),
    priorTxns: priorTxns.map(toInsightTxn),
    byCategoryThisMonth: thisMonthSummary.byCategory,
    byCategoryPriorMonths,
    deriveMerchantName,
  });
  return { data };
});
```

Add imports: `import { computeExpenseInsights, LOOKBACK_MONTHS } from '@myfinance/core';` and `import { deriveMerchantName } from '../lib/deriveMerchantName';`. Ensure `badRequest` is available (import from `../errors`). Create `packages/api/src/lib/deriveMerchantName.ts` porting the web helper (pure string function; add a tiny unit test if the port is non-trivial).

- [ ] **Step 4: Run test to verify it passes**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && packages/api/node_modules/.bin/vitest run test/expenses.insights.test.ts --root packages/api`
Expected: PASS.

- [ ] **Step 5: Full api suite + typecheck**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && packages/api/node_modules/.bin/vitest run --root packages/api && node_modules/.bin/tsc --build`
Expected: green, clean.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/routes/expenses.ts packages/api/src/lib/deriveMerchantName.ts packages/api/test/expenses.insights.test.ts
git commit -m "feat(api): GET /expenses/insights (deterministic detectors)"
```

---

### Task B3: Web insight cards + localStorage dismissal

**Files:**
- Create: `apps/web/src/features/expenses/InsightCards.tsx`
- Create: `apps/web/src/features/expenses/useInsightDismissal.ts`
- Modify: `apps/web/src/lib/hooks.ts` — `useExpenseInsights(month)`
- Modify: `apps/web/src/lib/queryKeys.ts` — `expenseInsights(month)`
- Modify: `apps/web/src/features/expenses/ExpensesPage.tsx` — render cards
- Test: `apps/web/src/features/expenses/useInsightDismissal.test.ts`

**Interfaces:**
- Consumes: `GET /expenses/insights` via `useExpenseInsights`; `Insight` type (import from `@myfinance/core` or re-declare in web types).
- Produces: `InsightCards` (renders non-dismissed cards, each with a CTA calling `onOpen(insight)`); `useInsightDismissal()` → `{ dismissed, dismiss, isDismissed }` backed by `localStorage`.

- [ ] **Step 1: Write the failing test (dismissal logic)**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInsightDismissal } from './useInsightDismissal';

describe('useInsightDismissal', () => {
  beforeEach(() => localStorage.clear());
  it('dismiss persists and isDismissed reflects it', () => {
    const { result } = renderHook(() => useInsightDismissal());
    expect(result.current.isDismissed('abnormal-spend:food:2026-08')).toBe(false);
    act(() => result.current.dismiss('abnormal-spend:food:2026-08'));
    expect(result.current.isDismissed('abnormal-spend:food:2026-08')).toBe(true);
    // survives a fresh hook instance (same localStorage)
    const { result: r2 } = renderHook(() => useInsightDismissal());
    expect(r2.current.isDismissed('abnormal-spend:food:2026-08')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && apps/web/node_modules/.bin/vitest run src/features/expenses/useInsightDismissal.test.ts --root apps/web`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement dismissal hook**

```ts
// apps/web/src/features/expenses/useInsightDismissal.ts
import { useCallback, useState } from 'react';
const KEY = 'myfinance.expense.insights.dismissed.v1';
function load(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]); } catch { return new Set(); }
}
export function useInsightDismissal() {
  const [dismissed, setDismissed] = useState<Set<string>>(load);
  const dismiss = useCallback((id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev); next.add(id);
      try { localStorage.setItem(KEY, JSON.stringify([...next])); } catch { /* non-fatal */ }
      return next;
    });
  }, []);
  const isDismissed = useCallback((id: string) => dismissed.has(id), [dismissed]);
  return { dismissed, dismiss, isDismissed };
}
```

- [ ] **Step 4: Implement `InsightCards` + hook/queryKey**

`InsightCards.tsx` renders a violet-accented card per non-dismissed insight with title/detail, a "Review in chat" button (`onOpen(insight)`), and a dismiss "×" (`onDismiss(insight.id)`). `useExpenseInsights(month)`:

```ts
export const useExpenseInsights = (month: string) =>
  useQuery({ queryKey: qk.expenseInsights(month), queryFn: () => apiGet<Insight[]>('/expenses/insights', { month }), enabled: !!month });
```

Add `expenseInsights: (month: string) => ['expenseInsights', month] as const` to `queryKeys.ts`. Define/import the `Insight` type in web (re-declare a local `Insight` type in a web types file to avoid a core value import if the build prefers it).

- [ ] **Step 5: Render in `ExpensesPage`**

Above the transaction table, render `<InsightCards insights={insights.data ?? []} isDismissed={isDismissed} onDismiss={dismiss} onOpen={(i) => setActiveInsight(i)} />`. Add `const insights = useExpenseInsights(selectedMonth); const { dismiss, isDismissed } = useInsightDismissal(); const [activeInsight, setActiveInsight] = useState<Insight | null>(null);`. (`activeInsight` opens the drawer in Task C7.)

- [ ] **Step 6: Run test + web suite + typecheck**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && apps/web/node_modules/.bin/vitest run --root apps/web && node_modules/.bin/tsc --build`
Expected: green, clean.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): expense insight cards + localStorage dismissal"
```

---

## PHASE C — Expense Clarity Agent + chat + categorization

### Task C1: Confidence-gate + leave-blank in `categorizeWithAI`

**Files:**
- Modify: `packages/agents/src/categorize/aiCategorize.ts`
- Test: `packages/agents/test/aiCategorize.confidence.test.ts` (new) + update existing `aiCategorize` tests if they assert low-confidence rows are kept

**Interfaces:**
- Consumes: `AiSuggestion` (already has `confidence`).
- Produces: `CategorizeDeps` gains `minConfidence?: number` (default `0.9`); suggestions with `confidence < minConfidence` are dropped and counted in `skipped`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { categorizeWithAI } from '../src/categorize/aiCategorize';

const complete = async () => ({
  text: JSON.stringify([
    { transactionId: 1, categoryId: 'food', keyword: 'swiggy', confidence: 0.95 },
    { transactionId: 2, categoryId: 'food', keyword: 'zomato', confidence: 0.5 },  // below gate → dropped
  ]),
  usage: { inputTokens: 1, outputTokens: 1 },
});

describe('categorizeWithAI confidence gate', () => {
  it('drops suggestions below minConfidence (default 0.9) and counts them skipped', async () => {
    const txns = [
      { id: 1, description: 'SWIGGY ORDER', amount: 100, direction: 'debit' as const },
      { id: 2, description: 'ZOMATO ORDER', amount: 80, direction: 'debit' as const },
    ];
    const cats = [{ id: 'food', name: 'Food' }];
    const res = await categorizeWithAI(txns, { complete, categories: cats });
    expect(res.suggestions.map((s) => s.transactionId)).toEqual([1]);
    expect(res.skipped).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && packages/agents/node_modules/.bin/vitest run test/aiCategorize.confidence.test.ts --root packages/agents`
Expected: FAIL — tx 2 currently kept, `skipped` 0.

- [ ] **Step 3: Implement the gate**

In `aiCategorize.ts`: add `minConfidence` to `CategorizeDeps` and apply inside the per-suggestion loop:

```ts
  const minConfidence = deps.minConfidence ?? 0.9;
  // ...
    for (const s of batch) {
      const txn = byId.get(s.transactionId);
      if (!txn) continue;
      if (!validCategoryIds.has(s.categoryId)) continue;
      if (s.confidence < minConfidence) { skipped += 1; continue; } // leave blank
      const kw = s.keyword.trim().toLowerCase();
      const isSubstring = kw.length >= 2 && txn.description.toLowerCase().includes(kw);
      suggestions.push({ ...s, keyword: isSubstring ? kw : '' });
    }
```

Add to the `CategorizeDeps` type: `minConfidence?: number;`.

- [ ] **Step 4: Run test + full agents suite**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && packages/agents/node_modules/.bin/vitest run --root packages/agents`
Expected: new test PASS. If an existing test fed low-confidence rows and asserted they were applied, update that assertion (the behavior change is intentional per spec §5.4) — note it in the commit.

- [ ] **Step 5: Commit**

```bash
git add packages/agents/src/categorize/aiCategorize.ts packages/agents/test
git commit -m "feat(agents): confidence-gate categorizeWithAI (>=0.9 else leave blank)"
```

---

### Task C2: `/categories/ai-suggest` — leave-blank apply + learn rule on confident

**Files:**
- Modify: `packages/api/src/routes/categories.ts:129-189`
- Test: update `packages/api/test/aiSuggest.test.ts`

**Interfaces:**
- Consumes: `categorizeWithAI` (now gated), `saveCategoryMemoryRule`, `extractMerchantKey`, `recategorizeNonManualTransactions` from core.
- Produces: same response shape; low-confidence txns remain uncategorized; confident suggestions with a derivable merchant key also create a merchant rule.

> Behavior change: today every returned suggestion is applied. With the gate in C1, `result.suggestions` already excludes low-confidence rows, so the existing apply-loop naturally leaves them blank. This task ADDS optional rule-learning on confident suggestions and confirms the leave-blank outcome via tests.

- [ ] **Step 1: Write/adjust the failing test**

```ts
// in aiSuggest.test.ts — a fake gateway returns one high- and one low-confidence suggestion
it('leaves low-confidence uncategorized; keeps high-confidence applied', async () => {
  // build server with a fake gateway whose complete() returns:
  //   [{transactionId: A, categoryId:'food', keyword:'swiggy', confidence:0.95},
  //    {transactionId: B, categoryId:'food', keyword:'zz', confidence:0.4}]
  // seed two uncategorized txns A (SWIGGY) and B (MYSTERY) in-range, then POST /categories/ai-suggest
  // assert A.categoryId==='food' (source ai_suggested) and B.categoryId===null
});
```

Fill in using the existing `makeFakeGateway` helper in that test file (read it first: `grep -n "makeFakeGateway\|runTask" packages/api/test/aiSuggest.test.ts`). Match its shape exactly.

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && packages/api/node_modules/.bin/vitest run test/aiSuggest.test.ts --root packages/api`
Expected: FAIL until the fake returns confidences and assertions target leave-blank.

- [ ] **Step 3: Implement rule-learning on confident apply**

In the apply loop of `/categories/ai-suggest`, after `updateCategory(...)`, for each applied suggestion attempt a merchant rule (best-effort, inside the existing request; wrap in try/catch to swallow unique-collision):

```ts
import { extractMerchantKey, saveCategoryMemoryRule } from '@myfinance/core';
// ...
const learnDeps = deps();
for (const s of result.suggestions) {
  app.repos.expenseTxRepo.updateCategory(s.transactionId, s.categoryId, 'ai_suggested', s.keyword || null);
  const txn = app.repos.expenseTxRepo.getById(s.transactionId);
  const mk = txn ? extractMerchantKey(txn.description) : null;
  if (mk) {
    try {
      saveCategoryMemoryRule(learnDeps, { ruleType: 'merchant', patternValue: mk, categoryId: s.categoryId, createdFromTransactionId: s.transactionId });
    } catch (e) { if (!/unique/i.test((e as Error).message)) throw e; }
  }
}
```

> `getById` currently returns `{ id, description }` — sufficient for `extractMerchantKey`. Do NOT call `recategorizeNonManualTransactions` here (it would flip the just-applied `ai_suggested` rows via the new rule — that's fine and even desirable, but keep v1 behavior minimal and predictable: only create the rule; the next explicit "Recategorize all" applies it). Note this choice in the commit.

- [ ] **Step 4: Run test to verify it passes**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && packages/api/node_modules/.bin/vitest run test/aiSuggest.test.ts --root packages/api`
Expected: PASS.

- [ ] **Step 5: Full api suite + typecheck**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && packages/api/node_modules/.bin/vitest run --root packages/api && node_modules/.bin/tsc --build`
Expected: green, clean.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/routes/categories.ts packages/api/test/aiSuggest.test.ts
git commit -m "feat(api): ai-suggest leaves low-confidence blank + learns merchant rule on confident"
```

---

### Task C3: `expense_agent` AI task + `list_categories` MCP read tool

**Files:**
- Modify: `packages/agents/src/tasks.ts`
- Create: `packages/mcp/src/tools/read/categories.ts`
- Modify: `packages/mcp/src/server.ts` — register
- Test: `packages/agents/test/tasks.test.ts` (or extend existing) + `packages/mcp/test/read/categories.test.ts`

**Interfaces:**
- Produces:
  - `AI_TASKS.expense_agent = { label: 'Expense Clarity Agent', description: '...', defaultDialect: 'gemini' }`; `isAiTask('expense_agent') === true`.
  - MCP `list_categories` tool → `ok({ categories: { id, name }[] })`; `runListCategories(ctx)` handler.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/agents/test/tasks.test.ts
import { describe, it, expect } from 'vitest';
import { AI_TASKS, isAiTask } from '../src/tasks';
describe('AI_TASKS', () => {
  it('includes expense_agent', () => {
    expect(isAiTask('expense_agent')).toBe(true);
    expect(AI_TASKS.expense_agent.label).toBe('Expense Clarity Agent');
  });
});
```

```ts
// packages/mcp/test/read/categories.test.ts
import { describe, it, expect } from 'vitest';
import { buildContext } from '../../src/context';
import { runListCategories } from '../../src/tools/read/categories';
describe('list_categories', () => {
  it('returns seeded categories', async () => {
    const ctx = buildContext({ dbPath: ':memory:' });
    const res = await runListCategories(ctx);
    const payload = JSON.parse(res.content[0].text as string);
    expect(Array.isArray(payload.categories)).toBe(true);
    expect(payload.categories.length).toBeGreaterThan(0);
    expect(payload.categories[0]).toHaveProperty('id');
    ctx.close();
  });
});
```

> Confirm the `ToolResult` content shape (`res.content[0].text`) against `shared/output.ts` `ok()` and an existing read-tool test.

- [ ] **Step 2: Run tests to verify they fail**

Run both:
`source ~/.nvm/nvm.sh && nvm use 22 && packages/agents/node_modules/.bin/vitest run test/tasks.test.ts --root packages/agents`
`packages/mcp/node_modules/.bin/vitest run test/read/categories.test.ts --root packages/mcp`
Expected: FAIL.

- [ ] **Step 3: Add the task**

In `packages/agents/src/tasks.ts`, add inside `AI_TASKS`:

```ts
  expense_agent: {
    label: 'Expense Clarity Agent',
    description: 'The expense specialist: categorizes, disambiguates, and tags transactions',
    defaultDialect: 'gemini',
  },
```

- [ ] **Step 4: Add the read tool**

```ts
// packages/mcp/src/tools/read/categories.ts
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from '../../context';
import { ok, type ToolResult } from '../../shared/output';

export async function runListCategories(ctx: McpContext): Promise<ToolResult> {
  const categories = ctx.repos.categoryRepo.list().map((c) => ({ id: c.id, name: c.name }));
  return ok({ categories });
}

export function registerCategoriesReadTool(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'list_categories',
    {
      description: 'List all expense categories (id + name). Use these ids when categorizing transactions.',
      inputSchema: {},
    },
    async () => runListCategories(ctx),
  );
}
```

Register in `packages/mcp/src/server.ts` (mirror how other read tools are registered — import + call `registerCategoriesReadTool(server, ctx)`).

- [ ] **Step 5: Run tests to verify they pass + full suites**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && packages/agents/node_modules/.bin/vitest run --root packages/agents && packages/mcp/node_modules/.bin/vitest run --root packages/mcp`
Expected: green. (If an mcp test asserts read-tool count 10, bump to 11.)

- [ ] **Step 6: Typecheck + commit**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && node_modules/.bin/tsc --build
git add packages/agents/src/tasks.ts packages/agents/test/tasks.test.ts packages/mcp/src/tools/read/categories.ts packages/mcp/src/server.ts packages/mcp/test/read/categories.test.ts
git commit -m "feat: expense_agent AI task + list_categories MCP read tool"
```

---

### Task C4: `buildExpenseAgent` + tool allowlist

**Files:**
- Create: `packages/agent-harness/src/expenseAgent.ts`
- Modify: `packages/agent-harness/src/index.ts` — exports
- Test: `packages/agent-harness/test/expenseAgent.test.ts`

**Interfaces:**
- Consumes: `Agent` from `@mastra/core/agent`, `Memory` type.
- Produces:
  - `EXPENSE_INSTRUCTIONS: string`
  - `EXPENSE_TOOL_ALLOWLIST: string[]` (namespaced finance tool names + `ask_user`).
  - `filterTools(all: Record<string, unknown>, allow: string[]): Record<string, unknown>`
  - `buildExpenseAgent({ model, memory, tools }): Agent`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { filterTools, EXPENSE_TOOL_ALLOWLIST } from '../src/expenseAgent';

describe('expense agent tool filter', () => {
  it('keeps only allowlisted tools, drops investment/loan tools', () => {
    const all = {
      finance_list_transactions: {}, finance_get_expense_summary: {},
      finance_categorize_transaction: {}, finance_tag_transaction: {},
      finance_list_categories: {}, finance_create_rule: {}, finance_create_category: {},
      finance_get_investment_portfolio: {}, finance_get_loans_overview: {},
      ask_user: {},
    };
    const filtered = filterTools(all, EXPENSE_TOOL_ALLOWLIST);
    expect(Object.keys(filtered).sort()).not.toContain('finance_get_investment_portfolio');
    expect(Object.keys(filtered)).toContain('finance_tag_transaction');
    expect(Object.keys(filtered)).toContain('ask_user');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && packages/agent-harness/node_modules/.bin/vitest run test/expenseAgent.test.ts --root packages/agent-harness`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// packages/agent-harness/src/expenseAgent.ts
import { Agent } from '@mastra/core/agent';
import type { Memory } from '@mastra/memory';
import { ASK_USER_TOOL_NAME } from './askUserTool';

export const EXPENSE_TOOL_ALLOWLIST = [
  'finance_list_transactions',
  'finance_get_expense_summary',
  'finance_list_categories',
  'finance_categorize_transaction',
  'finance_tag_transaction',
  'finance_create_category',
  'finance_create_rule',
  ASK_USER_TOOL_NAME,
];

export function filterTools(all: Record<string, unknown>, allow: string[]): Record<string, unknown> {
  const set = new Set(allow);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(all)) if (set.has(k)) out[k] = v;
  return out;
}

export const EXPENSE_INSTRUCTIONS = `You are the user's Expense Clarity specialist. Your single
responsibility: make sure EVERY transaction is understood — correctly categorized, disambiguated,
and tagged — so the user has total clarity over every rupee they spend and earn.

WORKFLOW when reviewing flagged transactions:
1. Inspect them with your tools (list_transactions / get_expense_summary). Look up the category
   list with list_categories before assigning categories.
2. Categorize the clear ones with categorize_transaction. Only assign a category you are highly
   confident about; if a merchant key is derivable, learn a rule so it sticks. If you are NOT
   confident, LEAVE IT UNCATEGORIZED and ask the user — never guess a category.
3. For nature/intent (is this recurring? a subscription? one-off? work vs personal?), you usually
   need the user's knowledge. Use ask_user with 2–4 crisp options to clarify, then record the
   answer with tag_transaction (starter tags: subscription, recurring, one-time, reimbursable,
   work, personal).

STYLE: answer-first, concise, no process narration ("Let me pull…", "Perfect!"). Do not dump
everything; work through the flagged items efficiently. When you ask a clarifying question via
ask_user, STOP and wait — do not also write a long speculative answer. Reply in GitHub-flavoured
Markdown; bold key facts; tables only when comparing rows.`;

export function buildExpenseAgent(opts: { model: unknown; memory: Memory; tools: Record<string, unknown> }): Agent {
  return new Agent({
    name: 'expense-clarity-agent',
    instructions: EXPENSE_INSTRUCTIONS,
    model: opts.model as never,
    memory: opts.memory,
    tools: opts.tools as never,
  });
}
```

> Match `buildWealthAgent`'s exact `new Agent({...})` option names + casts by reading `wealthAgent.ts` lines 90+ (the `buildWealthAgent` body) and mirroring precisely (e.g. it may pass `model`, `memory`, `tools` with specific casts).

Add to `packages/agent-harness/src/index.ts`:

```ts
export { buildExpenseAgent, EXPENSE_INSTRUCTIONS, EXPENSE_TOOL_ALLOWLIST, filterTools } from './expenseAgent';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && packages/agent-harness/node_modules/.bin/vitest run test/expenseAgent.test.ts --root packages/agent-harness`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && node_modules/.bin/tsc --build
git add packages/agent-harness/src/expenseAgent.ts packages/agent-harness/src/index.ts packages/agent-harness/test/expenseAgent.test.ts
git commit -m "feat(agent-harness): buildExpenseAgent + focused tool allowlist"
```

---

### Task C5: Parameterize route resolution by task

**Files:**
- Modify: `packages/agent-harness/src/modelResolver.ts`
- Test: `packages/agent-harness/test/modelResolver.expense.test.ts`

**Interfaces:**
- Produces: `resolveRoute(deps, task: string): ResolvedRoute` (generalizes `resolveWealthRoute`). Keep `resolveWealthRoute(deps)` as a thin wrapper = `resolveRoute(deps, 'wealth_chat')` for back-compat.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { resolveRoute } from '../src/modelResolver';

const deps = {
  routeRepo: { getByTask: (t: string) => ({ task: t, modelId: 'm1', updatedAt: 'x' }) },
  modelRepo: { get: () => ({ id: 'm1', providerId: 'p1', modelString: 'gemini-1.5-flash', inputPerM: 1, outputPerM: 1 }) },
  providerRepo: { get: () => ({ id: 'p1', dialect: 'gemini', configJson: null, /* + secret fields as real shape */ }) },
} as any;

describe('resolveRoute(task)', () => {
  it('resolves the expense_agent route', () => {
    const r = resolveRoute(deps, 'expense_agent');
    expect(r.dialect).toBe('gemini');
    expect(r.modelString).toBe('gemini-1.5-flash');
  });
});
```

> Read `modelResolver.ts` fully first — the provider/model/secret decrypt shape must match `ResolvedRoute` exactly (e.g. gemini needs an `apiKey` decrypted from the provider). Mirror the real fakes used in the existing `modelResolver` test.

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && packages/agent-harness/node_modules/.bin/vitest run test/modelResolver.expense.test.ts --root packages/agent-harness`
Expected: FAIL — `resolveRoute` not exported.

- [ ] **Step 3: Refactor**

In `modelResolver.ts`, rename the body of `resolveWealthRoute` to `resolveRoute(deps, task)`, replacing the hardcoded `WEALTH_TASK` with `task` (and updating the "not configured" message to name the task generically or keep wealth-specific wording only when `task==='wealth_chat'`). Keep:

```ts
export function resolveRoute(deps: ResolverDeps, task: string): ResolvedRoute { /* former body, using `task` */ }
export function resolveWealthRoute(deps: ResolverDeps): ResolvedRoute { return resolveRoute(deps, 'wealth_chat'); }
```

Export `resolveRoute` from `index.ts`.

- [ ] **Step 4: Run test + full harness suite**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && packages/agent-harness/node_modules/.bin/vitest run --root packages/agent-harness`
Expected: green (existing `resolveWealthRoute` tests still pass via the wrapper).

- [ ] **Step 5: Commit**

```bash
git add packages/agent-harness/src/modelResolver.ts packages/agent-harness/src/index.ts packages/agent-harness/test/modelResolver.expense.test.ts
git commit -m "refactor(agent-harness): resolveRoute(task) generalizes resolveWealthRoute"
```

---

### Task C6: `runChat({ agent })` selects builder/route/memory

**Files:**
- Modify: `packages/agent-harness/src/runChat.ts`
- Test: `packages/agent-harness/test/runChat.expense.test.ts`

**Interfaces:**
- Consumes: `resolveRoute` (C5), `buildExpenseAgent`/`filterTools`/`EXPENSE_TOOL_ALLOWLIST` (C4), `buildWealthAgent`, `buildWealthMemory`.
- Produces: `runChat(args: { threadId?: string; message: string; agent?: 'wealth' | 'expense' })`. `agent` default `'wealth'`. For `'expense'`: task `expense_agent`, `buildExpenseAgent`, tools filtered to the allowlist, and memory resource id `'expense-agent'` (distinct from wealth's `'user'`). Usage row records `task: route.task` (i.e. `expense_agent`).

> The existing code hardcodes `RESOURCE_ID = 'user'`, `resolveWealthRoute`, `buildWealthAgent`, `task: 'wealth_chat'`. Generalize all four behind the `agent` switch.

- [ ] **Step 1: Write the failing test (mock model, assert routing + tool filter)**

```ts
import { describe, it, expect } from 'vitest';
import { makeWealthHarness } from '../src/runChat';
// Reuse the existing mock-model harness test setup (MockLanguageModelV4 + simulateReadableStream).
// Build a harness with makeModel returning a mock, a fake usageRepo capturing inserts,
// and fake AI repos routing BOTH wealth_chat and expense_agent.

describe('runChat agent selection', () => {
  it('agent:"expense" records usage under expense_agent task', async () => {
    const inserts: any[] = [];
    const harness = makeWealthHarness(/* deps with usageRepo.insert pushing to inserts, makeModel mock, both routes */);
    const chat = await harness.runChat({ message: 'review these', agent: 'expense' });
    for await (const _ of chat.events) { /* drain */ }
    await chat.done;
    expect(inserts.at(-1).task).toBe('expense_agent');
  });
});
```

> Read the existing `runChat` test (`grep -rln "makeWealthHarness\|MockLanguageModelV4" packages/agent-harness/test`) and clone its deps construction verbatim, then add the `expense_agent` route to the fake `routeRepo` and pass `agent: 'expense'`. This is the capability spike — pin the real mock shape from the existing test, don't invent it.

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && packages/agent-harness/node_modules/.bin/vitest run test/runChat.expense.test.ts --root packages/agent-harness`
Expected: FAIL — `agent` param ignored; usage task still `wealth_chat`.

- [ ] **Step 3: Implement the switch**

In `runChat.ts`:
- Import `resolveRoute`, `buildExpenseAgent`, `filterTools`, `EXPENSE_TOOL_ALLOWLIST`.
- In `runChat`, read `const agentKind = args.agent ?? 'wealth';`
- `const task = agentKind === 'expense' ? 'expense_agent' : 'wealth_chat';`
- `const route = resolveRoute(deps, task);`
- `const resourceId = agentKind === 'expense' ? 'expense-agent' : RESOURCE_ID;`
- After `getFinanceTools`, build the tool set + agent per kind:

```ts
const allTools = { ...financeTools, ...buildAskUserTool() };
const tools = agentKind === 'expense' ? filterTools(allTools, EXPENSE_TOOL_ALLOWLIST) : allTools;
const agent = agentKind === 'expense'
  ? buildExpenseAgent({ model, memory, tools })
  : buildWealthAgent({ model, memory, tools });
```

- Replace `agent.stream(args.message, { memory: { resource: RESOURCE_ID, thread: threadId } })` with `resource: resourceId`.
- In BOTH `usageRepo.insert(...)` calls, set `task` (currently the literal `'wealth_chat'`) to `route.task` if `ResolvedRoute` carries it, else the local `task` variable. Use the local `task` variable to be safe.

- [ ] **Step 4: Run test to verify it passes + full harness suite**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && packages/agent-harness/node_modules/.bin/vitest run --root packages/agent-harness`
Expected: green (wealth path unchanged; expense path routes correctly).

- [ ] **Step 5: Commit**

```bash
git add packages/agent-harness/src/runChat.ts packages/agent-harness/test/runChat.expense.test.ts
git commit -m "feat(agent-harness): runChat({agent}) selects expense vs wealth (route/tools/memory)"
```

---

### Task C7: API `agent` field + web `apiStream`/`useAgentChat` params

**Files:**
- Modify: `packages/api/src/routes/agent.ts:11-27`
- Modify: `apps/web/src/lib/apiStream.ts`
- Modify: `apps/web/src/features/assistant/useAgentChat.ts`
- Test: `packages/api/test/agentChat.expense.test.ts`

**Interfaces:**
- Produces:
  - `POST /agent/chat` accepts optional `agent: 'wealth' | 'expense'` in the body, passed to `runChat`.
  - `streamAgentChat({ threadId?, message, agent? })` sends `agent`.
  - `useAgentChat(opts?: { storageKey?: string; persist?: boolean; agent?: 'wealth' | 'expense' })`.

- [ ] **Step 1: Write the failing API test**

```ts
import { describe, it, expect } from 'vitest';
import { buildServer } from '../src/server';
// Use a fake harness injected via buildServer opts (mirror existing agentChat test harness injection).
describe('POST /agent/chat agent field', () => {
  it('passes agent:"expense" through to harness.runChat', async () => {
    let seen: any = null;
    const app = await buildServer({ dbPath: ':memory:', harness: { runChat: async (a: any) => { seen = a; return { threadId: 't1', events: (async function*(){})(), done: Promise.resolve({ threadId: 't1', usage: { inputTokens: 0, outputTokens: 0 } }) }; } } as any });
    await app.inject({ method: 'POST', url: '/agent/chat', payload: { message: 'hi', agent: 'expense' } });
    expect(seen.agent).toBe('expense');
  });
});
```

> Confirm how the existing agent test injects a fake harness (`grep -rn "harness" packages/api/test`). Match the real `buildServer` opts key for the harness.

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && packages/api/node_modules/.bin/vitest run test/agentChat.expense.test.ts --root packages/api`
Expected: FAIL — `agent` not forwarded.

- [ ] **Step 3: Implement**

In `packages/api/src/routes/agent.ts`:

```ts
const body = (req.body ?? {}) as { threadId?: string; message?: string; agent?: 'wealth' | 'expense' };
// ...
const chat = await opts.harness.runChat({ threadId: body.threadId, message, agent: body.agent });
```

(Update the `Harness` type's `runChat` signature to accept optional `agent` — in `packages/api/src/plugins/harness.ts` and/or the imported type.)

In `apps/web/src/lib/apiStream.ts`, add `agent?: 'wealth' | 'expense'` to `streamAgentChat`'s arg type and include it in the POST body.

In `useAgentChat.ts`: accept `opts?: { storageKey?; persist?; agent? }`. Use `opts.storageKey ?? CHAT_STORAGE_KEY` for load/save; when `opts.persist === false`, make `loadPersisted` return empty and `persist`/`save` no-ops; pass `agent: opts?.agent` into `streamAgentChat({...})`.

- [ ] **Step 4: Run test to verify it passes + suites + typecheck**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && packages/api/node_modules/.bin/vitest run --root packages/api && apps/web/node_modules/.bin/vitest run --root apps/web && node_modules/.bin/tsc --build`
Expected: green, clean (AssistantPage still works with default opts).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src apps/web/src/lib/apiStream.ts apps/web/src/features/assistant/useAgentChat.ts packages/api/test/agentChat.expense.test.ts
git commit -m "feat: thread agent selection through /agent/chat + web chat hook"
```

---

### Task C8: Extract `ChatPanel` from `AssistantPage`

**Files:**
- Create: `apps/web/src/features/assistant/ChatPanel.tsx`
- Modify: `apps/web/src/features/assistant/AssistantPage.tsx`
- Test: `apps/web/src/features/assistant/ChatPanel.test.tsx`

**Interfaces:**
- Produces: `ChatPanel({ chat, emptyState?, placeholder? })` where `chat` is the `useAgentChat()` return. Renders the message list (bubbles + `Markdown` + `StepsTrail` + `QuestionChips`) + input + New-chat button. Contains NO layout assumptions beyond `flex flex-col h-full`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatPanel } from './ChatPanel';

const fakeChat = {
  messages: [{ role: 'assistant' as const, text: 'Hello **world**' }],
  send: async () => {}, isStreaming: false, error: null, threadId: 't', clearChat: () => {},
};

describe('ChatPanel', () => {
  it('renders assistant markdown message', () => {
    render(<ChatPanel chat={fakeChat as any} />);
    expect(screen.getByText('world')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && apps/web/node_modules/.bin/vitest run src/features/assistant/ChatPanel.test.tsx --root apps/web`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `ChatPanel`**

Move the message-list + input JSX from `AssistantPage.tsx` (lines ~39-138) into `ChatPanel`, taking `chat` (the hook return) + optional `emptyState`/`placeholder` props. Keep the `draft` local state and `onSend` inside `ChatPanel`. Root element: `<div className="flex flex-col h-full">`.

- [ ] **Step 4: Rewrite `AssistantPage` to use it**

```tsx
export function AssistantPage() {
  const chat = useAgentChat();
  return (
    <div className="h-[calc(100vh-7rem)] max-w-3xl mx-auto">
      <ChatPanel chat={chat} emptyState={/* the existing suggested-prompts block */} placeholder="Ask your wealth manager…" />
    </div>
  );
}
```

Keep the suggested-prompts empty state (pass as `emptyState`, or leave a default inside `ChatPanel` gated on `messages.length === 0`).

- [ ] **Step 5: Run test + web suite + typecheck**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && apps/web/node_modules/.bin/vitest run --root apps/web && node_modules/.bin/tsc --build`
Expected: green, clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/assistant
git commit -m "refactor(web): extract ChatPanel from AssistantPage (reusable chat core)"
```

---

### Task C9: `buildInsightSeed` + `ExpensesInsightDrawer` + wire into ExpensesPage

**Files:**
- Create: `apps/web/src/features/expenses/insightSeed.ts`
- Create: `apps/web/src/features/expenses/ExpensesInsightDrawer.tsx`
- Modify: `apps/web/src/features/expenses/ExpensesPage.tsx`
- Test: `apps/web/src/features/expenses/insightSeed.test.ts`

**Interfaces:**
- Consumes: `Insight` type; `ChatPanel` (C8); `useAgentChat({ persist: false, agent: 'expense', storageKey: 'myfinance.expense.insight.chat' })`.
- Produces:
  - `buildInsightSeed(insight: Insight, txns: { id: number; description: string; amount: number }[]): string` — pure composer.
  - `ExpensesInsightDrawer({ insight, onClose })` — right-side slide-over; on mount, auto-sends the seed once.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { buildInsightSeed } from './insightSeed';

describe('buildInsightSeed', () => {
  it('includes the concern and the flagged transactions', () => {
    const seed = buildInsightSeed(
      { id: 'needs-clarity:2026-08', type: 'needs_clarity', severity: 'info', title: '2 need clarity', detail: 'Unclear txns.', transactionIds: [1, 2], cta: { label: 'x' } },
      [{ id: 1, description: 'UPI-UNKNOWNBIZ', amount: 700 }, { id: 2, description: 'RANDOM', amount: 50 }],
    );
    expect(seed).toContain('Unclear txns.');
    expect(seed).toContain('#1');
    expect(seed).toContain('UPI-UNKNOWNBIZ');
    expect(seed).toContain('700');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && apps/web/node_modules/.bin/vitest run src/features/expenses/insightSeed.test.ts --root apps/web`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `buildInsightSeed`**

```ts
// apps/web/src/features/expenses/insightSeed.ts
import type { Insight } from '...'; // web Insight type

export function buildInsightSeed(
  insight: Insight,
  txns: { id: number; description: string; amount: number }[],
): string {
  const lines = txns.map((t) => `#${t.id} "${t.description}" ₹${Math.round(t.amount)}`).join('; ');
  return [
    `I'm reviewing flagged transactions from my Expenses page because ${insight.detail}`,
    `Transactions: ${lines}.`,
    `Help me understand each and tag them appropriately (subscription, recurring, one-time, etc). Ask me about any you're unsure of, and categorize the clear ones.`,
  ].join('\n');
}
```

- [ ] **Step 4: Implement `ExpensesInsightDrawer`**

A right slide-over (`fixed inset-y-0 right-0 w-[420px] ...`) rendering `<ChatPanel chat={chat} placeholder="Reply…" />`. On mount, resolve the flagged txns' details from the current expenses page rows (pass them in as a prop `txns`), compose `buildInsightSeed`, and call `chat.send(seed)` exactly once (guard with a `useRef` fired flag). `onClose` triggers `queryClient.invalidateQueries` for `['expenses']` + `['expenseInsights']`.

```tsx
const chat = useAgentChat({ agent: 'expense', persist: false, storageKey: 'myfinance.expense.insight.chat' });
const fired = useRef(false);
useEffect(() => {
  if (!fired.current) { fired.current = true; void chat.send(buildInsightSeed(insight, txns)); }
}, []);
```

- [ ] **Step 5: Wire into `ExpensesPage`**

When `activeInsight` (set in B3) is non-null, render `<ExpensesInsightDrawer insight={activeInsight} txns={rowsForIds(activeInsight.transactionIds)} onClose={() => setActiveInsight(null)} />`. `rowsForIds` maps ids → the loaded expense rows (id/description/amount).

- [ ] **Step 6: Run test + web suite + typecheck**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && apps/web/node_modules/.bin/vitest run --root apps/web && node_modules/.bin/tsc --build`
Expected: green, clean.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/expenses
git commit -m "feat(web): insight-scoped expense chat drawer (seed + ChatPanel + expense agent)"
```

---

## PHASE D — Full-suite gate, review, close-out

### Task D1: Full-suite gate across all packages

**Files:** none (verification only).

- [ ] **Step 1: Build the whole graph**

Run: `source ~/.nvm/nvm.sh && nvm use 22 && node_modules/.bin/tsc --build`
Expected: clean across core/agents/api/mcp/agent-harness/web.

- [ ] **Step 2: Run every package suite**

Run each and confirm green (adjust bin paths as needed):
```
packages/core/node_modules/.bin/vitest run --root packages/core
packages/agents/node_modules/.bin/vitest run --root packages/agents
packages/api/node_modules/.bin/vitest run --root packages/api
packages/mcp/node_modules/.bin/vitest run --root packages/mcp
packages/agent-harness/node_modules/.bin/vitest run --root packages/agent-harness
apps/web/node_modules/.bin/vitest run --root apps/web
```
Expected: all green. **Confirm `packages/core/test/golden/groww.golden.test.ts` is 6/6 unchanged.**

- [ ] **Step 3: Seam-invariant check**

Run: `grep -rnE "from '(drizzle-orm|better-sqlite3)'" packages/core/src/domain packages/agent-harness/src packages/mcp/src`
Expected: no matches (comments/types-only are fine — inspect any hit).

- [ ] **Step 4: Commit any test-count adjustments made during the gate**

```bash
git add -A && git commit -m "test: full-suite gate green for expense insights + tags" || echo "nothing to commit"
```

---

### Task D2: Subagent code review

- [ ] **Step 1:** Dispatch a fresh `feature-dev:code-reviewer` (or `superpowers:requesting-code-review`) over the whole branch diff vs `feat/agent-response-calibration`, with the spec as the contract. Focus: seam invariant, no frozen-logic change (categorize.ts byte-identical, Groww 6/6), tag normalization correctness, confidence-gate behavior change is intentional + tested, memory-resource isolation for the expense agent, no secret/PII leakage.
- [ ] **Step 2:** Triage findings via `superpowers:receiving-code-review`; fix Critical/Important with TDD; record accepted minors.

---

### Task D3: Live smoke (real demo.db)

- [ ] **Step 1:** With a real AI route configured, start api + web against `demo.db`; on the Expenses page confirm insight cards render, clicking one opens the drawer, the expense agent asks a clarifying question and writes a tag (chip appears agent-styled), and "Suggest with AI" leaves low-confidence txns blank (which then show as `needs_clarity`).
- [ ] **Step 2:** Confirm the wealth Assistant page still works unchanged (regression check on the `ChatPanel` extraction + `runChat` param).

> Reuse the live-verify script pattern from project-memory ("Live verify verbosity + markdown output"). Do NOT commit demo.db or its memory sidecar.

---

### Task D4: Close-out

- [ ] **Step 1:** Update `docs/superpowers/MASTER_PLAN.md` §4 (L4 row) + §8 (mark Feature B built; note deferred E/bulk-tag/web_search).
- [ ] **Step 2:** Save decisions to project-memory (`mcp__project-memory__memory_save`): the tags-as-JSON decision, the confidence-gate+leave-blank change, the Expense Clarity Agent (isolated memory + focused toolset + own route), and the deferred vector-RAG framing.
- [ ] **Step 3:** Push `feat/expense-ai-insights-tags` + open PR into `main` via `gh auth switch --user ak688744`. (Note: this branch is based on `feat/agent-response-calibration`; if that hasn't merged, target the PR base accordingly or rebase onto `main` once it lands.)
- [ ] **Step 4:** `mcp__project-memory__session_summary`.

---

## Self-Review (author checklist — completed)

**Spec coverage:**
- A tags model → A1–A6 ✓ (schema/migration, repo, API, MCP tool, UI chips).
- B insights → B1–B3 ✓ (pure detectors, endpoint, cards + dismissal).
- C agent+chat+categorization → C1–C9 ✓ (confidence gate, ai-suggest change, task+list_categories, buildExpenseAgent, resolveRoute, runChat param, API/web plumbing, ChatPanel, drawer).
- Triggers (§7): insight-card click (C9), "Suggest with AI" (C2), manual chips (A6), insights auto no-LLM (B2/B3) ✓.
- Deferred items carry no tasks (correct): bulk AI tag pass, vector RAG (E), web_search, recurring detector, auto-run-on-import.
- T1 gate (§9): D1 (Groww 6/6 + seam), D2 (review) ✓.

**Placeholder scan:** no TBD/TODO; each code step has real content. Spots that say "confirm/verify X against the real file" are deliberate grounding checks (the exact current signatures were read during planning), not deferred work.

**Type consistency:** `Tag` used consistently (A1 defines, A3/A5 consume). `Insight`/`InsightInput` consistent B1→B2→B3/C9. `resolveRoute(deps, task)` (C5) consumed by `runChat` (C6). `filterTools`/`EXPENSE_TOOL_ALLOWLIST` (C4) consumed by C6. `agent` field consistent C6→C7→C9.
