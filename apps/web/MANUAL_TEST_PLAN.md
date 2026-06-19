# L2 Web UI — Manual Test Plan

> **For the tester (e.g. Codex / a fresh agent — zero prior context):** this is a
> browser-driven manual test of the MyFinance web UI (`apps/web`), a Vite + React
> SPA that reads a Fastify REST API (`packages/api`) over a local SQLite DB. It
> covers the visual/integration layer; automated coverage (TDD) already lives in
> the `lib` unit tests, the UI-kit smoke test, and the API `inject()` tests.
> Everything you need is below — repo, commands, seed data, URLs, reference
> images, and where to save your screenshots. **Do not edit application code while
> testing**; just exercise the UI and record what you see.

**Repo root:** `/Users/vkhandelwal/Documents/MyFinance` (run all commands from here).
**Runtime:** Node 20 (mandatory — `source ~/.nvm/nvm.sh && nvm use 20` first; the
native `better-sqlite3` module is built for Node 20 and fails on Node 18).

## Setup (start the two servers + seed demo data)

**Step 1 — API server (port 3001).** Creates/migrates a fresh `demo.db` and seeds
starter categories on first run:
```bash
cd /Users/vkhandelwal/Documents/MyFinance
source ~/.nvm/nvm.sh && nvm use 20
DB_PATH=demo.db PORT=3001 pnpm -C packages/api exec tsx src/server.ts
```
Leave it running. Verify in another shell: `curl -s localhost:3001/health` → `{"data":{"status":"ok","db":true}}`.

**Step 2 — seed realistic expense transactions.** Run from `packages/core` (that's
where `better-sqlite3` resolves). Bank-format `UPI-…` descriptions are required for
the merchant-rule "learn" flow to work:
```bash
cd /Users/vkhandelwal/Documents/MyFinance/packages/core
source ~/.nvm/nvm.sh && nvm use 20
node -e '
const Database = require("better-sqlite3");
const db = new Database("/Users/vkhandelwal/Documents/MyFinance/packages/api/demo.db");
const ins = db.prepare(`INSERT INTO transactions (transaction_date, description, normalized_description, amount, direction, category_id, category_source, source_type, dedupe_key) VALUES (?,?,?,?,?,?,?,?,?)`);
const rows = [
  ["2026-06-01","UPI-SWIGGY-swiggy@axis-order","upi-swiggy",480,"debit","d1"],
  ["2026-06-03","UPI-SWIGGY-swiggy@axis-dinner","upi-swiggy",650,"debit","d2"],
  ["2026-06-05","UPI-ZOMATO-zomato@hdfc-lunch","upi-zomato",420,"debit","d3"],
  ["2026-06-07","UPI-UBER-uber@paytm-ride","upi-uber",260,"debit","d4"],
  ["2026-06-09","UPI-AMAZON-amazon@apl-shopping","upi-amazon",1899,"debit","d5"],
  ["2026-06-10","POS 1234 567890 BIGBAZAAR MUMBAI","pos bigbazaar",2340,"debit","d6"],
  ["2026-06-12","UPI-SWIGGY-swiggy@axis-snacks","upi-swiggy",310,"debit","d7"],
  ["2026-06-02","ACME CORP SALARY CREDIT","acme salary",185000,"credit","d8"],
  ["2026-06-15","UPI-NETFLIX-netflix@hdfc-subscription","upi-netflix",649,"debit","d9"],
  ["2026-06-18","UPI-UBER-uber@paytm-airport","upi-uber",540,"debit","d10"],
];
const tx = db.transaction(()=>{ for (const [d,desc,nd,amt,dir,dk] of rows) ins.run(d,desc,nd,amt,dir,null,null,"hdfc",dk); });
tx(); console.log("seeded "+rows.length+" txns"); db.close();
'
curl -s -X POST localhost:3001/recategorize -H 'Content-Type: application/json' -d '{}'
```
After seeding + recategorize, the expected starting state is: **Swiggy ×3 → `food`,
Netflix → `bills`** (auto via built-in rules); **Uber ×2, Amazon, Zomato, BigBazaar,
ACME salary → uncategorized**.
(Optional richer demo for the other screens — Net Worth/Investments/Loans — seed an
account/asset/loan via `POST /accounts`, `POST /assets`, `POST /liabilities`; or just
verify their empty states.)

