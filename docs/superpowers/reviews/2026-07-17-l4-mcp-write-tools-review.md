# L4 MCP Write Tools — Code Review Findings

**Date:** 2026-07-17
**Branch:** `layer/4-mcp-write-tools` (commit `742c64b`)
**Reviewed against:** [spec](../specs/2026-07-16-l4-mcp-write-tools-design.md) · [plan](../plans/2026-07-17-l4-mcp-write-tools.md)
**Method:** manual review + runtime probes + independent `feature-dev:code-reviewer` subagent pass.

---

## Baseline gates — all green ✅

| Gate | Result |
|---|---|
| MCP test suite | **64/64 pass** (26 L3 + 38 new) |
| Typecheck (`tsc --build`) | MCP package clean (exit 0). The `core/src/db/migrate.ts` URL type error is **pre-existing in `core`**, unchanged by this branch. |
| Seam invariant | No `drizzle`/`better-sqlite3` import in `mcp/src` (only a comment). |
| Groww golden-master | Net diff touches **zero `packages/core/` files** → 6/6 trivially unchanged. |
| Preview gates (the safety model) | **All 6 gated tools correct** — check `confirm !== true` before any mutation; tests assert the DB is unchanged on the preview path. |

**Verdict:** Faithful-to-spec implementation; safety model sound; core untouched. Findings below are localized validation gaps, none of which break the preview model or the seam. **Findings 1–4 trace to gaps in the spec/plan, not implementer error** — the code matches the plan; the plan under-specified.

---

## Findings

### 1. `update_rule` reports success for a non-existent ruleId — silent false success
- **Severity:** High (correctness)
- **File:** `packages/mcp/src/tools/write/categories.ts:74` (`runUpdateRule`)
- **Documented?** No — gap originates in the plan (`runUpdateRule` had no existence check, unlike its sibling `runDeleteRule`).
- **Failure scenario:** Agent calls `update_rule` with `ruleId: 9999` (not present). Core `updateRuleCategory` issues `UPDATE category_rules … WHERE id = 9999`, which matches 0 rows and does **not** throw. The wrapper returns `ok({ ruleId: 9999, updated: true })`. The agent believes the rule was retargeted; nothing changed.
- **Verified:** runtime probe returned `{ ruleId: 9999, updated: true }`.
- **Fix:** Mirror `runDeleteRule` — look the rule up in `getActiveRules()` first, return `errorResult(\`Rule ${ruleId} not found.\`)` if absent. Add a regression test.

### 2. `add_asset_contribution` / `add_asset_valuation` accept zero/negative amounts
- **Severity:** High (input validation / data integrity)
- **File:** `packages/mcp/src/tools/write/assets.ts:57` (contribution), `:69` (valuation)
- **Documented?** No. Spec **D9 scopes money-sanity only to `add_/update_transaction`** — it never extended the guard to asset sub-resources. The plan carried the same narrow guard (`!Number.isFinite(...)` only).
- **Failure scenario:** Agent calls `add_asset_contribution { assetId, amountInr: -500 }` or `add_asset_valuation { valueInr: 0 }`. Both pass the `isFinite`-only guard and write nonsensical rows, corrupting derived net-worth/valuation. `runAddTransaction` guards with `<= 0`; these do not.
- **Fix:** Add `|| input.amountInr <= 0` (contribution) and `|| input.valueInr <= 0` (valuation). Add regression tests.

### 3. `update_liability` allows `principalInr` to be set to zero/negative
- **Severity:** Medium (input validation)
- **File:** `packages/mcp/src/tools/write/liabilities.ts:42` (`runUpdateLiability`)
- **Documented?** No. D9 mentions only transactions; the plan's `runUpdateLiability` copies `principalInr` into the patch with no guard (`add_liability` guards `<= 0`, update does not).
- **Failure scenario:** Agent calls `update_liability { id, principalInr: -500000 }` (typo). Accepted. Net-worth then treats the liability as negative, **inflating** assets.
- **Fix:** Guard `principalInr` on the update path the same way as `add_liability`. Add a regression test.

