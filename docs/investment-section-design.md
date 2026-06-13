# Investment Section Design Plan

## Context

The user wants to add an Investment section to the MyFinance app to track mutual fund holdings. They have a sample holdings statement from Groww (`Holdings_Statement_2026-04-04.xlsx`) that contains portfolio summary and individual fund details. The goal is to design and implement an Investment screen that shows portfolio value, gains/losses, and individual holdings with filtering capabilities.

---

## Holdings Data Structure (from Excel)

**Summary Section:**
- Total Investments: ₹10,82,030.81
- Current Portfolio Value: ₹13,26,223.31
- Profit/Loss: ₹2,44,192.50 (+22.57%)
- XIRR: 11.97%

**Per-Fund Details:**
- Scheme Name, AMC, Category (Equity/Debt), Sub-category (Small Cap, Large Cap, Ultra Short Duration)
- Folio No., Source (Groww), Units
- Invested Value, Current Value, Returns, XIRR

---

## Investment Screen Design

### 1. Portfolio Summary Card

```
┌─────────────────────────────────────────────────────┐
│ CURRENT VALUE                              XIRR     │
│ ₹13,26,223                                11.97%   │
│                                                     │
│ [████████████████████░░░░░░░░░]  (progress bar)    │
│                                                     │
│ Invested              Gains                         │
│ ₹10.8L               +₹2.44L (+22.57%)             │
└─────────────────────────────────────────────────────┘
```

- Large current value (primary metric)
- XIRR badge in top-right
- Visual meter showing invested vs current ratio
- Gains shown in green (palette.success), losses in rust (palette.danger)

### 2. Account & App Filter

```
┌─────────────────────────────────────────────────────┐
│ Account: [All Accounts ▾]    App: [All Apps ▾]     │
└─────────────────────────────────────────────────────┘
```

- Dropdown to filter by account (Personal, Wife, etc.)
- Dropdown to filter by investment app (Groww, Coin, etc.)
- "All" shows combined portfolio across accounts/apps

### 3. Asset Type Toggle

```
┌──────────────────┬──────────────────┐
│       All        │      Equity      │      Debt      │
└──────────────────┴──────────────────┘
```

- Similar to Expenses/Income toggle in FinancesScreen
- Filters holdings by asset type

### 4. Sorting & Grouping Controls

```
┌─────────────────────────────────────────────────────┐
│ Sort by: [Current Value ▾]    Group by: [AMC ▾]    │
└─────────────────────────────────────────────────────┘
```

**Sort Options:**
- Current Value (default, high to low)
- Returns Amount
- Returns % / XIRR
- Invested Value

**Group Options:**
- None (flat list)
- By AMC (Axis, SBI, Nippon, ICICI, etc.)
- By Category (Equity / Debt)

### 5. Holdings List (with Expandable Details)

**Collapsed State:**
```
┌─────────────────────────────────────────────────────┐
│ Nippon India Small Cap Fund Direct Growth        ▾  │
│ Small Cap  •  137.38 units                          │
│ ₹24,998 → ₹23,346         -₹1,651 (-6.34%)         │
└─────────────────────────────────────────────────────┘
```

**Expanded State (tap to expand):**
```
┌─────────────────────────────────────────────────────┐
│ Nippon India Small Cap Fund Direct Growth        ▴  │
│ Small Cap  •  137.38 units                          │
│ ₹24,998 → ₹23,346         -₹1,651 (-6.34%)         │
├─────────────────────────────────────────────────────┤
│ AMC            Nippon India Mutual Fund             │
│ Folio No.      477375211091                         │
│ Source         Groww                                │
│ XIRR           -6.34%                               │
│ As of          04 Apr 2026                          │
└─────────────────────────────────────────────────────┘
```

**With AMC Grouping:**
```
┌─────────────────────────────────────────────────────┐
│ ▼ Axis Mutual Fund (4 funds)           ₹4.7L total │
├─────────────────────────────────────────────────────┤
│   Axis Large Cap Fund...                            │
│   Axis Nifty 50 Index Fund...                       │
│   ...                                               │
├─────────────────────────────────────────────────────┤
│ ▼ SBI Mutual Fund (2 funds)            ₹3.1L total │
├─────────────────────────────────────────────────────┤
│   SBI Small Cap Fund...                             │
│   ...                                               │
└─────────────────────────────────────────────────────┘
```

- Fund name with expand/collapse chevron
- Sub-category and units on second line
- Invested → Current with returns (color-coded)
- Expanded view shows all details (AMC, folio, source, XIRR, date)

### 6. Empty State

- Icon badge with chart/investment icon
- "No holdings imported yet"
- CTA button: "Import Holdings Statement"

### 7. Holdings Import Flow

