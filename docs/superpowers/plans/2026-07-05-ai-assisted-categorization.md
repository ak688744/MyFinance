# AI-Assisted Expense Categorization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an LLM suggest categories for the uncategorized expense transactions in the viewed month; the user confirms/cancels each, and on confirm may turn the AI's keyword into a reusable substring rule.

**Architecture:** New `packages/agents` package holds a dialect-shaped, provider-agnostic LLM layer (Gemini implemented via `fetch`; OpenAI-compatible + Anthropic stubbed) and a pure `categorizeWithAI` use-case whose output is Zod-validated. `packages/core` gains a new `keyword` substring rule type (last in the precedence ladder, below builtins). `packages/api` adds `POST /categories/ai-suggest` (month-bounded, uncategorized-only) and extends `PATCH /transactions/:id/category` for keyword-rule creation. `apps/web` adds a month-scoped button, a violet AI chip state with confirm/cancel + a second "always do this?" prompt, and a review banner/filter.

**Tech Stack:** TypeScript (ESM), Node 20, Fastify 5, Drizzle (SQLite), Vitest, React 19 + TanStack Query, Zod (new), Gemini Generative Language REST API via global `fetch`.

## Global Constraints

- **Node 20 mandatory.** Prefix commands: `source ~/.nvm/nvm.sh && nvm use 20 && …`
- **TOOLCHAIN GOTCHA — pnpm 11.2.2 crashes on Node 20.20.2** (`ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING`). For build/test, DO NOT call `pnpm exec`; call binaries directly from the package's `node_modules/.bin`:
  - core tests: `cd packages/core && ./node_modules/.bin/vitest run`
  - core build: `cd packages/core && ./node_modules/.bin/tsc --build`
  - api tests: `cd packages/api && ./node_modules/.bin/vitest run`
  - agents tests: `cd packages/agents && ./node_modules/.bin/vitest run`
  - web tests: `cd apps/web && ./node_modules/.bin/vitest run`
- **Adding a dependency needs a working installer.** `pnpm install` may crash. If it does, run `corepack prepare pnpm@latest --activate` first, then `pnpm install`. Only two installs happen in this plan (Task 2.1 adds `zod` to `packages/agents`; nothing else).
- **Typecheck via `tsc --build`, never plain `--noEmit`** — composite project refs need core's `.d.ts` emitted first (build core before api/agents).
- **Seam invariant:** `packages/core/src/domain/` and `import/` import NO Drizzle/better-sqlite3 and NO LLM SDK. `packages/agents` imports `@myfinance/core` for TYPES ONLY (no Drizzle). `packages/api` is the only layer touching both DB and agent.
- **Money/rate/value stay REAL/number** (L0 decision) — not relevant here but do not introduce paise.
- **Groww golden-master must stay 6/6 green** after every core change (categorization is not under it, but the full core suite must pass).
- **Branch:** `feat/ai-assisted-categorization` (already created off `main`). Commit frequently.
- **Precedence ladder (final):** `merchant (exact) → upi_note_keyword (exact) → builtin_rule (substring) → keyword (substring) → null`. Enforced by CODE ORDER in `resolveCategoryFromRules`, not the `priority` column. Keyword rules store `priority = 50`.
- **New `category_source` values:** `'keyword_rule'` (a keyword rule matched) and `'ai_suggested'` (AI applied, pre-confirmation).

---

## Phase 1 — Core engine: the `keyword` substring rule type

### Task 1.1: Widen `CategoryRuleType` + resolution source unions

**Files:**
- Modify: `packages/core/src/repositories/types.ts:89` (the `CategoryRuleType` type)
- Modify: `packages/core/src/domain/categorize.ts:32-35` (the `CategoryResolution` type)
- Test: `packages/core/test/unit/categorize.test.ts` (existing — extend)

**Interfaces:**
- Produces: `CategoryRuleType = 'merchant' | 'upi_note_keyword' | 'keyword'`; `CategoryResolution.categorySource` union additionally allows `'keyword_rule' | 'ai_suggested'`.

- [ ] **Step 1: Write the failing test**

Add to `packages/core/test/unit/categorize.test.ts` (top-level, near the other `resolveCategoryFromRules` tests):

```ts
import { describe, it, expect } from 'vitest';
import { resolveCategoryFromRules, createCategorizationInput } from '../../src/domain/categorize';
import type { StoredCategoryRule } from '../../src/repositories/types';

describe('keyword (substring) rule type', () => {
  const keywordRule = (patternValue: string, categoryId: string): StoredCategoryRule => ({
    id: 1, ruleType: 'keyword', patternValue, categoryId, priority: 50,
  });

  it('matches when the normalized description CONTAINS the keyword (plain description)', () => {
    const input = createCategorizationInput('SWIGGY ORDER 123');
    const res = resolveCategoryFromRules(input, [keywordRule('swiggy', 'food')]);
    expect(res).toEqual({ categoryId: 'food', categorySource: 'keyword_rule' });
  });

  it('does not match when the keyword is absent from the description', () => {
    const input = createCategorizationInput('AMAZON PURCHASE');
    const res = resolveCategoryFromRules(input, [keywordRule('swiggy', 'food')]);
    expect(res).toEqual({ categoryId: null, categorySource: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && cd packages/core && ./node_modules/.bin/vitest run test/unit/categorize.test.ts`
Expected: FAIL — TypeScript error `ruleType: 'keyword'` not assignable to `CategoryRuleType`, and/or the keyword branch not matching.

- [ ] **Step 3: Widen the type unions**

In `packages/core/src/repositories/types.ts`, change line 89:

```ts
export type CategoryRuleType = 'merchant' | 'upi_note_keyword' | 'keyword';
```

In `packages/core/src/domain/categorize.ts`, change the `CategoryResolution` type (lines 32-35):

```ts
export type CategoryResolution = {
  categoryId: string | null;
  categorySource:
    | 'merchant_rule'
    | 'upi_note_keyword'
    | 'builtin_rule'
    | 'keyword_rule'
    | 'ai_suggested'
    | null;
};
```

- [ ] **Step 4: Add the keyword branch to `resolveCategoryFromRules`**

In `packages/core/src/domain/categorize.ts`, inside `resolveCategoryFromRules`, insert a keyword loop AFTER the builtin-rule resolution block and BEFORE the final `return`. Replace the existing tail (lines ~169-178, the `normalizedDescription`/`builtinRule`/`return`) with:

```ts
  const normalizedDescription = ` ${normalizeRuleValue(input.description)} `;
  const builtinRule = builtinRules.find((rule) =>
    rule.matches.some((pattern) => normalizedDescription.includes(pattern))
  );

  if (builtinRule) {
    return { categoryId: builtinRule.categoryId, categorySource: 'builtin_rule' };
  }

  // keyword rules: substring match against the normalized description.
  // Deliberately LAST among user rules (below builtins) — substring matching
  // is broader/riskier than exact merchant/UPI matching. Enforced by code order.
  const keywordRule = storedRules.find(
    (rule) =>
      rule.ruleType === 'keyword' &&
      normalizedDescription.includes(` ${normalizeRuleValue(rule.patternValue)} `.trim()),
  );

  if (keywordRule) {
    return { categoryId: keywordRule.categoryId, categorySource: 'keyword_rule' };
  }

  return { categoryId: null, categorySource: null };
```

Note: the keyword is normalized the same way builtins are, and matched with `.includes()` on the space-padded normalized description (so `swiggy` matches `swiggy order 123` → normalized ` swiggy order 123 `). Using `.trim()` on the padded pattern keeps a bare substring match while still normalizing punctuation/case.

- [ ] **Step 5: Run the test to verify it passes**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && cd packages/core && ./node_modules/.bin/vitest run test/unit/categorize.test.ts`
Expected: PASS (both new tests + all existing categorize tests).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/repositories/types.ts packages/core/src/domain/categorize.ts packages/core/test/unit/categorize.test.ts
git commit -m "feat(core): add keyword substring rule type to categorization ladder"
```

---

### Task 1.2: Precedence tests — keyword is weakest user rule

**Files:**
- Test: `packages/core/test/unit/categorize.test.ts` (extend)

**Interfaces:**
- Consumes: `resolveCategoryFromRules`, `createCategorizationInput`, `StoredCategoryRule` (Task 1.1).

- [ ] **Step 1: Write the failing tests**

Add to the `describe('keyword (substring) rule type', …)` block:

```ts
it('builtin_rule beats a keyword rule (keyword is below builtins)', () => {
  // "zepto" is a builtin groceries match; a keyword rule mapping "zepto"→food must NOT win.
  const input = createCategorizationInput('UPI PAYMENT ZEPTO STORE');
  const res = resolveCategoryFromRules(input, [
    { id: 1, ruleType: 'keyword', patternValue: 'zepto', categoryId: 'food', priority: 50 },
  ]);
  expect(res).toEqual({ categoryId: 'groceries', categorySource: 'builtin_rule' });
});

it('an exact merchant rule beats a keyword rule', () => {
  const input = createCategorizationInput('UPI-SWIGGY-payment');
  const res = resolveCategoryFromRules(input, [
    { id: 1, ruleType: 'merchant', patternValue: 'swiggy', categoryId: 'food', priority: 200 },
    { id: 2, ruleType: 'keyword', patternValue: 'swiggy', categoryId: 'shopping', priority: 50 },
  ]);
  expect(res.categorySource).toBe('merchant_rule');
  expect(res.categoryId).toBe('food');
});
```

- [ ] **Step 2: Run to verify they pass** (Task 1.1 already made keyword last, so these should PASS immediately — this task pins the ordering with regression tests)

Run: `source ~/.nvm/nvm.sh && nvm use 20 && cd packages/core && ./node_modules/.bin/vitest run test/unit/categorize.test.ts`
Expected: PASS. If the builtin test FAILS, the keyword branch was placed before the builtin block — move it after (per Task 1.1 Step 4).

- [ ] **Step 3: Commit**

```bash
git add packages/core/test/unit/categorize.test.ts
git commit -m "test(core): pin keyword rule as weakest user rule (below builtins, below exact)"
```

---

### Task 1.3: Extend `saveCategoryMemoryRule` to accept `keyword` type (priority 50)

**Files:**
- Modify: `packages/core/src/domain/categorize.ts:212-235` (`saveCategoryMemoryRule`)
- Test: `packages/core/test/unit/categorize.test.ts` (extend — uses a fake `CategoryRuleRepo`)

**Interfaces:**
- Consumes: `CategoryRuleRepo.createRule({ ruleType, patternValue, categoryId, priority?, createdFromTransactionId? })`.
- Produces: `saveCategoryMemoryRule` accepts `ruleType: 'keyword'` and stores `priority = 50` for it (merchant stays 200, upi_note_keyword stays 100).

- [ ] **Step 1: Write the failing test**

Add to `packages/core/test/unit/categorize.test.ts`:

