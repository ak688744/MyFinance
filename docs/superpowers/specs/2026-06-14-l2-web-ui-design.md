# L2 — Web UI — Design Spec

**Date:** 2026-06-14
**Layer:** L2 (Web UI) — MASTER_PLAN §4
**Tier:** T1 (new layer / new architectural surface). **No `core` financial-logic change → no Groww re-validation.**
**Status:** Design approved; ready for `writing-plans`.
**Inputs:** [Frontend design spike](2026-06-13-frontend-design-spike-design.md) (UI contract §3–§5; schema payload §6, now realized in L1.5). L1.5 build complete (PR #4 merged).

---

## 0. Summary

Build `apps/web` — the web frontend for the MyFinance wealth manager. It is a
**pure consumer of the existing Fastify REST API** (`packages/api`): it reads
endpoints, renders the spike's approved screens, and offers the highest-value
write flows. **All financial math stays in `core`/API** — the web app holds no
business logic beyond presentation formatting and chart-data shaping.

This layer delivers the **four data sections** of the approved IA — Net Worth,
Investments, Expenses, Loans — **read-first**, plus key write flows (add asset,
add loan, add account, edit category, file import). The fifth nav item,
**Assistant (L4)**, ships as a disabled "coming in L4" placeholder.

One bounded API addition: two **read-only** expense endpoints (`/expenses`,
`/expenses/summary`) that were explicitly deferred from L1 to L2. They are pure
read aggregations over existing data — no core financial logic touched.

---

## 1. Scope

### In scope
- New package `apps/web`: Vite + React 19 + TypeScript SPA in the pnpm workspace.
- **Net Worth** command center (hero + trend + asset-class composition + assets−liabilities + per-class KPI cards).
- **Investments** unified portfolio (KPI strip + asset-class group cards with valuation badges) + **Investment Analyzer** (single-holding drill-down).
- **Expenses** (KPI strip + spending-breakdown donut + month-on-month bars + transaction list with editable category chips).
- **Loans** (KPI strip + loan cards + amortization drawer + payoff projection chart).
- **Assistant**: disabled placeholder (L4 seam reserved via the `AIInsightCard` component rendering static copy).
- **Write flows:** Add asset (`POST /assets`, per-class manual/computed form with live computed preview), Add loan (`POST /liabilities`), Add account (`POST /accounts`), edit transaction category (`PATCH /categories/rules/:id` + recategorize), file import upload (multipart `POST /imports/*`).
- **Two new read-only API endpoints** in `packages/api`: `GET /expenses` (filterable), `GET /expenses/summary` (KPIs + category breakdown + month-on-month), TDD'd with `inject()` tests + new repo query methods.

### Out of scope (explicitly deferred)
- **Assistant / AI chat** (L4) — placeholder only; `AIInsightCard` renders static copy, no agent calls.
- **Budgets** — deferred (spike §6.9/§7). Expenses KPIs render without budget-dependent figures.
- **MF historical-NAV wiring** — the documented stretch gap; trend charts degrade gracefully where MF history is absent (a clean follow-up).
- **Live stock/gold pricing** (L1.5 deferred), **multi-currency**, **auth**, **mobile app** — not designed.
- **No new core financial logic; no schema changes.**

---

## 2. Locked decisions (from brainstorm)

| # | Decision | Rationale |
|---|---|---|
| D1 | **Scope = 4 data sections read-first + key write flows.** Assistant = placeholder. | One coherent shippable web app; keeps L4 in its own layer. |
| D2 | **Stack: Vite + React 19 + TS + Tailwind + TanStack Query + React Router + Recharts.** | Lightweight SPA; no SSR tax for a single-user local-first dashboard. Imports `@myfinance/core` types for end-to-end typing. |
| D3 | **Internal architecture: feature-folder + thin typed API client + shared UI kit** (brainstorm Approach A). | Maps 1:1 onto the 4 nav sections; isolates silently-buggy logic into pure, tested functions; no duplication. |
| D4 | **Add read-only `/expenses` + `/expenses/summary` API endpoints.** | Server-side aggregation belongs in the repo/API layer (L0 seam), reusable by L4 agents. Read-only → no Groww re-validation. |
| D5 | **Defer budgets.** Render Total Spent / Income / Saved; omit budget KPIs. | Avoids a new CRUD subsystem mid-L2. |
| D6 | **Real charts, graceful degradation, no fake data.** | Faithful reporting: where MF history is unwired, show an honest empty state, never synthetic numbers. |
| D7 | **Light frontend tests + TDD on logic/API + written manual test plan.** | TDD where bugs hide (formatters, transforms, new endpoints); manual in-browser verification (computer-use plugin) for UI/integration. |

---

## 3. Architecture

`apps/web` is a Vite SPA added to the pnpm workspace (`apps/*` already globbed).
It talks **only** to the Fastify REST API; it has no DB access and no financial
logic.

### Stack & dependencies
- `vite`, `@vitejs/plugin-react`, `react`/`react-dom` 19, `typescript`.
- `tailwindcss` — spike §4 design tokens encoded in `tailwind.config.ts`.
- `@tanstack/react-query` — all server-state (cache, loading/error, refetch, invalidation).
- `react-router-dom` — the 5-section nav.
- `recharts` — trend (line/area), donut, bar charts.
- `vitest` + `@testing-library/react` — light tests.
- Dev dep on `@myfinance/core` for shared **types only** (no runtime import of core in the browser bundle).

### Dev / runtime wiring
- Vite dev server **proxies `/api/*` → `http://localhost:<API_PORT>`** (configurable in `vite.config.ts`), so the browser hits a same-origin path — **no CORS plugin needed in the API**.
- `VITE_API_BASE` (default `/api`) is the single base-URL knob; prod can serve UI + API behind one origin.
- Scripts: `dev`, `build`, `preview`, `test`, `typecheck` (the last via `tsc --build`, consistent with the monorepo; build `core` first for `.d.ts`).
- Node 20 (repo `.nvmrc`).

### Design tokens (spike §4 → Tailwind theme)
- Primary blue `#1463F3` (actions/nav); green `#0E9F6E` / red `#E02424` **only** for financial deltas; violet `#7C5CFC` **reserved for AI**; canvas `#F7F8FA`; white cards, 12px radius, hairline borders, soft shadow.
- Fonts: Manrope (headings + big money numbers), Inter (body); **tabular numerals** everywhere.
- Per-asset-class soft accent chips for legends/breakdowns.

---

## 4. Folder structure & unit boundaries

```
apps/web/
  index.html
  vite.config.ts            ← React plugin + /api proxy + vitest config
  tailwind.config.ts        ← spike §4 design tokens
  tsconfig.json             ← references ../../packages/core
  src/
    main.tsx                ← React root + QueryClientProvider + RouterProvider
    App.tsx                 ← AppShell: persistent sidebar (5 nav items) + <Outlet/>
    lib/
      apiClient.ts          ← typed fetch wrapper; unwraps { data }; throws ApiError
      queryKeys.ts          ← centralized TanStack Query keys
      hooks/                ← one file per resource: useNetWorth, useNetWorthHistory,
                              useHoldings, useInvestmentSummary, useReturns, useAssets,
                              useLiabilities, useLiability, useExpenses, useExpenseSummary,
                              useAccounts, useCategories + mutation hooks
      format.ts             ← INR lakh/crore + compact (₹1.84Cr), %, dates  ← UNIT TESTED
      transforms.ts         ← allocation→chart data, history→series, breakdown shaping,
                              group-holdings-by-class  ← UNIT TESTED
    components/ui/          ← design-system kit ("the card is the primary unit")
      Card, KPIStat, Money, DeltaText, Badge (MARKET/COMPUTED/MANUAL),
      FreshnessChip, RangeToggle (1M/6M/1Y/ALL), TrendChart, DonutChart, BarChart,
      DataState (loading/error/empty wrapper), Sidebar, AIInsightCard (violet, static),
      Modal, FormField
    features/
      networth/   ← NetWorthPage
      investments/← InvestmentsPage, InvestmentAnalyzerPage, AddInvestmentModal
      expenses/   ← ExpensesPage
      loans/      ← LoansPage, AmortizationDrawer
      assistant/  ← AssistantPage (disabled "Coming in L4")
    types.ts                ← re-exports @myfinance/core types + web-only view types
```

### Unit boundaries (each: one purpose, testable in isolation)
- **`lib/format.ts`, `lib/transforms.ts`** — pure functions, no React. All silently-buggy logic (currency grouping, allocation %, series shaping, grouping holdings by class) lives here. **Unit-tested first (TDD).**
- **`lib/apiClient.ts` + `lib/hooks/*`** — the only place that touches the network. Components never call `fetch` directly.
- **`components/ui/*`** — dumb, presentational; props-in/JSX-out. A KPI card doesn't know which screen it's on.
- **`features/*`** — composition only: fetch via a hook → shape via a transform → render UI-kit components. Each screen reads end-to-end in one file.
- **`AIInsightCard`** — real styled component, **static placeholder copy** in L2. Reserves the spike §5.3 AI seam without pulling L4 forward.

---

## 5. Data flow

### Read flow (every screen)
```
Component → useXxx() hook → apiClient.get('/path', params)
         → fetch /api/path → server { data } → apiClient unwraps → typed value
         → TanStack Query cache → component renders via <DataState>
```
- `apiClient` builds the URL from `VITE_API_BASE`, sets JSON headers, checks `res.ok`, unwraps the `{ data }` envelope, and throws a typed `ApiError { status, message }` parsed from the API's `{ error: { message, statusCode } }`.
- Each hook is `useQuery` with a stable key from `queryKeys.ts`; filters (account, assetClass, period, date-range) are part of the key so caching is correct.
- `<DataState status error isEmpty>` is the **single** loading/error/empty wrapper. It is also where charts **gracefully degrade**: when a series is absent (MF historical gap), `<TrendChart>` shows an honest "history not available yet" hint — never synthetic data.

### Write flow
```
Modal/form → useMutation → apiClient.post/patch → on success:
queryClient.invalidateQueries(relevantKeys) → dashboards refetch
```
Write flows: **Add asset** (`POST /assets` — §3.4 form, per-class fields, live computed preview), **Add loan** (`POST /liabilities`), **Add account** (`POST /accounts`), **edit category** (`PATCH /categories/rules/:id` + `POST /recategorize`), **file import** (multipart `POST /imports/{expenses,investments/holdings,investments/transactions}`).

---

## 6. API contract consumed (existing) + additions

### Existing endpoints (all return `{ data }`)
| Endpoint | Used by | Shape (core type) |
|---|---|---|
| `GET /networth` | Net Worth hero/composition/summary | `NetWorthSummary` |
| `GET /networth/history?dates=` | Net Worth trend (degrades on MF gap) | `NetWorthPoint[]` |
| `GET /investments/summary` | Investments KPI strip | `PortfolioSummary` |
| `GET /investments/returns?period=` | Analyzer performance, period returns | `PeriodReturns` |
| `GET /investments/holdings?account&sortBy&sortOrder` | Investments MF group, Analyzer | `Holding[]` |
| `GET /investments/allocation?account` | Investments / sector donut | `AssetAllocation` |
| `GET /investments/accounts` | Account filter | `string[]` |
| `GET /assets?account&assetClass` | Investments non-MF groups, Net Worth | `ValuedAsset[]` |
| `POST /assets` (+ `/:id/contributions|valuations|rates`, PATCH, DELETE) | Add Investment | `{ id }` |
| `GET /liabilities?status` | Loans cards | `Liability[]` |
| `GET /liabilities/:id` | Amortization drawer | `{ liability, status: LoanStatus, schedule: AmortizationRow[] }` |
| `POST /liabilities` (PATCH, DELETE) | Add loan | `{ id }` |
| `GET /accounts?domain` / `POST /accounts` | Account picker / add | `Account[]` / `{ id }` |
| `GET /categories` | Category chips | category rows |
| `POST/PATCH/DELETE /categories/rules` + `POST /recategorize` | Category edit affordance | `{ ok }` |
| `POST /imports/*` | File import upload | import result |

### New read-only endpoints (this layer, TDD'd)
| Endpoint | Query params | Returns `{ data }` |
|---|---|---|
| `GET /expenses` | `from`, `to` (ISO), `direction` (`in`\|`out`), `search`, `categoryId`, `accountId`, `limit`, `offset` | filtered transaction rows (richer `/transactions`) |
| `GET /expenses/summary` | `from`, `to`, `accountId` | `{ totalSpent, totalIncome, saved, byCategory: [{categoryId, name, amount}], byMonth: [{month, spent}] }` |

- Implemented as **new repo query methods** (`expenseTxRepo.query(filters)`, `expenseTxRepo.summary(filters)`) so all SQL stays in the repo layer (L0 seam invariant); routes just call them.
- `saved = totalIncome − totalSpent`. Budget KPIs omitted (D5).
- Pure read aggregations over `expense_transactions` — **no XIRR/categorize/portfolio/NAV math** → **no Groww re-validation**.

---

## 7. Screens (against spike §3 mockups)

1. **Net Worth** (`mockups/01`): hero net-worth + period delta + `<TrendChart>` + `<RangeToggle>`; asset-class composition (stacked bar + legend); explicit Assets − Liabilities = Net Worth; per-class KPI cards (value + return + sparkline; manual classes show `<FreshnessChip>`); static `<AIInsightCard>`.
2. **Investments** (`mockups/02`): account filter + asset-class chips + `+ Add investment`; KPI strip (Invested · Current · Returns · **XIRR**); asset-class group cards each with a valuation `<Badge>` (MARKET/COMPUTED/MANUAL). MF group from `/investments/holdings`; non-MF from `/assets`.
3. **Investment Analyzer** (`mockups/03`): single-holding KPI row + `<TrendChart>` + sector donut + recent transactions + fund details. Embedded "ask a follow-up" input is **disabled placeholder** (L4).
4. **Add Investment** (`mockups/04`): ingestion-mode toggle (Manual ⇄ Import); asset-class picker tiles driving per-class fields; `COMPUTED`/`MANUAL` valuation note; linked-account dropdown + new-account; **live computed preview**.
5. **Expenses** (`mockups/05`): context subtitle + month stepper + `+ Add expense`; KPI strip (Total Spent · Income · Saved — no budget KPIs); inline collapsible `<AIInsightCard>` (static); spending donut + month-on-month `<BarChart>`; transaction list with editable category chip + account tag + auto-categorize "correct? ✓ ✗"; floating "Ask AI" (opens disabled drawer).
6. **Loans** (`mockups/06`): KPI strip (Outstanding · EMI · Interest Remaining · Avg Rate); loan cards with repayment-progress bar; `<AmortizationDrawer>` (from `/liabilities/:id`); payoff projection `<TrendChart>` + static prepayment insight.

---

## 8. Error handling & edge cases

- **API errors:** `apiClient` throws typed `ApiError`; `<DataState>` renders an inline error card with retry (TanStack `refetch`). No white-screen.
- **Empty data:** fresh DB / no holdings / no loans → purposeful empty state with the relevant "Add …" CTA.
- **Chart degradation:** absent time-series (MF-history gap) → honest "not available yet" hint; **never synthetic numbers**.
- **Form validation:** client-side required-field checks mirror the API's 400 rules (asset: accountId/assetClass/name/valuationStrategy; loan: principal/annualRate/startDate + tenure-or-EMI); server 400 message surfaced inline on rejection.
- **Money formatting:** one `formatINR` path (tabular numerals, lakh/crore), unit-tested on edges (0, negatives, crore boundary, null).

---

## 9. Testing strategy

### Automated (TDD — written first)
- **New API endpoints** (`/expenses`, `/expenses/summary`) → Vitest `inject()` tests in `packages/api`, plus repo-method tests in `packages/core` for the new query/summary methods.
- **`lib/format.ts`, `lib/transforms.ts`** → Vitest unit tests written before implementation.
- **UI components** → light smoke renders only (mount without crashing, key props render).

### Manual (in-browser via computer-use plugin) — written test plan
1. **Setup:** start API on a seeded DB; `pnpm -C apps/web dev`; open the app.
2. **Per screen** (Net Worth, Investments, Analyzer, Expenses, Loans): checklist of what to load, which numbers/badges/charts must appear, and what each should reflect:
   - Net Worth = Total Assets − Total Liabilities; composition sums to total.
   - MF group → MARKET badge + XIRR; FD → COMPUTED badge + maturity; Gold/RE → MANUAL + freshness chip.
   - Expenses: Saved = Income − Spent; donut categories sum to Total Spent; MoM bars present.
   - Loans: outstanding/EMI/progress match `/liabilities/:id`; amortization drawer opens with schedule rows.
3. **Write flows:** add an FD asset (verify live computed preview, then it appears in Investments + Net Worth); add a loan (verify amortization drawer); upload an import; edit a category (verify recategorize).
4. **Degradation:** confirm empty / error / no-history states render honestly (no fake data).
5. **Cross-check:** reconcile a couple of figures against raw API JSON (e.g. `/networth` total == hero number).

---

## 10. Build sequencing (for the plan)

1. Scaffold `apps/web` (Vite + Tailwind + Router + Query + tsconfig refs; `/api` proxy; design tokens).
2. `lib/format.ts` + `lib/transforms.ts` **TDD** (pure logic first).
3. New API endpoints `/expenses` + `/expenses/summary` **TDD** (repo methods + routes + inject tests).
4. `lib/apiClient.ts` + `queryKeys` + resource hooks.
5. UI kit (`components/ui/*`) — cards, badges, charts, `DataState`, sidebar shell.
6. Screens read-first, in IA order: Net Worth → Investments (+Analyzer) → Expenses → Loans → Assistant placeholder.
7. Write flows (Add asset/loan/account, edit category, import) with mutation + invalidation.
8. Smoke tests; write the manual test plan into the repo; self-review; subagent code review; PR; update MASTER_PLAN §4 + project-memory.

---

## 11. T1 gate

- New API endpoints + new repo methods + `lib` logic: **automated tests green**; `tsc --build` clean across `core`/`api`/`web`.
- Existing **core 215 + api 42 suites stay green**; **Groww golden-master unchanged** (no core financial logic touched — verified by the seam: only read aggregations added).
- Subagent code review: READY TO MERGE before PR.
- Manual browser test plan executed (computer-use plugin), screens verified against §7.
