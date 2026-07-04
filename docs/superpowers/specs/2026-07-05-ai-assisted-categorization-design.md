# AI-Assisted Expense Categorization — Design Spec

**Date:** 2026-07-05
**Tier:** T1 (touches `core` categorization logic + first LLM/AI integration = new architectural surface)
**Branch:** `feat/ai-assisted-categorization` (off `main`)
**Status:** Brainstorm complete — spec for review. No code yet.

---

## 1. Problem & Goal

Expense transactions are auto-categorized at import by a **deterministic rule engine**
(`packages/core/src/domain/categorize.ts`) using a fixed precedence ladder:

```
merchant_rule (exact, 200) → upi_note_keyword (exact, 100) → builtin_rule (substring) → null
```

Transactions that match no rule land **uncategorized** (`category_id IS NULL`). Today the
only way to categorize them is manual reassignment, and the "learn a rule" affordance
only works for **structured bank descriptions** — `extractMerchantKey` derives a pattern
only from `UPI-`/`ACH`/`POS` formats. Plain descriptions like `SWIGGY ORDER 123` yield no
merchant key, so **no rule can ever be created for them** — they stay a permanent manual
chore. (This gap was explicitly logged as deferred in the L2 categorization work.)

**Goal:** Let an LLM suggest categories for the uncategorized transactions in the
currently-viewed month. Each AI suggestion is applied and visibly flagged. The user
confirms or cancels per transaction; on confirm, the user is asked whether to turn the
AI's chosen keyword into a reusable **substring** rule that catches siblings and future
imports — closing the plain-description gap.

This is the **first LLM/AI integration** in the codebase. The MASTER_PLAN reserves the AI
layer for **L4** (Claude Agent SDK orchestrator + specialist agents, over the L3 MCP
contract). This feature deliberately pulls a **thin slice** of that layer forward — see
§11 (L4-sequencing tension) — without adopting the Agent SDK or MCP yet.

---

## 2. Scope

### In scope
- New `packages/agents` package: a provider-agnostic LLM layer + a categorization use-case.
- **v1 implements exactly one LLM adapter: Gemini (native).** OpenAI-compatible and
  Anthropic adapters are typed **stubs** that throw "provider not configured."
- New `core` rule type `keyword` (substring match against the normalized description) +
  the precedence-ladder change, schema/CHECK widening, and migration.
- New `category_source` value `'ai_suggested'` (transient, pre-confirmation marker).
- New API endpoint `POST /categories/ai-suggest` (month-bounded, uncategorized-only).
- Extension of `PATCH /transactions/:id/category` for keyword-rule creation.
- Web UI: month-scoped "Suggest categories with AI" button, violet AI chip state with
  inline confirm/cancel + a second "always do this?" prompt, a post-run review banner, and
  an "AI suggested" filter option.

### Out of scope (deferred — see §10)
- OpenAI/DeepSeek/other providers (adapter stubbed; config-only to enable later).
- Claude Agent SDK adoption + MCP tool wrapping (L3/L4).
- A dedicated **AI Settings & Usage** surface (per-section model routing + usage/cost
  dashboard + key management) — explicitly parked as future work (likely L4).
- Persisting token usage/cost (v1 shows it transiently only).
- Auto-run on import (v1 is on-demand only).

---

## 3. Architecture & Package Layout

New package **`packages/agents`** (seeds the reserved L4 slot):

```
packages/agents/
  src/
    llm/
      types.ts        // LlmProvider interface, LlmConfig, LlmDialect, LlmError
      gemini.ts       // native Gemini adapter (v1 — the only real one)
      openaiCompat.ts // stub: throws LlmError('provider_not_configured')
      anthropic.ts    // stub: throws LlmError('provider_not_configured')
      index.ts        // resolveProvider(config) → LlmProvider
    categorize/
      schema.ts       // Zod AiSuggestion / AiSuggestionBatch schemas
      prompt.ts       // pure buildCategorizationPrompt(chunk, categories)
      aiCategorize.ts // categorizeWithAI(txns, {provider, categories, chunkSize})
    index.ts          // public surface
```

