# Expense AI Insights + Notes→Tags + Expense Clarity Agent — Design

**Date:** 2026-08-05
**Tier:** T1 (new architectural surfaces: tags data model, insights contract, a new
agent + sidebar-chat surface). **No frozen financial logic touched** → Groww
golden-master 6/6 unchanged, no re-validation triggered.
**Branch:** `feat/expense-ai-insights-tags` off `feat/agent-response-calibration`
(reuses the `ask_user` / question-chips machinery built there).
**Layer context:** part of L4; the Expense Clarity Agent is an early, focused slice
of L4.1's planned "expense specialist."

---

## 1. Goal & North Star

On the Expenses page, surface **deterministic AI insight cards** that flag
transactions needing attention. Clicking a card opens a **right-side chat drawer**
scoped to that insight, where a dedicated **Expense Clarity Agent** works the flagged
transactions conversationally — categorizing, disambiguating, and recording
structured **tags** from the user's answers. Separately, migrate the free-text `note`
annotation to first-class, source-tracked, queryable **tags**.

**Agent mission (single responsibility):** *total clarity over every rupee* — every
transaction categorized, disambiguated, and tagged so the wealth agent has clean,
well-understood expense data to reason over. The agent finds ambiguities with tools,
resolves categorization at high confidence (else leaves blank), and talks to the user
to fill the remaining gaps.

**The clarity loop this creates:**
```
import → rules categorize (frozen engine)
       → confident AI categorization (≥90%, writes rules, else LEAVE BLANK)
       → blank/vague txns surface as `needs_clarity` insights
       → user clicks insight → Expense Agent chat → user explains
       → agent categorizes + tags with the new knowledge → insight self-heals
```

---

## 2. Scope

### In scope (this build): three subsystems A, B, C

| # | Subsystem | Layers touched |
|---|-----------|----------------|
| A | **Tags data model** | core (schema/repo) + api + mcp + web |
| B | **Insight detectors** | core (pure domain) + api + web |
| C | **Expense Clarity Agent + sidebar chat + confidence-gated categorization** | agents + agent-harness + api + web |

### Deferred (logged, NOT built)
- **E — transaction vectorization / semantic search (own future T1).** RAG over
  transactions is genuinely new infrastructure (no embedding column/vector table over
  finance data today; the only vector index in-repo is Mastra *agent-memory* message
  embeddings in a separate DB). When built, it is justified **primarily by semantic
  search / grouping / insights and the long-tail residue — NOT as the core
  categorization mechanism** (transaction matching is mostly lexical, which
  rules + `extractMerchantKey` already handle). Aligns with the MASTER_PLAN
  pgvector-in-same-DB arc.
- **Bulk "Suggest tags with AI" pass** — dropped. Tags represent the user's *stated
  intent* ("is this recurring?" usually needs the user's knowledge, unlike a category
  which is inferable from the merchant), so tags are written only where intent is
  captured: the insight-scoped chat + manual UI. No `suggestTagsWithAI`, no
  `POST /expenses/ai-tag`.
- **`web_search` tool + provider** — a new external surface (provider, key, AI-Settings
  entry, cost, hallucination risk). Its own focused build; also serves the L4
  Investment-Analyzer "fetch news" vision.
- **`recurring-not-tagged` detector** — deferred; the three v1 detectors below suffice.
- **Auto-run-on-import** — all triggers in v1 are user-initiated (see §7). The agent
  never runs unattended.

---

## 3. Subsystem A — Tags data model

### 3.1 Schema (core, migration `0007`)
Add a nullable `tags TEXT` column to the `transactions` table, storing a JSON array
of `{ tag: string, source: 'user' | 'agent' }`. **No new table** — tags ride along on
every transaction read, which matches the dominant access pattern (the agent/UI reads
whole transaction sets and wants tags attached per row). Mirrors how `note` (migration
0005) was added. The `note` column **stays** for free-text nuance (e.g. "quarterly").

**Rationale for JSON-over-junction-table:** at single-user volume (thousands of rows),
a junction table's indexed `WHERE tag = X` / `GROUP BY tag` wins are marginal, while it
costs a join on every transaction read plus a new repo + endpoints. The primary query
is "read transactions, tags come along," which the JSON column serves directly.
`source` is kept (objects, not bare strings) so the UI can distinguish agent-suggested
tags from user-set ones (mirrors the violet `ai_suggested` category treatment).