```ts
import { saveCategoryMemoryRule } from '../../src/domain/categorize';
import type { CategoryRuleRepo } from '../../src/repositories/types';

describe('saveCategoryMemoryRule — keyword type', () => {
  function fakeRuleRepo() {
    const created: any[] = [];
    const repo = {
      getActiveRules: () => [],
      createRule: (r: any) => { created.push(r); return created.length; },
      updateRuleCategory: () => {},
      deleteRule: () => {},
    } as unknown as CategoryRuleRepo;
    return { repo, created };
  }

  it('stores a keyword rule with priority 50', () => {
    const { repo, created } = fakeRuleRepo();
    saveCategoryMemoryRule({ ruleRepo: repo }, {
      ruleType: 'keyword', patternValue: 'swiggy', categoryId: 'food', createdFromTransactionId: 7,
    });
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ ruleType: 'keyword', patternValue: 'swiggy', categoryId: 'food', priority: 50 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && cd packages/core && ./node_modules/.bin/vitest run test/unit/categorize.test.ts`
Expected: FAIL — priority is 100 (current code: `ruleType === 'merchant' ? 200 : 100`).

- [ ] **Step 3: Implement the priority mapping**

In `packages/core/src/domain/categorize.ts`, in `saveCategoryMemoryRule`, replace the priority line:

```ts
  const priority = input.ruleType === 'merchant' ? 200 : input.ruleType === 'upi_note_keyword' ? 100 : 50;
```

- [ ] **Step 4: Run to verify it passes**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && cd packages/core && ./node_modules/.bin/vitest run test/unit/categorize.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/domain/categorize.ts packages/core/test/unit/categorize.test.ts
git commit -m "feat(core): saveCategoryMemoryRule stores keyword rules at priority 50"
```

---

### Task 1.4: Widen the `category_rules.rule_type` CHECK + migration

**Files:**
- Modify: `packages/core/src/db/schema.ts:105-127` (the `categoryRules` table `rule_type` CHECK)
- Create: `packages/core/drizzle/0002_keyword_rule_type.sql` (table-recreate migration; confirm the next migration number by listing `packages/core/drizzle/`)
- Test: `packages/core/test/unit/keywordRuleMigration.test.ts` (new)

**Interfaces:**
- Produces: a `category_rules` table whose CHECK accepts `('merchant','upi_note_keyword','keyword')`.

- [ ] **Step 1: Confirm the next migration filename**

Run: `ls packages/core/drizzle/*.sql`
Use the next sequential number (spec assumes `0002_…`; if `0002` exists, use the next free number and adjust the filename below accordingly).

- [ ] **Step 2: Write the failing test**

Create `packages/core/test/unit/keywordRuleMigration.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { runMigrations } from '../../src/db/migrate';

describe('category_rules keyword CHECK', () => {
  let handle: ReturnType<typeof runMigrations> | null = null;
  afterEach(() => { handle?.sqlite.close(); handle = null; });

  it('accepts a keyword rule insert', () => {
    handle = runMigrations(':memory:');
    const { sqlite } = handle;
    sqlite.prepare("INSERT INTO categories (id, name) VALUES ('food', 'Food')").run();
    expect(() =>
      sqlite.prepare(
        "INSERT INTO category_rules (rule_type, pattern_value, category_id, priority) VALUES ('keyword','swiggy','food',50)",
      ).run(),
    ).not.toThrow();
  });

  it('still rejects an invalid rule_type', () => {
    handle = runMigrations(':memory:');
    const { sqlite } = handle;
    sqlite.prepare("INSERT INTO categories (id, name) VALUES ('food', 'Food')").run();
    expect(() =>
      sqlite.prepare(
        "INSERT INTO category_rules (rule_type, pattern_value, category_id, priority) VALUES ('bogus','x','food',1)",
      ).run(),
    ).toThrow();
  });
});
```

(Confirm `runMigrations(path)` returns `{ sqlite, … }` — it does per L0. If the seed is required for the `categories` FK, the raw insert above satisfies it directly.)

- [ ] **Step 3: Run to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && cd packages/core && ./node_modules/.bin/vitest run test/unit/keywordRuleMigration.test.ts`
Expected: FAIL on the first test — CHECK constraint rejects `'keyword'`.

- [ ] **Step 4: Update the Drizzle schema**

In `packages/core/src/db/schema.ts`, update BOTH the `enum` and the `check` for `categoryRules`:

```ts
    ruleType: text('rule_type', {
      enum: ['merchant', 'upi_note_keyword', 'keyword'],
    }).notNull(),
```

and

```ts
    ruleTypeCheck: check(
      'category_rules_rule_type_check',
      sql`${table.ruleType} IN ('merchant', 'upi_note_keyword', 'keyword')`,
    ),
```

- [ ] **Step 5: Write the migration SQL (table-recreate, L1.5 pattern)**

Create `packages/core/drizzle/0002_keyword_rule_type.sql`. SQLite can't ALTER a CHECK, so recreate the table preserving data. First inspect an existing recreate migration for the exact PRAGMA/rename idiom:

Run: `ls packages/core/drizzle/ && sed -n '1,60p' packages/core/drizzle/0001_*.sql`

Then write (adapt column list to match the live `category_rules` definition exactly):

```sql
PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `__new_category_rules` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `rule_type` text NOT NULL,
  `pattern_value` text NOT NULL,
  `category_id` text NOT NULL,
  `priority` integer DEFAULT 0 NOT NULL,
  `is_active` integer DEFAULT 1 NOT NULL,
  `created_from_transaction_id` integer,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT `category_rules_rule_type_check` CHECK (`rule_type` IN ('merchant', 'upi_note_keyword', 'keyword')),
  FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`created_from_transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_category_rules` SELECT * FROM `category_rules`;
--> statement-breakpoint
DROP TABLE `category_rules`;
--> statement-breakpoint
ALTER TABLE `__new_category_rules` RENAME TO `category_rules`;
--> statement-breakpoint
CREATE UNIQUE INDEX `category_rules_rule_type_pattern_value_unique` ON `category_rules` (`rule_type`, `pattern_value`);
--> statement-breakpoint
PRAGMA foreign_keys=ON;
```

IMPORTANT: verify the column list, the unique-index name, and the FK clauses against the actual `0000_*`/`0001_*` migration text for `category_rules` (copy them verbatim so the recreate is faithful). Also confirm how migrations are registered — if `packages/core/drizzle/meta/_journal.json` drives application, add the entry the same way the `db:generate` output would (or regenerate with `drizzle-kit` if that is the project's flow; check `packages/core/drizzle/meta/`).

- [ ] **Step 6: Run to verify both tests pass**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && cd packages/core && ./node_modules/.bin/vitest run test/unit/keywordRuleMigration.test.ts`
Expected: PASS (accepts keyword, rejects bogus).

- [ ] **Step 7: Full core suite + build (regression gate)**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 20 && cd packages/core && ./node_modules/.bin/tsc --build && ./node_modules/.bin/vitest run
```
Expected: build clean; ALL core tests green including the Groww golden-master (`groww.golden.test.ts` 6/6).

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/db/schema.ts packages/core/drizzle/ packages/core/test/unit/keywordRuleMigration.test.ts
git commit -m "feat(core): widen category_rules CHECK to allow keyword rule_type (migration)"
```

---

## Phase 2 — `packages/agents`: LLM layer + categorize use-case

### Task 2.1: Scaffold `packages/agents` (tsconfig, package.json, vitest, zod)

**Files:**
- Modify: `packages/agents/package.json`
- Create: `packages/agents/tsconfig.json`
- Create: `packages/agents/vitest.config.ts`
- Create: `packages/agents/src/index.ts` (temporary placeholder export)
- Test: `packages/agents/test/smoke.test.ts` (new)

**Interfaces:**
- Produces: a buildable, testable `@myfinance/agents` package referencing `@myfinance/core`.

- [ ] **Step 1: Rewrite `packages/agents/package.json`**

```json
{
  "name": "@myfinance/agents",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --build"
  },
  "dependencies": {
    "@myfinance/core": "workspace:*",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "typescript": "~5.9.2",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create `packages/agents/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": ".", "outDir": "dist" },
  "include": ["src", "test"],
  "references": [{ "path": "../core" }]
}
```

- [ ] **Step 3: Create `packages/agents/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { globals: true, include: ['test/**/*.test.ts'] } });
```

- [ ] **Step 4: Create `packages/agents/src/index.ts`**

```ts
export const AGENTS_VERSION = '0.0.0';
```

- [ ] **Step 5: Create `packages/agents/test/smoke.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { AGENTS_VERSION } from '../src/index';

describe('agents package', () => {
  it('is importable', () => { expect(AGENTS_VERSION).toBe('0.0.0'); });
});
```

- [ ] **Step 6: Install deps**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && cd /Users/vkhandelwal/Documents/MyFinance && pnpm install`
If pnpm crashes: `corepack prepare pnpm@latest --activate && pnpm install`.
Expected: `zod` installed under `packages/agents`; workspace link to `@myfinance/core` present.

- [ ] **Step 7: Build core, then run agents smoke test**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 20 && cd packages/core && ./node_modules/.bin/tsc --build && cd ../agents && ./node_modules/.bin/vitest run
```
Expected: 1 test PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/agents/ pnpm-lock.yaml
git commit -m "chore(agents): scaffold packages/agents (tsconfig, vitest, zod)"
```

---

### Task 2.2: LLM provider interface + types + `resolveProvider` with stubs

**Files:**
- Create: `packages/agents/src/llm/types.ts`
- Create: `packages/agents/src/llm/openaiCompat.ts`
- Create: `packages/agents/src/llm/anthropic.ts`
- Create: `packages/agents/src/llm/index.ts`
- Test: `packages/agents/test/resolveProvider.test.ts`

**Interfaces:**
- Produces:
  - `type LlmDialect = 'gemini' | 'openai-compatible' | 'anthropic'`
  - `type LlmConfig = { dialect: LlmDialect; model: string; apiKey: string; baseURL?: string }`
  - `interface LlmProvider { complete(input: { prompt: string; jsonSchema: object }): Promise<{ text: string; usage?: { inputTokens: number; outputTokens: number } }> }`
  - `class LlmError extends Error { kind: LlmErrorKind }` where `LlmErrorKind = 'provider_not_configured' | 'network' | 'rate_limit' | 'invalid_output' | 'auth'`
  - `resolveProvider(config: LlmConfig): LlmProvider`

- [ ] **Step 1: Write the failing test**

Create `packages/agents/test/resolveProvider.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveProvider } from '../src/llm/index';
import { LlmError } from '../src/llm/types';

describe('resolveProvider', () => {
  it('openai-compatible stub throws provider_not_configured', async () => {
    const p = resolveProvider({ dialect: 'openai-compatible', model: 'x', apiKey: 'k' });
    await expect(p.complete({ prompt: 'hi', jsonSchema: {} })).rejects.toMatchObject({
      name: 'LlmError', kind: 'provider_not_configured',
    });
    expect(LlmError).toBeDefined();
  });

  it('anthropic stub throws provider_not_configured', async () => {
    const p = resolveProvider({ dialect: 'anthropic', model: 'x', apiKey: 'k' });
    await expect(p.complete({ prompt: 'hi', jsonSchema: {} })).rejects.toMatchObject({
      kind: 'provider_not_configured',
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && cd packages/agents && ./node_modules/.bin/vitest run test/resolveProvider.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `packages/agents/src/llm/types.ts`**

```ts
export type LlmDialect = 'gemini' | 'openai-compatible' | 'anthropic';

