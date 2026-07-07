# AI Settings & Usage — Design Spec

**Date:** 2026-07-07
**Tier:** T1 (new architectural surface: runtime config system + secrets-at-rest + new API contracts + new web pages). **No Groww re-validation triggered** — zero financial logic (XIRR / categorization algorithm / parsers / portfolio math) is touched; the T1 gate is satisfied by the Groww golden-master staying **6/6 unchanged**.
**Branch:** `feat/ai-settings-usage` (off `main`, after AI-categorization has merged).
**Status:** Design — approved in brainstorm, pending spec review.

---

## 1. Purpose

Turn the AI layer's provider/model choice into a **user-controlled, runtime setting** and give the user **visibility into AI cost**. Today the LLM provider is env-driven and resolved once at server boot (`GEMINI_API_KEY`, `AI_CATEGORIZATION_MODEL`), supporting exactly one task (`categorization`). This feature delivers:

1. A **Settings surface** to register providers, register models (with pricing), and assign a provider+model to each AI task.
2. **Per-task routing** so future agents (taxation, expense-manager, wealth-manager) each get their own provider/model choice — with no code change beyond registering the task.
3. **Usage & cost tracking** — every AI task invocation records tokens and dollars spent, surfaced in a dashboard.
4. A **working Bedrock (Claude via AWS SSO) provider**, reusing the user's existing `claude_aws` login flow.

This was explicitly deferred during the AI-assisted-categorization build (that spec §10). It is the planned next step for the AI layer and lays groundwork the L4 agents reuse.

## 2. Scope

### In scope
- New DB tables + repos: `ai_providers`, `ai_models`, `ai_task_routes`, `ai_usage_events` (migration `0004`).
- Secret encryption at rest (AES-256-GCM; master key from `MYFINANCE_SECRET_KEY` env).
- Code-defined **task registry** in `packages/agents`.
- An **`LlmGateway`** — the single injected choke point that resolves a task's route, calls the provider, and records **one aggregated usage row per task invocation**.
- **Provider factory** + a **working Bedrock adapter** (`@anthropic-ai/bedrock-sdk` + `fromSSO`, forced-tool-use JSON output, injectable client for offline tests).
- User-entered **pricing per model** (input/output $/M); a code pricing table demoted to a **prefill hint**.
- New API routes (providers / models / task-routes / usage).
- New **AI** web surface: two tabs — *Providers & Routing* and *Usage & Cost*.
- Refactor of the categorization path to run through the gateway (output-identical, TDD-pinned).

### Out of scope (deferred)
- `openai-compatible` adapter implementation (stays a stub; unlocking OpenAI/DeepSeek/Groq/OpenRouter/Ollama is a later config-only change).
- The future agents themselves (taxation, wealth-manager) — this feature only makes the *slot* they plug into.
- Claude Agent SDK / MCP wrapping (L3/L4).
- Live/scraped pricing feeds; DB-editable global pricing table.
- Budgets / spend caps / alerts on AI cost.
- Multi-user / per-user keys (single-user app).

## 3. Locked Decisions (from brainstorm)

| # | Decision | Rationale |
|---|---|---|
| D1 | **All config + secrets in DB** (not env). | Self-contained; the Settings UI is the single source of truth. Env keeps only the master encryption key. |
| D2 | **Secrets AES-256-GCM encrypted at rest**; master key from `MYFINANCE_SECRET_KEY` (hex, 32 bytes). | DB file alone is useless without the env key. Missing key → provider creation *with a secret* fails loudly; keyless providers (Bedrock) still work. |
| D3 | **Polymorphic credentials.** Key-based (Gemini / openai-compatible) store an encrypted key; **Bedrock stores only `{region, profile}`** and authenticates via the ambient AWS SSO credential chain. | One data model spanning both auth styles; reuses the user's `claude_aws` SSO login unchanged. |
| D4 | **Code-defined task registry, real tasks only.** | No dead config; a task exists in code because backing agent code exists. `defaultDialect` is a *first-run setup hint only*, never a binding. |
| D5 | **Task→provider→model routing is fully DB-driven & user-editable.** | The whole point of the feature; nothing in code binds a task to a provider. |
| D6 | **Models are first-class entities with user-entered pricing** (`inputPerM`/`outputPerM`). Code pricing table = **prefill hint** only. | No reliable pricing API exists; user-entered price means every model is priced, killing the "fake $0 / unpriced" problem. |
| D7 | **Cost frozen at write time** into the usage row. | Later price edits never rewrite history; the dashboard stays truthful. |
| D8 | **One aggregated usage row per task invocation** (not per internal LLM call/chunk), with a `call_count`. | Matches how the user reasons about cost ("what did that action cost"); dashboard aggregates anyway. |
| D9 | **Working Bedrock adapter now** (not seam-only). | Delivers the explored Bedrock reuse; JSON via forced tool-use; injectable client keeps tests offline. |
| D10 | **Two-tab AI page** (Providers & Routing / Usage & Cost). | Cohesive surface matching the existing KPI-strip + chart + table pattern. |