### 3.2 Tag normalization
Tags are stored **lowercase, trimmed, deduped within a row** (dedupe by `tag`;
last-writer-wins on `source`). Tags are **free strings** (the agent can invent useful
ones), but a curated **starter vocabulary** is offered as UI suggestions and named in
the MCP tool description:
`recurring`, `one-time`, `subscription`, `reimbursable`, `work`, `personal`.

### 3.3 Repo methods (`ExpenseTransactionRepo`, synchronous, better-sqlite3)
- `getTags(id): { tag, source }[]` — parse JSON, `[]` if null/blank.
- `setTags(id, tags: { tag, source }[]): void` — replace (write normalized JSON; write
  `null` when the array is empty).
- `addTags(id, tags: { tag, source }[]): void` — merge with existing, dedupe by tag
  (last-writer-wins on source).
- `removeTag(id, tag: string): void` — drop one tag (case-insensitive match).
- `ExpenseTransactionRow` gains `tags: { tag, source }[]` (parsed) so `query()` returns
  tags inline — no extra fetch for UI or agent.

All tag helpers are pure JSON manipulation over a `tags` string; a small internal
`normalizeTags(raw): {tag,source}[]` handles parse + lowercase + trim + dedupe and is
reused by every method. This touches **no** financial logic (`domain/categorize.ts`
byte-identical).

### 3.4 API endpoints (`packages/api`, additive)
- `PATCH /transactions/:id/tags` — body `{ tags: string[], mode: 'add' | 'replace' }`;
  writes with `source: 'user'`; returns the updated `{ tags }`. 404 on unknown id.
- `DELETE /transactions/:id/tags/:tag` — remove one tag; returns updated `{ tags }`.
  404 on unknown id.
- Tags already flow OUT via the existing `GET /expenses` (through `query()`), so no read
  endpoint changes beyond the `tags` field appearing on each row.

### 3.5 MCP write tool (`packages/mcp/src/tools/write/transactions.ts`)
New `tag_transaction(id, tags: string[], mode: 'add' | 'replace')` → `addTags`/`setTags`
with `source: 'agent'`. **Not preview-gated** (additive/reversible). Unknown id → error
result. Description names the starter vocabulary and explains one-time/recurring/
subscription semantics so the agent tags consistently. **MCP write-tool count 22 → 23.**

### 3.6 Web (Expenses page)
Tags render as small **chips** on each expense row (alongside the existing note
affordance). Agent-set chips (`source: 'agent'`) are visually distinct from user-set
(mirrors the violet AI treatment). Inline add (from starter vocabulary + free text) and
remove per row, wired to the PATCH/DELETE endpoints via new TanStack hooks.

---

## 4. Subsystem B — Insight detectors

### 4.1 Where the logic lives
New pure module `packages/core/src/domain/insights/expenseInsights.ts`:
`computeExpenseInsights(input): Insight[]`, deterministic over data the caller injects
(transaction rows for the selected month + the prior lookback window). Pure,
repo-injected, no Drizzle (seam invariant holds). **Descriptive analytics, NOT
financial logic** — no XIRR/portfolio/categorize — so no Groww implication despite being
new `domain/` code.

### 4.2 The `Insight` shape (reuses the design-spike's reserved "text + severity + CTA" slot)
```ts
type InsightType = 'needs_clarity' | 'new_spend' | 'abnormal_spend';
type Insight = {
  id: string;              // STABLE, deterministic — enables localStorage dismissal.
                           //   e.g. "needs-clarity:2026-08", "new-spend:merchant:ACMEGYM",
                           //        "abnormal-spend:food_dining:2026-08"
  type: InsightType;
  severity: 'info' | 'warn';
  title: string;           // templated, e.g. "3 transactions need clarity"
  detail: string;          // e.g. "Food & Dining is 52% above your 3-month average"
  transactionIds: number[];// affected txns — seed the chat + let the card scope
  cta: { label: string };  // e.g. "Review in chat"
};
```

### 4.3 The three detectors (v1), all for the selected month `M`
1. **`needs_clarity`** (`info`) — transactions in `M` that are uncategorized
   (`categoryId === null`) **OR** vague (`deriveMerchantName(description) === null`),
   **AND** not already tagged. Grouped into **one** card; `transactionIds` = all flagged.
   This detector consumes the leave-blank output of confidence-gated categorization (§5.4).