export type LlmConfig = {
  dialect: LlmDialect;
  model: string;
  apiKey: string;
  baseURL?: string;
};

export type LlmErrorKind =
  | 'provider_not_configured'
  | 'network'
  | 'rate_limit'
  | 'invalid_output'
  | 'auth';

export class LlmError extends Error {
  kind: LlmErrorKind;
  constructor(kind: LlmErrorKind, message: string) {
    super(message);
    this.name = 'LlmError';
    this.kind = kind;
  }
}

export type LlmUsage = { inputTokens: number; outputTokens: number };

export interface LlmProvider {
  complete(input: { prompt: string; jsonSchema: object }): Promise<{ text: string; usage?: LlmUsage }>;
}
```

- [ ] **Step 4: Create the two stub adapters**

`packages/agents/src/llm/openaiCompat.ts`:

```ts
import { LlmError, type LlmConfig, type LlmProvider } from './types';

// Drop-in slot: OpenAI + DeepSeek + Groq + OpenRouter + Ollama all speak this dialect.
// v1 not implemented — enabling later is config + this adapter, no new code elsewhere.
export function makeOpenAiCompatProvider(_config: LlmConfig): LlmProvider {
  return {
    async complete() {
      throw new LlmError('provider_not_configured', 'OpenAI-compatible provider not configured in v1.');
    },
  };
}
```

`packages/agents/src/llm/anthropic.ts`:

```ts
import { LlmError, type LlmConfig, type LlmProvider } from './types';

// Reserved for the L4 Claude Agent SDK path.
export function makeAnthropicProvider(_config: LlmConfig): LlmProvider {
  return {
    async complete() {
      throw new LlmError('provider_not_configured', 'Anthropic provider not configured in v1.');
    },
  };
}
```

- [ ] **Step 5: Create `packages/agents/src/llm/index.ts` (dispatch; gemini added next task)**

```ts
import { LlmError, type LlmConfig, type LlmProvider } from './types';
import { makeOpenAiCompatProvider } from './openaiCompat';
import { makeAnthropicProvider } from './anthropic';
import { makeGeminiProvider } from './gemini';

export function resolveProvider(config: LlmConfig): LlmProvider {
  switch (config.dialect) {
    case 'gemini':
      return makeGeminiProvider(config);
    case 'openai-compatible':
      return makeOpenAiCompatProvider(config);
    case 'anthropic':
      return makeAnthropicProvider(config);
    default:
      throw new LlmError('provider_not_configured', `Unknown dialect: ${(config as LlmConfig).dialect}`);
  }
}

export * from './types';
```

NOTE: this imports `./gemini` which doesn't exist yet — Task 2.3 creates it. To keep this task independently green, temporarily comment out the gemini import + case and add them in Task 2.3. (Simpler: do Step 5 with only the two stubs + default, then Task 2.3 wires gemini in.) Use this two-stub-only version for now:

```ts
import { LlmError, type LlmConfig, type LlmProvider } from './types';
import { makeOpenAiCompatProvider } from './openaiCompat';
import { makeAnthropicProvider } from './anthropic';

export function resolveProvider(config: LlmConfig): LlmProvider {
  switch (config.dialect) {
    case 'openai-compatible':
      return makeOpenAiCompatProvider(config);
    case 'anthropic':
      return makeAnthropicProvider(config);
    case 'gemini':
      throw new LlmError('provider_not_configured', 'Gemini adapter wired in Task 2.3.');
    default:
      throw new LlmError('provider_not_configured', `Unknown dialect: ${(config as LlmConfig).dialect}`);
  }
}

export * from './types';
```

- [ ] **Step 6: Run to verify it passes**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && cd packages/agents && ./node_modules/.bin/vitest run test/resolveProvider.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/agents/src/llm/ packages/agents/test/resolveProvider.test.ts
git commit -m "feat(agents): LLM provider interface + resolveProvider with openai-compat/anthropic stubs"
```

---

### Task 2.3: Gemini adapter (fetch-based, structured JSON output)

**Files:**
- Create: `packages/agents/src/llm/gemini.ts`
- Modify: `packages/agents/src/llm/index.ts` (wire the real gemini case)
- Test: `packages/agents/test/gemini.test.ts` (uses an injected `fetch` fake — NO network)

**Interfaces:**
- Produces: `makeGeminiProvider(config: LlmConfig, deps?: { fetchFn?: typeof fetch }): LlmProvider`. Uses `deps.fetchFn ?? globalThis.fetch`. Calls the Generative Language REST endpoint `${baseURL ?? 'https://generativelanguage.googleapis.com/v1beta'}/models/${model}:generateContent?key=${apiKey}` with `responseMimeType: 'application/json'` + `responseSchema: jsonSchema`. Maps non-2xx to `LlmError` (`auth` for 401/403, `rate_limit` for 429, `network` otherwise). Returns `{ text, usage }` where `usage` maps `usageMetadata.promptTokenCount`/`candidatesTokenCount`.

- [ ] **Step 1: Write the failing test (injected fetch fake)**

Create `packages/agents/test/gemini.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { makeGeminiProvider } from '../src/llm/gemini';

function fakeFetch(status: number, body: unknown): typeof fetch {
  return (async () =>
    ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    }) as unknown as Response) as unknown as typeof fetch;
}

describe('gemini adapter', () => {
  it('returns text + usage from a successful response', async () => {
    const body = {
      candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
      usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 5 },
    };
    const p = makeGeminiProvider(
      { dialect: 'gemini', model: 'gemini-flash', apiKey: 'k' },
      { fetchFn: fakeFetch(200, body) },
    );
    const res = await p.complete({ prompt: 'classify', jsonSchema: { type: 'object' } });
    expect(res.text).toBe('{"ok":true}');
    expect(res.usage).toEqual({ inputTokens: 12, outputTokens: 5 });
  });

  it('maps 429 to rate_limit', async () => {
    const p = makeGeminiProvider(
      { dialect: 'gemini', model: 'gemini-flash', apiKey: 'k' },
      { fetchFn: fakeFetch(429, { error: { message: 'quota' } }) },
    );
    await expect(p.complete({ prompt: 'x', jsonSchema: {} })).rejects.toMatchObject({ kind: 'rate_limit' });
  });

  it('maps 403 to auth', async () => {
    const p = makeGeminiProvider(
      { dialect: 'gemini', model: 'gemini-flash', apiKey: 'k' },
      { fetchFn: fakeFetch(403, { error: { message: 'bad key' } }) },
    );
    await expect(p.complete({ prompt: 'x', jsonSchema: {} })).rejects.toMatchObject({ kind: 'auth' });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && cd packages/agents && ./node_modules/.bin/vitest run test/gemini.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `packages/agents/src/llm/gemini.ts`**

```ts
import { LlmError, type LlmConfig, type LlmProvider } from './types';

const DEFAULT_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export function makeGeminiProvider(
  config: LlmConfig,
  deps: { fetchFn?: typeof fetch } = {},
): LlmProvider {
  const fetchFn = deps.fetchFn ?? globalThis.fetch;
  if (!config.apiKey) {
    return { async complete() { throw new LlmError('provider_not_configured', 'GEMINI_API_KEY not set.'); } };
  }
  return {
    async complete({ prompt, jsonSchema }) {
      const base = config.baseURL ?? DEFAULT_BASE;
      const url = `${base}/models/${config.model}:generateContent?key=${config.apiKey}`;
      let res: Response;
      try {
        res = await fetchFn(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json', responseSchema: jsonSchema },
          }),
        });
      } catch (e) {
        throw new LlmError('network', `Gemini request failed: ${(e as Error).message}`);
      }
      if (!res.ok) {
        if (res.status === 429) throw new LlmError('rate_limit', 'Gemini rate limit (429).');
        if (res.status === 401 || res.status === 403) throw new LlmError('auth', `Gemini auth error (${res.status}).`);
        throw new LlmError('network', `Gemini error (${res.status}).`);
      }
      const data = (await res.json()) as any;
      const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      const usage = data?.usageMetadata
        ? { inputTokens: data.usageMetadata.promptTokenCount ?? 0, outputTokens: data.usageMetadata.candidatesTokenCount ?? 0 }
        : undefined;
      return { text, usage };
    },
  };
}
```

- [ ] **Step 4: Wire the real gemini case in `packages/agents/src/llm/index.ts`**

Replace the `case 'gemini':` throw with the real adapter (and add the import):

```ts
import { makeGeminiProvider } from './gemini';
// …
    case 'gemini':
      return makeGeminiProvider(config);
```

- [ ] **Step 5: Run gemini + resolveProvider tests**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && cd packages/agents && ./node_modules/.bin/vitest run`
Expected: PASS (gemini 3 + resolveProvider 2 + smoke 1).

- [ ] **Step 6: Commit**

```bash
git add packages/agents/src/llm/gemini.ts packages/agents/src/llm/index.ts packages/agents/test/gemini.test.ts
git commit -m "feat(agents): fetch-based Gemini adapter with structured JSON output + error mapping"
```

---

### Task 2.4: Zod schema + pure prompt builder

**Files:**
- Create: `packages/agents/src/categorize/schema.ts`
- Create: `packages/agents/src/categorize/prompt.ts`
- Test: `packages/agents/test/prompt.test.ts`, `packages/agents/test/schema.test.ts`

**Interfaces:**
- Produces:
  - `AiSuggestionSchema` (Zod): `{ transactionId: number(int), categoryId: string, keyword: string, confidence: number 0..1, reason?: string }`
  - `AiSuggestionBatchSchema = z.array(AiSuggestionSchema)`
  - `type AiSuggestion = z.infer<typeof AiSuggestionSchema>`
  - `type TxnForPrompt = { id: number; description: string; amount: number; direction: 'debit' | 'credit' }`
  - `type CategoryForPrompt = { id: string; name: string }`
  - `buildCategorizationPrompt(txns: TxnForPrompt[], categories: CategoryForPrompt[]): string`
  - `GEMINI_RESPONSE_SCHEMA: object` (the response-schema JSON passed to the provider; an array of suggestion objects)

- [ ] **Step 1: Write the failing tests**

`packages/agents/test/schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { AiSuggestionBatchSchema } from '../src/categorize/schema';

describe('AiSuggestionBatchSchema', () => {
  it('accepts a valid batch', () => {
    const parsed = AiSuggestionBatchSchema.safeParse([
      { transactionId: 1, categoryId: 'food', keyword: 'swiggy', confidence: 0.9, reason: 'food delivery' },
    ]);
    expect(parsed.success).toBe(true);
  });
  it('rejects confidence out of range', () => {
    const parsed = AiSuggestionBatchSchema.safeParse([
      { transactionId: 1, categoryId: 'food', keyword: 'swiggy', confidence: 5 },
    ]);
    expect(parsed.success).toBe(false);
  });
  it('rejects a non-integer transactionId', () => {
    const parsed = AiSuggestionBatchSchema.safeParse([
      { transactionId: 1.5, categoryId: 'food', keyword: 'swiggy', confidence: 0.5 },
    ]);
    expect(parsed.success).toBe(false);
  });
});
```