## 4. Architecture

**The central shift:** replace "resolve one `LlmProvider` from env at boot and inject it" with a single injected **`LlmGateway`** that, per task invocation, resolves `{provider, model}` from DB config, builds the concrete provider, calls it, and records usage/cost.

```
apps/web  ── AI Settings (2 tabs) ──> REST
                                        │
packages/api ── routes: /ai/providers /ai/models /ai/tasks /ai/usage
             ── buildServer constructs LlmGateway from repos + decrypt, injects it
                                        │
packages/agents ── LlmGateway (choke point)
                   ├─ tasks.ts       (code registry)
                   ├─ llm/factory.ts (dialect → adapter)
                   ├─ llm/bedrock.ts (NEW: AnthropicBedrock + fromSSO + forced tool-use)
                   ├─ llm/gemini.ts  (exists)
                   ├─ pricing.ts     (prefill hints)
                   └─ gateway.runTask(task, fn) → aggregate usage → 1 usage row
                                        │  (repo INTERFACES injected; no Drizzle here)
packages/core ── schema (4 new tables) + repos + crypto.ts (AES-256-GCM)
              ── migration drizzle/0004_*.sql (additive)
```

**Seam invariant preserved:** `packages/agents` and `packages/core/domain` import zero Drizzle; the gateway takes repo *interfaces* injected by the API layer (mirrors the existing `amfiMatch` / `NavLookup` injection pattern).

## 5. Data Model

All money as `REAL`, tokens as `INTEGER`, timestamps as `TEXT` ISO (L0 conventions). Migration **`drizzle/0004_*.sql`** — additive only, existing tables untouched.

### `ai_providers` — one row per configured provider instance
```
id           text pk           -- user-meaningful, e.g. 'gemini', 'bedrock-dev'
dialect      text  NOT NULL     -- CHECK IN ('gemini','openai-compatible','bedrock')
label        text  NOT NULL     -- display name
secret_enc   text  NULL         -- AES-GCM ciphertext of API key; NULL for bedrock
config_json  text  NULL         -- non-secret dialect params: {baseURL} | {region,profile}
created_at   text  NOT NULL DEFAULT CURRENT_TIMESTAMP
```
Providers are **instances, not singletons** — two Gemini rows (personal vs work key) or `bedrock-dev`/`bedrock-prod` are allowed.

### `ai_models` — a model registered under a provider, with its price
```
id            text pk           -- e.g. 'gemini-flash', 'bedrock-haiku'
provider_id   text NOT NULL FK → ai_providers.id
model_string  text NOT NULL     -- literal API model id, e.g. 'gemini-2.5-flash'
label         text NOT NULL
input_per_m   real NOT NULL     -- USD per 1M input tokens  (user-entered; >= 0)
output_per_m  real NOT NULL     -- USD per 1M output tokens (user-entered; >= 0)
created_at    text NOT NULL DEFAULT CURRENT_TIMESTAMP
```
Prices are **required** (may be `0` for a genuinely free/untracked model, never blank) so cost math is always total.

### `ai_task_routes` — which model each task uses
```
task         text pk            -- validated against the code registry (AI_TASKS)
model_id     text NOT NULL FK → ai_models.id   -- provider reachable through the model
updated_at   text NOT NULL DEFAULT CURRENT_TIMESTAMP
```
A task with no row = **not configured** (feature disabled for that task, surfaced in UI). No implicit default.

