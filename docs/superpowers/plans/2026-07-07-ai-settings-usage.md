# AI Settings & Usage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a user-controlled AI settings surface — register providers/models (with pricing), route each AI task to a provider+model at runtime from the DB, track token usage and dollar cost per invocation, and ship a working Bedrock (Claude via AWS SSO) provider.

**Architecture:** Four new DB tables in `core` (`ai_providers`, `ai_models`, `ai_task_routes`, `ai_usage_events`) + AES-256-GCM secret encryption. A code-defined **task registry** and an injected **`LlmGateway`** in `agents` become the single choke point: per task invocation it resolves `{provider, model}` from the DB, builds a concrete provider (Gemini / new Bedrock adapter), calls it, and writes **one aggregated usage row**. New `/ai/*` API routes and a two-tab **AI** web page expose it.

**Tech Stack:** TypeScript, Drizzle ORM + better-sqlite3 (synchronous repos), Fastify, `@anthropic-ai/bedrock-sdk` + `@aws-sdk/credential-providers` (new), React 19 + Vite + TanStack Query + Recharts, Vitest, Zod, Node's `crypto`.

**Spec:** `docs/superpowers/specs/2026-07-07-ai-settings-usage-design.md`

## Global Constraints

- **Node 20 mandatory.** Prefix every command: `source ~/.nvm/nvm.sh && nvm use 20 &&`.
- **pnpm 11.x crashes on Node 20.20.2.** Do NOT run `pnpm install`/`pnpm exec` for build/test. Use `node_modules/.bin/{tsc,vitest}` directly. If a dep must be added, use `corepack prepare pnpm@10.4.1 --activate` first, then `corepack pnpm@10.4.1 add ...`.
- **Typecheck via `tsc --build`** (composite project refs) — NOT plain `--noEmit`. Build order: core → agents → api → web.
- **Seam invariant:** `packages/agents` and `packages/core/src/domain` import ZERO Drizzle/better-sqlite3. The gateway takes repo INTERFACES; only `core/repositories/*` and `core/db/*` touch Drizzle.
- **Money = REAL, tokens = INTEGER, timestamps = TEXT ISO** with `CURRENT_TIMESTAMP` defaults (L0 convention).
- **Groww golden-master must stay 6/6 unchanged** — the T1 gate (no financial logic is touched).
- **Repos are synchronous** (better-sqlite3). No `async`/`await` in repo methods.
- **API response envelope:** `{ data: … }`; errors via the central handler (`errors.ts` helpers `badRequest`/`badGateway`/etc.).
- **Migration file is `drizzle/0004_*.sql`** (0000–0003 already exist). Generate via drizzle-kit, do not hand-number.
- **Branch:** `feat/ai-settings-usage` off freshly-fetched `main`.

---

## File Structure

**packages/core**
- `src/db/schema.ts` (modify) — append 4 tables.
- `src/db/crypto.ts` (create) — AES-256-GCM encrypt/decrypt.
- `drizzle/0004_*.sql` + `drizzle/meta/*` (generate) — migration.
- `src/repositories/types.ts` (modify) — 4 repo interfaces + row types.
- `src/repositories/aiProviderRepo.ts`, `aiModelRepo.ts`, `aiTaskRouteRepo.ts`, `aiUsageRepo.ts` (create).
- `src/index.ts` (modify) — export new repos, crypto, types.

**packages/agents**
- `src/tasks.ts` (create) — `AI_TASKS` registry.
- `src/pricing.ts` (create) — `PRICING_HINTS` + `costUsd`.
- `src/llm/factory.ts` (create) — `buildProvider`.
- `src/llm/bedrock.ts` (modify) — real adapter (currently `anthropic.ts` stub; add bedrock).
- `src/gateway.ts` (create) — `makeLlmGateway` / `runTask`.
- `src/categorize/aiCategorize.ts` (modify) — accept injected `complete` fn.
- `src/index.ts` (modify) — export gateway, tasks, pricing, factory, bedrock, repo-interface types.
- `package.json` (modify) — add bedrock SDK + credential-providers.

**packages/api**
- `src/plugins/db.ts` (modify) — build the 4 new repos into `repos`.
- `src/plugins/gateway.ts` (create) — construct `LlmGateway` from repos + decrypt.
- `src/routes/aiSettings.ts` (create) — providers/models/tasks routes.
- `src/routes/aiUsage.ts` (create) — usage summary/events routes.
- `src/routes/categories.ts` (modify) — `/ai-suggest` calls gateway.
- `src/server.ts` (modify) — inject gateway, register new routes.
- `src/config.ts` (modify) — drop env-provider resolution (note inert).

**apps/web**
- `src/features/ai/AiSettingsPage.tsx`, `ProvidersRoutingTab.tsx`, `UsageCostTab.tsx`, `ProviderFormModal.tsx`, `ModelFormModal.tsx` (create).
- `src/features/ai/aiUsageTransforms.ts` (create) — pure aggregation/formatting.
- `src/lib/hooks.ts` (modify) — AI hooks.
- `src/lib/queryKeys.ts` (modify) — AI keys.
- `src/App.tsx` (modify) — `path: 'ai'` route.
- `src/components/Sidebar.tsx` (modify) — AI nav item.

---

## Phase 1 — Core: crypto, schema, repos

### Task 1: Secret encryption utility

**Files:**
- Create: `packages/core/src/db/crypto.ts`
- Test: `packages/core/test/unit/crypto.test.ts`

**Interfaces:**
- Produces: `encryptSecret(plain: string, keyHex?: string): string`, `decryptSecret(blob: string, keyHex?: string): string`. `keyHex` defaults to `process.env.MYFINANCE_SECRET_KEY`. Format: `base64(iv[12] | authTag[16] | ciphertext)`. Missing/short key → throws `Error('MYFINANCE_SECRET_KEY must be a 64-char hex string (32 bytes)')`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/test/unit/crypto.test.ts
import { describe, it, expect } from 'vitest';
import { encryptSecret, decryptSecret } from '../../src/db/crypto';

const KEY = '0'.repeat(64); // 32 bytes hex