### Boundary rules (preserve existing seams)
- `packages/agents` depends on `@myfinance/core` for **types only** — never Drizzle/SQL.
- **The LLM call never enters `core`.** `core`'s no-network seam is preserved (only NAV
  fetch is async in core). `categorize.ts` stays a pure rule engine.
- `packages/api` is the **only** layer touching both the DB and the agent: it reads
  uncategorized txns + categories via repos, calls `categorizeWithAI`, and persists results.
- Dependency direction: `api → agents → core(types)`. No cycle.
- `agents` is independently testable with a **fake provider** — no network in tests.

### Why not the Claude Agent SDK now
The chosen agent engine (L4) is the Claude Agent SDK, which is **Claude-only**. A
multi-model/provider-agnostic categorizer cannot be built on it. Categorization is a
**structured classification** task (return constrained JSON), not an agent loop — it needs
one structured LLM call per provider, not tool-calling orchestration. The Agent SDK is
introduced later for the conversational/orchestrator work where it earns its keep. The
`LlmProvider` interface here is exactly what the future `anthropic` adapter and L4 reuse.

---

## 4. Provider Model — dialect-shaped, not model-shaped

**Key insight:** you do **not** need a separate implementation per *model* — only per API
**dialect**. Most "other models" speak OpenAI's wire format.

| Dialect | Covers | v1 status |
|---|---|---|
| `gemini` | Google Gemini (`generateContent` + `responseSchema`) | **Implemented** |
| `openai-compatible` | OpenAI, **DeepSeek**, Groq, Together, Fireworks, Mistral, Ollama, OpenRouter (→ hundreds of models) | Stub |
| `anthropic` | Claude (Messages API + tool_use); later the L4 Agent SDK path | Stub |

Adding DeepSeek later = **a config entry** (`{dialect:'openai-compatible', baseURL, model, apiKey}`),
**zero new code**. The interface is keyed by dialect from day one.

```ts
type LlmDialect = 'gemini' | 'openai-compatible' | 'anthropic';
type LlmConfig = { dialect: LlmDialect; model: string; apiKey: string; baseURL?: string };

interface LlmProvider {
  complete(input: { prompt: string; jsonSchema: object }):
    Promise<{ text: string; usage?: { inputTokens: number; outputTokens: number } }>;
}

type LlmErrorKind =
  | 'provider_not_configured' | 'network' | 'rate_limit' | 'invalid_output' | 'auth';
```

**Structured output varies by dialect** (Gemini `responseSchema`; OpenAI-compat
`response_format`), so regardless of provider we **always validate the returned JSON with
Zod** — a provider that only returns free-form JSON still gets validated + retried.

### Why Zod
LLMs return **text**. Even in structured-output mode a model can return a wrong-shaped
object, an extra field, a `categoryId` that isn't real, or a confidence as a string. TS
types vanish at runtime. Zod defines the required shape once (yielding both a runtime
validator and a TS type) and gates every LLM response: **LLM → parse JSON → Zod validate →
(retry once) → use.** This is what makes "any provider" safe.

---

## 5. Data Model Changes

### 5.1 New rule type `keyword` (substring) — the core-engine change
- Widen `category_rules.rule_type` CHECK: `('merchant', 'upi_note_keyword', 'keyword')`.
- Widen `CategoryRuleType` union in `repositories/types.ts` to add `'keyword'`.
- In `resolveCategoryFromRules`, add a `keyword` branch. **Revised precedence ladder:**

  ```
  merchant (exact) → upi_note_keyword (exact) → builtin_rule (substring)
      → keyword (substring)  → null
  ```

  A `keyword` rule fires when the **normalized description contains** the pattern
  (`normalizedDescription.includes(pattern)`, the same mechanism `builtinRules` use), so it
  catches plain descriptions like `SWIGGY ORDER 123` that `extractMerchantKey` returns null
  for. Produces `category_source = 'keyword_rule'`.

  **Keyword is deliberately the WEAKEST user rule (last before `null`), below builtins.**
  Rationale: substring matching is broader/riskier than exact matching, so exact merchant/
  UPI rules *and* the curated builtins should all win over an AI-derived keyword. Since AI
  only runs on already-uncategorized txns (no builtin caught them), keyword rules fill the
  gap **beneath** builtins with no real conflict.

  **Enforcement is by CODE ORDER** in `resolveCategoryFromRules` (merchant → upi → builtin
  loop → keyword loop → null), not by the `priority` column (the resolver doesn't sort on
  priority today). Stored keyword rules get `priority = 50` for display/consistency with the
  existing 200/100 convention.