### `ai_usage_events` — append-only, one row per task invocation
```
id            integer pk autoincrement
ts            text NOT NULL      -- ISO timestamp
task          text NOT NULL
provider_id   text NOT NULL
dialect       text NOT NULL
model         text NOT NULL      -- model_string snapshot
input_tokens  integer NOT NULL   -- summed across the invocation's internal calls
output_tokens integer NOT NULL
call_count    integer NOT NULL    -- internal LLM calls made (e.g. chunk count)
cost_usd      real NULL           -- frozen at write time; NULL only if model unpriced
ok            integer NOT NULL    -- 1 success / 0 failed
```
Indexed on `ts` and `task` for dashboard range/group queries.

### Encryption — `packages/core/src/db/crypto.ts` (or `util/crypto.ts`)
- AES-256-GCM. Master key from `MYFINANCE_SECRET_KEY` (hex-encoded 32 bytes).
- `encrypt(plain) → base64(iv[12] | authTag[16] | ciphertext)`; `decrypt(blob) → plain`.
- Distinct random IV per call. Tampered ciphertext → throw. Missing/short master key → throw a clear, actionable error.
- Keyless providers (Bedrock) never call encrypt/decrypt, so they work even if `MYFINANCE_SECRET_KEY` is unset.

## 6. Task Registry — `packages/agents/src/tasks.ts`

```ts
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
```
Future agents = **add one entry here**; the Settings UI grows a routing row automatically. The API validates any `task` written to `ai_task_routes` against this registry.

## 7. Provider Factory & Bedrock Adapter

### Factory — `packages/agents/src/llm/factory.ts`
```ts
buildProvider({ dialect, model, apiKey?, config? }): LlmProvider
//  'gemini'            → makeGeminiProvider (exists)
//  'openai-compatible' → stub this pass (throws provider_not_configured)
//  'bedrock'           → makeBedrockProvider (NEW)
```
Takes an already-decrypted credential (the gateway decrypts before calling). This is distinct from the existing `resolveProvider(LlmConfig)` (which keys off `apiKey` and can't express Bedrock's SSO creds); `resolveProvider` stays for back-compat but the gateway path is primary.

### Bedrock adapter — `packages/agents/src/llm/bedrock.ts`
```ts
makeBedrockProvider(
  { model, region, profile }: { model: string; region: string; profile?: string },
  deps?: { client?: AnthropicBedrock },   // injectable for offline tests
): LlmProvider
```
- Client: `@anthropic-ai/bedrock-sdk` `AnthropicBedrock`, credentials from `@aws-sdk/credential-providers` `fromSSO({ profile })` (+ `awsRegion: region`). Reuses the user's `aws sso login --profile dev` session; **no secret stored**.
- **JSON-schema output via forced tool-use** (Bedrock Claude has no Gemini-style `responseSchema`): define one tool whose `input_schema` = the passed `jsonSchema`, set `tool_choice: { type: 'tool', name: <tool> }`, read the tool-use block's `input` as the structured result. `complete()` returns `{ text: JSON.stringify(toolInput), usage }` — a drop-in for the existing `parseBatch` path.
- **Usage:** `response.usage.input_tokens/output_tokens` → `LlmUsage`.
- **Error mapping** (mirrors Gemini adapter): throttling → `rate_limit`; `AccessDenied` / expired-SSO → `auth` (message tells the user to re-run `aws sso login`); else → `network`.
- **Deps:** add `@anthropic-ai/bedrock-sdk` + `@aws-sdk/credential-providers` to `packages/agents`.

### Pricing — `packages/agents/src/pricing.ts`
```ts
// USD per 1M tokens. CONVENIENCE PREFILL ONLY — the source of truth is the
// user-entered price on each ai_models row. Keyed by literal model_string.
export const PRICING_HINTS: Record<string, { inputPerM: number; outputPerM: number; source: string; asOf: string }> = { … };

export function costUsd(inTok: number, outTok: number, inputPerM: number, outputPerM: number): number;
```

## 8. The Gateway — `packages/agents/src/gateway.ts`

```ts
makeLlmGateway({
  providerRepo, modelRepo, routeRepo, usageRepo,   // repo INTERFACES
  decrypt,                                          // (blob) => plain
  now?,                                             // injectable clock for tests
  credentialProviders?,                             // injectable fromSSO for tests
})

gateway.runTask<T>(task: AiTaskId, fn: (complete: CompleteFn) => Promise<T>): Promise<T>
//  complete: ({prompt, jsonSchema}) => Promise<{text, usage}>
```

