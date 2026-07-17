# @myfinance/mcp

MCP server exposing MyFinance `core` financial data as agent tools over stdio.
It is a thin, task-shaped wrapper over the already-tested `@myfinance/core` domain logic —
it validates inputs, calls core, and shapes results into agent-friendly JSON. This is the
tool contract the L4 AI agents bind to.

## Tools (32: 10 read + 22 write)

### Read tools

- `get_networth_overview` — assets − liabilities, per-asset-class breakdown, every valued asset (MF projected in at read time)
- `get_investment_portfolio` — MF summary (invested/current/returns/`xirrFraction`) + holdings + allocation; optional `period`/`account`
- `get_investment_returns` — period returns over a window (`1M`…`ALL`) with `xirrFraction`
- `get_expense_summary` — total spent/income/saved/invested + by-category + by-month for a date range
- `list_transactions` — expense/bank transactions, paginated + filterable (from/to/direction/search/categoryId/accountId)
- `get_loans_overview` — active loans with computed EMI, outstanding, next due, payoff progress
- `get_loan_amortization` — full amortization schedule for one `liabilityId`
- `list_accounts` — accounts, optional `domain` filter (investment | expense)
- `search_schemes` — search mutual-fund schemes by name (external market data)
- `get_scheme_nav` — latest NAV (and optional history) for a scheme by AMFI code (external market data)

### Write tools (L4 mutation primitives)

Composable dashboard writes — thin wrappers over existing core repos. Destructive or wide-blast
operations are **preview-gated**: call without `confirm: true` to see what would change (nothing
is mutated); re-call with `confirm: true` to proceed.

- **Transactions:** `add_transaction`, `update_transaction`, `delete_transaction`, `categorize_transaction`
- **Categories & rules:** `create_category`, `rename_category`, `delete_category`, `create_rule`, `update_rule`, `delete_rule`, `recategorize_all`
- **Accounts:** `create_account`
- **Assets:** `add_asset`, `update_asset`, `close_asset`, `add_asset_contribution`, `add_asset_valuation`, `add_asset_rate`, `delete_asset`
- **Liabilities:** `add_liability`, `update_liability`, `delete_liability`

**Split recipe (no dedicated tool):** shrink the original via `update_transaction`, then
`add_transaction` for the remainder — two separate calls, not atomic; verify with `list_transactions`.

**Units:** all money fields are INR (`*Inr` suffix, raw numbers); `*Percent` is an already-scaled
percentage; `xirrFraction` is a raw fraction (`0.0949` = 9.49%). Each tool description states its units.

**Data source:** the SQLite database at `DB_PATH` (default `myfinance.db`) — the **same** env var
and DB the API uses. Empty data is a valid (non-error) result; only genuinely-malformed calls or
external market-data outages surface as errors.

## Run

The server runs TypeScript directly via `tsx` (no build step — the same convention the API uses
with `tsx src/server.ts`):

```bash
# from repo root
DB_PATH=myfinance.db node_modules/.bin/tsx packages/mcp/src/index.ts
# or, from packages/mcp:  pnpm start
```

It speaks the MCP protocol over stdio. To inspect interactively:

```bash
DB_PATH=myfinance.db npx @modelcontextprotocol/inspector node_modules/.bin/tsx packages/mcp/src/index.ts
```

Typecheck: `node_modules/.bin/tsc --build packages/core packages/mcp` (core first — mcp is a composite leaf referencing it).

## Transport

stdio only for L3/L4 write slice. `buildServer(ctx)` is transport-agnostic, so an HTTP transport is a later
drop-in (swap `StdioServerTransport` for the SDK's HTTP transport in `src/index.ts` — no tool changes).

## Architecture

Write tools live in `src/tools/write/` and are always registered alongside the read tools.
`buildContext` provides `runInTransaction` for atomic multi-write handlers (e.g. `categorize_transaction`).