describe('crypto', () => {
  it('round-trips a secret', () => {
    const blob = encryptSecret('sk-test-123', KEY);
    expect(decryptSecret(blob, KEY)).toBe('sk-test-123');
  });
  it('uses a distinct IV each call (ciphertext differs)', () => {
    expect(encryptSecret('same', KEY)).not.toBe(encryptSecret('same', KEY));
  });
  it('throws on tampered ciphertext', () => {
    const blob = encryptSecret('secret', KEY);
    const tampered = Buffer.from(blob, 'base64');
    tampered[tampered.length - 1] ^= 0xff;
    expect(() => decryptSecret(tampered.toString('base64'), KEY)).toThrow();
  });
  it('throws a clear error on a missing/short key', () => {
    expect(() => encryptSecret('x', 'abc')).toThrow(/MYFINANCE_SECRET_KEY/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && packages/core/node_modules/.bin/vitest run test/unit/crypto.test.ts` (from `packages/core`)
Expected: FAIL — cannot find `../../src/db/crypto`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/core/src/db/crypto.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

function resolveKey(keyHex?: string): Buffer {
  const hex = keyHex ?? process.env.MYFINANCE_SECRET_KEY ?? '';
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('MYFINANCE_SECRET_KEY must be a 64-char hex string (32 bytes)');
  }
  return Buffer.from(hex, 'hex');
}

export function encryptSecret(plain: string, keyHex?: string): string {
  const key = resolveKey(keyHex);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64');
}

export function decryptSecret(blob: string, keyHex?: string): string {
  const key = resolveKey(keyHex);
  const buf = Buffer.from(blob, 'base64');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: same as Step 2. Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/db/crypto.ts packages/core/test/unit/crypto.test.ts
git commit -m "feat(core): AES-256-GCM secret encryption util"
```

---

### Task 2: Schema — 4 new AI tables + migration

**Files:**
- Modify: `packages/core/src/db/schema.ts` (append)
- Generate: `packages/core/drizzle/0004_*.sql`
- Test: `packages/core/test/unit/aiSchema.migration.test.ts`

**Interfaces:**
- Produces: Drizzle table objects `aiProviders`, `aiModels`, `aiTaskRoutes`, `aiUsageEvents` exported from `schema.ts`. Columns exactly as spec §5.

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/test/unit/aiSchema.migration.test.ts
import { describe, it, expect } from 'vitest';
import { runMigrations } from '../../src/db/migrate';

describe('ai tables migration 0004', () => {
  it('creates the four ai_* tables and leaves categories intact', () => {
    const { sqlite } = runMigrations(':memory:');
    const names = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r: any) => r.name);
    expect(names).toEqual(expect.arrayContaining([
      'ai_providers', 'ai_models', 'ai_task_routes', 'ai_usage_events', 'categories',
    ]));
    sqlite.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `packages/core/node_modules/.bin/vitest run test/unit/aiSchema.migration.test.ts`
Expected: FAIL — tables not present (migration not generated yet).

- [ ] **Step 3: Append tables to schema.ts**

```ts
// packages/core/src/db/schema.ts  (append at end)
export const aiProviders = sqliteTable(
  'ai_providers',
  {
    id: text('id').primaryKey().notNull(),
    dialect: text('dialect').notNull(),
    label: text('label').notNull(),
    secretEnc: text('secret_enc'),
    configJson: text('config_json'),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    dialectCheck: check('ai_providers_dialect_check',
      sql`${t.dialect} IN ('gemini','openai-compatible','bedrock')`),
  }),
);

export const aiModels = sqliteTable('ai_models', {
  id: text('id').primaryKey().notNull(),
  providerId: text('provider_id').notNull().references(() => aiProviders.id),
  modelString: text('model_string').notNull(),
  label: text('label').notNull(),
  inputPerM: real('input_per_m').notNull(),
  outputPerM: real('output_per_m').notNull(),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const aiTaskRoutes = sqliteTable('ai_task_routes', {
  task: text('task').primaryKey().notNull(),
  modelId: text('model_id').notNull().references(() => aiModels.id),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const aiUsageEvents = sqliteTable(
  'ai_usage_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ts: text('ts').notNull(),
    task: text('task').notNull(),
    providerId: text('provider_id').notNull(),
    dialect: text('dialect').notNull(),
    model: text('model').notNull(),
    inputTokens: integer('input_tokens').notNull(),
    outputTokens: integer('output_tokens').notNull(),
    callCount: integer('call_count').notNull(),
    costUsd: real('cost_usd'),
    ok: integer('ok').notNull(),
  },
  (t) => ({
    tsIdx: index('ai_usage_ts_idx').on(t.ts),
    taskIdx: index('ai_usage_task_idx').on(t.task),
  }),
);
```

- [ ] **Step 4: Generate the migration**

Run (from `packages/core`):
```bash
source ~/.nvm/nvm.sh && nvm use 20 && node_modules/.bin/drizzle-kit generate
```
Expected: creates `drizzle/0004_*.sql` with 4 `CREATE TABLE` + 2 indexes, and updates `drizzle/meta/`. Inspect the file to confirm only additive `CREATE TABLE`/`CREATE INDEX` statements (no ALTER/DROP on existing tables).

- [ ] **Step 5: Run test to verify it passes**

Run: `packages/core/node_modules/.bin/vitest run test/unit/aiSchema.migration.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/db/schema.ts packages/core/drizzle/0004_* packages/core/drizzle/meta packages/core/test/unit/aiSchema.migration.test.ts
git commit -m "feat(core): ai_providers/ai_models/ai_task_routes/ai_usage_events tables + migration 0004"
```

---

### Task 3: Repo interfaces + row types

**Files:**
- Modify: `packages/core/src/repositories/types.ts` (append)

**Interfaces:**
- Produces (row types + interfaces, consumed by Tasks 4–7 and the gateway):

```ts
// packages/core/src/repositories/types.ts  (append)
export type AiDialect = 'gemini' | 'openai-compatible' | 'bedrock';

export interface AiProviderRow {
  id: string; dialect: AiDialect; label: string;
  secretEnc: string | null; configJson: string | null; createdAt: string;
}
export interface AiModelRow {
  id: string; providerId: string; modelString: string; label: string;
  inputPerM: number; outputPerM: number; createdAt: string;
}
export interface AiTaskRouteRow { task: string; modelId: string; updatedAt: string; }
export interface AiUsageEventRow {
  id: number; ts: string; task: string; providerId: string; dialect: string;
  model: string; inputTokens: number; outputTokens: number; callCount: number;
  costUsd: number | null; ok: number;
}

export interface AiProviderRepo {
  list(): AiProviderRow[];
  get(id: string): AiProviderRow | null;
  create(p: { id: string; dialect: AiDialect; label: string; secretEnc: string | null; configJson: string | null }): void;
  update(id: string, patch: { label?: string; secretEnc?: string | null; configJson?: string | null }): void;
  delete(id: string): void;
  countModels(providerId: string): number;
}
export interface AiModelRepo {
  list(filters?: { providerId?: string }): AiModelRow[];
  get(id: string): AiModelRow | null;
  create(m: { id: string; providerId: string; modelString: string; label: string; inputPerM: number; outputPerM: number }): void;
  update(id: string, patch: { label?: string; inputPerM?: number; outputPerM?: number }): void;
  delete(id: string): void;
  countRoutes(modelId: string): number;
}
export interface AiTaskRouteRepo {
  list(): AiTaskRouteRow[];
  getByTask(task: string): AiTaskRouteRow | null;
  upsert(task: string, modelId: string, updatedAt: string): void;
  delete(task: string): void;
}
export interface AiUsageRepo {
  insert(e: Omit<AiUsageEventRow, 'id'>): number;
  listEvents(filters: { from?: string; to?: string; task?: string; limit: number; offset: number }): AiUsageEventRow[];
  summary(filters: { from?: string; to?: string }): {
    totalCostUsd: number; totalInput: number; totalOutput: number; callCount: number; unpricedCount: number;
    byTask: { task: string; costUsd: number; inputTokens: number; outputTokens: number; calls: number }[];
    byModel: { model: string; costUsd: number; inputTokens: number; outputTokens: number; calls: number }[];
    byDay: { day: string; costUsd: number }[];
  };
}
```

- [ ] **Step 1: Append the block above to `types.ts`.**
- [ ] **Step 2: Typecheck**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && packages/core/node_modules/.bin/tsc --build` (from repo root, or `packages/core`)
Expected: clean (types only; no consumers yet).

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/repositories/types.ts
git commit -m "feat(core): AI repo interfaces + row types"
```

---

### Task 4: `aiProviderRepo` + `aiModelRepo`

**Files:**
- Create: `packages/core/src/repositories/aiProviderRepo.ts`, `packages/core/src/repositories/aiModelRepo.ts`
- Test: `packages/core/test/unit/aiProviderModelRepo.test.ts`

**Interfaces:**
- Consumes: `AiProviderRepo`, `AiModelRepo` from types.ts; `aiProviders`, `aiModels` from schema.
- Produces: `makeAiProviderRepo(db: Db): AiProviderRepo`, `makeAiModelRepo(db: Db): AiModelRepo`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/test/unit/aiProviderModelRepo.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { runMigrations } from '../../src/db/migrate';
import { makeAiProviderRepo } from '../../src/repositories/aiProviderRepo';
import { makeAiModelRepo } from '../../src/repositories/aiModelRepo';

function setup() {
  const { db, sqlite } = runMigrations(':memory:');
  return { providers: makeAiProviderRepo(db), models: makeAiModelRepo(db), sqlite };
}

describe('aiProviderRepo + aiModelRepo', () => {
  it('creates, gets, lists, updates, deletes a provider', () => {
    const { providers } = setup();
    providers.create({ id: 'gemini', dialect: 'gemini', label: 'Gemini', secretEnc: 'enc', configJson: null });
    expect(providers.get('gemini')?.label).toBe('Gemini');
    providers.update('gemini', { label: 'Gemini 2' });
    expect(providers.get('gemini')?.label).toBe('Gemini 2');
    expect(providers.list()).toHaveLength(1);
    providers.delete('gemini');
    expect(providers.get('gemini')).toBeNull();
  });

  it('models: create/list-by-provider + countRoutes/countModels guards', () => {
    const { providers, models } = setup();
    providers.create({ id: 'gemini', dialect: 'gemini', label: 'G', secretEnc: 'e', configJson: null });
    models.create({ id: 'flash', providerId: 'gemini', modelString: 'gemini-2.5-flash', label: 'Flash', inputPerM: 0.3, outputPerM: 2.5 });
    expect(models.list({ providerId: 'gemini' })).toHaveLength(1);
    expect(providers.countModels('gemini')).toBe(1);
    expect(models.countRoutes('flash')).toBe(0);
    models.update('flash', { inputPerM: 0.4 });
    expect(models.get('flash')?.inputPerM).toBe(0.4);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`cannot find aiProviderRepo`).

Run: `packages/core/node_modules/.bin/vitest run test/unit/aiProviderModelRepo.test.ts`

- [ ] **Step 3: Implement `aiProviderRepo.ts`**

```ts
// packages/core/src/repositories/aiProviderRepo.ts
import { eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { aiModels, aiProviders } from '../db/schema';
import type { AiProviderRepo, AiProviderRow, AiDialect } from './types';

export function makeAiProviderRepo(db: Db): AiProviderRepo {
  const rows = () => db.select().from(aiProviders);
  return {
    list: () => rows().all() as AiProviderRow[],
    get: (id) => (rows().where(eq(aiProviders.id, id)).get() as AiProviderRow) ?? null,
    create: (p) => { db.insert(aiProviders).values({
      id: p.id, dialect: p.dialect, label: p.label, secretEnc: p.secretEnc, configJson: p.configJson,
    }).run(); },
    update: (id, patch) => { db.update(aiProviders).set(patch).where(eq(aiProviders.id, id)).run(); },
    delete: (id) => { db.delete(aiProviders).where(eq(aiProviders.id, id)).run(); },
    countModels: (providerId) =>
      (db.select({ n: sql<number>`count(*)` }).from(aiModels).where(eq(aiModels.providerId, providerId)).get()?.n) ?? 0,
  };
}
```

- [ ] **Step 4: Implement `aiModelRepo.ts`**

```ts
// packages/core/src/repositories/aiModelRepo.ts
import { eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { aiModels, aiTaskRoutes } from '../db/schema';
import type { AiModelRepo, AiModelRow } from './types';

export function makeAiModelRepo(db: Db): AiModelRepo {
  return {
    list: (filters) => {
      const q = db.select().from(aiModels);
      const rows = (filters?.providerId
        ? q.where(eq(aiModels.providerId, filters.providerId))
        : q).all();
      return rows as AiModelRow[];
    },
    get: (id) => (db.select().from(aiModels).where(eq(aiModels.id, id)).get() as AiModelRow) ?? null,
    create: (m) => { db.insert(aiModels).values(m).run(); },
    update: (id, patch) => { db.update(aiModels).set(patch).where(eq(aiModels.id, id)).run(); },
    delete: (id) => { db.delete(aiModels).where(eq(aiModels.id, id)).run(); },
    countRoutes: (modelId) =>
      (db.select({ n: sql<number>`count(*)` }).from(aiTaskRoutes).where(eq(aiTaskRoutes.modelId, modelId)).get()?.n) ?? 0,
  };
}
```

- [ ] **Step 5: Run — expect PASS.**
- [ ] **Step 6: Commit**

```bash
git add packages/core/src/repositories/aiProviderRepo.ts packages/core/src/repositories/aiModelRepo.ts packages/core/test/unit/aiProviderModelRepo.test.ts
git commit -m "feat(core): aiProviderRepo + aiModelRepo"
```

---

### Task 5: `aiTaskRouteRepo` + `aiUsageRepo`

**Files:**
- Create: `packages/core/src/repositories/aiTaskRouteRepo.ts`, `packages/core/src/repositories/aiUsageRepo.ts`
- Test: `packages/core/test/unit/aiRouteUsageRepo.test.ts`

**Interfaces:**
- Produces: `makeAiTaskRouteRepo(db): AiTaskRouteRepo`, `makeAiUsageRepo(db): AiUsageRepo`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/test/unit/aiRouteUsageRepo.test.ts
import { describe, it, expect } from 'vitest';
import { runMigrations } from '../../src/db/migrate';
import { makeAiProviderRepo } from '../../src/repositories/aiProviderRepo';
import { makeAiModelRepo } from '../../src/repositories/aiModelRepo';
import { makeAiTaskRouteRepo } from '../../src/repositories/aiTaskRouteRepo';
import { makeAiUsageRepo } from '../../src/repositories/aiUsageRepo';

function seedModel(db: any) {
  makeAiProviderRepo(db).create({ id: 'gemini', dialect: 'gemini', label: 'G', secretEnc: 'e', configJson: null });
  makeAiModelRepo(db).create({ id: 'flash', providerId: 'gemini', modelString: 'gemini-2.5-flash', label: 'Flash', inputPerM: 0.3, outputPerM: 2.5 });
}

describe('aiTaskRouteRepo', () => {
  it('upserts a route (insert then replace) and reads by task', () => {
    const { db } = runMigrations(':memory:');
    seedModel(db);
    const routes = makeAiTaskRouteRepo(db);
    routes.upsert('categorization', 'flash', '2026-07-07T00:00:00Z');
    expect(routes.getByTask('categorization')?.modelId).toBe('flash');
    routes.upsert('categorization', 'flash', '2026-07-08T00:00:00Z');
    expect(routes.list()).toHaveLength(1); // still one row
    routes.delete('categorization');
    expect(routes.getByTask('categorization')).toBeNull();
  });
});

describe('aiUsageRepo', () => {
  it('inserts events and aggregates summary by task/model/day + unpriced count', () => {
    const { db } = runMigrations(':memory:');
    const usage = makeAiUsageRepo(db);
    usage.insert({ ts: '2026-07-01T10:00:00Z', task: 'categorization', providerId: 'gemini', dialect: 'gemini', model: 'gemini-2.5-flash', inputTokens: 1000, outputTokens: 500, callCount: 2, costUsd: 0.01, ok: 1 });
    usage.insert({ ts: '2026-07-01T12:00:00Z', task: 'categorization', providerId: 'gemini', dialect: 'gemini', model: 'gemini-2.5-flash', inputTokens: 2000, outputTokens: 0, callCount: 1, costUsd: null, ok: 1 });
    const s = usage.summary({});
    expect(s.callCount).toBe(2);
    expect(s.totalInput).toBe(3000);
    expect(s.totalCostUsd).toBeCloseTo(0.01);
    expect(s.unpricedCount).toBe(1);
    expect(s.byTask[0].task).toBe('categorization');
    expect(s.byDay[0].day).toBe('2026-07-01');
    expect(usage.listEvents({ limit: 10, offset: 0 })).toHaveLength(2);
    expect(usage.listEvents({ task: 'nope', limit: 10, offset: 0 })).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement `aiTaskRouteRepo.ts`**

```ts
// packages/core/src/repositories/aiTaskRouteRepo.ts
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { aiTaskRoutes } from '../db/schema';
import type { AiTaskRouteRepo, AiTaskRouteRow } from './types';

export function makeAiTaskRouteRepo(db: Db): AiTaskRouteRepo {
  return {
    list: () => db.select().from(aiTaskRoutes).all() as AiTaskRouteRow[],
    getByTask: (task) => (db.select().from(aiTaskRoutes).where(eq(aiTaskRoutes.task, task)).get() as AiTaskRouteRow) ?? null,
    upsert: (task, modelId, updatedAt) => {
      db.insert(aiTaskRoutes).values({ task, modelId, updatedAt })
        .onConflictDoUpdate({ target: aiTaskRoutes.task, set: { modelId, updatedAt } }).run();
    },
    delete: (task) => { db.delete(aiTaskRoutes).where(eq(aiTaskRoutes.task, task)).run(); },
  };
}
```

- [ ] **Step 4: Implement `aiUsageRepo.ts`**

```ts
// packages/core/src/repositories/aiUsageRepo.ts
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { aiUsageEvents } from '../db/schema';
import type { AiUsageRepo, AiUsageEventRow } from './types';

export function makeAiUsageRepo(db: Db): AiUsageRepo {
  const rangeWhere = (from?: string, to?: string, task?: string) => {
    const conds = [];
    if (from) conds.push(gte(aiUsageEvents.ts, from));
    if (to) conds.push(lte(aiUsageEvents.ts, to));
    if (task) conds.push(eq(aiUsageEvents.task, task));
    return conds.length ? and(...conds) : undefined;
  };
  return {
    insert: (e) => {
      const r = db.insert(aiUsageEvents).values(e).run();
      return Number(r.lastInsertRowid);
    },
    listEvents: ({ from, to, task, limit, offset }) => {
      const w = rangeWhere(from, to, task);
      let q = db.select().from(aiUsageEvents).$dynamic();
      if (w) q = q.where(w);
      return q.orderBy(desc(aiUsageEvents.ts), desc(aiUsageEvents.id)).limit(limit).offset(offset).all() as AiUsageEventRow[];
    },
    summary: ({ from, to }) => {
      const w = rangeWhere(from, to);
      const base = () => { let q = db.select().from(aiUsageEvents).$dynamic(); if (w) q = q.where(w); return q; };
      const rows = base().all() as AiUsageEventRow[];
      const totalCostUsd = rows.reduce((a, r) => a + (r.costUsd ?? 0), 0);
      const totalInput = rows.reduce((a, r) => a + r.inputTokens, 0);
      const totalOutput = rows.reduce((a, r) => a + r.outputTokens, 0);
      const callCount = rows.length;
      const unpricedCount = rows.filter((r) => r.costUsd === null).length;
      const group = <K extends string>(key: (r: AiUsageEventRow) => string, label: K) => {
        const m = new Map<string, { costUsd: number; inputTokens: number; outputTokens: number; calls: number }>();
        for (const r of rows) {
          const k = key(r);
          const g = m.get(k) ?? { costUsd: 0, inputTokens: 0, outputTokens: 0, calls: 0 };
          g.costUsd += r.costUsd ?? 0; g.inputTokens += r.inputTokens; g.outputTokens += r.outputTokens; g.calls += 1;
          m.set(k, g);
        }
        return [...m.entries()].map(([k, v]) => ({ [label]: k, ...v })) as any[];
      };
      const byDay = [...rows.reduce((m, r) => {
        const d = r.ts.slice(0, 10);
        m.set(d, (m.get(d) ?? 0) + (r.costUsd ?? 0)); return m;
      }, new Map<string, number>()).entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([day, costUsd]) => ({ day, costUsd }));
      return {
        totalCostUsd, totalInput, totalOutput, callCount, unpricedCount,
        byTask: group((r) => r.task, 'task'),
        byModel: group((r) => r.model, 'model'),
        byDay,
      };
    },
  };
}
```

- [ ] **Step 5: Run — expect PASS.**
- [ ] **Step 6: Commit**

```bash
git add packages/core/src/repositories/aiTaskRouteRepo.ts packages/core/src/repositories/aiUsageRepo.ts packages/core/test/unit/aiRouteUsageRepo.test.ts
git commit -m "feat(core): aiTaskRouteRepo (upsert) + aiUsageRepo (insert + summary aggregation)"
```

---

### Task 6: Export new core surface

**Files:**
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces (re-exports): `encryptSecret`, `decryptSecret`; `makeAiProviderRepo`, `makeAiModelRepo`, `makeAiTaskRouteRepo`, `makeAiUsageRepo`; types `AiDialect`, `AiProviderRow`, `AiModelRow`, `AiTaskRouteRow`, `AiUsageEventRow`, `AiProviderRepo`, `AiModelRepo`, `AiTaskRouteRepo`, `AiUsageRepo`.

- [ ] **Step 1: Add exports**

```ts
// packages/core/src/index.ts  (add near other repo exports)
export { encryptSecret, decryptSecret } from './db/crypto';
export { makeAiProviderRepo } from './repositories/aiProviderRepo';
export { makeAiModelRepo } from './repositories/aiModelRepo';
export { makeAiTaskRouteRepo } from './repositories/aiTaskRouteRepo';
export { makeAiUsageRepo } from './repositories/aiUsageRepo';
export type {
  AiDialect, AiProviderRow, AiModelRow, AiTaskRouteRow, AiUsageEventRow,
  AiProviderRepo, AiModelRepo, AiTaskRouteRepo, AiUsageRepo,
} from './repositories/types';
```

- [ ] **Step 2: Typecheck + full core suite (Groww gate)**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && packages/core/node_modules/.bin/tsc --build && packages/core/node_modules/.bin/vitest run`
Expected: all core tests green, **Groww golden-master 6/6 unchanged**.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/index.ts
git commit -m "feat(core): export AI repos + crypto + types"
```

---

## Phase 2 — Agents: registry, pricing, factory, Bedrock, gateway

### Task 7: Task registry

**Files:**
- Create: `packages/agents/src/tasks.ts`
- Test: `packages/agents/test/tasks.test.ts`

**Interfaces:**
- Produces: `AI_TASKS` (record), `type AiTaskId`, `isAiTask(x: string): x is AiTaskId`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/agents/test/tasks.test.ts
import { describe, it, expect } from 'vitest';
import { AI_TASKS, isAiTask } from '../src/tasks';

describe('AI_TASKS registry', () => {
  it('includes categorization with label + description', () => {
    expect(AI_TASKS.categorization.label).toMatch(/categoriz/i);
    expect(AI_TASKS.categorization.description).toBeTruthy();
  });
  it('isAiTask guards unknown tasks', () => {
    expect(isAiTask('categorization')).toBe(true);
    expect(isAiTask('taxation')).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

Run: `packages/agents/node_modules/.bin/vitest run test/tasks.test.ts`

- [ ] **Step 3: Implement**

```ts
// packages/agents/src/tasks.ts
export const AI_TASKS = {
  categorization: {
    label: 'Expense Categorization',
    description: 'Suggest categories for uncategorized transactions',
    // First-run convenience ONLY: pre-selects this dialect in the setup form when the
    // task has no ai_task_routes row yet. NOT a binding — the actual task→provider→model
    // routing lives entirely in the ai_task_routes DB table and is fully user-editable
    // from Settings. Changing this never re-routes an already-configured task.
    defaultDialect: 'gemini',
  },
} as const;

export type AiTaskId = keyof typeof AI_TASKS;

export function isAiTask(x: string): x is AiTaskId {
  return Object.prototype.hasOwnProperty.call(AI_TASKS, x);
}
```

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit**

```bash
git add packages/agents/src/tasks.ts packages/agents/test/tasks.test.ts
git commit -m "feat(agents): AI task registry + isAiTask guard"
```

---

### Task 8: Pricing table + cost function

**Files:**
- Create: `packages/agents/src/pricing.ts`
- Test: `packages/agents/test/pricing.test.ts`

**Interfaces:**
- Produces: `costUsd(inTok, outTok, inputPerM, outputPerM): number`; `pricingHint(modelString): { inputPerM: number; outputPerM: number } | null`; `PRICING_HINTS`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/agents/test/pricing.test.ts
import { describe, it, expect } from 'vitest';
import { costUsd, pricingHint } from '../src/pricing';

describe('pricing', () => {
  it('computes cost from per-million rates', () => {
    // 1M input @ $0.30 + 0.5M output @ $2.50 = 0.30 + 1.25 = 1.55
    expect(costUsd(1_000_000, 500_000, 0.3, 2.5)).toBeCloseTo(1.55);
  });
  it('hint hit + miss', () => {
    expect(pricingHint('gemini-2.5-flash')).toEqual({ inputPerM: 0.3, outputPerM: 2.5 });
    expect(pricingHint('unknown-model-xyz')).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement**

```ts
// packages/agents/src/pricing.ts
// USD per 1M tokens. CONVENIENCE PREFILL ONLY — the source of truth for cost is
// the user-entered price on each ai_models row. Keyed by literal model_string.
// Update by editing this table; because cost is frozen at write time, edits only
// affect prefill suggestions, never recorded history.
export const PRICING_HINTS: Record<string, { inputPerM: number; outputPerM: number; source: string; asOf: string }> = {
  'gemini-2.5-flash': { inputPerM: 0.3, outputPerM: 2.5, source: 'ai.google.dev/pricing', asOf: '2026-07' },
  'gemini-2.5-pro': { inputPerM: 1.25, outputPerM: 10.0, source: 'ai.google.dev/pricing', asOf: '2026-07' },
};

export function pricingHint(modelString: string): { inputPerM: number; outputPerM: number } | null {
  const h = PRICING_HINTS[modelString];
  return h ? { inputPerM: h.inputPerM, outputPerM: h.outputPerM } : null;
}

export function costUsd(inTok: number, outTok: number, inputPerM: number, outputPerM: number): number {
  return (inTok / 1_000_000) * inputPerM + (outTok / 1_000_000) * outputPerM;
}
```

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit**

```bash
git add packages/agents/src/pricing.ts packages/agents/test/pricing.test.ts
git commit -m "feat(agents): pricing hints table + costUsd"
```

---

### Task 9: Add Bedrock SDK deps + Bedrock adapter

**Files:**
- Modify: `packages/agents/package.json`
- Create: `packages/agents/src/llm/bedrock.ts`
- Test: `packages/agents/test/bedrock.test.ts`

**Interfaces:**
- Consumes: `LlmProvider`, `LlmError`, `LlmUsage` from `./llm/types`.
- Produces: `makeBedrockProvider(cfg: { model: string; region: string; profile?: string }, deps?: { client?: BedrockLike }): LlmProvider`, plus an exported minimal `BedrockLike` interface for injection.

- [ ] **Step 1: Add deps**

Run (from `packages/agents`):
```bash
source ~/.nvm/nvm.sh && nvm use 20 && corepack prepare pnpm@10.4.1 --activate && corepack pnpm@10.4.1 add @anthropic-ai/bedrock-sdk @aws-sdk/credential-providers
```
Expected: both appear under `dependencies` in `packages/agents/package.json`.

- [ ] **Step 2: Write the failing test** (fully offline via injected fake client)

```ts
// packages/agents/test/bedrock.test.ts
import { describe, it, expect } from 'vitest';
import { makeBedrockProvider } from '../src/llm/bedrock';
import { LlmError } from '../src/llm/types';

// Fake matching the subset of AnthropicBedrock.messages.create we use.
function fakeClient(response: any) {
  return { messages: { create: async () => response } };
}

const SCHEMA = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] };

describe('makeBedrockProvider', () => {
  it('forces tool-use and returns the tool input as JSON text + usage', async () => {
    let captured: any;
    const client = { messages: { create: async (args: any) => { captured = args; return {
      content: [{ type: 'tool_use', name: 'emit', input: { ok: true } }],
      usage: { input_tokens: 12, output_tokens: 3 },
    }; } } };
    const p = makeBedrockProvider({ model: 'us.anthropic.claude-haiku', region: 'us-east-1' }, { client });
    const out = await p.complete({ prompt: 'hi', jsonSchema: SCHEMA });
    expect(JSON.parse(out.text)).toEqual({ ok: true });
    expect(out.usage).toEqual({ inputTokens: 12, outputTokens: 3 });
    // tool_choice forces the single tool whose input_schema is our schema
    expect(captured.tool_choice.type).toBe('tool');
    expect(captured.tools[0].input_schema).toEqual(SCHEMA);
  });

  it('maps throttling to rate_limit and access-denied to auth', async () => {
    const throttle = makeBedrockProvider({ model: 'm', region: 'r' }, {
      client: { messages: { create: async () => { throw Object.assign(new Error('Rate exceeded'), { name: 'ThrottlingException' }); } } },
    });
    await expect(throttle.complete({ prompt: 'x', jsonSchema: SCHEMA }))
      .rejects.toMatchObject({ kind: 'rate_limit' });

    const denied = makeBedrockProvider({ model: 'm', region: 'r' }, {
      client: { messages: { create: async () => { throw Object.assign(new Error('expired token'), { name: 'AccessDeniedException' }); } } },
    });
    await expect(denied.complete({ prompt: 'x', jsonSchema: SCHEMA }))
      .rejects.toMatchObject({ kind: 'auth' });
  });
});
```

- [ ] **Step 3: Run — expect FAIL.**

Run: `packages/agents/node_modules/.bin/vitest run test/bedrock.test.ts`

- [ ] **Step 4: Implement `bedrock.ts`**

```ts
// packages/agents/src/llm/bedrock.ts
import { LlmError, type LlmProvider } from './types';

const TOOL_NAME = 'emit_structured_output';

/** Minimal shape of AnthropicBedrock we depend on — injectable for offline tests. */
export interface BedrockLike {
  messages: { create(args: unknown): Promise<any> };
}

export function makeBedrockProvider(
  cfg: { model: string; region: string; profile?: string },
  deps: { client?: BedrockLike } = {},
): LlmProvider {
  return {
    async complete({ prompt, jsonSchema }) {
      let client = deps.client;
      if (!client) {
        // Lazy import so tests (which inject a client) never load the AWS SDK.
        const { AnthropicBedrock } = await import('@anthropic-ai/bedrock-sdk');
        const { fromSSO } = await import('@aws-sdk/credential-providers');
        client = new AnthropicBedrock({
          awsRegion: cfg.region,
          // fromSSO reads the cached SSO token from `aws sso login --profile <profile>`.
          awsSessionToken: undefined,
          // The SDK accepts an AWS credential provider via awsCredentials-style env chain;
          // fromSSO({profile}) resolves temp creds at call time.
          // @ts-expect-error runtime credential provider hook
          credentials: fromSSO(cfg.profile ? { profile: cfg.profile } : {}),
        }) as unknown as BedrockLike;
      }

      let res: any;
      try {
        res = await client.messages.create({
          model: cfg.model,
          max_tokens: 4096,
          tools: [{
            name: TOOL_NAME,
            description: 'Return the answer as structured JSON matching the schema.',
            input_schema: jsonSchema,
          }],
          tool_choice: { type: 'tool', name: TOOL_NAME },
          messages: [{ role: 'user', content: prompt }],
        });
      } catch (e) {
        const name = (e as any)?.name ?? '';
        const msg = (e as Error)?.message ?? String(e);
        if (/Throttl|TooManyRequests|Rate/i.test(name)) throw new LlmError('rate_limit', `Bedrock throttled: ${msg}`);
        if (/AccessDenied|Unrecognized|ExpiredToken|Unauthor/i.test(name) || /expired|denied/i.test(msg)) {
          throw new LlmError('auth', `Bedrock auth failed (${msg}). Re-run: aws sso login --profile ${cfg.profile ?? 'dev'}.`);
        }
        throw new LlmError('network', `Bedrock request failed: ${msg}`);
      }

      const toolBlock = (res.content ?? []).find((b: any) => b.type === 'tool_use' && b.name === TOOL_NAME);
      const text = toolBlock ? JSON.stringify(toolBlock.input) : '';
      const usage = res.usage
        ? { inputTokens: res.usage.input_tokens ?? 0, outputTokens: res.usage.output_tokens ?? 0 }
        : undefined;
      return { text, usage };
    },
  };
}
```

- [ ] **Step 5: Run — expect PASS** (both tests, no AWS network).
- [ ] **Step 6: Commit**

```bash
git add packages/agents/package.json packages/agents/src/llm/bedrock.ts packages/agents/test/bedrock.test.ts ../../pnpm-lock.yaml
git commit -m "feat(agents): working Bedrock adapter (fromSSO + forced tool-use JSON, injectable client)"
```

---

### Task 10: Provider factory

**Files:**
- Create: `packages/agents/src/llm/factory.ts`
- Test: `packages/agents/test/factory.test.ts`

**Interfaces:**
- Consumes: `makeGeminiProvider`, `makeBedrockProvider`, `LlmProvider`, `LlmError`.
- Produces: `buildProvider(input: { dialect: 'gemini'|'openai-compatible'|'bedrock'; model: string; apiKey?: string; config?: { baseURL?: string; region?: string; profile?: string } }): LlmProvider`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/agents/test/factory.test.ts
import { describe, it, expect } from 'vitest';
import { buildProvider } from '../src/llm/factory';
import { LlmError } from '../src/llm/types';

describe('buildProvider', () => {
  it('builds gemini with a key', () => {
    const p = buildProvider({ dialect: 'gemini', model: 'gemini-2.5-flash', apiKey: 'k' });
    expect(typeof p.complete).toBe('function');
  });
  it('builds bedrock with region/profile and NO secret', () => {
    const p = buildProvider({ dialect: 'bedrock', model: 'us.anthropic.claude-haiku', config: { region: 'us-east-1', profile: 'dev' } });
    expect(typeof p.complete).toBe('function');
  });
  it('openai-compatible still not implemented → provider_not_configured on use', async () => {
    const p = buildProvider({ dialect: 'openai-compatible', model: 'x', apiKey: 'k' });
    await expect(p.complete({ prompt: 'x', jsonSchema: {} })).rejects.toBeInstanceOf(LlmError);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement**

```ts
// packages/agents/src/llm/factory.ts
import { LlmError, type LlmProvider } from './types';
import { makeGeminiProvider } from './gemini';
import { makeBedrockProvider } from './bedrock';
import { makeOpenAiCompatProvider } from './openaiCompat';

export function buildProvider(input: {
  dialect: 'gemini' | 'openai-compatible' | 'bedrock';
  model: string;
  apiKey?: string;
  config?: { baseURL?: string; region?: string; profile?: string };
}): LlmProvider {
  switch (input.dialect) {
    case 'gemini':
      return makeGeminiProvider({ dialect: 'gemini', model: input.model, apiKey: input.apiKey ?? '', baseURL: input.config?.baseURL });
    case 'bedrock':
      return makeBedrockProvider({ model: input.model, region: input.config?.region ?? 'us-east-1', profile: input.config?.profile });
    case 'openai-compatible':
      return makeOpenAiCompatProvider({ dialect: 'openai-compatible', model: input.model, apiKey: input.apiKey ?? '', baseURL: input.config?.baseURL });
    default:
      throw new LlmError('provider_not_configured', `Unknown dialect: ${(input as any).dialect}`);
  }
}
```

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit**

```bash
git add packages/agents/src/llm/factory.ts packages/agents/test/factory.test.ts
git commit -m "feat(agents): buildProvider factory (gemini/bedrock/openai-compat)"
```

---

### Task 11: `categorizeWithAI` accepts an injected `complete` fn

**Files:**
- Modify: `packages/agents/src/categorize/aiCategorize.ts`
- Test: `packages/agents/test/aiCategorize.test.ts` (existing — update)

**Interfaces:**
- Produces: `CompleteFn = (input: { prompt: string; jsonSchema: object }) => Promise<{ text: string; usage?: LlmUsage }>`. `CategorizeDeps` gains `complete: CompleteFn` and drops `provider`. Behavior/output unchanged.

- [ ] **Step 1: Update the existing test to inject `complete` instead of `provider`**

Change the fake in `aiCategorize.test.ts` from `{ provider: { complete: … } }` to `{ complete: … }`. Add an assertion that a two-chunk run calls `complete` twice and sums usage. Example fake:

```ts
const calls: string[] = [];
const complete = async ({ prompt }: { prompt: string; jsonSchema: object }) => {
  calls.push(prompt);
  return { text: JSON.stringify([{ transactionId: 1, categoryId: 'food_dining', keyword: '' }]), usage: { inputTokens: 10, outputTokens: 5 } };
};
const res = await categorizeWithAI(txns, { complete, categories });
```

- [ ] **Step 2: Run — expect FAIL** (`provider` no longer the param / type error).

Run: `packages/agents/node_modules/.bin/vitest run test/aiCategorize.test.ts`

- [ ] **Step 3: Modify `aiCategorize.ts`**

Replace the `provider: LlmProvider` field in `CategorizeDeps` with `complete: CompleteFn`, and change the call site:

```ts
// top of file
import { LlmError, type LlmUsage } from '../llm/types';
export type CompleteFn = (input: { prompt: string; jsonSchema: object }) => Promise<{ text: string; usage?: LlmUsage }>;

export type CategorizeDeps = {
  complete: CompleteFn;               // was: provider: LlmProvider
  categories: CategoryForPrompt[];
  chunkSize?: number;
  logger?: CategorizeLogger;
};
```
And in the loop replace `await deps.provider.complete({ prompt, jsonSchema: … })` with `await deps.complete({ prompt, jsonSchema: GEMINI_RESPONSE_SCHEMA })`. Everything else (retry, skip, usage summation, validation) is unchanged.

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit**

```bash
git add packages/agents/src/categorize/aiCategorize.ts packages/agents/test/aiCategorize.test.ts
git commit -m "refactor(agents): categorizeWithAI takes injected complete fn (usage flows to gateway)"
```

---

### Task 12: The `LlmGateway`

**Files:**
- Create: `packages/agents/src/gateway.ts`
- Test: `packages/agents/test/gateway.test.ts`

**Interfaces:**
- Consumes: repo interfaces `AiProviderRepo`, `AiModelRepo`, `AiTaskRouteRepo`, `AiUsageRepo`, `AiProviderRow`, `AiModelRow` (imported as types from `@myfinance/core`); `buildProvider`; `costUsd`; `isAiTask`; `LlmError`, `LlmUsage`.
- Produces:
```ts
type GatewayDeps = {
  providerRepo: AiProviderRepo; modelRepo: AiModelRepo;
  routeRepo: AiTaskRouteRepo; usageRepo: AiUsageRepo;
  decrypt: (blob: string) => string;
  now?: () => string;   // default new Date().toISOString()
};
type CompleteFn = (input: { prompt: string; jsonSchema: object }) => Promise<{ text: string; usage?: LlmUsage }>;
makeLlmGateway(deps: GatewayDeps): { runTask<T>(task: string, fn: (complete: CompleteFn) => Promise<T>): Promise<T> };
```

- [ ] **Step 1: Write the failing test**

```ts
// packages/agents/test/gateway.test.ts
import { describe, it, expect } from 'vitest';
import { makeLlmGateway } from '../src/gateway';
import { LlmError } from '../src/llm/types';

function fakeRepos(overrides: any = {}) {
  const inserted: any[] = [];
  return {
    inserted,
    deps: {
      routeRepo: { getByTask: (t: string) => (t === 'categorization' ? { task: t, modelId: 'flash', updatedAt: '' } : null), list: () => [], upsert() {}, delete() {} },
      modelRepo: { get: (id: string) => (id === 'flash' ? { id, providerId: 'gemini', modelString: 'gemini-2.5-flash', label: 'F', inputPerM: 0.3, outputPerM: 2.5, createdAt: '' } : null), list: () => [], create() {}, update() {}, delete() {}, countRoutes: () => 0 },
      providerRepo: { get: (id: string) => (id === 'gemini' ? { id, dialect: 'gemini', label: 'G', secretEnc: 'ENC', configJson: null, createdAt: '' } : null), list: () => [], create() {}, update() {}, delete() {}, countModels: () => 0 },
      usageRepo: { insert: (e: any) => { inserted.push(e); return inserted.length; }, listEvents: () => [], summary: () => ({} as any) },
      decrypt: (_blob: string) => 'decrypted-key',
      now: () => '2026-07-07T00:00:00Z',
      ...overrides,
    },
  };
}

describe('LlmGateway.runTask', () => {
  it('resolves route→model→provider, runs fn, writes ONE aggregated usage row', async () => {
    const { deps, inserted } = fakeRepos();
    const gw = makeLlmGateway(deps as any);
    const result = await gw.runTask('categorization', async (complete) => {
      // simulate two internal calls (fn does NOT actually hit network — buildProvider
      // returns a gemini provider, but we override by asserting only usage aggregation)
      return 'done';
    });
    expect(result).toBe('done');
    // no complete() calls → still records a zero-usage ok row
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ task: 'categorization', model: 'gemini-2.5-flash', providerId: 'gemini', ok: 1, callCount: 0, inputTokens: 0, outputTokens: 0 });
  });

  it('aggregates usage + computes frozen cost across calls', async () => {
    const { deps, inserted } = fakeRepos();
    // stub provider by making complete resolve without network: we monkeypatch via a fake
    // provider through decrypt path is complex; instead assert the accumulator using a
    // gateway-level injected completeFactory is out of scope — we validate cost math by
    // having fn call the provided complete twice against a fake provider.
    const gw = makeLlmGateway({ ...deps, buildProviderOverride: () => ({ complete: async () => ({ text: '[]', usage: { inputTokens: 1000, outputTokens: 500 } }) }) } as any);
    await gw.runTask('categorization', async (complete) => {
      await complete({ prompt: 'a', jsonSchema: {} });
      await complete({ prompt: 'b', jsonSchema: {} });
      return null;
    });
    const row = inserted[0];
    expect(row.callCount).toBe(2);
    expect(row.inputTokens).toBe(2000);
    expect(row.outputTokens).toBe(1000);
    // cost = 2000/1e6*0.3 + 1000/1e6*2.5 = 0.0006 + 0.0025 = 0.0031
    expect(row.costUsd).toBeCloseTo(0.0031);
  });

  it('throws provider_not_configured when the task has no route (no usage row)', async () => {
    const { deps, inserted } = fakeRepos({ routeRepo: { getByTask: () => null, list: () => [], upsert() {}, delete() {} } });
    const gw = makeLlmGateway(deps as any);
    await expect(gw.runTask('categorization', async () => 'x')).rejects.toBeInstanceOf(LlmError);
    expect(inserted).toHaveLength(0);
  });

  it('records ok=0 and re-throws when fn throws after usage accrued', async () => {
    const { deps, inserted } = fakeRepos();
    const gw = makeLlmGateway({ ...deps, buildProviderOverride: () => ({ complete: async () => ({ text: '[]', usage: { inputTokens: 100, outputTokens: 0 } }) }) } as any);
    await expect(gw.runTask('categorization', async (complete) => {
      await complete({ prompt: 'a', jsonSchema: {} });
      throw new Error('boom');
    })).rejects.toThrow('boom');
    expect(inserted[0]).toMatchObject({ ok: 0, inputTokens: 100, callCount: 1 });
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement `gateway.ts`**

```ts
// packages/agents/src/gateway.ts
import type {
  AiProviderRepo, AiModelRepo, AiTaskRouteRepo, AiUsageRepo,
} from '@myfinance/core';
import { LlmError, type LlmProvider, type LlmUsage } from './llm/types';
import { buildProvider } from './llm/factory';
import { costUsd } from './pricing';

export type CompleteFn = (input: { prompt: string; jsonSchema: object }) => Promise<{ text: string; usage?: LlmUsage }>;

export type GatewayDeps = {
  providerRepo: AiProviderRepo;
  modelRepo: AiModelRepo;
  routeRepo: AiTaskRouteRepo;
  usageRepo: AiUsageRepo;
  decrypt: (blob: string) => string;
  now?: () => string;
  // Test seam only: override the concrete provider builder to avoid real network/SDK.
  buildProviderOverride?: (args: unknown) => LlmProvider;
};

export function makeLlmGateway(deps: GatewayDeps) {
  const now = deps.now ?? (() => new Date().toISOString());
  return {
    async runTask<T>(task: string, fn: (complete: CompleteFn) => Promise<T>): Promise<T> {
      const route = deps.routeRepo.getByTask(task);
      if (!route) throw new LlmError('provider_not_configured', `Task "${task}" has no model assigned. Configure it in AI Settings.`);
      const model = deps.modelRepo.get(route.modelId);
      if (!model) throw new LlmError('provider_not_configured', `Model "${route.modelId}" for task "${task}" no longer exists.`);
      const provider = deps.providerRepo.get(model.providerId);
      if (!provider) throw new LlmError('provider_not_configured', `Provider "${model.providerId}" no longer exists.`);

      const config = provider.configJson ? JSON.parse(provider.configJson) : {};
      const apiKey = provider.secretEnc ? deps.decrypt(provider.secretEnc) : undefined;
      const built: LlmProvider = deps.buildProviderOverride
        ? deps.buildProviderOverride({ dialect: provider.dialect, model: model.modelString, apiKey, config })
        : buildProvider({ dialect: provider.dialect, model: model.modelString, apiKey, config });

      let inputTokens = 0, outputTokens = 0, callCount = 0;
      const complete: CompleteFn = async (input) => {
        callCount += 1;
        const out = await built.complete(input);
        if (out.usage) { inputTokens += out.usage.inputTokens; outputTokens += out.usage.outputTokens; }
        return out;
      };

      const record = (ok: 0 | 1) => {
        deps.usageRepo.insert({
          ts: now(), task, providerId: provider.id, dialect: provider.dialect, model: model.modelString,
          inputTokens, outputTokens, callCount,
          costUsd: costUsd(inputTokens, outputTokens, model.inputPerM, model.outputPerM),
          ok,
        });
      };

      try {
        const result = await fn(complete);
        record(1);
        return result;
      } catch (e) {
        record(0);
        throw e;
      }
    },
  };
}
```

- [ ] **Step 4: Run — expect PASS** (4 gateway tests).
- [ ] **Step 5: Commit**

```bash
git add packages/agents/src/gateway.ts packages/agents/test/gateway.test.ts
git commit -m "feat(agents): LlmGateway.runTask — resolve route, aggregate usage, one costed row"
```

---

### Task 13: Export agents surface

**Files:**
- Modify: `packages/agents/src/index.ts`

**Interfaces:**
- Produces (re-exports): `makeLlmGateway`, `type GatewayDeps`, `type CompleteFn`, `AI_TASKS`, `isAiTask`, `type AiTaskId`, `buildProvider`, `makeBedrockProvider`, `costUsd`, `pricingHint`, `PRICING_HINTS`.

- [ ] **Step 1: Add exports**

```ts
// packages/agents/src/index.ts (append)
export { makeLlmGateway, type GatewayDeps, type CompleteFn } from './gateway';
export { AI_TASKS, isAiTask, type AiTaskId } from './tasks';
export { buildProvider } from './llm/factory';
export { makeBedrockProvider, type BedrockLike } from './llm/bedrock';
export { costUsd, pricingHint, PRICING_HINTS } from './pricing';
```

- [ ] **Step 2: Typecheck core+agents**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && packages/core/node_modules/.bin/tsc --build && packages/agents/node_modules/.bin/tsc --build && packages/agents/node_modules/.bin/vitest run`
Expected: clean; all agents tests green.

- [ ] **Step 3: Commit**

```bash
git add packages/agents/src/index.ts
git commit -m "feat(agents): export gateway, tasks, factory, bedrock, pricing"
```

---

## Phase 3 — API: repos wiring, gateway plugin, routes

### Task 14: Wire new repos + gateway into the server

**Files:**
- Modify: `packages/api/src/plugins/db.ts` (add repos)
- Create: `packages/api/src/plugins/gateway.ts`
- Modify: `packages/api/src/server.ts`
- Modify: `packages/api/src/config.ts`
- Test: `packages/api/test/gatewayPlugin.test.ts`

**Interfaces:**
- Produces: `app.repos` gains `aiProviderRepo, aiModelRepo, aiTaskRouteRepo, aiUsageRepo`. `makeGateway(repos): ReturnType<typeof makeLlmGateway>` using `decryptSecret` from core. `buildServer` injects the gateway into routes (replaces `opts.llmProvider`); tests may pass `opts.gateway` to override.

- [ ] **Step 1: Write the failing test** (gateway constructed + reachable)

```ts
// packages/api/test/gatewayPlugin.test.ts
import { describe, it, expect } from 'vitest';
import { buildServer } from '../src/server';

describe('gateway wiring', () => {
  it('decorates repos with the 4 AI repos', async () => {
    const app = await buildServer({ dbPath: ':memory:' });
    expect(app.repos.aiProviderRepo).toBeTruthy();
    expect(app.repos.aiModelRepo).toBeTruthy();
    expect(app.repos.aiTaskRouteRepo).toBeTruthy();
    expect(app.repos.aiUsageRepo).toBeTruthy();
    await app.close();
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

Run: `packages/api/node_modules/.bin/vitest run test/gatewayPlugin.test.ts`

- [ ] **Step 3: Add repos in `plugins/db.ts`**

Import `makeAiProviderRepo, makeAiModelRepo, makeAiTaskRouteRepo, makeAiUsageRepo` from `@myfinance/core`; add to the `Repos` type and the `repos` object:
```ts
aiProviderRepo: makeAiProviderRepo(db),
aiModelRepo: makeAiModelRepo(db),
aiTaskRouteRepo: makeAiTaskRouteRepo(db),
aiUsageRepo: makeAiUsageRepo(db),
```

- [ ] **Step 4: Create `plugins/gateway.ts`**

```ts
// packages/api/src/plugins/gateway.ts
import { decryptSecret } from '@myfinance/core';
import { makeLlmGateway } from '@myfinance/agents';
import type { Repos } from './db';

export function makeGateway(repos: Repos) {
  return makeLlmGateway({
    providerRepo: repos.aiProviderRepo,
    modelRepo: repos.aiModelRepo,
    routeRepo: repos.aiTaskRouteRepo,
    usageRepo: repos.aiUsageRepo,
    decrypt: (blob) => decryptSecret(blob),
  });
}
export type Gateway = ReturnType<typeof makeGateway>;
```

- [ ] **Step 5: Modify `server.ts`**

Replace the `llmProvider` resolution (lines ~43–44 and the `opts.llmProvider` field) with:
```ts
import { makeGateway, type Gateway } from './plugins/gateway';
// in BuildServerOpts: gateway?: Gateway;
const gateway: Gateway = opts.gateway ?? makeGateway(app.repos);
await app.register(categoryRoutes, { gateway });
await app.register(aiSettingsRoutes, { }); // Task 15
await app.register(aiUsageRoutes, { });    // Task 16
```
(Register statements for Tasks 15/16 are added when those routes exist; for this task only the gateway construction + categoryRoutes change is required to compile. Keep `aiSettings`/`aiUsage` registration commented until Task 15/16.)

- [ ] **Step 6: Trim `config.ts`**

Remove the `llm.categorization` env resolution (it is superseded by DB routing). Leave a one-line comment: `// AI provider config now lives in the DB (ai_providers/ai_task_routes); env keys are inert.` Keep `dbPath`/`port`.

- [ ] **Step 7: Update `categories.ts` `/ai-suggest`** to use the gateway (this makes Step 1 build):

```ts
// routes/categories.ts — replace the ai-suggest handler body’s LLM call
// opts type: { gateway: Gateway }
// ...after building `candidates` + `categories`:
let result;
try {
  result = await opts.gateway.runTask('categorization', (complete) =>
    categorizeWithAI(
      candidates.map((t) => ({ id: t.id, description: t.description, amount: t.amount, direction: t.direction })),
      { complete, categories, logger: req.log },
    ),
  );
} catch (e) {
  req.log.error({ err: e }, 'ai-suggest: categorization failed hard');
  if (e instanceof LlmError && e.kind === 'auth') throw badGateway('AI provider auth failed.');
  if (e instanceof LlmError && e.kind === 'provider_not_configured') throw badRequest('No AI model is assigned to categorization. Configure it in AI Settings.');
  throw e;
}
```
Remove the old `if (!opts.llmProvider) …` guard and the `provider: opts.llmProvider` usage.

- [ ] **Step 8: Run the plugin test + existing categories/ai-suggest tests**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && packages/core/node_modules/.bin/tsc --build && packages/agents/node_modules/.bin/tsc --build && packages/api/node_modules/.bin/tsc --build && packages/api/node_modules/.bin/vitest run test/gatewayPlugin.test.ts`
Expected: PASS. (Existing ai-suggest tests are updated in Task 17.)

- [ ] **Step 9: Commit**

```bash
git add packages/api/src/plugins/db.ts packages/api/src/plugins/gateway.ts packages/api/src/server.ts packages/api/src/config.ts packages/api/src/routes/categories.ts packages/api/test/gatewayPlugin.test.ts
git commit -m "feat(api): wire AI repos + LlmGateway; categorization routes through gateway"
```

---

### Task 15: `/ai/providers`, `/ai/models`, `/ai/tasks` routes

**Files:**
- Create: `packages/api/src/routes/aiSettings.ts`
- Modify: `packages/api/src/server.ts` (register)
- Test: `packages/api/test/aiSettings.test.ts`

**Interfaces:**
- Consumes: `app.repos.*`, `AI_TASKS`, `isAiTask`, `pricingHint`, `encryptSecret`.
- Produces: routes per spec §9. Secret never in responses (`hasSecret` boolean).

- [ ] **Step 1: Write the failing test**

```ts
// packages/api/test/aiSettings.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { buildServer } from '../src/server';

const KEY = '0'.repeat(64);
beforeAll(() => { process.env.MYFINANCE_SECRET_KEY = KEY; });

async function app() { return buildServer({ dbPath: ':memory:' }); }

describe('AI settings routes', () => {
  it('creates a provider without echoing the secret', async () => {
    const a = await app();
    const res = await a.inject({ method: 'POST', url: '/ai/providers', payload: { id: 'gemini', dialect: 'gemini', label: 'Gemini', apiKey: 'sk-secret' } });
    expect(res.statusCode).toBe(201);
    const list = await a.inject({ method: 'GET', url: '/ai/providers' });
    const body = list.json().data;
    expect(body[0]).toMatchObject({ id: 'gemini', hasSecret: true });
    expect(JSON.stringify(body)).not.toContain('sk-secret');
    await a.close();
  });

  it('creates a model with prices, then routes a task to it', async () => {
    const a = await app();
    await a.inject({ method: 'POST', url: '/ai/providers', payload: { id: 'gemini', dialect: 'gemini', label: 'G', apiKey: 'k' } });
    const m = await a.inject({ method: 'POST', url: '/ai/models', payload: { id: 'flash', providerId: 'gemini', modelString: 'gemini-2.5-flash', label: 'Flash', inputPerM: 0.3, outputPerM: 2.5 } });
    expect(m.statusCode).toBe(201);
    const route = await a.inject({ method: 'PUT', url: '/ai/tasks/categorization/route', payload: { modelId: 'flash' } });
    expect(route.statusCode).toBe(200);
    const tasks = await a.inject({ method: 'GET', url: '/ai/tasks' });
    const cat = tasks.json().data.find((t: any) => t.task === 'categorization');
    expect(cat).toMatchObject({ configured: true, assignedModelId: 'flash', label: expect.any(String) });
    await a.close();
  });

  it('rejects routing an unknown task (400) and blocks deleting a referenced model/provider (409)', async () => {
    const a = await app();
    await a.inject({ method: 'POST', url: '/ai/providers', payload: { id: 'g', dialect: 'gemini', label: 'G', apiKey: 'k' } });
    await a.inject({ method: 'POST', url: '/ai/models', payload: { id: 'flash', providerId: 'g', modelString: 'x', label: 'F', inputPerM: 0, outputPerM: 0 } });
    await a.inject({ method: 'PUT', url: '/ai/tasks/categorization/route', payload: { modelId: 'flash' } });
    expect((await a.inject({ method: 'PUT', url: '/ai/tasks/taxation/route', payload: { modelId: 'flash' } })).statusCode).toBe(400);
    expect((await a.inject({ method: 'DELETE', url: '/ai/models/flash' })).statusCode).toBe(409);
    expect((await a.inject({ method: 'DELETE', url: '/ai/providers/g' })).statusCode).toBe(409);
    await a.close();
  });

  it('pricing-hints returns a known model prefill', async () => {
    const a = await app();
    const r = await a.inject({ method: 'GET', url: '/ai/pricing-hints?modelString=gemini-2.5-flash' });
    expect(r.json().data).toEqual({ inputPerM: 0.3, outputPerM: 2.5 });
    await a.close();
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement `aiSettings.ts`**

```ts
// packages/api/src/routes/aiSettings.ts
import type { FastifyInstance } from 'fastify';
import { AI_TASKS, isAiTask, pricingHint } from '@myfinance/agents';
import { encryptSecret } from '@myfinance/core';
import { badRequest, conflict, notFound } from '../errors'; // add `conflict` (409) if missing

export async function aiSettingsRoutes(app: FastifyInstance) {
  const r = () => app.repos;

  // Providers
  app.get('/ai/providers', async () =>
    ({ data: r().aiProviderRepo.list().map((p) => ({
      id: p.id, dialect: p.dialect, label: p.label, hasSecret: p.secretEnc != null,
      config: p.configJson ? JSON.parse(p.configJson) : null, createdAt: p.createdAt,
    })) }));

  app.post<{ Body: { id: string; dialect: string; label: string; apiKey?: string; config?: object } }>(
    '/ai/providers', async (req, reply) => {
      const { id, dialect, label, apiKey, config } = req.body ?? ({} as any);
      if (!id || !label || !['gemini', 'openai-compatible', 'bedrock'].includes(dialect)) throw badRequest('id, label and a valid dialect are required.');
      const secretEnc = dialect === 'bedrock' ? null : (apiKey ? encryptSecret(apiKey) : null);
      r().aiProviderRepo.create({ id, dialect: dialect as any, label, secretEnc, configJson: config ? JSON.stringify(config) : null });
      reply.code(201); return { data: { id } };
    });

  app.patch<{ Params: { id: string }; Body: { label?: string; apiKey?: string; config?: object } }>(
    '/ai/providers/:id', async (req) => {
      const p = r().aiProviderRepo.get(req.params.id); if (!p) throw notFound('Provider not found.');
      const patch: any = {};
      if (req.body?.label != null) patch.label = req.body.label;
      if (req.body?.config != null) patch.configJson = JSON.stringify(req.body.config);
      if (req.body?.apiKey != null) patch.secretEnc = req.body.apiKey ? encryptSecret(req.body.apiKey) : null;
      r().aiProviderRepo.update(req.params.id, patch);
      return { data: { ok: true } };
    });

  app.delete<{ Params: { id: string } }>('/ai/providers/:id', async (req) => {
    if (!r().aiProviderRepo.get(req.params.id)) throw notFound('Provider not found.');
    if (r().aiProviderRepo.countModels(req.params.id) > 0) throw conflict('Provider has models; delete them first.');
    r().aiProviderRepo.delete(req.params.id); return { data: { ok: true } };
  });

  // Models
  app.get<{ Querystring: { providerId?: string } }>('/ai/models', async (req) =>
    ({ data: r().aiModelRepo.list(req.query.providerId ? { providerId: req.query.providerId } : undefined) }));

  app.post<{ Body: { id: string; providerId: string; modelString: string; label: string; inputPerM: number; outputPerM: number } }>(
    '/ai/models', async (req, reply) => {
      const b = req.body ?? ({} as any);
      if (!b.id || !b.providerId || !b.modelString || !b.label) throw badRequest('id, providerId, modelString, label are required.');
      if (typeof b.inputPerM !== 'number' || typeof b.outputPerM !== 'number' || b.inputPerM < 0 || b.outputPerM < 0) throw badRequest('inputPerM and outputPerM must be numbers >= 0.');
      if (!r().aiProviderRepo.get(b.providerId)) throw badRequest('Unknown providerId.');
      r().aiModelRepo.create(b); reply.code(201); return { data: { id: b.id } };
    });

  app.patch<{ Params: { id: string }; Body: { label?: string; inputPerM?: number; outputPerM?: number } }>(
    '/ai/models/:id', async (req) => {
      if (!r().aiModelRepo.get(req.params.id)) throw notFound('Model not found.');
      r().aiModelRepo.update(req.params.id, req.body ?? {});
      return { data: { ok: true } };
    });

  app.delete<{ Params: { id: string } }>('/ai/models/:id', async (req) => {
    if (!r().aiModelRepo.get(req.params.id)) throw notFound('Model not found.');
    if (r().aiModelRepo.countRoutes(req.params.id) > 0) throw conflict('Model is assigned to a task; unassign it first.');
    r().aiModelRepo.delete(req.params.id); return { data: { ok: true } };
  });

  app.get<{ Querystring: { modelString?: string } }>('/ai/pricing-hints', async (req) =>
    ({ data: req.query.modelString ? pricingHint(req.query.modelString) : null }));

  // Tasks (registry ∪ DB routes)
  app.get('/ai/tasks', async () => {
    const routes = new Map(r().aiTaskRouteRepo.list().map((x) => [x.task, x.modelId]));
    const data = Object.entries(AI_TASKS).map(([task, meta]) => ({
      task, label: meta.label, description: meta.description,
      defaultDialect: (meta as any).defaultDialect ?? null,
      assignedModelId: routes.get(task) ?? null, configured: routes.has(task),
    }));
    return { data };
  });

  app.put<{ Params: { task: string }; Body: { modelId: string } }>('/ai/tasks/:task/route', async (req) => {
    if (!isAiTask(req.params.task)) throw badRequest(`Unknown task "${req.params.task}".`);
    const modelId = req.body?.modelId;
    if (!modelId || !r().aiModelRepo.get(modelId)) throw badRequest('Unknown modelId.');
    r().aiTaskRouteRepo.upsert(req.params.task, modelId, new Date().toISOString());
    return { data: { ok: true } };
  });

  app.delete<{ Params: { task: string } }>('/ai/tasks/:task/route', async (req) => {
    r().aiTaskRouteRepo.delete(req.params.task); return { data: { ok: true } };
  });
}
```

- [ ] **Step 4: Add `conflict` helper to `errors.ts`** if absent:

```ts
// packages/api/src/errors.ts
export function conflict(message: string) { const e: any = new Error(message); e.statusCode = 409; return e; }
```

- [ ] **Step 5: Register in `server.ts`**: `await app.register(aiSettingsRoutes);` (uncomment placeholder from Task 14).

- [ ] **Step 6: Run — expect PASS.**

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/routes/aiSettings.ts packages/api/src/errors.ts packages/api/src/server.ts packages/api/test/aiSettings.test.ts
git commit -m "feat(api): /ai/providers /ai/models /ai/tasks routes (encrypted secrets, FK guards, registry merge)"
```

---

### Task 16: `/ai/usage` routes

**Files:**
- Create: `packages/api/src/routes/aiUsage.ts`
- Modify: `packages/api/src/server.ts` (register)
- Test: `packages/api/test/aiUsage.test.ts`

**Interfaces:**
- Produces: `GET /ai/usage/summary?from&to`, `GET /ai/usage/events?from&to&task&limit&offset`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/api/test/aiUsage.test.ts
import { describe, it, expect } from 'vitest';
import { buildServer } from '../src/server';

describe('AI usage routes', () => {
  it('summary + events reflect inserted usage rows', async () => {
    const a = await buildServer({ dbPath: ':memory:' });
    // insert directly through the repo (bypassing an actual LLM call)
    a.repos.aiUsageRepo.insert({ ts: '2026-07-01T10:00:00Z', task: 'categorization', providerId: 'gemini', dialect: 'gemini', model: 'gemini-2.5-flash', inputTokens: 1000, outputTokens: 500, callCount: 1, costUsd: 0.01, ok: 1 });
    const s = await a.inject({ method: 'GET', url: '/ai/usage/summary' });
    expect(s.json().data).toMatchObject({ callCount: 1, totalInput: 1000, unpricedCount: 0 });
    const e = await a.inject({ method: 'GET', url: '/ai/usage/events?limit=10&offset=0' });
    expect(e.json().data).toHaveLength(1);
    await a.close();
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement `aiUsage.ts`**

```ts
// packages/api/src/routes/aiUsage.ts
import type { FastifyInstance } from 'fastify';

export async function aiUsageRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { from?: string; to?: string } }>('/ai/usage/summary', async (req) =>
    ({ data: app.repos.aiUsageRepo.summary({ from: req.query.from, to: req.query.to }) }));

  app.get<{ Querystring: { from?: string; to?: string; task?: string; limit?: string; offset?: string } }>(
    '/ai/usage/events', async (req) => ({
      data: app.repos.aiUsageRepo.listEvents({
        from: req.query.from, to: req.query.to, task: req.query.task,
        limit: Math.min(Number(req.query.limit ?? 50), 500), offset: Number(req.query.offset ?? 0),
      }),
    }));
}
```

- [ ] **Step 4: Register in `server.ts`**: `await app.register(aiUsageRoutes);`
- [ ] **Step 5: Run — expect PASS.**
- [ ] **Step 6: Commit**

```bash
git add packages/api/src/routes/aiUsage.ts packages/api/src/server.ts packages/api/test/aiUsage.test.ts
git commit -m "feat(api): /ai/usage/summary + /ai/usage/events"
```

---

### Task 17: Update existing ai-suggest tests + end-to-end usage row

**Files:**
- Modify: `packages/api/test/*ai*suggest*.test.ts` (whichever exercises `/categories/ai-suggest`)
- Test: add an assertion that a successful ai-suggest records exactly one usage row.

**Interfaces:**
- Consumes: `buildServer({ dbPath, gateway })` — tests inject a fake gateway OR seed a provider/model/route + a fake `complete` via a real gateway with `buildProviderOverride`. Simplest: seed provider/model/route through repos, then inject a fake gateway that runs the fn against a canned `complete` and records via the real usageRepo.

- [ ] **Step 1: Update the existing ai-suggest test** to configure routing first (POST provider/model + PUT route) and use a `buildServer` `gateway` override whose `complete` returns canned suggestions. Assert:
  - suggestions applied as `ai_suggested` (unchanged behavior),
  - `app.repos.aiUsageRepo.summary({}).callCount === 1` after the call.

Add an explicit test: with **no route configured**, `/categories/ai-suggest` returns **400** ("No AI model is assigned…").

- [ ] **Step 2: Run — iterate until green.**

Run: `packages/api/node_modules/.bin/vitest run` (all api tests)

- [ ] **Step 3: Commit**

```bash
git add packages/api/test
git commit -m "test(api): ai-suggest routes through gateway + records one usage row; unrouted → 400"
```

---

## Phase 4 — Web: AI Settings surface

### Task 18: API types + query keys + hooks

**Files:**
- Modify: `apps/web/src/lib/queryKeys.ts`, `apps/web/src/lib/hooks.ts`
- Create: `apps/web/src/features/ai/types.ts`
- Test: `apps/web/src/features/ai/aiUsageTransforms.test.ts` (pure-logic, created in Task 20; hooks are smoke-covered)

**Interfaces:**
- Produces: `useAiProviders/useAiModels/useAiTasks/useAiUsageSummary/useAiUsageEvents` + mutations `useCreateProvider/useDeleteProvider/useCreateModel/useUpdateModel/useDeleteModel/useSetTaskRoute/useUnsetTaskRoute`. TS types `AiProviderDTO, AiModelDTO, AiTaskDTO, AiUsageSummaryDTO, AiUsageEventDTO`.

- [ ] **Step 1: Add DTO types** in `features/ai/types.ts` mirroring the API responses (provider with `hasSecret`, model with prices, task with `assignedModelId/configured`, summary shape, event row).

- [ ] **Step 2: Add query keys** (`ai: { providers, models, tasks, usageSummary, usageEvents }`).

- [ ] **Step 3: Add hooks** following the existing `useRules`/`useUpdateTxCategory` pattern (TanStack Query `useQuery`/`useMutation` through `apiClient`; mutations invalidate the relevant keys).

- [ ] **Step 4: Typecheck web**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && apps/web/node_modules/.bin/tsc --build`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/queryKeys.ts apps/web/src/lib/hooks.ts apps/web/src/features/ai/types.ts
git commit -m "feat(web): AI settings/usage query keys, DTO types, hooks"
```

---

### Task 19: Providers & Routing tab (+ modals)

**Files:**
- Create: `apps/web/src/features/ai/ProvidersRoutingTab.tsx`, `ProviderFormModal.tsx`, `ModelFormModal.tsx`
- Test: `apps/web/src/features/ai/ProviderFormModal.test.tsx`

**Interfaces:**
- Consumes: hooks from Task 18; UI kit (`Card`, `Badge`, `Modal`, `DataState`).
- Produces: `<ProvidersRoutingTab/>`. Provider form is **polymorphic by dialect** (bedrock hides the key field, shows region+profile).

- [ ] **Step 1: Write the failing smoke test** (dialect toggles the credential fields)

```tsx
// apps/web/src/features/ai/ProviderFormModal.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ProviderFormModal } from './ProviderFormModal';

describe('ProviderFormModal', () => {
  it('shows API key for gemini and hides it for bedrock (region/profile instead)', () => {
    render(<ProviderFormModal open onClose={() => {}} onSubmit={() => {}} />);
    // default dialect gemini → key field present
    expect(screen.getByLabelText(/API key/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/dialect/i), { target: { value: 'bedrock' } });
    expect(screen.queryByLabelText(/API key/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/region/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/profile/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

Run: `apps/web/node_modules/.bin/vitest run src/features/ai/ProviderFormModal.test.tsx`

- [ ] **Step 3: Implement the modals + tab.** `ProviderFormModal`: dialect `<select>`; when `gemini`/`openai-compatible` show API key (+ optional baseURL); when `bedrock` show region (default `us-east-1`) + profile (default `dev`) and a hint "auth via your AWS SSO session — run `aws sso login` first." `ModelFormModal`: providerId select, modelString, label, inputPerM, outputPerM; on modelString blur/change call `useAiPricingHint` (or a fetch to `/ai/pricing-hints`) to prefill prices (editable). `ProvidersRoutingTab`: three sections — Providers (cards + Add), Models (grouped by provider + Add), Task routing (row per `useAiTasks()` task → model `<select>` → Save; amber "Not configured" chip when `!configured`).

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/ai/ProvidersRoutingTab.tsx apps/web/src/features/ai/ProviderFormModal.tsx apps/web/src/features/ai/ModelFormModal.tsx apps/web/src/features/ai/ProviderFormModal.test.tsx
git commit -m "feat(web): Providers & Routing tab + polymorphic provider/model modals"
```

---

### Task 20: Usage & Cost tab (+ pure transforms) and page shell + nav

**Files:**
- Create: `apps/web/src/features/ai/UsageCostTab.tsx`, `apps/web/src/features/ai/aiUsageTransforms.ts`, `apps/web/src/features/ai/AiSettingsPage.tsx`
- Modify: `apps/web/src/App.tsx`, `apps/web/src/components/Sidebar.tsx`
- Test: `apps/web/src/features/ai/aiUsageTransforms.test.ts`

**Interfaces:**
- Produces: `formatUsd(n): string`, `toDailyBars(summary): {label:string; value:number}[]`, `<UsageCostTab/>`, `<AiSettingsPage/>` (tab switcher), route `path: 'ai'`, sidebar "AI" item.

- [ ] **Step 1: Write the failing test** (pure transforms)

```ts
// apps/web/src/features/ai/aiUsageTransforms.test.ts
import { describe, it, expect } from 'vitest';
import { formatUsd, toDailyBars } from './aiUsageTransforms';

describe('aiUsageTransforms', () => {
  it('formats USD to cents', () => {
    expect(formatUsd(1.5)).toBe('$1.50');
    expect(formatUsd(0.0031)).toBe('$0.0031'); // sub-cent shows 4 dp
  });
  it('maps byDay to chart bars', () => {
    const bars = toDailyBars({ byDay: [{ day: '2026-07-01', costUsd: 0.02 }] } as any);
    expect(bars).toEqual([{ label: '2026-07-01', value: 0.02 }]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement `aiUsageTransforms.ts`** (`formatUsd`: `>=0.01 → 2dp`, else `4dp`; `toDailyBars`: map `byDay`). Then `UsageCostTab` (KPI strip via `KPIStat`: total spend `formatUsd(totalCostUsd)`, this-month, total tokens, call count; `SpendBar` from `toDailyBars`; breakdown tables from `byTask`/`byModel`; "N calls unpriced" note when `unpricedCount>0`; `DataState` empty when no events). Then `AiSettingsPage` (two-tab switcher). Wire `App.tsx` route `{ path: 'ai', element: <AiSettingsPage/> }` and add the Sidebar "AI" `NavLink`.

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/ai/UsageCostTab.tsx apps/web/src/features/ai/aiUsageTransforms.ts apps/web/src/features/ai/AiSettingsPage.tsx apps/web/src/features/ai/aiUsageTransforms.test.ts apps/web/src/App.tsx apps/web/src/components/Sidebar.tsx
git commit -m "feat(web): Usage & Cost tab, AI page shell, sidebar nav"
```

---

## Phase 5 — Verify, review, close out

### Task 21: Full-suite gate + manual test plan

**Files:**
- Modify: `docs/manual_testing/MANUAL_TEST_PLAN.md` (append AI section)

- [ ] **Step 1: Build all packages**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && packages/core/node_modules/.bin/tsc --build && packages/agents/node_modules/.bin/tsc --build && packages/api/node_modules/.bin/tsc --build && apps/web/node_modules/.bin/tsc --build`
Expected: clean.

- [ ] **Step 2: Run every suite**

Run: `packages/core/node_modules/.bin/vitest run` (Groww 6/6), then agents, api, web `vitest run`.
Expected: all green; **Groww golden-master 6/6 unchanged**.

- [ ] **Step 3: Seam-invariant check**

Run: `grep -rn "drizzle-orm\|better-sqlite3" packages/agents/src packages/core/src/domain`
Expected: no matches (comments aside).

- [ ] **Step 4: Append the manual test plan** — steps to (a) set `MYFINANCE_SECRET_KEY`, (b) add a Gemini provider + model + route categorization, run "Suggest with AI", confirm a usage row appears with a dollar cost; (c) add a Bedrock provider (region `us-east-1`, profile `dev`), after `aws sso login`, route categorization to a Bedrock model, run again, confirm cost recorded; (d) verify secret never appears in `GET /ai/providers`.

- [ ] **Step 5: Commit**

```bash
git add docs/manual_testing/MANUAL_TEST_PLAN.md
git commit -m "docs: AI Settings & Usage manual test plan"
```

---

### Task 22: Subagent code review + close out

- [ ] **Step 1:** Dispatch a fresh `feature-dev:code-reviewer` (or `superpowers:requesting-code-review`) over the whole branch diff against the spec. Focus: secret never leaked in any response/log; gateway records exactly one row per invocation; FK-guard 409s; seam invariant; Bedrock adapter offline-testable; Groww unchanged.
- [ ] **Step 2:** Apply review fixes (re-run affected suites).
- [ ] **Step 3:** Push `feat/ai-settings-usage` (`gh auth switch --user ak688744`), open PR into `main`.
- [ ] **Step 4:** Update `MASTER_PLAN.md` §4/§8 (AI Settings & Usage shipped) and save a project-memory decision + `session_summary`.

---

## Self-Review

**Spec coverage:**
- §5 tables → Task 2; crypto → Task 1; repos → Tasks 3–6. ✓
- §6 registry → Task 7 (with hint-only `defaultDialect` comment). ✓
- §7 factory + Bedrock + pricing → Tasks 8–10. ✓
- §8 gateway (one aggregated row, ok=0 on failure, provider_not_configured) → Task 12. ✓
- §9 API routes (providers/models/tasks/usage, secret hidden, 409 guards, task validation) → Tasks 14–17. ✓
- §10 web (two tabs, polymorphic form, Not-configured chip, unpriced note, empty state) → Tasks 18–20. ✓
- §11 testing + §12 risks (SSO expiry→auth msg, env inert) → covered in Tasks 9/14/21. ✓

**Placeholder scan:** No TBD/TODO. Every code step shows code. The one intentional deferral (openai-compat stub) is explicit and tested (Task 10 asserts it throws).

**Type consistency:** `AiProviderRow/AiModelRow/AiTaskRouteRow/AiUsageEventRow` and repo method names (`getByTask`, `upsert`, `countModels`, `countRoutes`, `summary`) are defined in Task 3 and used identically in Tasks 4–6, 12, 15–16. `CompleteFn` defined in Task 11 and reused in Task 12. `buildProvider` signature consistent Tasks 10/12. `makeGateway`/`runTask` consistent Tasks 12/14/17.

**Known adjustment during build:** the exact `AnthropicBedrock` credential-provider wiring (Task 9, Step 4) may need a small tweak to match the installed SDK version's constructor options — the injected-client tests are the contract and stay valid regardless; verify the real constructor against `@anthropic-ai/bedrock-sdk` docs at build time.