`runTask` behavior:
1. Resolve route via `routeRepo.getByTask(task)`. No row → throw `LlmError('provider_not_configured', 'Task "<task>" has no model assigned. Configure it in AI Settings.')`.
2. Load `modelRepo.get(route.modelId)` + `providerRepo.get(model.providerId)` **once** (one task ⇒ one model for the whole invocation).
3. Decrypt secret (key dialects) or read `{region, profile}` (Bedrock); `buildProvider(...)`.
4. Run `fn`, passing a `complete` that calls `provider.complete` and **accumulates** `{inputTokens, outputTokens}` + increments `call_count` across every internal call.
5. On resolve: compute **one** `cost_usd` from the model's stored price over the **summed** tokens; `usageRepo.insert({... ok:1, call_count})`; return `fn`'s result.
6. On throw: if usage accrued, still insert `ok:0` with the summed usage + `call_count`, then re-throw. Hard errors (`auth`, `provider_not_configured`) propagate to the caller as today.

`categorizeWithAI` is refactored to accept an injected `complete` fn instead of a raw `provider`; its suggestion/skip output is **identical** given the same inputs (TDD-pinned). The `/categories/ai-suggest` route calls `gateway.runTask('categorization', (complete) => categorizeWithAI(txns, { complete, categories, logger }))`.

## 9. API — `packages/api`

New route modules `routes/aiSettings.ts` (+ `routes/aiUsage.ts`). All use the existing `{ data: … }` envelope and central error handler.

**Providers**
- `GET /ai/providers` → list; **secret never returned**, only `hasSecret: boolean`.
- `POST /ai/providers` → `{ id, dialect, label, apiKey?, config? }`; encrypts `apiKey` → `secret_enc`. Bedrock: no `apiKey`, `config = {region, profile}`.
- `PATCH /ai/providers/:id` → edit label/config or rotate key.
- `DELETE /ai/providers/:id` → **409** if any model references it.

**Models**
- `GET /ai/models` (`?providerId=`) → includes prices.
- `POST /ai/models` → `{ id, providerId, modelString, label, inputPerM, outputPerM }` (prices required, `>= 0`).
- `PATCH /ai/models/:id` → edit label/prices (response note: affects future usage only).
- `DELETE /ai/models/:id` → **409** if any route references it.
- `GET /ai/pricing-hints?modelString=` → `{inputPerM, outputPerM}` prefill or `null`.

**Task routing**
- `GET /ai/tasks` → merges the **code registry** (id/label/description) with each task's DB route (`assignedModelId | null`, `configured: boolean`).
- `PUT /ai/tasks/:task/route` → `{ modelId }`; validates `task ∈ AI_TASKS` (else 400) and model exists (else 400).
- `DELETE /ai/tasks/:task/route` → unassign.

**Usage**
- `GET /ai/usage/summary?from&to` → `{ totalCostUsd, totalInput, totalOutput, callCount, byTask[], byModel[], byDay[], unpricedCount }`.
- `GET /ai/usage/events?from&to&task&limit&offset` → paginated raw rows.

**`buildServer` change:** construct the `LlmGateway` from the new repos + `decrypt`, inject it into the categories route (replacing the pre-resolved `llmProvider`) and the new AI routes. The env-based `cfg.llm.categorization` path is removed in favor of DB routing (a one-time note: existing env vars become inert; the user reconfigures via the UI). Tests inject a fake gateway (mirrors `amfiMatch`).

## 10. Web — `apps/web`

New **AI** sidebar item + route `path: 'ai'` (feature folder `features/ai/`). Two tabs.

**Tab 1 — Providers & Routing**
- **Providers**: cards (label, dialect badge, `key set ✓` / `Bedrock: SSO` status) + **Add provider** modal. Form is **polymorphic by dialect**: Gemini / openai-compatible → API key + optional baseURL; Bedrock → region + profile (no key field) with a hint "auth via your AWS SSO session."
- **Models**: grouped by provider + **Add model** modal (`modelString`, label, two price fields). Typing a known `modelString` **prefills** prices from `/ai/pricing-hints` (editable).
- **Task routing**: one row per registered task (from `/ai/tasks`) → dropdown of registered models → Save. Unconfigured tasks show an amber **"Not configured"** chip (mirrors the Uncategorized pattern).