- **Migration:** SQLite can't `ALTER` a CHECK — recreate `category_rules` with the widened
  CHECK (follow the L1.5 table-recreate migration pattern; `drizzle/` new migration file).

### 5.2 New `category_source` value `'ai_suggested'`
- `category_source` is free-text (no CHECK) → **additive, no migration.** Marks a txn that
  AI categorized but the user hasn't confirmed.
- Widen `CategoryResolution['categorySource']` union to include `'keyword_rule'` and
  `'ai_suggested'`.

### 5.3 No suggestions table
The AI's `keyword`/`confidence`/`reason` are **transient** — returned in the run response
and held by the client, never persisted per-transaction. What persists: only the applied
`category_id` + `category_source='ai_suggested'` on the transaction. On confirm-with-rule,
the keyword becomes a real `category_rules` row (which already has
`created_from_transaction_id` for provenance). This avoids a suggestions table that would
immediately go stale.

---

## 6. End-to-End Flow

**Trigger.** On the Expenses page (which already has a month selector), the user clicks
**"Suggest categories with AI · ‹Month YYYY›"**. Disabled when the selected month has 0
uncategorized transactions.

**Request.** `POST /categories/ai-suggest` with `{ from, to }` (the selected month window,
consistent with the existing `/expenses` and `/expenses/summary` date params).

**Server (`packages/api`) orchestration.**
1. Load candidate txns: `category_id IS NULL` **AND** `transaction_date ∈ [from, to]`
   (month-bounded uncategorized query on `ExpenseTransactionRepo`).
2. Load the category list (id + name) via `categoryRepo`.
3. If none → return `{ suggestions: [], counts: { total: 0 } }` (guard; button prevents this).
4. `resolveProvider(llmConfig)` → Gemini in v1.
5. `categorizeWithAI(candidates, { provider, categories })`:
   - **Chunk** into groups of ≤ **25** (default, configurable). Chunks run **sequentially**
     in v1 (simplest; respects rate limits; single-user latency is fine).
   - Per chunk: `buildCategorizationPrompt` emits a **compact row** per txn
     (`{id, description, amount, direction}`) + the category list + the instruction to
     return `{transactionId, categoryId, keyword, confidence, reason}` and to pick a
     **distinctive** substring keyword (avoid stopwords).
   - `provider.complete()` → parse JSON → **Zod validate** → **retry once** on failure →
     if still invalid, drop the chunk's txns to "skipped" (never fail the whole run).
   - Validate `categoryId ∈ categories` (else drop that suggestion).
   - Validate `keyword` is a non-empty substring of the normalized description
     (else keep the suggestion but set `keyword = null` → no rule can be offered later).
6. **Apply** each valid suggestion: `updateCategory(txId, categoryId, 'ai_suggested')`.
   Keyword is returned in the response only (not persisted).
7. Return `{ suggestions: [...], counts: { suggested, skipped, total }, usage, warnings }`.

**Client.**
8. On success, invalidate expenses/summary queries → table re-renders. AI rows show the
   **violet AI chip** (suggested category + confidence) with inline **✓ / ✗**.
9. Show a **post-run banner**: *"AI suggested categories for N transactions — Review"*;
   the category-filter dropdown gains an **"AI suggested"** option to isolate them; a small
   token-cost note (`usage`) is shown transiently.
10. **Confirm (✓)** — two steps, mirroring the existing merchant learn-loop:
    - Step 1: `PATCH /transactions/:id/category { categoryId }` → promotes
      `ai_suggested` → `manual` (one-off; that single txn is settled, **no rule**).
    - Step 2: inline second prompt — **"Always categorize transactions containing
      '‹keyword›' as ‹Category›?"** Yes/No.
      - **Yes** → `PATCH /transactions/:id/category { categoryId, createRuleKeyword: true, keyword }`
        → creates a `keyword` rule (priority 50) + recategorizes → siblings flip from
        uncategorized to `keyword_rule`.
      - **No** → dismiss; the step-1 one-off assignment stands, no rule created.
    - The prompt wording says *"transactions containing '‹keyword›'"* (not "merchant X") to
      be honest about the **substring** semantics.
