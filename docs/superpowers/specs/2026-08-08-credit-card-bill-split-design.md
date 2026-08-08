# Credit-Card Bill Split — Design Spec

**Date:** 2026-08-08
**Tier:** T2 (light) — user override of my T1 classification.
**Branch/worktree:** worktree off `origin/main` (another session holds `feat/agent-response-calibration`).
**Design handoff:** `/Users/vkhandelwal/Downloads/design_handoff_credit_card_split/` (`README.md` + `Credit Card Split.dc.html` + `Expenses Prototype.dc.html`).

---

## 1. Problem & Goal

Today a credit-card bill payment appears in the ledger as **one opaque debit** (the
autopay/bill lump sum, e.g. `HDFC BANK CC PAYMENT ₹8,240`). The user — and the
wealth/expense agents — get **zero category-level visibility** into what that spend
actually was (dining, subscriptions, shopping…). This is the agent's single biggest
expense blind spot.

**Goal:** let the user upload that card's **statement PDF** and split the opaque bill
row into its underlying **line items**, each categorized individually, so the real
spend replaces the lump sum in totals and category breakdowns.

## 2. Scope & Tier Rationale

**T2 (light).** I originally classified this T1 (new PDF parser + the handoff's
suggestion to detect the CC bill inside the categorization engine). The user overrode
to **T2 with an explicit guardrail:** keep `packages/core/src/domain/categorize.ts`
**byte-identical** and do not edit an existing validated parser. The design honors that:

- **Detection is read-only** — no new categorization code (see §4). `categorize.ts`,
  `importTransactions.ts`, and the `/expenses` route stay byte-identical.
- **The CC statement parser is net-new code** (LLM-based) — there is no Groww golden
  master to regress; it touches no XIRR/portfolio/NAV math.
- **The one summary-SQL change** (§7) is expense-aggregation only, not financial core
  logic.

**Groww golden-master stays a standing guardrail** (must remain 6/6 green) even though
nothing financial is touched. If any slice is later forced into the frozen engine, that
slice rounds back up to T1 + Groww re-validation.

**In scope:** schema (self-FK), read-only detection + a seeded `credit_card_bill`
category, an expense-agent tagging instruction, LLM PDF parsing (with password support),
the split endpoint, totals exclusion, and the full inline-split UI.

**Deferred (out of scope):** a deterministic per-issuer PDF parser; a manual
"mark as CC bill / not a CC bill" override toggle; dedicated CC expense accounts;
auto-detecting the card/last-4 from the statement; editing an already-confirmed split's
membership beyond the normal per-child edit/delete affordances.

## 3. Data Model — one additive column

The only schema change is a self-referential foreign key on `transactions`:

```
parent_transaction_id INTEGER REFERENCES transactions(id)   -- nullable
```

Migration `packages/core/drizzle/0009_credit_card_split.sql` (hand-written `ALTER TABLE`
+ journal entry idx 9, mirroring how `note`/`tags` were added). Add the column to
`schema.ts` and an index `idx_transactions_parent` on `parent_transaction_id`.

This single column carries the entire split relationship; **no status/derived columns
are persisted:**

- A row is a **split parent** ⟺ at least one other row has `parent_transaction_id = its id`
  ("has children").
- `parsedTotal` = Σ children `amount`; `matched` = `abs(parsedTotal − parent.amount) < ₹1`.
- The README's `flagged / parsing / split / done` states are **UI-only**. On reload:
  "has children" ⇒ collapsed container (done); "no children" ⇒ normal row (flagged if
  detected). `parsing` is transient client state during the request.

**Children:**
- Inherit the parent's `accountId`.
- Get their own unique `dedupeKey` (reuse the `insertManual` key scheme:
  `cc_<parentId>_<date>_<desc>_<amount>_<Date.now()>_<idx>` to guarantee uniqueness).
- `sourceType = 'cc_statement'`, `importHistoryId = null`.
- Auto-categorized at creation via the **pure** `resolveCategoryFromRules`
  (calling the frozen function is allowed; editing it is not).
- `parent_transaction_id = <parent id>`.

**Parent** is otherwise unchanged (keeps its own `amount`, `categoryId`, etc.), but is
excluded from spend aggregation once it has children (§7).