**Tab 2 — Usage & Cost**
- **KPI strip**: Total spend · This-month spend · Total tokens · Call count (reuse `KPIStat`).
- **Spend-over-time bar chart** (reuse `SpendBar`/Recharts wrapper), grouped by day or month.
- **Breakdown table**: by task and by model — cost, tokens, calls; an **"N calls unpriced"** note if any `cost_usd` is null.
- Date-range filter (reuse the Expenses month-window pattern).

New hooks (`lib/hooks.ts`): `useAiProviders / useAiModels / useAiTasks / useAiUsageSummary / useAiUsageEvents` + mutations, all through the typed `apiClient`. **Charts render recorded usage only** — genuine empty state before any AI call (project honesty value).

## 11. Testing Strategy (TDD)

**core**
- `crypto.ts`: encrypt/decrypt round-trip; distinct IV per call; tampered ciphertext throws; missing/short master key throws clear error.
- Repos (provider/model/route/usage): CRUD; FK guards (delete provider-with-models → blocked; delete model-with-routes → blocked); usage insert + range/task-filtered aggregation sums.
- Migration `0004`: new tables exist; existing tables untouched.
- **Groww golden-master: 6/6 unchanged** (the T1 gate).

**agents**
- `pricing.ts`: `costUsd` formula; prefill hit/miss.
- `factory.ts`: dialect → right adapter; Bedrock builds without a secret.
- `bedrock.ts` (offline via injected fake client): forced-tool-use request shape; reads tool-use `input` → JSON text; usage mapping; error mapping (throttle→rate_limit, expired-SSO→auth, other→network).
- `gateway.runTask` (fake repos + fake complete): resolves route→model→provider; writes **exactly one aggregated usage row** with summed tokens + correct frozen cost + `call_count`; `ok=0` + re-throw on hard failure; `provider_not_configured` when unrouted.
- `categorizeWithAI` refactor: output identical to today given the same inputs.

**api** (`app.inject`, fake gateway/repos — no network)
- provider/model/route CRUD happy + error paths; **secret never in any response**; 409 on referenced deletes; task validated against registry; `PUT /ai/tasks/:task/route` rejects unknown task/model.
- usage summary aggregation + events pagination.
- `/categories/ai-suggest` still works end-to-end through the gateway **and records a usage row**.

**web** (light, per L2 precedent)
- pure logic: usage-aggregation transforms + cost formatting.
- UI-kit smoke: provider form polymorphic by dialect (Bedrock hides key field); "Not configured" chip; dashboard empty state.
- Manual browser test-plan entries appended to `docs/manual_testing/`.

**Full-suite gate before PR:** `tsc --build` clean (core → agents → api → web); core + agents + api + web green; Groww 6/6; seam invariant (agents/core import no Drizzle beyond repos).

## 12. Risks & Notes

- **Bedrock SSO expiry:** temporary creds expire (few hours); an expired session surfaces as an `auth` `LlmError` with a "re-run `aws sso login --profile dev`" message, not a 500. Unattended/long-running use would later need an IAM role — out of scope (local single-user).
- **Bedrock ≠ Anthropic-API pricing, region-dependent:** the user enters the Bedrock model's price at registration, so this is handled by data, not assumption.
- **Removing the env provider path** is a deliberate behavior change: existing `GEMINI_API_KEY` / `AI_CATEGORIZATION_*` env vars become inert; the user reconfigures categorization via the UI once. Documented in the PR + a first-run empty state.
- **Toolchain gotcha:** pnpm 11.x crashes on Node 20.20.2 → use `corepack prepare pnpm@10.4.1 --activate` for installs; build/test via `node_modules/.bin/{tsc,vitest}` (Node 20).
- **Master key management:** if `MYFINANCE_SECRET_KEY` is lost/changed, stored key-based secrets become undecryptable — the user re-enters keys. Acceptable for single-user; documented.

## 13. Out-of-the-box sequencing

Build order (bottom-up, each TDD'd): crypto + schema + repos (core) → pricing + factory + Bedrock adapter + gateway + registry (agents) → categorize refactor → API routes + buildServer wiring → web pages → full-suite gate → subagent review → PR → update MASTER_PLAN + project-memory.
