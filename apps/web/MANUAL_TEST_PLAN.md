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