```
┌─────────────────────────────────────────────────────┐
│ Import Holdings                                     │
├─────────────────────────────────────────────────────┤
│                                                     │
│ Account Name: [Personal ▾]  or  [+ New Account]    │
│                                                     │
│ Investment App: [Groww ▾]                           │
│                                                     │
│ [Select Holdings Statement File]                    │
│                                                     │
│ ┌─────────────────────────────────────────────────┐ │
│ │ 📄 Holdings_Statement_2026-04-04.xlsx          │ │
│ │    As-of date: Apr 04 2026                     │ │
│ │    11 holdings found                            │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│ ⚠️ This will replace holdings as of Apr 04 2026    │
│    for "Personal" account on "Groww"               │
│                                                     │
│              [Import]                               │
└─────────────────────────────────────────────────────┘
```

- User selects or creates account name
- User selects investment app (Groww for now)
- File is parsed to detect as-of date
- Only holdings for that account+app+date are replaced

---

## Database Schema

### New Tables

```sql
-- Master table for fund metadata (enables flexible LLM queries)
CREATE TABLE IF NOT EXISTS investment_schemes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scheme_name TEXT NOT NULL,
  amfi_code TEXT,                    -- Standard ID for NAV API (mfapi.in)
  isin TEXT,
  amc_name TEXT,
  category TEXT CHECK (category IN ('equity', 'debt', 'hybrid', 'other')),
  sub_category TEXT,                 -- small cap, large cap, ultra short duration, etc.
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(scheme_name, amc_name)
);

CREATE TABLE IF NOT EXISTS investment_import_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_name TEXT NOT NULL,         -- User-defined label: "Personal", "Wife's Account", etc.
  investment_app TEXT NOT NULL,       -- Platform: "groww", "coin", "kuvera", etc.
  import_type TEXT NOT NULL CHECK (import_type IN ('holdings', 'transactions')),
  file_name TEXT,
  start_date TEXT NOT NULL,           -- Start of date range imported
  end_date TEXT NOT NULL,             -- End of date range imported (same as start for holdings)
  record_count INTEGER,               -- Number of records imported
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Holdings-specific summary (NULL for transactions)
  total_invested REAL,
  total_current_value REAL,
  total_xirr REAL,
  holder_name TEXT,
  holder_pan TEXT
);

CREATE TABLE IF NOT EXISTS investment_holdings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_history_id INTEGER NOT NULL,
  scheme_id INTEGER,                  -- FK to schemes (NULL until matched)
  account_name TEXT NOT NULL,         -- Denormalized for easy filtering
  investment_app TEXT NOT NULL,       -- Denormalized for easy filtering
  scheme_name TEXT NOT NULL,          -- Original name from import (for display)
  folio_number TEXT,
  units REAL NOT NULL,
  invested_value REAL NOT NULL,
  current_value REAL NOT NULL,
  returns_amount REAL NOT NULL,
  returns_xirr REAL,
  as_of_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (import_history_id) REFERENCES investment_import_history (id),
  FOREIGN KEY (scheme_id) REFERENCES investment_schemes (id)
);

-- Note: No dedupe_key needed - date-range deletion prevents duplicates.
-- Category/sub_category now comes from schemes table via scheme_id.

CREATE TABLE IF NOT EXISTS investment_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scheme_id INTEGER,                  -- FK to schemes (NULL until matched)
  account_name TEXT NOT NULL,
  investment_app TEXT NOT NULL,
  scheme_name TEXT NOT NULL,          -- Original name from import
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('PURCHASE', 'REDEMPTION', 'SWITCH_IN', 'SWITCH_OUT', 'DIVIDEND')),
  units REAL NOT NULL,
  nav REAL NOT NULL,
  amount REAL NOT NULL,
  transaction_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (scheme_id) REFERENCES investment_schemes (id)
);

-- Note: No dedupe_key needed since we use date-range deletion strategy.
-- Identical transactions (same fund, date, amount = multiple SIPs) are 
-- preserved as separate rows - they represent real distinct transactions.

CREATE INDEX IF NOT EXISTS idx_investment_schemes_category ON investment_schemes (category, sub_category);
CREATE INDEX IF NOT EXISTS idx_investment_schemes_amc ON investment_schemes (amc_name);
CREATE INDEX IF NOT EXISTS idx_investment_holdings_scheme ON investment_holdings (scheme_id);
CREATE INDEX IF NOT EXISTS idx_investment_holdings_date ON investment_holdings (as_of_date DESC);
CREATE INDEX IF NOT EXISTS idx_investment_holdings_account ON investment_holdings (account_name, investment_app);
CREATE INDEX IF NOT EXISTS idx_investment_transactions_scheme ON investment_transactions (scheme_id);
CREATE INDEX IF NOT EXISTS idx_investment_transactions_account ON investment_transactions (account_name, investment_app);
CREATE INDEX IF NOT EXISTS idx_investment_transactions_date ON investment_transactions (transaction_date DESC);
```