### 4. `add_asset_rate` accepts a negative `ratePercent`
- **Severity:** Medium (input validation)
- **File:** `packages/mcp/src/tools/write/assets.ts:81` (`runAddAssetRate`)
- **Documented?** No. D9 is silent on rates.
- **Failure scenario:** Agent computes a rate via an arithmetic slip (e.g. `-7`) and calls `add_asset_rate { ratePercent: -7 }`. Only `isFinite` is checked, so it is stored; the compound-interest valuation engine applies `(1 + rate/100)^years = 0.93^years`, shrinking the asset and misstating net worth.
- **Fix:** Add `|| input.ratePercent < 0` (0 is valid = no interest). Add a regression test.

### 5. `add_liability` allows BOTH `tenureMonths` and `emiAmountInr`
- **Severity:** Low (input validation)
- **File:** `packages/mcp/src/tools/write/liabilities.ts:17` (`runAddLiability`)
- **Documented?** Partial. Spec §4 says "`tenureMonths?` | `emiAmountInr?`" and the tool description says "either … OR", but no decision mandates handler enforcement, and the DB `liabilities_tenure_or_emi_check` is an **OR**, not XOR.
- **Failure scenario:** Agent calls `add_liability` with `tenureMonths: 120` AND `emiAmountInr: 10000`. The CHECK (`tenure IS NOT NULL OR emi IS NOT NULL`) is satisfied, so both persist; amortization/EMI resolution then silently favors one and ignores the other, diverging from the agent's stated terms. (The "neither" case **is** caught by the CHECK, but only as a cryptic `CHECK constraint failed` `isError`.)
- **Fix (optional):** Enforce exactly-one at the handler with a clear `errorResult`. Or accept as-is (DB backstops "neither").

### 6. Unknown `categoryId`/`accountId` surfaces as a raw `FOREIGN KEY constraint failed` message
- **Severity:** Low (error message quality) — **acceptable per spec**
- **Files:** `transactions.ts:23` (`add_transaction`), `transactions.ts:78` (`categorize_transaction`), `categories.ts` (`create_rule` via core), `assets.ts` (`add_asset` accountId path)
- **Documented?** **Yes** — spec **D6 / §6** describes the two-layer validation model; semantic failures that reach the repo throw and are wrapped as `isError`. This path is explicitly accepted.
- **Failure scenario:** Agent calls `add_transaction { categoryId: 'ghost' }`. `foreign_keys = ON`, so the insert throws; the MCP SDK wraps it as `{ isError: true, text: 'FOREIGN KEY constraint failed' }`. The agent is correctly stopped but gets a cryptic message instead of `"Category 'ghost' not found."` (which §6 prefers). **Verified end-to-end over the in-memory transport.**
- **Fix (optional polish):** Pre-flight `categoryRepo.exists()` / `accountRepo.getById()` checks for a clean `errorResult`. Not a blocker.

---

## Documentation status summary

| # | Finding | Documented / accepted? | Root cause |
|---|---------|------------------------|------------|
| 1 | `update_rule` false success | ❌ No | Plan omitted the existence check `delete_rule` has |
| 2 | asset contribution/valuation ≤ 0 | ❌ No | Spec D9 scoped money-sanity to transactions only |
| 3 | `update_liability` principal ≤ 0 | ❌ No | D9 never covered liabilities |
| 4 | negative `add_asset_rate` | ❌ No | D9 silent on rates |
| 5 | `add_liability` both tenure+emi | ⚠️ Intent documented, gap not | DB CHECK is OR, no handler XOR |
| 6 | cryptic FK message | ✅ Yes (D6/§6) | Accepted two-layer validation behavior |

**Recommended action:** Fix **1–4** (real data-integrity gaps) with a regression test each, and widen spec **D9** to read "all money-accepting write tools" so the contract matches. Log **5–6** as accepted minors (DB CHECK + SDK error-wrapping already backstop them).