2. **`new_spend`** (`info`) — merchants (keyed by `deriveMerchantName`, else normalized
   description) appearing in `M` but **not** in the prior `LOOKBACK_MONTHS` (3). One card
   per new merchant with month total `≥ NEW_SPEND_MIN_INR` (500), capped at
   `NEW_SPEND_TOP_N` (5) by amount.
3. **`abnormal_spend`** (`warn`) — per category, compare `M` spend to the trailing
   `LOOKBACK_MONTHS` (3) average (reuses `expenseTxRepo.summary` byCategory/byMonth).
   Flag when `M > ABNORMAL_RATIO (1.4) × avg` **AND** the absolute jump
   `≥ ABNORMAL_MIN_JUMP_INR` (1000) — the AND guard kills "₹200 vs ₹120 = +67%" noise.
   One card per flagged category.

All thresholds are **named constants** at the top of the module (`LOOKBACK_MONTHS`,
`NEW_SPEND_MIN_INR`, `NEW_SPEND_TOP_N`, `ABNORMAL_RATIO`, `ABNORMAL_MIN_JUMP_INR`),
easy to tune. Empty data → `[]`.

### 4.4 Repo support
Prefer **reusing `query()`** over a wider window (M + 3 prior months, one fetch) and
doing the merchant/category grouping **inside the pure module** (keeps all detector logic
in one testable place, minimizes new repo surface). `summary()` already provides
byCategory/byMonth for the abnormal detector. No new financial repo methods.

### 4.5 API
`GET /expenses/insights?month=YYYY-MM` → `{ data: Insight[] }`. Wires repo reads →
`computeExpenseInsights(...)`. **No LLM** — pure/deterministic/cheap.

### 4.6 Web — lifecycle
- Cards render on the Expenses page, computed via a TanStack-cached fetch of
  `/expenses/insights` keyed by month. **Re-fetches on month change / query
  invalidation, NOT on every render.**
- **Self-heal:** tagging/categorizing a flagged txn invalidates the insights query, so
  resolved items drop from cards automatically.
- **Dismissal:** client-side only — dismissed insight `id`s stored in `localStorage`
  (keyed list). A pure recompute would otherwise resurface a dismissed card. No
  server-side dismissal table (over-engineered for single-user).

---

## 5. Subsystem C — Expense Clarity Agent + sidebar chat + categorization change

### 5.1 New agent (`packages/agent-harness/src/expenseAgent.ts`)
`buildExpenseAgent({ model, memory, tools })` — mirrors `buildWealthAgent` structure with:
- **Mission prompt:** ensure total clarity over every rupee — categorize →
  disambiguate → tag. Find ambiguities with tools; resolve categorization at high
  confidence; talk to the user to fill gaps and record tags. Includes the
  answer-first / anti-verbosity calibration discipline already in the wealth agent's
  instructions.
- **Isolated memory:** a **distinct memory resource id** (`expense-agent`) so its
  clarification/tagging chatter never pollutes the wealth agent's advisory
  semantic-recall pool (the known memory-pollution vector). Same LibSQL store engine,
  separate resource scope.
- **Focused toolset:** `getFinanceTools()` (namespaced `finance_<tool>`) **filtered to an
  allowlist**, plus the local `ask_user` tool. Allowlist (a named constant; unknown
  names skipped defensively), using the **real** MCP tool names:
  `finance_list_transactions`, `finance_get_expense_summary` (reads),
  `finance_list_categories` (**NEW read tool — see below**),
  `finance_categorize_transaction`, `finance_tag_transaction`,
  `finance_create_category`, `finance_create_rule` (writes it needs), + `ask_user`.
  **NOT** investment/loan/networth tools — keeps it on-mission, smaller context, cheaper.
- **NEW `list_categories` read tool required.** The current MCP server exposes 10 read
  tools; **none** returns the category catalog. The agent cannot categorize without
  knowing the available category ids, so this build adds a small additive
  `list_categories` read tool (`packages/mcp/src/tools/read/`, over `categoryRepo` —
  read-only, no financial logic) → MCP read-tool count 10 → 11. (`create_rule` /
  `create_category` already exist as write tools.)