**Import Strategy (Date Range Replacement):**

1. Parse file to detect date range (start_date, end_date)
   - Groww transaction file has: "Date Range: Apr 01 2025 to Mar 31 2026" in header
   - Holdings file has: as-of date (single date)
2. User selects `account_name` + `investment_app`
3. Delete existing records WHERE:
   - `account_name` = selected account AND
   - `investment_app` = selected app AND
   - `transaction_date` (or `as_of_date`) BETWEEN start_date AND end_date
4. Insert new records

**Benefits:**
- Import Jan-Mar data, later import Apr-Jun → both periods preserved
- Re-import Jan-Mar with corrections → only Jan-Mar replaced
- No accidental data loss from other date ranges

**Example flow:**
```
Existing data: Personal + Groww → Jan 2025 - Mar 2026

Import file: Apr 2025 - Mar 2026 (Personal + Groww)
  → Deletes: Apr 2025 - Mar 2026 records only
  → Keeps: Jan 2025 - Mar 2025 records
  → Inserts: New Apr 2025 - Mar 2026 records
```

**Example accounts:**
| account_name | investment_app |
|--------------|----------------|
| Personal     | groww          |
| Wife         | groww          |
| Personal     | coin           |

**Scheme Matching Strategy:**
1. On import, store raw `scheme_name` from file
2. Attempt to match against `schemes` table by name
3. If no match, create new scheme entry (category/sub_category from import file)
4. Later: enrich with AMFI code via API lookup for NAV fetching

```
Import: "Axis Nifty 50 Index Fund Direct Growth"
  → Search schemes table
  → Found? Link scheme_id
  → Not found? Create scheme, then link
```

---

## File Structure

### New Files to Create

| File | Purpose |
|------|---------|
| `src/screens/InvestmentScreen.tsx` | Main investment screen UI |
| `src/features/import/holdingsParser.ts` | Parse holdings Excel files (Groww format) |
| `src/features/import/transactionParser.ts` | Parse transaction history Excel (Groww format) |
| `src/features/import/importHoldings.ts` | Import holdings to database |
| `src/features/import/importTransactions.ts` | Import transactions to database |
| `src/features/investment/navService.ts` | Fetch historical NAV from mfapi.in |
| `src/features/investment/returnsCalculator.ts` | Calculate period-wise returns |
| `src/features/investment/services/portfolioService.ts` | Portfolio summary & holdings queries |
| `src/features/investment/services/transactionService.ts` | Transaction queries |
| `src/features/investment/services/schemeService.ts` | Scheme lookup & matching |
| `src/features/investment/services/index.ts` | Export all services (MCP-ready interface) |

### Files to Modify

| File | Changes |
|------|---------|
| `App.tsx` | Add 'investments' section, state, handlers |
| `src/db/initializeDatabase.ts` | Add holdings tables |
| `src/components/BottomNav.tsx` | Add investments tab with glyph |
| `src/screens/ImportScreen.tsx` | Add holdings import option |

---

## Implementation Steps

### Phase 1: Database
1. Add holdings tables to `initializeDatabase.ts`

### Phase 2: Parser
2. Create `holdingsParser.ts` with header detection for Groww format
3. Create `importHoldings.ts` with deduplication logic

### Phase 3: UI
4. Create `InvestmentScreen.tsx` with:
   - Portfolio summary card
   - Asset type toggle (All / Equity / Debt)
   - Sorting & grouping controls
   - Holdings list with expandable details
   - AMC grouping view
   - Empty state
5. Update `BottomNav.tsx` with investments glyph
6. Update `App.tsx` with investments section and state

### Phase 4: Integration
7. Add holdings import to ImportScreen (as second option alongside Bank Statement)
8. Add import CTA in InvestmentScreen empty state and as refresh/re-import option

---

## Verification

1. Import the sample holdings statement
2. Verify summary values match Excel (₹10.8L invested, ₹13.26L current)
3. Verify all 11 funds are imported
4. Test asset type filter (Equity vs Debt)
5. Test sorting options (by value, returns, XIRR)
6. Test AMC grouping
7. Verify gains shown in green, losses in rust
8. Test re-import (should replace, not duplicate)

---

## User Preferences (Confirmed)

- **Import Flow**: Both places - Investment screen AND Import screen
- **Features**: Sorting options, AMC grouping, Expandable holding details
- **History**: Latest only - new import replaces previous data (simpler)
- **Multi-account**: Support multiple accounts per investment app
- **Multi-platform**: Support multiple investment apps (Groww now, others later)