**Step 3 — web server (port 5173).**
```bash
cd /Users/vkhandelwal/Documents/MyFinance
source ~/.nvm/nvm.sh && nvm use 20
API_PORT=3001 pnpm -C apps/web dev
```
Open **http://localhost:5173** (use `http://127.0.0.1:5173` if `localhost` doesn't
resolve). Vite proxies `/api/*` → `http://localhost:3001`.

**Already running?** If someone started these for you, just confirm
`curl -s -o /dev/null -w "%{http_code}" localhost:5173` → `200` and skip to testing.

## Reference mockups (compare the live UI against these)
The approved visual designs live in `docs/superpowers/specs/mockups/`. Open the
matching image side-by-side with each screen — the live build should be in the same
spirit (layout, KPI strip, cards, valuation badges, colors), though seeded numbers
differ from the mockups' illustrative figures.

| Screen | Reference image |
|---|---|
| Net Worth | `docs/superpowers/specs/mockups/01-networth-home.png` |
| Investments | `docs/superpowers/specs/mockups/02-investments.png` |
| Investment Analyzer | `docs/superpowers/specs/mockups/03-investment-analyzer.png` |
| Add Investment (FD) | `docs/superpowers/specs/mockups/04-add-asset-fd.png` |
| Expenses | `docs/superpowers/specs/mockups/05-expenses.png` |
| Loans | `docs/superpowers/specs/mockups/06-loans.png` |

## Screenshots (save your evidence here)
Save every screenshot you capture to **`apps/web/test-screenshots/`** (this folder
exists; its `*.png` are gitignored). Naming: `<screen>-<state>.png`, e.g.
`networth-home.png`, `expenses-uncategorized.png`, `expenses-learn-prompt.png`,
`expenses-manage-rules.png`, `loans-amortization.png`. Capture at least: each of the
5 screens, the learn-prompt mid-flow, the Manage Categories & Rules panel, and any
failure you hit. Note the filename next to the relevant checklist item.

## How to report
For each `[ ]` item: mark **PASS** / **FAIL**, and for any FAIL include the
screenshot filename + what you expected vs. saw + (if useful) the matching
`GET /api/...` JSON. The cross-check items below tell you which API to compare against.

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
- [ ] `GET /api/networth` `data.netWorth` == the hero number. (Or `curl -s localhost:3001/networth`.)
- [ ] `GET /api/expenses/summary` `data` totals == the Expenses KPI strip.
- [ ] `GET /api/investments/summary` `data.xirr` == the Investments Portfolio XIRR card.
- [ ] `GET /api/categories/rules` reflects rules created via the learn prompt / Manage panel.

## Troubleshooting
- **`better-sqlite3` NODE_MODULE_VERSION error / `ERR_DLOPEN_FAILED`** → you're on Node 18. Run `nvm use 20` and retry (including the seed `node -e` script).
- **Web shows data but mutations 404 / network errors** → the API isn't on 3001, or the web wasn't started with `API_PORT=3001`. Restart per Setup Step 3.
- **Port already in use** → `lsof -ti:3001 | xargs kill` (and `:5173`), then restart.
- **Want a clean slate** → stop the API, `rm -f packages/api/demo.db*`, restart from Setup Step 1.

## Teardown (after testing)
```bash
lsof -ti:3001 | xargs kill 2>/dev/null   # stop API
lsof -ti:5173 | xargs kill 2>/dev/null   # stop web
rm -f /Users/vkhandelwal/Documents/MyFinance/packages/api/demo.db*   # drop demo DB (gitignored anyway)
```
Screenshots in `apps/web/test-screenshots/` are gitignored — keep or delete as you like.