`packages/agents/test/prompt.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildCategorizationPrompt } from '../src/categorize/prompt';

describe('buildCategorizationPrompt', () => {
  const cats = [{ id: 'food', name: 'Food' }, { id: 'transport', name: 'Transport' }];
  const txns = [{ id: 7, description: 'SWIGGY ORDER 123', amount: 250, direction: 'debit' as const }];

  it('includes every category id and each transaction id/description', () => {
    const p = buildCategorizationPrompt(txns, cats);
    expect(p).toContain('food');
    expect(p).toContain('transport');
    expect(p).toContain('7');
    expect(p).toContain('SWIGGY ORDER 123');
  });
  it('instructs the model to choose a distinctive substring keyword', () => {
    const p = buildCategorizationPrompt(txns, cats).toLowerCase();
    expect(p).toContain('keyword');
    expect(p).toContain('substring');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && cd packages/agents && ./node_modules/.bin/vitest run test/schema.test.ts test/prompt.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create `packages/agents/src/categorize/schema.ts`**

```ts
import { z } from 'zod';

export const AiSuggestionSchema = z.object({
  transactionId: z.number().int(),
  categoryId: z.string().min(1),
  keyword: z.string(),
  confidence: z.number().min(0).max(1),
  reason: z.string().optional(),
});

export const AiSuggestionBatchSchema = z.array(AiSuggestionSchema);

export type AiSuggestion = z.infer<typeof AiSuggestionSchema>;

// JSON schema handed to the provider's structured-output mode (Gemini responseSchema).
export const GEMINI_RESPONSE_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      transactionId: { type: 'integer' },
      categoryId: { type: 'string' },
      keyword: { type: 'string' },
      confidence: { type: 'number' },
      reason: { type: 'string' },
    },
    required: ['transactionId', 'categoryId', 'keyword', 'confidence'],
  },
} as const;
```

- [ ] **Step 4: Create `packages/agents/src/categorize/prompt.ts`**

```ts
export type TxnForPrompt = { id: number; description: string; amount: number; direction: 'debit' | 'credit' };
export type CategoryForPrompt = { id: string; name: string };