### 5.2 New AI task (`packages/agents/src/tasks.ts`)
Add `expense_agent` to `AI_TASKS` (label "Expense Clarity Agent",
`defaultDialect: 'gemini'`). Independently routable/priced in the existing AI Settings
surface (can run on a cheaper model than the Opus `wealth_chat` — this is high-volume
clarification work, not deep advice). Records its own `ai_usage_events` (task
`expense_agent`), one row per turn.

### 5.3 Harness (`packages/agent-harness/src/runChat.ts`)
`runChat` gains an optional `agent: 'wealth' | 'expense'` (default `'wealth'`). One
parameterized code path selects: the route (`wealth_chat` vs `expense_agent`), the
builder (`buildWealthAgent` / `buildExpenseAgent`), the tool filter, and the memory
resource id. The stream contract (`text` / `step` / `question` events; usage; one
`ai_usage_events` row/turn) is otherwise unchanged.

### 5.4 Confidence-gated categorization (behavior change to `/categories/ai-suggest`)
The existing "Suggest with AI" categorize pass is modified:
- **Rules still run first** at import (frozen `categorize.ts`, unchanged). The
  uncategorized residue (`listUncategorizedInRange`) is the AI work-list.
- The model proposes a category **only at ≥ 0.9 confidence** (`AI_CATEGORIZE_MIN_CONFIDENCE`).
  `categorizeWithAI`'s Zod output gains a `confidence: number` field; below-threshold
  suggestions are **dropped (left blank)** — the deliberate departure from today's
  always-assign behavior.
- On a confident decision where a merchant/keyword is derivable, **also write a rule**
  (via the existing `categorize_transaction` `learnRule` path) so each confident
  decision becomes an exact, free, explainable memory the frozen engine applies next
  time. (Model-knowledge + rule-writing is the categorization strategy this build —
  NOT vectors.)
- Left-blank txns surface as `needs_clarity` insights (§4.3.1), closing the loop.

**This is not a change to the frozen rule engine** — `categorizeWithAI` /
`ai-suggest` are the non-frozen AI layer in `packages/agents`, writing category via
`updateCategory(source='ai_suggested')`. Groww unaffected. Existing `ai-suggest` tests
are updated to assert the new confidence-gate + leave-blank behavior (intentional
behavior change, called out explicitly).

### 5.5 Web — extracted `ChatPanel` + sidebar drawer
- **Extract `ChatPanel`** from `AssistantPage.tsx`: the chat internals (message list —
  user/assistant bubbles, `Markdown`, `StepsTrail`, `QuestionChips` — streaming state,
  input box). `AssistantPage` becomes a thin full-page shell around `ChatPanel`. One
  chat implementation, two shells; no divergence.
- **`useAgentChat` parameterized** with optional `{ storageKey?, persist?, agent?,
  seedMessage? }`. Defaults preserve today's behavior for `AssistantPage` (wealth,
  persisted, global key). The drawer passes `agent: 'expense'`, `persist: false`
  (fresh ephemeral thread per insight session — scoped task, not the ongoing advisory
  thread), and an auto-sent `seedMessage`.
