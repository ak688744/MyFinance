# L4 — MCP Write Tools (Design Spec)

**Date:** 2026-07-16
**Layer:** L4 (first slice — the mutation tool contract the wealth-manager agents will use)
**Tier:** T1 (new architectural surface: mutation tools + a safety model)
**Groww re-validation:** **Not triggered.** Every write tool is a thin wrapper over an
existing `@myfinance/core` repo/domain method; none touch the Groww-frozen logic
(categorize/XIRR/portfolio/parsers). Net diff touches only `packages/mcp`. Standing gate:
Groww golden-master **6/6 unchanged**.

Related: L3 build decision `0abb8b24`; L4 write-tools stance decision `1cc41d48`;
L3 spec `docs/superpowers/specs/2026-07-11-l3-mcp-server-design.md` (§8 reserved the write seam).

---

## 1. Goal

Give the (future L4) agents the ability to do **everything the user can do on the
dashboard** — add/edit/delete transactions, categorize + learn rules, manage
categories/rules/accounts/assets/liabilities — through the MCP tool contract.

This is the write half of the tool contract L3 deliberately reserved
(`packages/mcp/src/tools/write/` empty + `runInTransaction` built-unused). It is a
**tool-contract layer, not the agents themselves** — the Claude Agent SDK orchestrator
and specialist agents that *call* these tools are the broader L4 work that follows.

---

## 2. Guiding stance (locked)

Prefer a **small set of complete, composable write primitives + tool descriptions that
teach multi-step recipes** over one-tool-per-user-intent. The agent should be smart enough
to compose (e.g. split = shrink original + add remainder; move = update account;
duplicate-for-next-month = add with shifted date). Keeps the catalog small — context window
is the scarce resource (L3 principle).

**Explicitly NO `split_transaction` tool** — composed from `update_transaction` +
`add_transaction`.

---

## 3. Architecture

Extends the existing `packages/mcp` package. **No new package.**

```
packages/mcp/src/
  context.ts            ← unchanged; runInTransaction (reserved-unused in L3) now USED
  server.ts             ← also calls the register*WriteTools(server, ctx) fns
  shared/output.ts      ← add preview() helper alongside ok()/errorResult()
  tools/
    read/   …           ← unchanged (10 L3 read tools)
    write/              ← NEW
      transactions.ts   ← add/update/delete/categorize_transaction
      categories.ts     ← create/rename/delete_category, create/update/delete_rule, recategorize_all
      accounts.ts       ← create_account
      assets.ts         ← add/update/close/delete_asset + add_asset_{contribution,valuation,rate}
      liabilities.ts    ← add/update/delete_liability
```

- **Module pattern** mirrors `tools/read/*` exactly: each file exports pure
  `run<Name>(ctx, input): Promise<ToolResult>` handlers + `register<Name>Tools(server, ctx)`.
- **Data access = direct-to-core**, identical to reads. Every write is a **thin wrapper**
  over an existing core repo/domain method (verified present — see §4). **Zero core change.**
- **Transactions:** a handler performing multiple repo writes wraps them in
  `ctx.runInTransaction(fn)` so the *handler* is atomic. (Cross-*tool-call* atomicity — the
  split recipe — is out of scope; see §6.)
- **Registration:** write tools are **always registered** (see §5 D-flag). `buildServer(ctx)`
  signature is **unchanged** — it simply also calls the write registrars.
- **Seam invariant preserved:** no drizzle/better-sqlite3 import in `mcp/src`.

---

## 4. Tool catalog (~22 primitives)

`⚠` = **preview-gated** (requires `confirm: true`; without it returns an impact summary and
mutates nothing — see §6). All money inputs/outputs use the L3 unit-safety labels: `*Inr`
for money, `*Percent` for rates.

### Transactions (`write/transactions.ts`)
| Tool | Wraps | Notes |
|---|---|---|
| `add_transaction` | `expenseTxRepo.insertManual` | date, description, amountInr, direction (`in`\|`out`), categoryId?, note?, accountId?. Self-generates a unique `dedupeKey`. **Description teaches** the split & duplicate-for-next-month recipes. |
| `update_transaction` | `updateAmount` / `updateNote` | amountInr and/or note. **Description teaches** the split recipe (shrink here → `add_transaction` for remainder → read back to verify). |
| `categorize_transaction` | `updateCategory(source='manual')` (+ optional `learnRule`) | `learnRule: 'merchant' \| 'keyword'` → `saveCategoryMemoryRule` + `recategorizeNonManualTransactions`, all inside one `runInTransaction`. |
| ⚠ `delete_transaction` | `deleteTransaction` | |

