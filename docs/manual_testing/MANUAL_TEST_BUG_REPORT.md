# L2 Web UI Manual Test Bug Report

**App:** MyFinance web UI (`apps/web`)  
**Test date:** 2026-06-16  
**Tester:** Codex browser/manual pass  
**Source plan:** `docs/manual_testing/MANUAL_TEST_PLAN.md`  
**Context:** `docs/superpowers/MASTER_PLAN.md`  
**Status:** Bugs confirmed by user before report creation.

## Test Setup

- API: `DB_PATH=demo.db PORT=3001 pnpm -C packages/api exec tsx src/server.ts`
- Web: `API_PORT=3001 pnpm -C apps/web dev`
- Demo expense seed: 10 transactions from `docs/manual_testing/MANUAL_TEST_PLAN.md`
- Additional test data:
  - One investment account created from UI.
  - One FD asset created from UI.
  - One gold asset created from UI.
  - Groww test fixtures imported from `packages/api/test/fixtures/`.
  - One personal loan created from UI.
- Evidence folder: `docs/manual_testing/evidence/`

## BUG-001: Investments KPI Strip Excludes Generic Assets

**Severity:** High  
**Area:** Investments

### Steps

1. Open `/investments`.
2. Add an investment account.
3. Add a valid FD asset.
4. Add a gold asset.
5. Observe the Investments KPI strip and asset groups.
6. Cross-check `/assets`, `/investments/summary`, and `/networth`.

### Expected

The Investments KPI strip should reflect all visible investment assets, including generic assets such as FD and gold, or the UI should clearly state that the KPI strip is MF-only.

### Actual

FD and gold appear in the investment groups and Net Worth, but the KPI strip remains based only on `/investments/summary`. Before MF import, the strip showed zero values while the asset groups showed:

- FD: INR 1,03,323
- Gold: INR 50,000

API cross-check:

- `/assets` included FD and gold.
- `/networth` included FD and gold.
- `/investments/summary` returned zero until MF holdings were imported.

### Evidence

- `docs/manual_testing/evidence/investments-after-fd.png`
- `docs/manual_testing/evidence/investments-after-fd-gold.png`
- `docs/manual_testing/evidence/networth-after-fd.png`

## BUG-002: Mutual Fund Holdings Are Duplicated And Double-Counted

**Severity:** High  
**Area:** Investments

### Steps

1. Import Groww holdings fixture.
2. Import Groww transactions fixture.
3. Open `/investments`.
4. Compare the Mutual Funds group against `/investments/summary`, `/investments/holdings`, and `/assets`.

### Expected

Each MF holding should appear once, and the Mutual Funds group total should match the MF current value from summary/holdings.

### Actual

The Mutual Funds group listed each holding twice and showed a total of INR 32,000 while `/investments/summary` reported INR 16,000 and `/investments/holdings` contained only two holdings.

Likely cause: the Investments page combines MF holdings from `/investments/holdings` with MF projections returned from `/assets`, causing duplicate display/counting.

Console also reported a duplicate React key warning.

### Evidence

- `docs/manual_testing/evidence/investments-populated.png`
- `docs/manual_testing/evidence/investments-populated-snapshot.md`

## BUG-003: Category And Rule Delete Actions Fail From UI

**Severity:** High  
**Area:** Expenses / Manage Categories & Rules

### Steps

1. Open `/expenses`.
2. Open `Manage categories & rules`.
3. Add category `Subscriptions`.
4. Rename it to `Recurring`.
5. Assign Zomato to `Recurring`.
6. Delete `Recurring` and confirm.
7. Add rule `merchant · bigbazaar mumbai -> Groceries`.
8. Edit the rule to `Travel`.
9. Delete the rule.
10. Cross-check `/categories`, `/expenses`, and `/categories/rules`.

### Expected

- Deleting an in-use category should confirm, remove the category, revert matching transactions to Uncategorized, and remove dependent rules.
- Deleting a rule should remove it and recategorize affected non-manual transactions.

### Actual

Both delete operations failed from the UI with API 400 responses:

