# @myfinance/mcp

Read-only MCP server exposing MyFinance core financial data over stdio.

## Tools

The server provides 10 read-only tools:

- `get_net_worth` — net-worth summary (totalAssets, totalLiabilities, netWorth)
- `get_portfolio_summary` — MF portfolio (totalInvested, totalCurrentValue, totalReturns, xirr)
- `list_investments` — MF holdings with current values + returns
- `get_investment_returns` — period returns (ALL, 1Y, 6M, 3M, 1M) with XIRR
- `list_asset_classes` — generic assets grouped by class (PPF/FD/gold/real_estate/cash)
- `list_liabilities` — loans with outstanding principal + EMI + next due date
- `list_expense_transactions` — expense txns (filterable by date/category/account/direction)
- `get_expense_summary` — totalSpent, totalIncome, saved, investmentCategories, byCategory, byMonth
- `list_accounts` — accounts (investment-domain or expense-domain)
- `list_categories` — expense categories with icons

All tools operate over the SQLite database at the path specified by `DB_PATH` (default `myfinance.db`). They are READ-ONLY — no mutations.

## Usage

Build (from repo root):
```bash
node_modules/.bin/tsc --build packages/mcp
```

Run:
```bash
DB_PATH=myfinance.db node packages/mcp/dist/index.js
```

The server communicates over stdio (MCP protocol). To inspect interactively, use the MCP inspector:
```bash
npx @modelcontextprotocol/inspector node packages/mcp/dist/index.js
```

## Write seam (reserved for L4)

This is a read-only server. Write operations (add transaction, import file, create account, etc.) are reserved for the L4 (AI Agents) layer, which will extend this server with mutation tools that route through the MyFinance API for validation + side-effects.