### Categories & rules (`write/categories.ts`)
| Tool | Wraps | Notes |
|---|---|---|
| `create_category` | `categoryRepo.create` | id slugified from name; 409-style `isError` if exists. |
| `rename_category` | `categoryRepo.rename` | |
| ⚠ `delete_category` | `categoryRepo.delete` | Cascade: reassign tagged txns → Uncategorized (null) + drop dependent rules. Preview shows both counts. |
| `create_rule` | `categoryRuleRepo.createRule` | ruleType `merchant\|keyword`; empty pattern → `isError`. |
| `update_rule` | `categoryRuleRepo.updateRuleCategory` | |
| ⚠ `delete_rule` | `categoryRuleRepo.deleteRule` | |
| ⚠ `recategorize_all` | `recategorizeNonManualTransactions` | Re-runs categorization over all non-manual txns. Preview shows affected count. **No hard cap.** |

### Accounts (`write/accounts.ts`)
| Tool | Wraps | Notes |
|---|---|---|
| `create_account` | `accountRepo.ensureAccount` | Find-or-create by (domain, institution, label); returns id. Idempotent by design. |

### Assets (`write/assets.ts`) — Family 2/3 (FD/PPF/EPF/NPS/gold/real-estate/cash)
| Tool | Wraps | Notes |
|---|---|---|
| `add_asset` | `assetRepo.create` | accountId, assetClass, name, valuationStrategy (`computed\|manual`), ingestionMode?, params?, openedAt?. |
| `update_asset` | `assetRepo.update` | name/status/params/openedAt. |
| `close_asset` | `assetRepo.update({status:'closed'})` | Distinct tool for agent clarity; same underlying call as `update_asset`. |
| `add_asset_contribution` | `assetContributionRepo.insert` | append-only (PPF/EPF/NPS recurring deposits, FD single). |
| `add_asset_valuation` | `assetValuationRepo.insert` | append-only (manual stated-value time series). |
| `add_asset_rate` | `assetRateRepo.insert` | append-only (rate schedule; govt PPF resets). |
| ⚠ `delete_asset` | `assetRepo.delete` | |

### Liabilities (`write/liabilities.ts`)
| Tool | Wraps | Notes |
|---|---|---|
| `add_liability` | `liabilityRepo.create` | name, loanType, principalInr, annualRatePercent, tenureMonths? \| emiAmountInr?, startDate. |
| `update_liability` | `liabilityRepo.update` | Also covers "close" via `status:'closed'`. |
| ⚠ `delete_liability` | `liabilityRepo.delete` | |

### Deferred (NOT built this layer)
- **Imports** (`POST /imports/*`) — file-upload, dashboard-only; doesn't fit a chat tool.
- **AI provider/model/route CRUD** — belongs to the AI-Settings surface, not a
  wealth-manager write concern.
- **Edits/deletes of asset contributions/valuations/rates** — insert-only for v1 (append is
  the real use case; correcting history is rare).

---

## 5. Decisions

| # | Decision | Rationale |
|---|---|---|
| **D1** | **Model C safety:** every `delete_*` tool + `recategorize_all` + `delete_category` are **preview-gated**; creates/updates execute directly. | Wrong write mutates finances. Destructive/wide-blast ops get a look-before-leap step; single-row creates/updates are low-risk and easily corrected. |
| **D2** | **Stateless preview protocol:** gated tool called without `confirm:true` returns an impact summary and mutates nothing; agent relays it, re-calls with `confirm:true`. **No server-side pending-op store.** | Fits the direct-to-core, no-session design. No expiry/GC complexity. |
| **D3** | **No `split_transaction` tool** — composed from `update_transaction` + `add_transaction`; recipe taught in descriptions. | Locked stance (`1cc41d48`). Same primitives yield move/duplicate. Small catalog. |
| **D4** | **Split (cross-tool-call) atomicity is a documented KNOWN GAP** — not guaranteed. `update_transaction` description instructs the agent to read back and verify. | A single MCP tool call = a single handler; two agent-initiated calls can't share one DB transaction. Building an atomic `split`/batch tool was rejected to honor D3; the risk is narrow (agent dies *between* the two calls). |
| **D5** | **Runtime host = Claude Agent SDK.** Real per-call permission gating lives at L4 (`canUseTool`/permission modes), NOT assumed from a host prompt. | The SDK runs the loop; we can't rely on a Desktop-style "Allow?" dialog. So the write-tools layer bakes in its own preview-gate (D1) and L4 adds `canUseTool` on top. |
| **D6** | **Write tools are ALWAYS registered** (`buildServer` unchanged). **Consciously supersedes L3 spec §8's "explicit opt-in flag."** | User override. For a single-user self-hosted server the real safety is the preview-gates (D1) + L4 `canUseTool` (D5), not a coarse boot flag. Documented as a deliberate divergence. |
| **D7** | **No hard numeric cap on `recategorize_all`.** | It is already preview-gated (surfaces the affected-row count); a hard cap would block a legitimate large recategorize. User decides from the preview. |
| **D8** | **Multi-write handlers use `ctx.runInTransaction`** (the L3 reserved runner). | `categorize_transaction` + `learnRule` + recategorize must be all-or-nothing. Activates the seam L3 built and reserved. |
| **D9** | **Money sanity at the handler:** reject non-finite / negative amounts (`add_/update_transaction`) as `isError`. | Cheap guard against agent arithmetic slips corrupting the ledger. |
| **D10** | **Asset contributions/valuations/rates are insert-only** (no edit/delete tool). | Append is the real use case; keeps the catalog lean. |