```text
DELETE /api/categories/subscriptions -> 400
Body cannot be empty when content-type is set to 'application/json'

DELETE /api/categories/rules/2 -> 400
Body cannot be empty when content-type is set to 'application/json'
```

The category and rule remained in API state after the failed deletes.

### Evidence

- `docs/manual_testing/evidence/expenses-delete-category-confirm.png`
- `docs/manual_testing/evidence/expenses-manage-after-add-category.png`
- Console output captured during the manual run.

## BUG-004: Seed Expectation Mismatch - Not All Swiggy Rows Auto-Categorize

**Severity:** Medium  
**Area:** Expenses / Categorization

### Steps

1. Seed the demo transactions from `docs/manual_testing/MANUAL_TEST_PLAN.md`.
2. Run `POST /recategorize`.
3. Open `/expenses`.
4. Inspect all three Swiggy transactions.
5. Cross-check `/expenses`.

### Expected

The manual plan states: Swiggy x3 -> `food`.

### Actual

Only two Swiggy rows were categorized:

- `UPI-SWIGGY-swiggy@axis-snacks` -> Food
- `UPI-SWIGGY-swiggy@axis-dinner` -> Food
- `UPI-SWIGGY-swiggy@axis-order` -> Uncategorized

The current built-in food rules match terms such as `snacks` and `dinner`, but not merchant `swiggy` or note `order`.

### Evidence

- `docs/manual_testing/evidence/expenses-baseline.png`
- API cross-check from `/expenses` during test.

## BUG-005: Loan Card Does Not Show Computed EMI

**Severity:** Medium  
**Area:** Loans

### Steps

1. Open `/loans`.
2. Add a loan:
   - Principal: INR 5,00,000
   - Annual rate: 10%
   - Start date: 2026-01-01
   - Tenure: 72 months
3. Observe the loan card.
4. Open amortization schedule.
5. Cross-check `/liabilities` and `/liabilities/1`.

### Expected

The loan card should show name, type, rate, EMI, and principal as required by the manual test plan.

### Actual

The loan card showed:

```text
Personal · +10.0% · EMI -
```

The amortization drawer computed EMI as INR 9,263. API detail contained computed schedule EMI, while the list endpoint returned `emiAmount: null`.

### Evidence

- `docs/manual_testing/evidence/loans-populated.png`
- `docs/manual_testing/evidence/loans-amortization.png`
- `docs/manual_testing/evidence/loans-amortization-snapshot.md`

## BUG-006: API-Down Retry Handling Is Incomplete On Secondary Sections

**Severity:** Medium  
**Area:** Error/degradation states

### Steps

1. Stop the API server.
2. Open each data-backed screen.
3. Capture the inline error states.
4. Restart the API server.
5. Click Retry where available.

### Expected

Per the manual test plan, each screen should show an inline error card with a Retry button, and Retry should refetch after the API is back.

### Actual

Top-level error sections generally showed Retry, and Loans recovered after Retry. Secondary sections did not consistently expose Retry:

- Investments: one error card had Retry, the second error card did not.
- Expenses: the summary error had Retry, but Recent Transactions showed an error without Retry, while charts degraded to `No data`.

### Evidence

- `docs/manual_testing/evidence/networth-api-error.png`
- `docs/manual_testing/evidence/investments-api-error.png`
- `docs/manual_testing/evidence/expenses-api-error.png`
- `docs/manual_testing/evidence/loans-api-error.png`
- `docs/manual_testing/evidence/loans-retry-recovered.png`

## BUG-007: UI Design Parity Drift From Approved Mockups

**Severity:** Medium  
**Area:** Visual design / layout parity

### Reference Mockups

- `docs/superpowers/specs/mockups/01-networth-home.png`
- `docs/superpowers/specs/mockups/02-investments.png`
- `docs/superpowers/specs/mockups/03-investment-analyzer.png`
- `docs/superpowers/specs/mockups/04-add-asset-fd.png`
- `docs/superpowers/specs/mockups/05-expenses.png`
- `docs/superpowers/specs/mockups/06-loans.png`