---

## Transaction Import (for Period-wise Returns)

### Why Transactions?

Holdings snapshot only shows current state. For period-wise returns (1M, 3M, 1Y, etc.), we need:
- When each unit was purchased
- Historical NAV to calculate value at past dates

### Groww Transaction History Format

Source: `Mutual_Funds_Order_History_YYYY_YYYY.xlsx`

| Column | Example | Notes |
|--------|---------|-------|
| Scheme Name | Axis Nifty 50 Index Fund Direct Growth | Full fund name |
| Transaction Type | PURCHASE | Also: REDEMPTION, SWITCH |
| Units | 341.11 | Decimal |
| NAV | 14.66 | Purchase/redemption NAV |
| Amount | 4,999 | Has commas (parse needed) |
| Date | 10 Mar 2026 | DD MMM YYYY format |

**Note:** No transaction ID in export. Duplicates possible (same fund, date, amount = different SIPs).

### Import Flow

```
┌─────────────────────────────────────────────────────┐
│ Import Transactions                                 │
├─────────────────────────────────────────────────────┤
│                                                     │
│ Account Name: [Personal ▾]  or  [+ New Account]    │
│                                                     │
│ Investment App: [Groww ▾]                           │
│                                                     │
│ [Select Transaction History File]                   │
│                                                     │
│ ┌─────────────────────────────────────────────────┐ │
│ │ 📄 Mutual_Funds_Order_History_2025_2026.xlsx   │ │
│ │    Date range: Apr 01 2025 → Mar 31 2026       │ │
│ │    42 transactions found                        │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│ ⚠️ This will replace transactions from              │
│    Apr 01 2025 to Mar 31 2026                       │
│    for "Personal" account on "Groww"               │
│                                                     │
│              [Import]                               │
└─────────────────────────────────────────────────────┘
```

### Period-wise Returns Calculation

With transactions + NAV API (mfapi.in), we can calculate:

| Feature | Calculation |
|---------|-------------|
| Invested at date X | Sum of purchases - redemptions up to X |
| Units at date X | Sum of units bought - sold up to X |
| Value at date X | Units × NAV (from API) |
| Period return | (End Value - Start Value - Net Investment) / Start Value |
| Period XIRR | XIRR of cash flows within the period |

### Period Options

```
┌─────────────────────────────────────────────────────┐
│ [1M] [3M] [6M] [YTD] [1Y] [3Y] [5Y] [Max] [Custom] │
└─────────────────────────────────────────────────────┘
```

---

---

## Service Layer (MCP-Ready)

Design services with clean interfaces that can be exposed as MCP tools later.

### Core Services

```typescript
// src/features/investment/services/

// Portfolio queries
getPortfolioSummary(filters?: {
  account?: string;
  app?: string;
  asOfDate?: string;
}): PortfolioSummary

getHoldings(filters?: {
  account?: string;
  app?: string;
  category?: 'equity' | 'debt' | 'hybrid';
  amc?: string;
  scheme?: string;
}): Holding[]

// Transaction queries
getTransactions(filters?: {
  account?: string;
  app?: string;
  scheme?: string;
  type?: 'PURCHASE' | 'REDEMPTION' | ...;
  startDate?: string;
  endDate?: string;
}): Transaction[]

// Returns calculation
getPeriodReturns(params: {
  period: '1M' | '3M' | '6M' | 'YTD' | '1Y' | '3Y' | '5Y' | 'MAX';
  account?: string;
  app?: string;
  scheme?: string;
}): PeriodReturns

// Asset allocation
getAssetAllocation(filters?: {
  account?: string;
  app?: string;
}): { category: string; value: number; percentage: number }[]

// Scheme lookup
getSchemes(filters?: {
  category?: string;
  amc?: string;
  search?: string;
}): Scheme[]
```

### MCP Tool Examples (Future)

These services become natural MCP tools:
- "What's my total portfolio value?" → `getPortfolioSummary()`
- "Show all small cap funds" → `getHoldings({ category: 'equity', subCategory: 'small cap' })`
- "How did my investments do last year?" → `getPeriodReturns({ period: '1Y' })`
- "List all transactions in March" → `getTransactions({ startDate, endDate })`

---

## Future Enhancements (Deferred)

1. **Benchmark Comparison** - Compare returns vs Nifty 50, Sensex, etc.
2. **CAS PDF Import** - For cross-platform holdings (CAMS/KFintech)
3. **Asset Allocation Chart** - Pie chart of equity/debt split
4. **Fund Overlap Analysis** - Common stocks across funds
5. **LTCG/STCG Indicator** - Tax implications on redemption
6. **MCP Server** - Expose services as MCP tools for natural language queries