---

## 6. Safety & validation model

**Preview/confirm flow (gated tools):**
1. Resolve target + compute impact (row counts, cascade effects).
2. Target missing → `errorResult` (e.g. `"Category 'food' not found."`).
3. `confirm !== true` → `preview(summary, impact)`: text stating exactly what *would*
   change + `"No changes made. Re-call with confirm:true to proceed."` **Nothing mutated.**
4. `confirm === true` → mutate (inside `runInTransaction` where multi-step) → `ok(result)`.

Example — `delete_category("food")` without confirm →
*"Would delete category 'food', reassign 42 transactions to Uncategorized, and delete 3
dependent rules. No changes made. Re-call with confirm:true to proceed."*

**Hard guardrails (code, not conversation):**
- **Input validation** = SDK Zod `inputSchema` (protocol layer): types, enums
  (`direction: in|out`, `ruleType: merchant|keyword`, `valuationStrategy: computed|manual`),
  required fields → malformed = `InvalidParams` throw.
- **Semantic failures** → `errorResult` (handler layer, per L3's two-layer validation): unknown id, category
  doesn't exist, empty rule pattern (core throws `"Rule pattern cannot be empty."`).
- **Money sanity** (D9): non-finite or negative amounts → `errorResult`.
- **Atomicity** (D8): multi-write handlers wrapped in `runInTransaction`; split recipe is
  the documented exception (D4).

**`shared/output.ts` addition:** `preview(summary: string, impact?: Record<string, unknown>)`
→ a non-error `ToolResult` whose text is the summary + the standard re-call instruction, and
whose `structuredContent` carries `{ preview: true, ...impact }`.

---

## 7. Testing (TDD)

Per-tool, mirroring L3's `test/tools/*` pattern — in-memory sqlite via
`buildContext({ dbPath: ':memory:' })`, no network.

- **Happy path** — call handler; assert the row changed via read-back; assert `ok` payload
  shape + unit labels.
- **Semantic failure** — unknown id / bad input → `isError` (not a throw).
- **Preview gate** (gated tools) — call without `confirm` → assert (a) result reads as a
  preview with correct impact counts **and (b) the DB is UNCHANGED** (the critical
  assertion); then call with `confirm:true` → assert the mutation happened.
- **Atomicity** — `categorize_transaction` + `learnRule`: assert all-or-nothing.
- **Split-recipe integration** — compose `update_transaction` + `add_transaction`; assert
  the parts sum to the original and both persist (documents the intended recipe; pins the
  non-atomic gap as known behavior).

**Standing T1 gates:**
- **Groww golden-master 6/6 unchanged** — trivial (net diff touches only `packages/mcp`);
  assert the net-diff scope.
- Full suite green (core / agents / api / mcp).
- `tsc --build` clean across the graph.
- **Seam invariant** — no drizzle/better-sqlite3 import in `mcp/src`.
- **Live stdio smoke** — launch server; `tools/list` returns reads + writes; exercise one
  write end-to-end (`add_transaction` → `list_transactions` shows it) + one preview-gate
  (`delete_category` without confirm leaves the DB unchanged).
- **Subagent code review** — fresh `feature-dev:code-reviewer` against this spec before PR.

---

## 8. Out of scope (YAGNI / deferred)

- Imports as tools (file-upload; dashboard-only).
- AI provider/model/route CRUD tools.
- Edits/deletes of asset contributions/valuations/rates (insert-only, D10).
- Cross-tool-call atomic split / batch-apply tool (rejected to honor D3; gap documented, D4).
- HTTP transport (stdio-only; `buildServer` is transport-agnostic — later drop-in).
- The L4 agents themselves + `canUseTool` permission wiring (the broader L4 work that
  consumes this contract).

---

## 9. Gotchas (carried from prior layers)

- **Runs via `tsx`** — the monorepo never compiles to JS. New write files use extensionless
  relative imports; no `dist`.
- **pnpm:** `corepack prepare pnpm@10.4.1` now fails (resolves 11.2.2, crashes Node 20.20.2).
  Install via `node ~/.cache/node/corepack/v1/pnpm/10.4.1/dist/pnpm.cjs install
  --config.manage-package-manager-versions=false`. Build/test via
  `node_modules/.bin/{tsc,vitest}` (mcp test bin at `packages/mcp/node_modules/.bin/vitest`).
- **Node 20** for all commands.
- **GH push/PR** via `gh auth switch --user ak688744`.
- **Branch off latest `main`** (L3 PR #12 merged). Branch: `layer/4-mcp-write-tools`.