**Repo additions** (`ExpenseTransactionRepo`):
- `insertChild(parentId, tx)` → inserts a child row, returns new id.
- `listChildren(parentId)` → children rows (for the expand view).
- `hasChildren(id)` helper OR expose `parentTransactionId` on `query()` rows so the UI
  can compute container-ness. **Decision:** add `parentTransactionId` to the `query()`
  select so a single `/expenses` call returns everything the ledger needs (a row is a
  container if its id appears as another row's `parentTransactionId`). Also add an
  optional `parentId` filter to `query()` for lazy child fetch if ever needed (the UI
  can also derive children client-side from the same page — see §8).

## 4. Detection — read-only, zero new code path

**No detection helper, no derived route field, no import-path change.** The UI shows the
CC badge + upload button when a row is a CC bill, decided purely from data the
`/expenses` query **already returns**:

```ts
const isCreditCardBill =
  row.categoryId === 'credit_card_bill' ||
  row.tags.some((t) => t.tag === 'credit_card_bill');
```

The badge + upload button render when `isCreditCardBill && !isContainer` (a row that
already has children is a done container, not a flag target).

How a row acquires the marker uses **only existing machinery:**

1. **Seed a `credit_card_bill` starter category** in `seedDatabase` (additive data, not
   frozen logic) so it is pickable in the `CategoryChip` picker and assignable by a
   merchant/keyword rule. Name: "Credit Card Bill".
2. **`credit_card_bill` tag** — set by the user via `TagChips`, or by the expense agent
   via the existing `tag_transaction` MCP tool.

**Expense-agent instruction (additive prompt text).** In `packages/agent-harness`
`buildExpenseAgent`, add one line to the focused instructions:

> "If a transaction looks like a credit-card bill payment (autopay/bill narration for a
> card), tag it `credit_card_bill` via `tag_transaction`."

This connects the two features: the agent (or a rule, or the user) marks the row →
badge + upload appear. No code path, no core touch.

## 5. PDF Parsing — LLM via the gateway

Chosen over a deterministic per-issuer parser: robust to layout variance across issuers,
fits the AI-product north star, reuses the gateway's cost tracking. (A deterministic
parser remains a future drop-in behind the registry.)

**Text extraction** — `packages/api/src/lib/pdfText.ts`, isolated:
- `extractPdfText(buffer: ArrayBuffer, password?: string): Promise<string>`.
- Uses `pdfjs-dist` (accepts a `password` option) — **not** `pdf-parse` (no decryption).
- Password is a **function argument only**: never written to DB, never logged.
- Throws typed errors the endpoint maps to clean messages (§6):
  `PdfPasswordRequiredError`, `PdfPasswordIncorrectError`, generic extract failure.

**LLM extraction** — `packages/agents`:
- New AI task `cc_statement_parse` in `AI_TASKS` (`tasks.ts`), independently routable in
  AI Settings.
- `parseCcStatement(complete, statementText)` → prompt returns strict JSON, Zod-validated:
  ```
  { lineItems: [{ date: 'YYYY-MM-DD', merchant: string, amount: number }],
    detectedTotal: number | null }
  ```
- One retry on bad JSON, then throw (nothing partial written). Rethrows auth /
  provider-not-configured (endpoint → 502). One `ai_usage_events` row per call — same
  pattern as `categorizeWithAI`/`triageInsights`.
- Amounts are absolute spend amounts (debits); payments/credits/refunds on the statement
  are excluded by the prompt (they net against the bill, not part of the spend split).

## 6. Endpoint

**`POST /transactions/:id/split-from-statement`** (multipart).

- Body: `file` (the statement PDF, required) + `password` (optional field).
- Flow:
  1. Load parent txn (`getById`); 404 if missing. If it already has children → 409
     "Already split." (idempotency guard).
  2. `extractPdfText(buffer, password)`.
  3. `gateway.runTask('cc_statement_parse', complete => parseCcStatement(complete, text))`.
  4. For each line item: `insertChild(parentId, …)` inside `runInTransaction`
     (all-or-nothing), auto-categorized via `resolveCategoryFromRules`.
  5. Return `{ data: { parentId, parentAmount, parsedTotal, matched, children: [...] } }`.
- **No confirm-preview step** — children are created directly, user reviews inline (per
  README §2/§3).
- **Error handling (all surface to the user; nothing written on failure):**
  | Condition | HTTP | Message |
  |---|---|---|
  | Missing file | 400 | "Missing file upload." |
  | Encrypted, no password | 400 | "This statement is password-protected. Enter the PDF password and try again." |
  | Wrong password | 400 | "Couldn't open the PDF — the password may be incorrect." |
  | Extract/parse yields no line items | 400 | "Couldn't read line items from this statement." |
  | Gateway auth / not configured | 502 | (existing ai-suggest convention) |
  | Parent not found | 404 | "Transaction not found." |
  | Already has children | 409 | "This transaction is already split." |
- Children insertion is atomic (`runInTransaction`); a mid-loop failure rolls back so we
  never leave a half-split parent.

**Reading children:** the existing `GET /expenses` returns `parentTransactionId` on each
row, so the UI already has children in the page; no new read endpoint required. (A
`?parentId=` filter is added to `query()` for robustness/large months.)

## 7. Totals — exclude split parents

`expenseTxRepo.summary()` must exclude any transaction that **has children**, so the
opaque parent lump sum is not double-counted with the children that carry the real
categorized spend. Add a shared condition to the window/spend conditions:

```sql
transactions.id NOT IN (
  SELECT parent_transaction_id FROM transactions
  WHERE parent_transaction_id IS NOT NULL
)
```

This is an **expense-aggregation SQL change only** — no XIRR/portfolio/categorize/NAV
math. No Groww re-validation triggered.

`query()` (the ledger list) still returns parents (the UI renders them as collapsed
containers) — only `summary()` excludes them.