11. **Cancel (✗)** on the AI chip → `PATCH { categoryId: null }` → reverts to uncategorized.

**Endpoint extension.** `PATCH /transactions/:id/category` currently takes
`createRuleMerchant?: boolean`. Add `createRuleKeyword?: boolean` + an explicit
`keyword?: string` (the AI-chosen token — unlike merchant keys it **cannot** be re-derived
from the description by `extractMerchantKey`). Server routes this to an extended
`saveCategoryMemoryRule` with `ruleType: 'keyword'` + `recategorizeNonManualTransactions`.

---

## 7. Error Handling & Edge Cases

**LLM / network.**
- **Provider not configured** (no key / stub dialect) → `LlmError('provider_not_configured')`
  → API **400** with a clear message (*"AI provider not configured. Set GEMINI_API_KEY."*),
  not a 500.
- **Network / timeout / 5xx** → per-chunk timeout; **retry once**, then that chunk is
  **skipped** (reported in `counts.skipped` + `warnings[]`); run returns 200. A
  non-recoverable auth error on the first call → 502 with the provider message.
- **Rate limit (429)** → retryable: one backoff retry, then skip the chunk.

**Malformed / invalid AI output (the Zod gate).**
- JSON parse fail or schema mismatch → retry chunk once → still bad → skip chunk.
- `categoryId` not in the real category list → **drop that single suggestion**.
- `keyword` not a substring of the description (or < 2 chars after normalize) → suggestion
  **applied as `ai_suggested` with `keyword = null`** → row shows the category guess, but
  the "always do this?" second prompt is **suppressed** (can't build a working substring
  rule). User can still confirm the one-off assignment.

**Categorization / rules.**
- **Duplicate keyword rule** — `category_rules` has unique `(rule_type, pattern_value)`.
  On "Yes" for an existing keyword, catch the unique violation and treat as success
  (rule already present), then recategorize. No error surfaced.
- **Overly-broad keyword** (e.g. a stopword) — mitigated by min-length + must-be-substring
  checks and a prompt instruction to pick a distinctive token. Not fully preventable, but
  keyword rules sit **last** (below builtins), the user explicitly opts in via the second
  prompt, and it's reversible (delete the rule in `ManageCategoriesModal`).
- **Concurrent re-run for the same month** — the query only selects `category_id IS NULL`;
  `ai_suggested` rows already carry a (provisional) category so they are **not re-sent**.
  Re-running only targets still-uncategorized rows → idempotent.
- **Txn got a rule-based category between run and confirm** — the `PATCH` still applies the
  user's choice (`source='manual'` wins). No conflict.

**Cost / safety guards.**
- **Hard cap 200 txns/run** — if a month somehow exceeds 200 uncategorized, process the
  first 200, report the remainder in `warnings[]`. (Month-scoping makes this a rare
  backstop.)
- **Token-cost visibility** — response includes `usage {inputTokens, outputTokens}` when the
  provider supplies it; UI shows a small transient note. **v1: display only, not persisted.**

**Aggregation decision.** `ai_suggested` txns carry a real `category_id` and **DO count** in
the month's spend totals/donut immediately (no `/expenses/summary` change). Honesty comes
from the visible violet flag; the trade-off (KPIs briefly reflect unconfirmed guesses until
confirm/cancel) is accepted. A **"Confirm all"** bulk action is a natural nice-to-have
(optional for v1) that shrinks that window.

---

## 8. Components & Interfaces

**`packages/agents` — LLM layer**
- `llm/types.ts` — `LlmDialect`, `LlmConfig`, `LlmProvider`, `LlmError` (see §4).
- `llm/gemini.ts` — the only real adapter; Gemini `generateContent` + `responseSchema`;
  owns wire format, timeout, one-retry-on-5xx/429.
- `llm/openaiCompat.ts`, `llm/anthropic.ts` — stubs implementing `LlmProvider`, throwing
  `LlmError('provider_not_configured')`; documented drop-in slots.