### Expected

The live UI should be in the same visual spirit as the approved mockups: layout hierarchy, KPI strip, card composition, valuation badges, colors, and screen density should be recognizably aligned.

### Actual

The live UI is substantially simpler than the mockups across multiple screens:

- Sidebar lacks the richer mockup treatment: icons, wealth-manager subtitle, avatar/footer/settings/support affordances.
- Top bar/search/notification/avatar elements from the mockups are absent.
- Net Worth does not match the mockup command-center layout; asset composition and summary areas are simplified.
- Expenses omits table-style columns, merchant/account affordances, richer insight treatment, and the mockup visual hierarchy. Budget UI is intentionally deferred per the manual plan and should not be counted as a bug by itself.
- Loans uses a very sparse card treatment compared with the mockup and misses visible EMI.
- Cards, spacing, labels, and chart legends are generally more minimal than the approved references.

Some differences may be intentional due to deferred scope, but the current implementation does not closely match the approved screenshots as a visual parity target.

### Evidence

- `docs/manual_testing/evidence/networth-home.png`
- `docs/manual_testing/evidence/investments-populated.png`
- `docs/manual_testing/evidence/investment-analyzer-holding.png`
- `docs/manual_testing/evidence/add-investment-fd-validation.png`
- `docs/manual_testing/evidence/expenses-baseline.png`
- `docs/manual_testing/evidence/loans-populated.png`
- Reference images under `docs/superpowers/specs/mockups/`

## BUG-008: Expenses Dashboard Has No Add Or Import Expense Entry Point

**Severity:** Medium  
**Area:** Expenses / Data entry

### Steps

1. Open `/expenses`.
2. Inspect the page header and primary actions.
3. Look for a way to add an expense manually or import an expense statement.
4. Compare with the available backend/import capability and the `ImportModal` component.

### Expected

The Expenses dashboard should expose a clear Add Expense and/or Import Expenses action so a user can create or load expense transactions from the expense workflow.

### Actual

The Expenses dashboard only exposes `Manage categories & rules`. There is no visible Add Expense button and no Import Expenses button on `/expenses`.

The app does contain an import modal with an `Expense statement` option, and the API exposes `POST /imports/expenses`, but the modal is currently launched from the Investments page rather than from the Expenses dashboard.

During manual testing, the expense transactions were therefore seeded directly through the backend setup script from `docs/manual_testing/MANUAL_TEST_PLAN.md`, followed by `POST /recategorize`; they were not added through the Expense dashboard UI.

### Evidence

- `docs/manual_testing/evidence/expenses-baseline.png`
- `apps/web/src/features/expenses/ExpensesPage.tsx`
- `apps/web/src/features/imports/ImportModal.tsx`
- `apps/web/src/features/investments/InvestmentsPage.tsx`
- `packages/api/src/routes/imports.ts`

## Passing Coverage Notes

The following major flows passed during the manual run:

- Net Worth refreshes after FD creation and shows real asset composition.
- Add Investment FD validation is inline and blocks invalid submit.
- Add Investment manual/gold form shows manual valuation fields.
- MF analyzer opens from a holding and shows honest empty trend messaging.
- Unknown analyzer id shows `Holding not found.`
- Expenses KPI totals reconcile against `/expenses/summary`.
- Uncategorized chips are visible and editable.
- Learn prompt Yes creates an Uber merchant rule and recategorizes sibling Uber rows.
- Learn prompt No changes only the selected row and creates no rule.
- Already-categorized chips remain editable.
- No-merchant-key transaction can be assigned without creating a rule.
- Category duplicate creation shows an inline error.
- Rule creation and rule edit recategorize matching non-manual transactions.
- Recategorize All does not overwrite manual transaction categories.
- Loan amortization drawer renders period, due date, EMI, principal, interest, balance, and the "Showing first 60 of 72 periods" notice.
- Assistant page renders the `Coming in L4` placeholder.
- No chart showed fabricated/synthetic values; unavailable history uses empty hints.