## 8. Frontend

Recreate the handoff mockup using existing components/tokens (do **not** port the raw
HTML). Chosen direction: **inline-expand** (README §3).

**`ExpensesPage.tsx` `TransactionRow`:**
- Compute `isCreditCardBill` (§4) and `isContainer` (id appears as another visible row's
  `parentTransactionId`).
- If `isCreditCardBill && !isContainer`: render the **"Credit card bill" badge**
  (reuse/extend `BADGE_STYLES` `market`-style, `ExpensesIcon` glyph) under the merchant,
  and a **32×32 upload icon button** at the end of the row → opens the split modal.
- If `isContainer`: render the **collapsed dashed "container" row** — chevron toggle,
  "Credit card bill · {n} items, split", muted total, an "excluded from totals" tag;
  expanded shows children indented with a left connector, each a normal editable
  transaction row (its own `CategoryChip`/edit/delete).

**New components (`features/expenses/`):**
- `SplitStatementModal.tsx` — reuses `Modal`; context line, dashed drop-zone (file input),
  **optional "PDF password (if protected)" text input**, "Parse statement" primary
  button. On submit → `useSplitFromStatement` → on success opens the inline split panel;
  on error shows the message inline (and keeps the row `flagged`).
- `SplitPanel.tsx` — the inline-expand review panel: uppercase label, **reconciliation
  bar** (green matched / amber mismatch with delta, live-recomputed), line-item rows
  (merchant + `CategoryChip` reusing `useUpdateTxCategory` + amount), "+ Add missing
  line" (creates a child via the manual-add flow), "Confirm split" (collapses to
  container — pure client state transition, categorization already written per-line).

**Hooks (`lib/hooks.ts`):** `useSplitFromStatement(parentId)` mutation (multipart POST),
invalidating `['expenses']`, `['expenseSummary']`, and `['expenseInsights']` on success
(so totals + insights self-heal). Children edits reuse existing
`useUpdateTxCategory`/update/delete hooks.

**Icons (`components/ui/icons.tsx`):** add an `UploadIcon` (arrow-into-tray, matching the
24×24/stroke-1.8 convention). Chevron/checkmark reuse existing conventions.

**Types (`types.ts`):** `ExpenseRow` gains `parentTransactionId: number | null`. New
`SplitResult` type for the endpoint response.

## 9. Testing (T2 — tests for new logic, no full ceremony)

- **core (unit):** `insertChild` + `listChildren` + `parentId`/`parentTransactionId` on
  `query()`; `summary()` excludes parents-with-children (double-count regression);
  migration applies. Groww golden-master **6/6 unchanged** (guardrail).
- **agents (unit):** `parseCcStatement` with a fake `complete` — valid JSON, bad-JSON
  retry, empty line items, credits excluded.
- **api (inject):** split endpoint with a fake gateway + fixture extracted text — happy
  path (children created, reconciliation matched/mismatch), 404/409/400 error cases;
  `pdfText` password-required / wrong-password / success against a tiny fixture PDF.
- **web (light):** `useSplitFromStatement` invalidation; `TransactionRow` badge/container
  rendering smoke.
- `tsc --build` clean across the graph.

## 10. Components at a glance (isolation)

| Unit | Purpose | Depends on |
|---|---|---|
| migration `0009` + `schema.ts` | `parent_transaction_id` column + index | — |
| `expenseTransactionRepo` (`insertChild`/`listChildren`/`query` parentId + `summary` exclusion) | persist/read the split relationship; keep parents out of totals | Drizzle, schema |
| `seedDatabase` (`credit_card_bill` category) | make the marker pickable | categories |
| `api/lib/pdfText.ts` | PDF → text, optional password, typed errors | `pdfjs-dist` |
| `agents` `cc_statement_parse` + `parseCcStatement` | text → structured line items | gateway `complete`, Zod |
| `POST /transactions/:id/split-from-statement` | orchestrate parse → insertChild → reconcile | repo, pdfText, gateway, `runInTransaction`, `resolveCategoryFromRules` |
| `agent-harness` `buildExpenseAgent` prompt | agent tags `credit_card_bill` | existing `tag_transaction` |
| web `SplitStatementModal` / `SplitPanel` / `TransactionRow` / `useSplitFromStatement` / `UploadIcon` | detection UI, upload+password, inline split, container | existing UI kit + hooks |

## 11. Gotchas / Build Notes

- Node 22 (`nvm use 22`); **never `pnpm install`** (crashes) — build/test via
  `node_modules/.bin/{tsc,vitest}`; run via `tsx` (never compile). Adding `pdfjs-dist`
  needs a careful install — confirm the working install command at plan time.
- `tsc --build` graph order: core → agents → api → agent-harness → web.
- Password must never reach logs — audit `logImport`/request logging on the new route.
- Worktree off `origin/main` (has PR #14 UI revamp + #15). Push via
  `gh auth switch --user ak688744`.
- `categorize.ts` byte-identical is the T2 guardrail — verify with a diff before PR.