export function buildCategorizationPrompt(txns: TxnForPrompt[], categories: CategoryForPrompt[]): string {
  const catList = categories.map((c) => `- ${c.id} (${c.name})`).join('\n');
  const rows = txns
    .map((t) => `{"id": ${t.id}, "description": ${JSON.stringify(t.description)}, "amount": ${t.amount}, "direction": "${t.direction}"}`)
    .join('\n');

  return [
    'You categorize personal bank/UPI expense transactions.',
    'Return ONLY a JSON array; one object per input transaction.',
    '',
    'Allowed categoryId values (use EXACTLY one of these ids, never invent a new one):',
    catList,
    '',
    'For each transaction return: transactionId (echo the input id), categoryId (from the list),',
    'keyword, confidence (0..1), and an optional short reason.',
    '',
    'The keyword MUST be a distinctive lowercase SUBSTRING that literally appears inside the',
    "transaction's description (e.g. \"swiggy\" for \"SWIGGY ORDER 123\"). It is used to build a",
    'reusable substring rule, so choose a merchant-like token — NOT a generic stopword',
    '(avoid: payment, upi, order, purchase, transfer, debit, credit).',
    '',
    'Transactions:',
    rows,
  ].join('\n');
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && cd packages/agents && ./node_modules/.bin/vitest run test/schema.test.ts test/prompt.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/agents/src/categorize/schema.ts packages/agents/src/categorize/prompt.ts packages/agents/test/schema.test.ts packages/agents/test/prompt.test.ts
git commit -m "feat(agents): Zod suggestion schema + pure categorization prompt builder"
```

---

### Task 2.5: `categorizeWithAI` — chunking, Zod gate, validation, retry

**Files:**
- Create: `packages/agents/src/categorize/aiCategorize.ts`
- Modify: `packages/agents/src/index.ts` (export public surface)
- Test: `packages/agents/test/aiCategorize.test.ts` (fake `LlmProvider`)

**Interfaces:**
- Consumes: `LlmProvider` (Task 2.2), `AiSuggestionBatchSchema`/`AiSuggestion`/`GEMINI_RESPONSE_SCHEMA` (2.4), `buildCategorizationPrompt`/`TxnForPrompt`/`CategoryForPrompt` (2.4).
- Produces:
  - `categorizeWithAI(txns: TxnForPrompt[], deps: { provider: LlmProvider; categories: CategoryForPrompt[]; chunkSize?: number }): Promise<CategorizeResult>`
  - `type CategorizeResult = { suggestions: AiSuggestion[]; skipped: number; usage: { inputTokens: number; outputTokens: number } }`
  - Validation rules: drop a suggestion whose `categoryId` is not in `categories`; keep a suggestion but set `keyword = ''` when the keyword (lowercased) is not a substring of the txn's lowercased description or is < 2 chars; a chunk whose JSON fails parse/Zod is retried once then its txns counted in `skipped`.

- [ ] **Step 1: Write the failing tests**

Create `packages/agents/test/aiCategorize.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { categorizeWithAI } from '../src/categorize/aiCategorize';
import type { LlmProvider } from '../src/llm/types';
import type { TxnForPrompt, CategoryForPrompt } from '../src/categorize/prompt';

const CATS: CategoryForPrompt[] = [{ id: 'food', name: 'Food' }, { id: 'transport', name: 'Transport' }];

function providerReturning(textPerCall: string[]): { provider: LlmProvider; calls: number } {
  let calls = 0;
  const provider: LlmProvider = {
    async complete() {
      const text = textPerCall[Math.min(calls, textPerCall.length - 1)];
      calls += 1;
      return { text, usage: { inputTokens: 10, outputTokens: 4 } };
    },
  };
  return { provider, get calls() { return calls; } } as any;
}

describe('categorizeWithAI', () => {
  it('maps valid suggestions by transactionId and sums usage', async () => {
    const txns: TxnForPrompt[] = [{ id: 1, description: 'SWIGGY ORDER 123', amount: 250, direction: 'debit' }];
    const text = JSON.stringify([{ transactionId: 1, categoryId: 'food', keyword: 'swiggy', confidence: 0.9 }]);
    const { provider } = providerReturning([text]);
    const res = await categorizeWithAI(txns, { provider, categories: CATS });
    expect(res.suggestions).toEqual([{ transactionId: 1, categoryId: 'food', keyword: 'swiggy', confidence: 0.9 }]);
    expect(res.skipped).toBe(0);
    expect(res.usage.inputTokens).toBe(10);
  });

  it('chunks: 3 txns with chunkSize 2 → 2 provider calls', async () => {
    const txns: TxnForPrompt[] = [1, 2, 3].map((id) => ({ id, description: `SWIGGY ${id}`, amount: 10, direction: 'debit' as const }));
    let calls = 0;
    const provider: LlmProvider = {
      async complete({ prompt }) {
        calls += 1;
        const ids = [...prompt.matchAll(/"id": (\d+)/g)].map((m) => Number(m[1]));
        const arr = ids.map((id) => ({ transactionId: id, categoryId: 'food', keyword: 'swiggy', confidence: 0.8 }));
        return { text: JSON.stringify(arr) };
      },
    };
    const res = await categorizeWithAI(txns, { provider, categories: CATS, chunkSize: 2 });
    expect(calls).toBe(2);
    expect(res.suggestions).toHaveLength(3);
  });

  it('drops a suggestion whose categoryId is not a real category', async () => {
    const txns: TxnForPrompt[] = [{ id: 1, description: 'X', amount: 1, direction: 'debit' }];
    const text = JSON.stringify([{ transactionId: 1, categoryId: 'made_up', keyword: 'x', confidence: 0.9 }]);
    const { provider } = providerReturning([text]);
    const res = await categorizeWithAI(txns, { provider, categories: CATS });
    expect(res.suggestions).toHaveLength(0);
  });

  it('keeps the suggestion but blanks keyword when keyword is not a substring of the description', async () => {
    const txns: TxnForPrompt[] = [{ id: 1, description: 'AMAZON PURCHASE', amount: 1, direction: 'debit' }];
    const text = JSON.stringify([{ transactionId: 1, categoryId: 'food', keyword: 'swiggy', confidence: 0.7 }]);
    const { provider } = providerReturning([text]);
    const res = await categorizeWithAI(txns, { provider, categories: CATS });
    expect(res.suggestions[0].categoryId).toBe('food');
    expect(res.suggestions[0].keyword).toBe('');
  });

  it('retries a chunk once on invalid JSON, then counts it skipped', async () => {
    const txns: TxnForPrompt[] = [{ id: 1, description: 'X', amount: 1, direction: 'debit' }];
    const { provider } = providerReturning(['not json', 'still not json']);
    const res = await categorizeWithAI(txns, { provider, categories: CATS });
    expect(res.suggestions).toHaveLength(0);
    expect(res.skipped).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && cd packages/agents && ./node_modules/.bin/vitest run test/aiCategorize.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `packages/agents/src/categorize/aiCategorize.ts`**

```ts
import type { LlmProvider } from '../llm/types';
import {
  AiSuggestionBatchSchema, GEMINI_RESPONSE_SCHEMA, type AiSuggestion,
} from './schema';
import { buildCategorizationPrompt, type TxnForPrompt, type CategoryForPrompt } from './prompt';

export type CategorizeResult = {
  suggestions: AiSuggestion[];
  skipped: number;
  usage: { inputTokens: number; outputTokens: number };
};

export type CategorizeDeps = {
  provider: LlmProvider;
  categories: CategoryForPrompt[];
  chunkSize?: number;
};

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function parseBatch(text: string): AiSuggestion[] | null {
  let json: unknown;
  try { json = JSON.parse(text); } catch { return null; }
  const parsed = AiSuggestionBatchSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

export async function categorizeWithAI(txns: TxnForPrompt[], deps: CategorizeDeps): Promise<CategorizeResult> {
  const chunkSize = deps.chunkSize ?? 25;
  const validCategoryIds = new Set(deps.categories.map((c) => c.id));
  const byId = new Map(txns.map((t) => [t.id, t]));

  const suggestions: AiSuggestion[] = [];
  let skipped = 0;
  const usage = { inputTokens: 0, outputTokens: 0 };

  for (const group of chunk(txns, chunkSize)) {
    const prompt = buildCategorizationPrompt(group, deps.categories);

    let batch: AiSuggestion[] | null = null;
    for (let attempt = 0; attempt < 2 && batch === null; attempt += 1) {
      const out = await deps.provider.complete({ prompt, jsonSchema: GEMINI_RESPONSE_SCHEMA });
      if (out.usage) { usage.inputTokens += out.usage.inputTokens; usage.outputTokens += out.usage.outputTokens; }
      batch = parseBatch(out.text);
    }

    if (batch === null) { skipped += group.length; continue; }

    for (const s of batch) {
      const txn = byId.get(s.transactionId);
      if (!txn) continue;                          // hallucinated id
      if (!validCategoryIds.has(s.categoryId)) continue; // invented category → drop
      const kw = s.keyword.trim().toLowerCase();
      const isSubstring = kw.length >= 2 && txn.description.toLowerCase().includes(kw);
      suggestions.push({ ...s, keyword: isSubstring ? kw : '' });
    }
  }

  return { suggestions, skipped, usage };
}
```

- [ ] **Step 4: Update `packages/agents/src/index.ts` — public surface**

```ts
export const AGENTS_VERSION = '0.0.0';

export { resolveProvider } from './llm/index';
export {
  LlmError, type LlmConfig, type LlmDialect, type LlmProvider, type LlmUsage, type LlmErrorKind,
} from './llm/types';
export { categorizeWithAI, type CategorizeResult, type CategorizeDeps } from './categorize/aiCategorize';
export { type AiSuggestion } from './categorize/schema';
export { type TxnForPrompt, type CategoryForPrompt } from './categorize/prompt';
```

- [ ] **Step 5: Run to verify they pass**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && cd packages/agents && ./node_modules/.bin/vitest run`
Expected: ALL agents tests PASS (aiCategorize 5 + gemini 3 + resolveProvider 2 + schema 3 + prompt 2 + smoke 1).

- [ ] **Step 6: Typecheck build**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && cd packages/core && ./node_modules/.bin/tsc --build && cd ../agents && ./node_modules/.bin/tsc --build`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add packages/agents/src/categorize/aiCategorize.ts packages/agents/src/index.ts packages/agents/test/aiCategorize.test.ts
git commit -m "feat(agents): categorizeWithAI — chunking, Zod gate, category+keyword validation, one retry"
```

---

## Phase 3 — API: endpoint, PATCH extension, categorySource plumbing

### Task 3.1: Repo — month-bounded uncategorized query + expose `categorySource`

**Files:**
- Modify: `packages/core/src/repositories/types.ts` (`ExpenseTransactionRepo` interface + `ExpenseTransactionRow`)
- Modify: `packages/core/src/repositories/expenseTransactionRepo.ts`
- Test: `packages/core/test/unit/expenseTxRepo.query.test.ts` (extend)

**Interfaces:**
- Produces:
  - `ExpenseTransactionRow` gains `categorySource: string | null`.
  - `ExpenseTransactionRepo.query()` SELECT now also returns `categorySource`.
  - New method `listUncategorizedInRange(range: { from: string; to: string; limit?: number }): { id: number; description: string; amount: number; direction: 'debit' | 'credit' }[]` — `WHERE category_id IS NULL AND transaction_date BETWEEN from AND to ORDER BY transaction_date ASC LIMIT ?`.

- [ ] **Step 1: Write the failing tests**

Add to `packages/core/test/unit/expenseTxRepo.query.test.ts` (follow the file's existing setup for seeding a temp DB + repo). Two tests:

```ts
it('listUncategorizedInRange returns only null-category txns within the date window', () => {
  // Seed via the test's existing helper. Insert:
  //  - id A: 2026-03-05, category_id NULL       → included
  //  - id B: 2026-03-20, category_id 'food'      → excluded (categorized)
  //  - id C: 2026-02-25, category_id NULL         → excluded (out of range)
  const rows = repo.listUncategorizedInRange({ from: '2026-03-01', to: '2026-03-31' });
  expect(rows.map((r) => r.description)).toEqual(['UNCAT MARCH']); // the A row's description
  expect(rows[0]).toMatchObject({ direction: 'debit' });
});

it('query() exposes categorySource', () => {
  const rows = repo.query({ from: '2026-03-01', to: '2026-03-31' });
  expect(rows[0]).toHaveProperty('categorySource');
});
```

Adapt the seed inserts to the test file's existing insertion style (it already builds a migrated DB + repo). Use raw `sqlite.prepare(...).run(...)` inserts with explicit `category_id`, `category_source`, `transaction_date`, `direction`, `amount`, `dedupe_key`, `normalized_description`, `description`, `source_type` (all NOT NULL columns).

- [ ] **Step 2: Run to verify they fail**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && cd packages/core && ./node_modules/.bin/vitest run test/unit/expenseTxRepo.query.test.ts`
Expected: FAIL — `listUncategorizedInRange` undefined; `categorySource` missing from query rows.

- [ ] **Step 3: Update the types**

In `packages/core/src/repositories/types.ts`:
- Add `categorySource: string | null;` to `ExpenseTransactionRow` (after `categoryId`).
- Add to the `ExpenseTransactionRepo` interface:

```ts
  /**
   * Uncategorized (category_id IS NULL) transactions within an inclusive
   * transaction_date window, ordered ASC. Feeds the AI-suggest endpoint.
   */
  listUncategorizedInRange(range: { from: string; to: string; limit?: number }): {
    id: number; description: string; amount: number; direction: 'debit' | 'credit';
  }[];
```

- [ ] **Step 4: Implement in the repo**

In `packages/core/src/repositories/expenseTransactionRepo.ts`:
- In `query()`'s `.select({ … })`, add `categorySource: transactions.categorySource,`.
- Add the new method (use the existing drizzle imports `and`, `isNull`, `gte`, `lte`, `asc`; if `gte`/`lte`/`asc` aren't imported, add them from `drizzle-orm`):

```ts
    listUncategorizedInRange({ from, to, limit }) {
      const rows = db
        .select({
          id: transactions.id,
          description: transactions.description,
          amount: transactions.amount,
          direction: transactions.direction,
        })
        .from(transactions)
        .where(and(
          isNull(transactions.categoryId),
          gte(transactions.transactionDate, from),
          lte(transactions.transactionDate, to),
        ))
        .orderBy(asc(transactions.transactionDate))
        .limit(limit ?? 1000)
        .all();
      return rows as { id: number; description: string; amount: number; direction: 'debit' | 'credit' }[];
    },
```

Confirm the `.all()`/execution idiom matches the file's other methods (better-sqlite3 drizzle is synchronous — copy whatever pattern the existing `query()` uses; if it doesn't call `.all()`, match it).

- [ ] **Step 5: Run to verify they pass**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && cd packages/core && ./node_modules/.bin/vitest run test/unit/expenseTxRepo.query.test.ts`
Expected: PASS.

- [ ] **Step 6: Full core suite + build**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && cd packages/core && ./node_modules/.bin/tsc --build && ./node_modules/.bin/vitest run`
Expected: all green (Groww 6/6 intact).

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/repositories/types.ts packages/core/src/repositories/expenseTransactionRepo.ts packages/core/test/unit/expenseTxRepo.query.test.ts
git commit -m "feat(core): listUncategorizedInRange + expose categorySource in query()"
```

---

### Task 3.2: API config — task-keyed LLM config from env

**Files:**
- Modify: `packages/api/src/config.ts`
- Test: `packages/api/test/config.test.ts` (new)

**Interfaces:**
- Produces: `ApiConfig` gains `llm: { categorization: LlmConfig | null }`. `loadConfig()` builds `categorization` from env: `AI_CATEGORIZATION_DIALECT` (default `'gemini'`), `AI_CATEGORIZATION_MODEL` (default `'gemini-1.5-flash'`), `GEMINI_API_KEY` (→ `apiKey`), `AI_CATEGORIZATION_BASE_URL` (→ `baseURL?`). If no api key present, `categorization` is `null` (task-keyed shape, forward-compat with the parked Settings surface).

- [ ] **Step 1: Write the failing test**

Create `packages/api/test/config.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { loadConfig } from '../src/config';

const saved = { ...process.env };
afterEach(() => { process.env = { ...saved }; });

describe('loadConfig llm', () => {
  it('builds categorization config when GEMINI_API_KEY is set', () => {
    process.env.GEMINI_API_KEY = 'k';
    process.env.AI_CATEGORIZATION_MODEL = 'gemini-1.5-flash';
    const cfg = loadConfig();
    expect(cfg.llm.categorization).toEqual({
      dialect: 'gemini', model: 'gemini-1.5-flash', apiKey: 'k',
    });
  });
  it('categorization is null when no key present', () => {
    delete process.env.GEMINI_API_KEY;
    const cfg = loadConfig();
    expect(cfg.llm.categorization).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && cd packages/core && ./node_modules/.bin/tsc --build && cd ../api && ./node_modules/.bin/vitest run test/config.test.ts`
Expected: FAIL — `cfg.llm` undefined.

- [ ] **Step 3: Implement**

Rewrite `packages/api/src/config.ts`:

```ts
import type { LlmConfig } from '@myfinance/agents';

export type ApiConfig = {
  dbPath: string;
  port: number;
  llm: { categorization: LlmConfig | null };
};

export function loadConfig(): ApiConfig {
  const apiKey = process.env.GEMINI_API_KEY ?? '';
  const categorization: LlmConfig | null = apiKey
    ? {
        dialect: (process.env.AI_CATEGORIZATION_DIALECT as LlmConfig['dialect']) ?? 'gemini',
        model: process.env.AI_CATEGORIZATION_MODEL ?? 'gemini-1.5-flash',
        apiKey,
        ...(process.env.AI_CATEGORIZATION_BASE_URL ? { baseURL: process.env.AI_CATEGORIZATION_BASE_URL } : {}),
      }
    : null;

  return {
    dbPath: process.env.DB_PATH ?? 'myfinance.db',
    port: Number(process.env.PORT ?? 3001),
    llm: { categorization },
  };
}
```

- [ ] **Step 4: Add `@myfinance/agents` to api deps**

In `packages/api/package.json` dependencies, add: `"@myfinance/agents": "workspace:*",`. Add a project reference in `packages/api/tsconfig.json`:

```json
  "references": [{ "path": "../core" }, { "path": "../agents" }]
```

Run: `source ~/.nvm/nvm.sh && nvm use 20 && cd /Users/vkhandelwal/Documents/MyFinance && pnpm install` (corepack workaround if it crashes).

- [ ] **Step 5: Run to verify it passes**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && cd packages/core && ./node_modules/.bin/tsc --build && cd ../agents && ./node_modules/.bin/tsc --build && cd ../api && ./node_modules/.bin/vitest run test/config.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/config.ts packages/api/package.json packages/api/tsconfig.json packages/api/test/config.test.ts pnpm-lock.yaml
git commit -m "feat(api): task-keyed LLM config (categorization) from env + agents dep"
```

---

### Task 3.3: `buildServer` — injectable `llmProvider`

**Files:**
- Modify: `packages/api/src/server.ts`
- (route added next task; this task only threads the option)

**Interfaces:**
- Produces: `BuildServerOpts` gains `llmProvider?: LlmProvider`. `buildServer` resolves the categorization provider: `opts.llmProvider ?? (cfg.llm.categorization ? resolveProvider(cfg.llm.categorization) : null)`, and passes it into `categoryRoutes` via registration options. Tests inject a fake; when neither is present the provider is `null` (route returns 400).

- [ ] **Step 1: Modify `packages/api/src/server.ts`**

Add imports:

```ts
import { resolveProvider, type LlmProvider } from '@myfinance/agents';
```

Extend `BuildServerOpts`:

```ts
export type BuildServerOpts = {
  dbPath?: string;
  amfiMatch?: AmfiMatch;
  /** Injected categorization LLM provider (tests pass a fake). Falls back to config. */
  llmProvider?: LlmProvider;
};
```

Inside `buildServer`, after `const dbPath = …`:

```ts
  const cfg = loadConfig();
  const categorizationProvider: LlmProvider | null =
    opts.llmProvider ?? (cfg.llm.categorization ? resolveProvider(cfg.llm.categorization) : null);
```

Change the categoryRoutes registration to pass the provider:

```ts
  await app.register(categoryRoutes, { llmProvider: categorizationProvider });
```

(`dbPath` currently uses `opts.dbPath ?? loadConfig().dbPath` — reuse the new `cfg`: `const dbPath = opts.dbPath ?? cfg.dbPath;`.)

- [ ] **Step 2: Build to verify types (route options change lands in next task)**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && cd packages/core && ./node_modules/.bin/tsc --build && cd ../agents && ./node_modules/.bin/tsc --build && cd ../api && ./node_modules/.bin/tsc --build`
Expected: This will FAIL until Task 3.4 gives `categoryRoutes` an options parameter. That's expected — do NOT commit yet; proceed to Task 3.4 and commit them together.

---

### Task 3.4: `POST /categories/ai-suggest` endpoint

**Files:**
- Modify: `packages/api/src/routes/categories.ts`
- Test: `packages/api/test/aiSuggest.test.ts` (new — injects a fake provider via `buildServer({ llmProvider })`)

**Interfaces:**
- Consumes: `categorizeWithAI` + `LlmProvider` (agents); `expenseTxRepo.listUncategorizedInRange` (3.1); `categoryRepo.list()`; `expenseTxRepo.updateCategory(id, categoryId, 'ai_suggested')`.
- Produces: `categoryRoutes(app, opts: { llmProvider: LlmProvider | null })`; route `POST /categories/ai-suggest` body `{ from: string; to: string }` → `{ data: { suggestions: {transactionId, categoryId, keyword, confidence, reason?}[], counts: { suggested, skipped, total }, usage, warnings: string[] } }`. Applies each suggestion as `ai_suggested`. 400 if provider is null. 200 with empty results if no candidates. Hard cap 200.

- [ ] **Step 1: Write the failing test**

Create `packages/api/test/aiSuggest.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { buildServer } from '../src/server';
import type { LlmProvider } from '@myfinance/agents';

const noAmfi = async () => ({ matched: 0, total: 0 });

function seedUncategorized(app: any) {
  // one uncategorized March txn with a plain description
  app.sqlite.prepare(
    `INSERT INTO transactions (transaction_date, description, normalized_description, amount, direction, source_type, dedupe_key)
     VALUES ('2026-03-10', 'SWIGGY ORDER 999', 'swiggy order 999', 250, 'debit', 'manual', 'k-swiggy-1')`,
  ).run();
}

function fakeProvider(suggestions: unknown): LlmProvider {
  return { async complete() { return { text: JSON.stringify(suggestions), usage: { inputTokens: 8, outputTokens: 3 } }; } };
}

describe('POST /categories/ai-suggest', () => {
  let app: Awaited<ReturnType<typeof buildServer>> | null = null;
  afterEach(async () => { await app?.close(); app = null; });

  it('applies AI suggestions as ai_suggested and returns them', async () => {
    app = await buildServer({
      dbPath: ':memory:', amfiMatch: noAmfi,
      llmProvider: fakeProvider([{ transactionId: 0, categoryId: 'food', keyword: 'swiggy', confidence: 0.9 }]),
    });
    seedUncategorized(app);
    const row = app.sqlite.prepare("SELECT id FROM transactions WHERE dedupe_key = 'k-swiggy-1'").get() as { id: number };
    // The AI must echo the real txn id; re-point the fake to it:
    (app as any); // provider was fixed above with id 0 — instead assert by re-seeding with known id.

    const res = await app.inject({ method: 'POST', url: '/categories/ai-suggest', payload: { from: '2026-03-01', to: '2026-03-31' } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.counts.total).toBe(1);
    // The applied row now carries category_source = 'ai_suggested'
    const after = app.sqlite.prepare('SELECT category_id, category_source FROM transactions WHERE id = ?').get(row.id) as any;
    if (body.data.suggestions.length) {
      expect(after.category_source).toBe('ai_suggested');
    }
  });

  it('returns 400 when no provider is configured', async () => {
    app = await buildServer({ dbPath: ':memory:', amfiMatch: noAmfi }); // no llmProvider, no env key
    const res = await app.inject({ method: 'POST', url: '/categories/ai-suggest', payload: { from: '2026-03-01', to: '2026-03-31' } });
    expect(res.statusCode).toBe(400);
  });

  it('returns empty result when the month has no uncategorized txns', async () => {
    app = await buildServer({ dbPath: ':memory:', amfiMatch: noAmfi, llmProvider: fakeProvider([]) });
    const res = await app.inject({ method: 'POST', url: '/categories/ai-suggest', payload: { from: '2026-05-01', to: '2026-05-31' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.counts.total).toBe(0);
  });
});
```

NOTE for the implementer: the fake provider must echo the REAL transaction id. Simplify the first test by fetching the seeded id first, then constructing the provider to return that id (build the server AFTER computing the id is awkward since seeding needs the app). Practical approach: make the fake echo whatever ids appear in the prompt — mirror the agents test's regex approach:

```ts
function echoingProvider(categoryId: string, keyword: string): LlmProvider {
  return { async complete({ prompt }) {
    const ids = [...prompt.matchAll(/"id": (\d+)/g)].map((m) => Number(m[1]));
    return { text: JSON.stringify(ids.map((id) => ({ transactionId: id, categoryId, keyword, confidence: 0.9 }))), usage: { inputTokens: 8, outputTokens: 3 } };
  } };
}
```

Use `echoingProvider('food', 'swiggy')` for the first test and assert `category_source === 'ai_suggested'` on the seeded row.

- [ ] **Step 2: Run to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && cd packages/core && ./node_modules/.bin/tsc --build && cd ../agents && ./node_modules/.bin/tsc --build && cd ../api && ./node_modules/.bin/vitest run test/aiSuggest.test.ts`
Expected: FAIL — route missing / categoryRoutes has no options param.

- [ ] **Step 3: Give `categoryRoutes` an options param + add the route**

In `packages/api/src/routes/categories.ts`:
- Add imports:

```ts
import { categorizeWithAI, type LlmProvider, type CategoryForPrompt } from '@myfinance/agents';
```

- Change the signature:

```ts
export async function categoryRoutes(
  app: FastifyInstance,
  opts: { llmProvider: LlmProvider | null },
): Promise<void> {
```

- Add the route (near the other category routes; a plain path so no `:id` collision):

```ts
  const AI_SUGGEST_CAP = 200;

  // POST /categories/ai-suggest — month-bounded, uncategorized-only AI categorization
  app.post<{ Body: { from?: string; to?: string } }>('/categories/ai-suggest', async (req) => {
    const { from, to } = req.body ?? {};
    if (!from || !to) throw badRequest('from and to are required.');
    if (!opts.llmProvider) throw badRequest('AI provider not configured. Set GEMINI_API_KEY.');

    const all = app.repos.expenseTxRepo.listUncategorizedInRange({ from, to, limit: AI_SUGGEST_CAP + 1 });
    const warnings: string[] = [];
    let candidates = all;
    if (all.length > AI_SUGGEST_CAP) {
      candidates = all.slice(0, AI_SUGGEST_CAP);
      warnings.push(`Only the first ${AI_SUGGEST_CAP} uncategorized transactions were processed; run again for the rest.`);
    }

    if (candidates.length === 0) {
      return { data: { suggestions: [], counts: { suggested: 0, skipped: 0, total: 0 }, usage: { inputTokens: 0, outputTokens: 0 }, warnings } };
    }

    const categories: CategoryForPrompt[] = app.repos.categoryRepo.list().map((c) => ({ id: c.id, name: c.name }));

    const result = await categorizeWithAI(
      candidates.map((t) => ({ id: t.id, description: t.description, amount: t.amount, direction: t.direction })),
      { provider: opts.llmProvider, categories },
    );

    // Apply each suggestion as ai_suggested (keyword stays transient — returned only).
    for (const s of result.suggestions) {
      app.repos.expenseTxRepo.updateCategory(s.transactionId, s.categoryId, 'ai_suggested');
    }
    if (result.skipped > 0) warnings.push(`AI could not categorize ${result.skipped} transaction(s) — try again.`);

    return {
      data: {
        suggestions: result.suggestions,
        counts: { suggested: result.suggestions.length, skipped: result.skipped, total: candidates.length },
        usage: result.usage,
        warnings,
      },
    };
  });
```

- [ ] **Step 4: Update `buildServer` registration (from Task 3.3) — already passes `{ llmProvider }`**

Verify `server.ts` line reads: `await app.register(categoryRoutes, { llmProvider: categorizationProvider });`

- [ ] **Step 5: Run the ai-suggest test**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && cd packages/api && ./node_modules/.bin/vitest run test/aiSuggest.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit (server.ts + categories.ts together)**

```bash
git add packages/api/src/server.ts packages/api/src/routes/categories.ts packages/api/test/aiSuggest.test.ts
git commit -m "feat(api): POST /categories/ai-suggest (month-bounded, injectable provider, ai_suggested)"
```

---

### Task 3.5: Extend `PATCH /transactions/:id/category` for keyword rules

**Files:**
- Modify: `packages/api/src/routes/transactions.ts`
- Test: `packages/api/test/transactionCategory.test.ts` (new; if a transactions test file exists, extend it — check `ls packages/api/test/`)

**Interfaces:**
- Consumes: `saveCategoryMemoryRule` (now accepts `ruleType: 'keyword'`), `recategorizeNonManualTransactions`.
- Produces: `UpdateCategoryBody` gains `createRuleKeyword?: boolean` and `keyword?: string`. When `createRuleKeyword && categoryId !== null && keyword` is a non-empty trimmed string → `saveCategoryMemoryRule(deps(), { ruleType: 'keyword', patternValue: keyword, categoryId, createdFromTransactionId: id })` then `recategorizeNonManualTransactions(deps())`. Unique-constraint violation on an existing identical rule is swallowed (treated as success) then recategorize still runs.

- [ ] **Step 1: Write the failing test**

Create `packages/api/test/transactionCategory.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { buildServer } from '../src/server';

const noAmfi = async () => ({ matched: 0, total: 0 });

describe('PATCH /transactions/:id/category — keyword rule', () => {
  let app: Awaited<ReturnType<typeof buildServer>> | null = null;
  afterEach(async () => { await app?.close(); app = null; });

  it('creates a keyword rule and recategorizes a sibling', async () => {
    app = await buildServer({ dbPath: ':memory:', amfiMatch: noAmfi });
    // target txn + a sibling sharing the "swiggy" token, both uncategorized
    app.sqlite.prepare(
      `INSERT INTO transactions (transaction_date, description, normalized_description, amount, direction, source_type, dedupe_key)
       VALUES ('2026-03-10','SWIGGY ORDER 999','swiggy order 999',250,'debit','manual','k1'),
              ('2026-03-11','SWIGGY ORDER 111','swiggy order 111',120,'debit','manual','k2')`,
    ).run();
    const target = app.sqlite.prepare("SELECT id FROM transactions WHERE dedupe_key='k1'").get() as { id: number };
    const sibling = app.sqlite.prepare("SELECT id FROM transactions WHERE dedupe_key='k2'").get() as { id: number };

    const res = await app.inject({
      method: 'PATCH', url: `/transactions/${target.id}/category`,
      payload: { categoryId: 'food', createRuleKeyword: true, keyword: 'swiggy' },
    });
    expect(res.statusCode).toBe(200);

    const t = app.sqlite.prepare('SELECT category_id, category_source FROM transactions WHERE id=?').get(target.id) as any;
    const s = app.sqlite.prepare('SELECT category_id, category_source FROM transactions WHERE id=?').get(sibling.id) as any;
    expect(t.category_id).toBe('food');
    expect(t.category_source).toBe('manual');       // the one-off assign wins on the target
    expect(s.category_id).toBe('food');             // sibling caught by the new keyword rule
    expect(s.category_source).toBe('keyword_rule');
  });
});
```

(Requires `food` category — `registerDb` seeds starter categories, so `food` exists.)

- [ ] **Step 2: Run to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && cd packages/api && ./node_modules/.bin/vitest run test/transactionCategory.test.ts`
Expected: FAIL — no keyword-rule handling; sibling stays uncategorized.

- [ ] **Step 3: Implement**

In `packages/api/src/routes/transactions.ts`:
- Add `saveCategoryMemoryRule` to the core import (already imports `extractMerchantKey`, `saveCategoryMemoryRule`, `recategorizeNonManualTransactions` — confirm; add if missing).
- Extend the body type:

```ts
type UpdateCategoryBody = {
  categoryId: string | null;
  createRuleMerchant?: boolean;
  createRuleKeyword?: boolean;
  keyword?: string;
};
```

- After the existing merchant-rule block, add:

```ts
      const { createRuleKeyword, keyword } = req.body ?? ({} as UpdateCategoryBody);
      if (createRuleKeyword && categoryId !== null) {
        const pattern = (keyword ?? '').trim();
        if (pattern.length >= 2) {
          try {
            saveCategoryMemoryRule(deps(), {
              ruleType: 'keyword', patternValue: pattern, categoryId, createdFromTransactionId: id,
            });
          } catch (e) {
            // Ignore unique-constraint (rule already exists); rethrow anything else.
            if (!/unique/i.test((e as Error).message)) throw e;
          }
          recategorizeNonManualTransactions(deps());
        }
      }
```

Ensure `categoryId`, `createRuleMerchant` destructuring at the top still stands; add the new fields to that same destructure to avoid re-reading `req.body` (or keep the separate destructure shown — both work).

- [ ] **Step 4: Run to verify it passes**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && cd packages/api && ./node_modules/.bin/vitest run test/transactionCategory.test.ts`
Expected: PASS.

- [ ] **Step 5: Full api suite + build**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && cd packages/core && ./node_modules/.bin/tsc --build && cd ../agents && ./node_modules/.bin/tsc --build && cd ../api && ./node_modules/.bin/tsc --build && ./node_modules/.bin/vitest run`
Expected: build clean; all api tests green.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/routes/transactions.ts packages/api/test/transactionCategory.test.ts
git commit -m "feat(api): PATCH /transactions/:id/category supports createRuleKeyword + keyword"
```

---

## Phase 4 — Web UI

### Task 4.1: Thread `categorySource` into the web `ExpenseRow` type + hooks

**Files:**
- Modify: `apps/web/src/types.ts` (`ExpenseRow`)
- Modify: `apps/web/src/lib/hooks.ts` (`useUpdateTxCategory` to pass keyword fields; add `useAiSuggest`)
- Test: none (types + hooks; covered by component test in 4.3)

**Interfaces:**
- Produces:
  - `ExpenseRow` gains `categorySource: string | null`.
  - `useUpdateTxCategory` mutation variables extended: `{ id: number; categoryId: string | null; createRuleMerchant?: boolean; createRuleKeyword?: boolean; keyword?: string }` — all passed through to the PATCH body.
  - `useAiSuggest()` — mutation `POST /categories/ai-suggest` with `{ from, to }`; on success invalidates `['expenses']`, `['categories']`, `['networth']`. Returns the `{ suggestions, counts, usage, warnings }` payload.

- [ ] **Step 1: Extend `ExpenseRow` in `apps/web/src/types.ts`**

Add `categorySource: string | null;` to the `ExpenseRow` type (alongside `categoryId`).

- [ ] **Step 2: Extend `useUpdateTxCategory` in `apps/web/src/lib/hooks.ts`**

Replace the mutation body/vars so the PATCH forwards the new fields:

```ts
export function useUpdateTxCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: number; categoryId: string | null; createRuleMerchant?: boolean; createRuleKeyword?: boolean; keyword?: string }) =>
      apiSend<{ ok: boolean }>('PATCH', `/transactions/${v.id}/category`, {
        categoryId: v.categoryId,
        createRuleMerchant: v.createRuleMerchant,
        createRuleKeyword: v.createRuleKeyword,
        keyword: v.keyword,
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); qc.invalidateQueries({ queryKey: ['categories'] }); qc.invalidateQueries({ queryKey: ['networth'] }); },
  });
}
```

- [ ] **Step 3: Add `useAiSuggest` in `apps/web/src/lib/hooks.ts`**

```ts
export type AiSuggestResult = {
  suggestions: { transactionId: number; categoryId: string; keyword: string; confidence: number; reason?: string }[];
  counts: { suggested: number; skipped: number; total: number };
  usage: { inputTokens: number; outputTokens: number };
  warnings: string[];
};

export function useAiSuggest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { from: string; to: string }) => apiSend<AiSuggestResult>('POST', '/categories/ai-suggest', v),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); qc.invalidateQueries({ queryKey: ['categories'] }); qc.invalidateQueries({ queryKey: ['networth'] }); },
  });
}
```

- [ ] **Step 4: Typecheck web**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && cd packages/core && ./node_modules/.bin/tsc --build && cd ../../apps/web && ./node_modules/.bin/tsc --build`
Expected: clean. (If `apiSend`'s body param requires a defined object, `undefined` fields are fine — they serialize out.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/types.ts apps/web/src/lib/hooks.ts
git commit -m "feat(web): thread categorySource + useAiSuggest + keyword fields in useUpdateTxCategory"
```

---

### Task 4.2: `CategoryChip` — `ai_suggested` violet state + confirm/cancel + second prompt

**Files:**
- Modify: `apps/web/src/features/expenses/CategoryChip.tsx`
- Modify: `apps/web/src/features/expenses/ExpensesPage.tsx:~94` (pass `categorySource` + `aiKeyword` props to `CategoryChip`)
- Test: `apps/web/src/features/expenses/CategoryChip.test.tsx` (new)

**Interfaces:**
- Consumes: `useUpdateTxCategory` (extended, 4.1).
- Produces: `CategoryChip` props gain `categorySource?: string | null` and `aiKeyword?: string`. When `categorySource === 'ai_suggested'`, render the violet AI chip: category name + confidence-agnostic "AI" tag + ✓ / ✗. ✓ → `updateTxCategory({ id, categoryId, /* one-off */ })` (source→manual), THEN if `aiKeyword` is non-empty show the second prompt "Always categorize transactions containing '‹keyword›' as X?" Yes/No; Yes → `updateTxCategory({ id, categoryId, createRuleKeyword: true, keyword: aiKeyword })`. ✗ → `updateTxCategory({ id, categoryId: null })`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/features/expenses/CategoryChip.test.tsx` (mirror the project's existing component-test setup — check `primitives.test.tsx` for the QueryClient/render harness):

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CategoryChip } from './CategoryChip';
import * as hooks from '../../lib/hooks';

const cats = [{ id: 'food', name: 'Food' }];

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient();
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('CategoryChip ai_suggested state', () => {
  const mutateAsync = vi.fn().mockResolvedValue({ ok: true });
  beforeEach(() => {
    mutateAsync.mockClear();
    vi.spyOn(hooks, 'useUpdateTxCategory').mockReturnValue({ mutateAsync, isPending: false, error: null } as any);
  });

  it('renders an AI suggestion with confirm/cancel', () => {
    wrap(<CategoryChip txId={1} categoryId="food" categorySource="ai_suggested" aiKeyword="swiggy" merchantLabel="SWIGGY ORDER 1" categories={cats} />);
    expect(screen.getByText(/AI/i)).toBeInTheDocument();
    expect(screen.getByText('Food')).toBeInTheDocument();
  });

  it('confirm → one-off assign, then shows the keyword second prompt', async () => {
    wrap(<CategoryChip txId={1} categoryId="food" categorySource="ai_suggested" aiKeyword="swiggy" merchantLabel="SWIGGY ORDER 1" categories={cats} />);
    fireEvent.click(screen.getByLabelText('Confirm AI suggestion'));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ id: 1, categoryId: 'food' }));
    expect(await screen.findByText(/Always categorize transactions containing/i)).toBeInTheDocument();
  });

  it('Yes on the second prompt creates a keyword rule', async () => {
    wrap(<CategoryChip txId={1} categoryId="food" categorySource="ai_suggested" aiKeyword="swiggy" merchantLabel="SWIGGY ORDER 1" categories={cats} />);
    fireEvent.click(screen.getByLabelText('Confirm AI suggestion'));
    fireEvent.click(await screen.findByText('Yes'));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ id: 1, categoryId: 'food', createRuleKeyword: true, keyword: 'swiggy' }));
  });

  it('cancel reverts to uncategorized', async () => {
    wrap(<CategoryChip txId={1} categoryId="food" categorySource="ai_suggested" aiKeyword="swiggy" merchantLabel="SWIGGY ORDER 1" categories={cats} />);
    fireEvent.click(screen.getByLabelText('Reject AI suggestion'));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ id: 1, categoryId: null }));
  });
});
```

Confirm `@testing-library/react` is available (check `apps/web/package.json` devDeps; the existing `primitives.test.tsx` should already use it — mirror its imports/harness exactly. If it uses a custom render helper, use that instead).

- [ ] **Step 2: Run to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && cd apps/web && ./node_modules/.bin/vitest run src/features/expenses/CategoryChip.test.tsx`
Expected: FAIL — no ai_suggested branch / labels missing.

- [ ] **Step 3: Implement the `ai_suggested` branch in `CategoryChip.tsx`**

Extend props and add the branch (place the ai-suggested render BEFORE the existing `isPickerOpen`/`!categoryId`/default returns):

```tsx
type CategoryChipProps = {
  txId: number;
  categoryId: string | null;
  merchantLabel: string;
  categories: { id: string; name: string }[];
  categorySource?: string | null;
  aiKeyword?: string;
};
```

Add state + handlers inside the component:

```tsx
  const [aiConfirmed, setAiConfirmed] = useState(false); // true after one-off assign, showing keyword prompt

  const handleAiConfirm = async () => {
    if (categoryId === null) return;
    await updateTxCategory.mutateAsync({ id: txId, categoryId });
    if (aiKeyword && aiKeyword.trim().length >= 2) setAiConfirmed(true);
  };
  const handleAiKeywordYes = async () => {
    if (categoryId === null) return;
    await updateTxCategory.mutateAsync({ id: txId, categoryId, createRuleKeyword: true, keyword: aiKeyword });
    setAiConfirmed(false);
  };
  const handleAiKeywordNo = () => setAiConfirmed(false);
  const handleAiReject = async () => { await updateTxCategory.mutateAsync({ id: txId, categoryId: null }); };
```

Add the render branch (violet = design-system AI color) near the top of the return logic:

```tsx
  if (categorySource === 'ai_suggested' && currentCategory) {
    if (aiConfirmed) {
      return (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-600">Always categorize transactions containing "{aiKeyword}" as {currentCategory.name}?</span>
          <button onClick={handleAiKeywordYes} disabled={updateTxCategory.isPending} className="text-violet-700 font-medium px-1">Yes</button>
          <span className="text-gray-400">/</span>
          <button onClick={handleAiKeywordNo} disabled={updateTxCategory.isPending} className="text-gray-600 px-1">No</button>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1">
        <span className="text-xs bg-violet-50 text-violet-700 border border-violet-200 rounded px-2 py-0.5">
          AI · {currentCategory.name}
        </span>
        <button aria-label="Confirm AI suggestion" onClick={handleAiConfirm} disabled={updateTxCategory.isPending} className="text-green-600 px-1">✓</button>
        <button aria-label="Reject AI suggestion" onClick={handleAiReject} disabled={updateTxCategory.isPending} className="text-red-600 px-1">✗</button>
      </div>
    );
  }
```

- [ ] **Step 4: Pass the new props from `ExpensesPage.tsx`**

At the `CategoryChip` usage (~line 94), add:

```tsx
<CategoryChip
  txId={t.id}
  categoryId={t.categoryId}
  categorySource={t.categorySource}
  aiKeyword={aiKeywordById[t.id]}
  merchantLabel={t.description}
  categories={categories.data ?? []}
/>
```

`aiKeywordById` is a `Record<number, string>` built from the last AI-suggest run (added in Task 4.3). For this task, default it to `{}` so the file compiles: add `const aiKeywordById: Record<number, string> = {};` near the top of the component (Task 4.3 replaces it with real state).

- [ ] **Step 5: Run to verify it passes**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && cd apps/web && ./node_modules/.bin/vitest run src/features/expenses/CategoryChip.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/expenses/CategoryChip.tsx apps/web/src/features/expenses/ExpensesPage.tsx apps/web/src/features/expenses/CategoryChip.test.tsx
git commit -m "feat(web): CategoryChip ai_suggested violet state + confirm/cancel + keyword prompt"
```

---

### Task 4.3: `ExpensesPage` — month-scoped button, banner, keyword map, AI filter

**Files:**
- Modify: `apps/web/src/features/expenses/ExpensesPage.tsx`
- Test: none new (manual verification in 4.4; logic is wiring)

**Interfaces:**
- Consumes: `useAiSuggest` (4.1); the page's existing selected-month state + `from`/`to` derivation (reuse whatever the month selector computes — it already scopes KPIs).
- Produces: a "Suggest categories with AI · ‹Month›" button (disabled while pending or when the month has 0 uncategorized rows), a post-run banner (counts + token usage + warnings), an `aiKeywordById` map fed into `CategoryChip`, and an "AI suggested" option in the category filter dropdown (filters rows where `categorySource === 'ai_suggested'`).

- [ ] **Step 1: Add AI-suggest state + handler**

Near the top of the component:

```tsx
const aiSuggest = useAiSuggest();
const [aiKeywordById, setAiKeywordById] = useState<Record<number, string>>({});
const [aiBanner, setAiBanner] = useState<null | { suggested: number; skipped: number; total: number; usage: { inputTokens: number; outputTokens: number }; warnings: string[] }>(null);

// `from`/`to` for the selected month — reuse the page's existing month-window derivation.
const runAiSuggest = async () => {
  const res = await aiSuggest.mutateAsync({ from: monthFrom, to: monthTo }); // monthFrom/monthTo already exist in this component; if named differently, use those
  const map: Record<number, string> = {};
  for (const s of res.suggestions) map[s.transactionId] = s.keyword;
  setAiKeywordById(map);
  setAiBanner({ ...res.counts, usage: res.usage, warnings: res.warnings });
};
```

Remove the placeholder `const aiKeywordById = {}` added in Task 4.2 (now real state).

- [ ] **Step 2: Add the button (near the month selector / the existing Manage button)**

```tsx
<button
  onClick={runAiSuggest}
  disabled={aiSuggest.isPending || uncategorizedInMonthCount === 0}
  className="text-sm rounded px-3 py-1.5 bg-violet-600 text-white disabled:opacity-50 hover:bg-violet-700"
>
  {aiSuggest.isPending ? 'Suggesting…' : `Suggest categories with AI · ${selectedMonthLabel}`}
</button>
```

`uncategorizedInMonthCount` = count of the currently-loaded month rows with `categoryId == null`. `selectedMonthLabel` = the label the month selector already renders. If the page doesn't already expose a count, compute it from the loaded expenses list: `const uncategorizedInMonthCount = (expenses.data ?? []).filter((t) => t.categoryId == null).length;` (note: this only counts the current page; acceptable for the disabled-guard — the endpoint still handles the full month).

- [ ] **Step 3: Add the banner (below the button row)**

```tsx
{aiBanner && (
  <div className="text-sm bg-violet-50 border border-violet-200 rounded px-3 py-2 my-2 flex items-center justify-between">
    <span>
      AI suggested categories for {aiBanner.suggested} of {aiBanner.total} transaction(s)
      {aiBanner.skipped > 0 ? ` · ${aiBanner.skipped} skipped` : ''}
      {aiBanner.usage.inputTokens + aiBanner.usage.outputTokens > 0
        ? ` · ~${aiBanner.usage.inputTokens + aiBanner.usage.outputTokens} tokens`
        : ''}
    </span>
    <button onClick={() => setAiBanner(null)} className="text-violet-700">Dismiss</button>
  </div>
)}
{aiBanner?.warnings.map((w, i) => (
  <div key={i} className="text-xs text-amber-700">{w}</div>
))}
```

- [ ] **Step 4: Add the "AI suggested" filter option**

In the category filter `<select>`, add an option `<option value="__ai__">AI suggested</option>`. Where rows are filtered/rendered, when `categoryFilter === '__ai__'` filter the rendered list to `t.categorySource === 'ai_suggested'` (client-side filter over the loaded rows; do NOT send `__ai__` to the API `categoryId` param — guard it: only pass `categoryId` to `useExpenses` when it's a real id).

- [ ] **Step 5: Typecheck + web tests**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && cd packages/core && ./node_modules/.bin/tsc --build && cd ../../apps/web && ./node_modules/.bin/tsc --build && ./node_modules/.bin/vitest run`
Expected: build clean; all web tests green (incl. CategoryChip 4).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/expenses/ExpensesPage.tsx
git commit -m "feat(web): month-scoped AI-suggest button, review banner, AI-suggested filter"
```

---

### Task 4.4: Full-stack verification gate

**Files:** none (verification only)

- [ ] **Step 1: Full monorepo build + all suites**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 20 \
 && cd /Users/vkhandelwal/Documents/MyFinance/packages/core && ./node_modules/.bin/tsc --build && ./node_modules/.bin/vitest run \
 && cd ../agents && ./node_modules/.bin/tsc --build && ./node_modules/.bin/vitest run \
 && cd ../api && ./node_modules/.bin/tsc --build && ./node_modules/.bin/vitest run \
 && cd ../../apps/web && ./node_modules/.bin/tsc --build && ./node_modules/.bin/vitest run
```
Expected: ALL green. Groww golden-master 6/6 intact in the core run. Note the totals (core was 231, api 53, web 28 pre-feature — expect increases).

- [ ] **Step 2: Seam-invariant grep**

Run:
```bash
cd /Users/vkhandelwal/Documents/MyFinance
grep -rn "drizzle\|better-sqlite3" packages/agents/src && echo "SEAM VIOLATION (agents)" || echo "agents seam OK"
grep -rn "generativelanguage\|fetch(\|apiKey" packages/core/src/domain packages/core/src/import && echo "SEAM VIOLATION (core has network/LLM)" || echo "core seam OK"
```
Expected: `agents seam OK` and `core seam OK`.

- [ ] **Step 3: Live smoke (manual, requires a real Gemini key)**

Documented for the T1 close-out (not automated):
1. `export GEMINI_API_KEY=<key>` and start the API (`cd packages/api && ./node_modules/.bin/tsx watch src/server.ts`) + web (`cd apps/web && ./node_modules/.bin/vite`).
2. Import/seed expenses with genuinely-unmatched plain descriptions (e.g. "SWIGGY ORDER 123", "BLINKIT xyz").
3. On Expenses, select the month → click "Suggest categories with AI".
4. Verify violet AI chips appear; confirm one (✓) → "Yes" on the keyword prompt.
5. Verify a `keyword` rule was created (Manage categories & rules) and a sibling flipped to that category with `category_source='keyword_rule'`.

- [ ] **Step 4: Commit any doc/test-count updates (if a manual test plan file is updated)**

```bash
git add -A && git commit -m "test(ai-categorization): full-stack verification gate green" --allow-empty
```

---

## Post-Plan: Close-out (T1)

After all tasks pass and a subagent code review is clean:
- Update `docs/superpowers/MASTER_PLAN.md` §8 with the feature status + the L4-sequencing note (this pulled a thin L4 slice forward).
- Save a project-memory decision (the keyword rule type, the agents package shape, the parked AI Settings surface).
- Push branch (`gh auth switch --user ak688744` first) + open PR into `main`.

## Self-Review Notes (author)

- **Spec coverage:** §3 package layout → Tasks 2.1–2.5. §4 dialect providers → 2.2/2.3 (+ stubs). §5.1 keyword rule + ladder + migration → 1.1/1.2/1.4. §5.2 `ai_suggested` source → 1.1 (union) + 3.4 (applied). §5.3 no suggestions table → transient keyword via `aiKeywordById` (4.2/4.3). §6 flow (month button → endpoint → apply → confirm + 2nd prompt) → 3.4/4.2/4.3. §7 errors (400 no-provider, skip/retry, category+keyword validation, 200-cap, unique-rule swallow) → 2.5/3.4/3.5. §8 components → all Phase 2–4. §9 testing (fake provider everywhere) → every task's tests.
- **categorySource plumbing** was a discovered gap (repo `query()` didn't select it, web `ExpenseRow` lacked it) → Task 3.1 + 4.1 close it; without it the violet chip can't render.
- **Type consistency:** `LlmProvider.complete({prompt, jsonSchema})`, `categorizeWithAI(txns, {provider, categories, chunkSize})`, `AiSuggestion` fields, and `updateCategory(id, categoryId, source)` are used identically across tasks.
- **Aggregation decision** (count `ai_suggested` in totals) means NO `/expenses/summary` change — correctly absent from the plan.
