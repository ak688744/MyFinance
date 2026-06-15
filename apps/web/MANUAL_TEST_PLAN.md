# L2 Web UI — Manual Test Plan

Run via the computer-use browser plugin against a seeded DB. Automated coverage
(TDD) lives in the `lib` unit tests, the UI-kit smoke test, and the `/expenses`
API `inject()` tests; this plan covers the visual/integration layer.

## Setup
1. `source ~/.nvm/nvm.sh && nvm use 20`
2. Start API on a seeded DB: `DB_PATH=<seeded.db> PORT=3001 pnpm -C packages/api exec tsx src/server.ts`
   (or point at a DB you've populated via the import endpoints / Add flows)
3. Start web: `pnpm -C apps/web dev` → open http://localhost:5173
   - Vite proxies `/api/*` → `http://localhost:3001`. If the API runs on a
     different port, start the dev server with `API_PORT=<port> pnpm -C apps/web dev`.

## Net Worth (`/`)
- [ ] Hero shows a net-worth number (compact ₹L/Cr).
- [ ] The three KPI cards reconcile: Total Assets − Total Liabilities = Net Worth.
- [ ] Asset Composition donut renders one slice per asset class present.
- [ ] Trend chart shows the honest "history not available yet" hint (MF-history gap) — NOT fabricated data.
- [ ] The AI insight card is violet and its button is disabled ("Coming in L4").

## Investments (`/investments`)
- [ ] KPI strip: Total Invested · Current Value · Total Returns · Portfolio XIRR, populated from `/investments/summary`.
- [ ] One group card per asset class; MF group shows the MARKET badge; FD/PPF show COMPUTED; gold/real-estate show MANUAL.
- [ ] Group total = sum of its rows; clicking an MF holding navigates to the analyzer.
- [ ] "+ Add investment" opens the modal. Selecting **FD** shows principal/rate/start fields + the COMPUTED note; selecting **gold** shows the current-value field + the MANUAL note.
- [ ] Submitting an FD with missing principal/rate/start shows the inline validation error (no API round-trip).
- [ ] Submitting a valid asset creates it; the modal closes and the asset appears in the list + Net Worth refreshes (query invalidation).

## Investment Analyzer (`/investments/:schemeId`)
- [ ] KPI row shows Current Value / Invested / Total Returns / XIRR for the chosen holding.
- [ ] Performance trend shows the honest empty hint (per-holding history not wired).
- [ ] Unknown id → "Holding not found." empty state.

## Expenses (`/expenses`)
- [ ] KPI strip: Total Spent · Income · Saved. Saved = Income − Spent. (No budget KPIs — budgets deferred.)
- [ ] Spending Breakdown donut: category names resolve (null → "Uncategorized"); slice values sum to Total Spent.
- [ ] Month-on-month Spend bars render one bar per YYYY-MM.
- [ ] Recent transactions list shows category chip, description, date, amount; credits are green, debits neutral (intentional).

### Categorization & rules (Expenses)
Demo seed (via `DB_PATH=demo.db`): 10 txns — 3× Swiggy + Netflix auto-categorized (`food`/`bills` via built-in rules); Uber ×2, Amazon, Zomato, BigBazaar (POS), ACME salary credit start **uncategorized**. (Re-seed: see the seeding block at the top + `POST /recategorize`.)

**Editable chip + flag uncategorized**
- [ ] Uncategorized rows render a **dashed amber "Uncategorized"** chip; categorized rows render a normal gray chip showing the category **name** (not the raw id).
- [ ] Clicking any chip opens an inline category picker.

**Learn prompt (the core flow)**
- [ ] Reassign an **Uber** row to a category → the row updates immediately (one-off), THEN an inline prompt appears: *"Always categorize ‹…› as ‹X›?"*.
- [ ] Click **Yes** → a merchant rule is created AND the **other Uber row auto-recategorizes** to the same category (verify it flips without manual action).
- [ ] Repeat on another merchant, click **No** → only that one row changes; the sibling stays as-is; no rule created.
- [ ] Reassigning an **already-categorized** row (e.g. a Swiggy `food` chip) also works (chip is editable regardless of source).
- [ ] Edge: reassigning a row whose description has **no bank-format merchant key** still assigns the category, but the "always" path creates no rule (expected — merchant key only derives from `UPI-`/`ACH`/`POS` formats).

**Manage Categories & Rules panel** (button in Expenses header)
- [ ] **Add category** (e.g. "Travel") → appears in the list and in chip pickers; adding a duplicate name shows a 409 "already exists" error inline.
- [ ] **Rename** a category → reflected in chips/donut.
- [ ] **Delete** a category in use → confirm step → its transactions revert to **Uncategorized** (not deleted); any rules targeting it disappear.
- [ ] **Rules section** lists rules as `ruleType · pattern → category`; add a rule, edit its category, delete a rule.
- [ ] **"Recategorize all"** re-applies rules to non-manual transactions (manually-set rows are NOT overwritten).

**Cross-check (API)**
- [ ] After a "Yes" learn action, `GET /api/categories/rules` shows the new `merchant` rule; the spending donut re-tallies to match.

## Loans (`/loans`)
- [ ] Loan cards show name, type, rate, EMI, principal.
- [ ] "View amortization schedule" opens the drawer with period / due date / EMI / principal / interest / balance rows.
- [ ] Schedules longer than 60 periods show "Showing first 60 of N periods."

## Assistant (`/assistant`)
- [ ] Renders the "Coming in L4" placeholder (no chat — L4 is a later layer).

## Error / empty / degradation
- [ ] Stop the API → each screen shows an inline error card with a Retry button (no white screen); Retry refetches after the API is back.
- [ ] Fresh/empty DB → each screen shows a purposeful empty state with the relevant "Add …" CTA.
- [ ] No chart anywhere shows fabricated/synthetic numbers — only real data or an honest empty hint.

## Cross-check (reconcile UI against raw API JSON)
- [ ] `GET /api/networth` `data.netWorth` == the hero number.
- [ ] `GET /api/expenses/summary` `data` totals == the Expenses KPI strip.
- [ ] `GET /api/investments/summary` `data.xirr` == the Investments Portfolio XIRR card.