- `llm/index.ts` — `resolveProvider(config): LlmProvider` (dialect dispatch).

**`packages/agents` — categorization use-case**
- `categorize/schema.ts` — Zod `AiSuggestion` (`{transactionId:int, categoryId:string,
  keyword:string, confidence:0..1, reason?:string}`) + `AiSuggestionBatch`.
- `categorize/prompt.ts` — `buildCategorizationPrompt(chunk, categories)` — **pure**, no
  network; unit-tested on output shape.
- `categorize/aiCategorize.ts` — `categorizeWithAI(txns, {provider, categories,
  chunkSize=25})`: chunk → complete → parse → Zod (retry once) → validate categoryId →
  validate keyword-substring → aggregate. Returns `{suggestions, skipped, usage}`.
  **No DB, no HTTP** — pure orchestration over injected `provider`; testable with a fake.
- `index.ts` — public surface: `categorizeWithAI`, `resolveProvider`, types.

**`packages/core` — the T1 engine change**
- `domain/categorize.ts` — `keyword` branch in `resolveCategoryFromRules` (substring, after
  builtins); widen `CategoryResolution['categorySource']`; extend `saveCategoryMemoryRule`
  to accept `ruleType:'keyword'` (priority 50).
- `repositories/types.ts` — `CategoryRuleType` gains `'keyword'`.
- schema + migration — widen `category_rules` CHECK (table-recreate migration).

**`packages/api` — orchestration**
- `routes/categories.ts` — new `POST /categories/ai-suggest` `{from,to}`.
- `PATCH /transactions/:id/category` — add `createRuleKeyword?: boolean` + `keyword?: string`.
- `ExpenseTransactionRepo` — month-bounded uncategorized query (reuse `query()` with
  `categoryId:null` + date range if it already supports it; confirm at build time).
- config — `llmConfig` resolved from env (`AI_CATEGORIZATION_MODEL`, `GEMINI_API_KEY`),
  shaped as a **per-task keyed entry** (forward-compat with the parked AI Settings surface).
- **Injectable provider** via `buildServer({ llmProvider })` — mirrors the existing
  injectable `amfiMatch` pattern so route tests use a fake (no network).

**`apps/web` — UI**
- `CategoryChip.tsx` — add the `ai_suggested` **violet** state (category + confidence +
  inline ✓/✗). ✓ → one-off promote, then the "always categorize containing ‹keyword›?"
  Yes/No second prompt (reuses the merchant learn-loop structure). ✗ → revert.
- `ExpensesPage.tsx` — the month-scoped "Suggest categories with AI · ‹Month›" button near
  the month selector (disabled if 0 uncategorized in month); post-run banner with counts +
  token-cost note; "AI suggested" filter option. Optional-for-v1: "Confirm all".
- `lib/hooks.ts` — `useAiSuggest()` mutation (**one HTTP call**; server does the chunking);
  extend `useUpdateTxCategory` for the keyword-rule path.

**Client/server split confirmed:** `useAiSuggest` is a single mutation running the whole
month batch server-side; the client does **not** orchestrate chunks.

---

## 9. Testing Strategy

Per T1: TDD; the existing categorize suite must stay byte-green. **No network in any test**
— the `LlmProvider` interface is the injection seam; everything uses a **fake provider**.

**`packages/core` (highest scrutiny — the engine change)**
- `keyword` precedence: exact `merchant`/`upi_note_keyword` beat `keyword`; `builtin_rule`
  beats `keyword`; `keyword` beats `null`; a description matching both a builtin and a
  keyword resolves to the **builtin**.
- substring semantics: a `keyword='swiggy'` rule matches `SWIGGY ORDER 123` (which
  `extractMerchantKey` returns null for) → `category_source='keyword_rule'`.
- `saveCategoryMemoryRule` with `ruleType:'keyword'` → priority 50, persists, unique-safe.
- **Regression:** full existing `categorize` suite unchanged (merchant/upi/builtin).
- Migration: widened CHECK accepts `'keyword'`, still rejects garbage.