- **`ExpensesInsightDrawer`** — a right-side slide-over rendering `ChatPanel`, opened by
  a card's CTA. On open it auto-sends a seed message composed by a **pure
  `buildInsightSeed(insight)`** function, e.g.:
  > "I'm reviewing these flagged transactions from the Expenses page because
  > *{insight.detail}*. Transactions: {#id "desc" ₹amount; …}. Please help me understand
  > each and tag them appropriately (subscription / recurring / one-time). Ask me about
  > any you're unsure of."
  On close (or after tag/category writes), the drawer invalidates the expenses +
  insights queries so tag chips and cards refresh.

### 5.6 API — chat route
`POST /agent/chat` gains an optional `agent` field (default `'wealth'`) passed through to
`runChat`. **Client composes the seed message** (chosen mechanic) and sends it as a
normal message — no structured `context` field, no server-side insight refetch. The
existing SSE stream contract (`start`/`token`/`step`/`question`/`done`/`error`) is
unchanged; the drawer already handles all frames.

---

## 6. Data flow (end-to-end)

```
Expenses page load
  └─ GET /expenses/insights?month=M  (deterministic, no LLM)
       └─ repo query(M + 3 prior) + summary → computeExpenseInsights → Insight[]
  └─ cards render (minus localStorage-dismissed)

User clicks a `needs_clarity` card
  └─ ExpensesInsightDrawer opens → ChatPanel (agent:'expense', persist:false)
       └─ auto-send buildInsightSeed(insight)
            └─ POST /agent/chat { message, agent:'expense' }
                 └─ runChat(agent:'expense') → buildExpenseAgent
                      (expense_agent route, isolated memory, focused tools)
                      ├─ list_transactions / get_expense_summary  (inspect)
                      ├─ ask_user  → SSE question → QuestionChips  (clarify intent)
                      ├─ categorize_transaction (+ learnRule)      (resolve category)
                      └─ tag_transaction (source:'agent')          (record tag)
  └─ drawer close → invalidate expenses + insights queries → cards self-heal, chips show

"Suggest with AI" (categories) click
  └─ POST /categories/ai-suggest → categorizeWithAI (confidence ≥0.9, else leave blank,
     write rule on confident derivable) → blanks feed needs_clarity next load
```

---

## 7. Triggers (all user-initiated in v1)

| Trigger | Kind | Runs LLM? |
|---|---|---|
| Expenses page load → insight cards | automatic | **No** (deterministic) |
| Click an insight card → sidebar chat | interactive | Yes (expense_agent) |
| "Suggest with AI" (categories) button | bulk, non-conversational | Yes (categorization task) |
| Manual tag chip add/remove | user write | No |

The agent never runs unattended. Auto-run-on-import is deferred (§2).

---

## 8. Testing (TDD)

- **A (tags):** repo `getTags/setTags/addTags/removeTag` + `normalizeTags`
  (lowercase/trim/dedupe/last-writer-source, empty→null) unit tests; `query()` returns
  parsed `tags`; API PATCH add-vs-replace + DELETE + 404s; MCP `tag_transaction`
  add/replace + unknown-id error; web tag-chip render/add/remove smoke.
- **B (insights):** pure `computeExpenseInsights` fixtures per detector —
  needs_clarity flags uncategorized+vague but skips tagged; new_spend respects
  lookback + min-INR floor + top-N cap; abnormal respects **both** ratio and absolute
  floor; stable ids; empty→[]. Endpoint wiring test.
- **C (agent/chat/categorization):** `buildInsightSeed` pure test; expense-agent
  toolset-filter test (allowlist applied, investment/loan tools absent); harness `agent`
  selection test (routes to `expense_agent` task + isolated memory resource); a
  mock-model turn that calls `tag_transaction`; **updated `ai-suggest` tests** asserting
  confidence-gate + leave-blank + rule-write-on-confident; `ChatPanel` render smoke;
  `useAgentChat` persist-toggle test.

---

## 9. T1 gate / invariants

- **Groww golden-master 6/6 unchanged** — zero change to `domain/categorize.ts`,
  XIRR, portfolio, parsers, NAV. The AI categorization change is in the non-frozen
  `packages/agents` layer.
- **Seam invariant** — no Drizzle / better-sqlite3 import in `agent-harness/src`,
  `mcp/src`, or `core/domain` (the new `expenseInsights.ts` is pure, repo-injected).
- **Full suite green** across core / agents / api / mcp / agent-harness / web;
  `tsc --build` clean across the graph.
- Node 22; `tsx` (never compile); push via `gh auth switch --user ak688744`.

---

## 10. Component summary (files)

**core:** `db/schema.ts` (+`tags` col), `drizzle/0007_*.sql`,
`repositories/types.ts` + `expenseTransactionRepo.ts` (tag methods, `tags` on row),
NEW `domain/insights/expenseInsights.ts`, `index.ts` exports.
**agents:** `tasks.ts` (+`expense_agent`), `categorizeWithAI` (+`confidence`, gate).
**mcp:** `tools/write/transactions.ts` (+`tag_transaction`), NEW `tools/read/categories.ts`
(`list_categories`), `server.ts` registration.
**api:** `routes/transactions.ts` (tags PATCH/DELETE), `routes/expenses.ts`
(+`/insights`), `routes/agent.ts` (+`agent` field), `/categories/ai-suggest` change.
**agent-harness:** NEW `expenseAgent.ts`, `runChat.ts` (+`agent` param + memory
resource selection).
**web:** NEW `ChatPanel.tsx`, NEW `ExpensesInsightDrawer.tsx`, NEW insight card
components, `AssistantPage.tsx` (use `ChatPanel`), `useAgentChat.ts` (params),
`ExpensesPage.tsx` (cards + tag chips + drawer), hooks + query keys, `buildInsightSeed`.