**`packages/agents` (fake provider)**
- `buildCategorizationPrompt` pure output (all category ids, compact rows, keyword instr.).
- `categorizeWithAI` happy path (maps by `transactionId`).
- Chunking: 60 txns, chunkSize 25 → 3 provider calls; reassembled.
- Zod-gate: malformed JSON → retry once → skip chunk (not thrown).
- Category validation: bogus `categoryId` → suggestion dropped.
- Keyword-substring validation: keyword absent from description → applied, `keyword=null`.
- Provider errors: `rate_limit`/`network` → retry-then-skip; `provider_not_configured` →
  typed error propagates.

**`packages/api` (inject fake provider via `buildServer`)**
- `POST /categories/ai-suggest` — month-bounded uncategorized get `ai_suggested`; rows
  outside the month or already-categorized untouched; response has `suggestions/counts/usage`.
- Empty month → `{suggestions:[], counts:{total:0}}`.
- Provider not configured → 400 with clear message.
- Partial failure → 200 with `counts.skipped` + `warnings[]`.
- 200-cap → 250 uncategorized → 200 processed, remainder in `warnings`.
- `PATCH …/category {createRuleKeyword, keyword}` → creates `keyword` rule + recategorizes
  siblings (sibling flips uncategorized→`keyword_rule`); both steps (one-off promote, then
  rule-on-Yes) covered.

**`apps/web` (light — project's established frontend bar)**
- `CategoryChip` `ai_suggested` state renders violet + confidence + ✓/✗; ✓ triggers one-off
  then the second prompt; Yes wires the keyword-rule call; ✗ reverts. Component smoke tests.

**Manual verification (T1 close-out).** Live end-to-end pass documented in the manual test
plan: real Gemini key → run on a month with genuinely-unmatched plain descriptions (e.g.
"SWIGGY ORDER…") → confirm one → "Yes" → verify the `keyword` rule catches siblings + future
imports. Mirrors the live-verified merchant learn-loop from the L2 work.

**Explicitly NOT tested:** real LLM output quality/accuracy (non-deterministic; out of
scope — we test the plumbing and guards, not the model's judgment).

**Groww gate:** categorization is not under the Groww golden-master (that guards XIRR), but
per SDLC discipline the full core suite (incl. Groww 6/6) must remain green.

---

## 10. Deferred / Future Work

- **AI Settings & Usage surface (likely L4).** A dedicated Settings → AI screen owning:
  (1) **per-section model routing** — a `task → provider+model` map (e.g.
  `categorization → gemini-flash`, `taxation agent → gemini-pro`/`claude-opus`), so each
  agent picks its cost/quality tier; (2) a **usage & cost dashboard** (tokens/spend by
  section/model/time); (3) **key/provider management** (add DeepSeek/OpenAI/Claude keys,
  pick active provider per task). This slice sets it up cheaply: `LlmConfig` is resolved
  from a **task-keyed** config entry (v1 has one entry from env, but the *shape* is per-task
  routing), and the run response already returns `usage` (the dashboard's raw material).
- **Additional providers** — implement the one `openai-compatible` adapter → OpenAI +
  DeepSeek + Groq + OpenRouter + Ollama for free; implement `anthropic` for the L4 Agent SDK.
- **Claude Agent SDK + MCP tool wrapping** — L3/L4. `categorizeWithAI` is shaped as a plain
  structured-classification function so it can later be wrapped as an MCP tool / called by
  the orchestrator without rework.
- **Auto-run on import**, **persisted usage/cost**, **"Confirm all" bulk action**.

---

## 11. L4-Sequencing Tension (explicit)

The MASTER_PLAN builds bottom-up: L3 (MCP) then L4 (AI). This feature introduces the first
LLM call **before** L3/L4. That is a deliberate, bounded pull-forward, justified because:
(a) it seeds `packages/agents` (a reserved L4 slot) with a real, useful first specialist;
(b) it does **not** adopt the Agent SDK or MCP, so it doesn't pre-empt those layers' design;
(c) the `LlmProvider` interface and `categorizeWithAI` function are exactly the shapes L4
will reuse. When L3/L4 arrive, this becomes a wrapped tool + the `anthropic` adapter, not a
rewrite. Logged so future sessions don't treat this as scope-creep or an accident.
