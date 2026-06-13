# Investment Backend Implementation Tasks

## Overview
Backend implementation for the Investment section.

---

## Backend Tasks - ALL COMPLETE

| Task | File | Status |
|------|------|--------|
| 1.1 Database Schema | `src/db/initializeDatabase.ts` | Done |
| 2.1 Holdings Parser | `src/features/import/holdingsParser.ts` | Done |
| 2.2 Transaction Parser | `src/features/import/transactionParser.ts` | Done |
| 3.1 Scheme Service | `src/features/investment/services/schemeService.ts` | Done |
| 4.1 Import Holdings | `src/features/import/importHoldings.ts` | Done |
| 4.2 Import Transactions | `src/features/import/importInvestmentTransactions.ts` | Done |
| 5.1 Portfolio Service | `src/features/investment/services/portfolioService.ts` | Done |
| 5.2 Transaction Service | `src/features/investment/services/transactionService.ts` | Done |
| 6.1 NAV Service | `src/features/investment/navService.ts` | Done |
| 6.2 Returns Calculator | `src/features/investment/returnsCalculator.ts` | Done |
| 7.1 Export Services | `src/features/investment/services/index.ts` | Done |

---

# Frontend Implementation Tasks

## Stitch Design Reference
- Project: https://stitch.withgoogle.com/projects/9496136583829480788
- Screens: "Investments Portfolio", "Investments (Empty State)", "Investments (Grouped by AMC)"

## Design System (from Stitch)
```
Colors:
- Primary/Accent: #00535b (teal)
- Secondary/Success: #3a6847 (green for gains)
- Error/Danger: #ba1a1a (red for losses)
- Background: #fbf9f4 (off-white)
- Text: #1b1c19 (near-black)

Typography:
- Headlines: Manrope (use system font as fallback)
- Body: Public Sans (use system font)
- Labels: Inter (use system font)

Border Radius: 12px for cards, 8px for buttons/pills
```

---

## Phase 1: Core Components (Parallelizable)

### Task F1.1: Portfolio Summary Card Component
**File:** `src/components/investment/PortfolioSummaryCard.tsx`
**Description:** Main portfolio value card with XIRR badge and progress bar.

UI Elements:
- Large current value: "₹13,26,223" (bold, 28px)
- XIRR pill badge top-right: "11.97% XIRR" (teal background)
- Progress bar: invested vs current (teal fill on light background)
- Bottom row: "Invested ₹10.8L" (left) | "+₹2.44L (+22.57%)" (right, green/red based on gain/loss)

Props:
```typescript
type PortfolioSummaryCardProps = {
  currentValue: number;
  investedValue: number;
  returns: number;
  returnsPercent: number;
  xirr: number | null;
};
```

**Depends on:** Nothing
**Estimated complexity:** Low

---

### Task F1.2: Holding Card Component
**File:** `src/components/investment/HoldingCard.tsx`
**Description:** Expandable card for individual fund holdings.

UI Elements (Collapsed):
- Fund name (truncate if long)
- Category badge: "Small Cap" | "Large Cap" | etc.
- Units: "137.38 units" (muted)
- Current value: "₹23,346" (right aligned)
- Returns: "-₹1,651 (-6.34%)" (green for gain, red for loss)
- Chevron icon (▾/▴)

UI Elements (Expanded):
- Divider line
- Detail rows: AMC, Folio, Account, Invested, XIRR
- Each row: label (muted) | value (right aligned)

Props:
```typescript
type HoldingCardProps = {
  holding: Holding;  // from portfolioService
  isExpanded: boolean;
  onToggle: () => void;
};
```

**Depends on:** Nothing
**Estimated complexity:** Medium

---

### Task F1.3: AMC Group Card Component
**File:** `src/components/investment/AMCGroupCard.tsx`
**Description:** Collapsible section header for AMC grouping.

UI Elements:
- Folder icon
- AMC name + fund count: "Axis Mutual Fund (4 funds)"
- Total value: "₹4.7L" (right aligned)
- Expand/collapse chevron

When expanded, renders child HoldingCards.

Props:
```typescript
type AMCGroupCardProps = {
  amcName: string;
  holdings: Holding[];
  totalValue: number;
  isExpanded: boolean;
  onToggle: () => void;
};
```

**Depends on:** Task F1.2
**Estimated complexity:** Low

---

### Task F1.4: Period Selector Component
**File:** `src/components/investment/PeriodSelector.tsx`
**Description:** Horizontal scrollable period pills (1M, 3M, 6M, etc.)

UI Elements:
- Horizontal ScrollView
- Pills: 1M, 3M, 6M, YTD, 1Y, 3Y, 5Y, MAX
- Active: teal background, white text
- Inactive: light gray background, dark text

Props:
```typescript
type Period = '1M' | '3M' | '6M' | 'YTD' | '1Y' | '3Y' | '5Y' | 'MAX';
type PeriodSelectorProps = {
  selected: Period;
  onSelect: (period: Period) => void;
};
```

**Depends on:** Nothing
**Estimated complexity:** Low

---

### Task F1.5: Asset Type Toggle Component
**File:** `src/components/investment/AssetTypeToggle.tsx`
**Description:** Segmented control for All/Equity/Debt filter.

UI Elements:
- 3-segment toggle: [All] [Equity] [Debt]
- Active: teal background, white text
- Inactive: white background, muted text
- Similar to existing Expenses/Income toggle in FinancesScreen

Props:
```typescript
type AssetType = 'all' | 'equity' | 'debt';
type AssetTypeToggleProps = {
  selected: AssetType;
  onSelect: (type: AssetType) => void;
};
```

**Depends on:** Nothing
**Estimated complexity:** Low

---

### Task F1.6: Account Filter Dropdown
**File:** `src/components/investment/AccountFilter.tsx`
**Description:** Dropdown to filter by account.

UI Elements:
- Label: "Account:"
- Dropdown button: "[All Accounts ▾]"
- Dropdown menu with account options
- Checkmark on selected

Props:
```typescript
type AccountFilterProps = {
  accounts: string[];
  selected: string | null;  // null = all
  onSelect: (account: string | null) => void;
};
```

**Depends on:** Nothing
**Estimated complexity:** Low

---

### Task F1.7: Sort & Group Controls
**File:** `src/components/investment/SortGroupControls.tsx`
**Description:** Row with sort and group dropdowns.

UI Elements:
- "Sort by: [Current Value ▾]" dropdown
- "Group by: [None ▾]" dropdown
- Compact inline layout

Sort options: Current Value, Returns, XIRR, Invested
Group options: None, AMC, Category

Props:
```typescript
type SortBy = 'currentValue' | 'returns' | 'returnsPercent' | 'xirr' | 'invested';
type GroupBy = 'none' | 'amc' | 'category';
type SortGroupControlsProps = {
  sortBy: SortBy;
  groupBy: GroupBy;
  onSortChange: (sort: SortBy) => void;
  onGroupChange: (group: GroupBy) => void;
};
```

**Depends on:** Nothing
**Estimated complexity:** Low

---

### Task F1.8: Empty State Component
**File:** `src/components/investment/InvestmentEmptyState.tsx`
**Description:** Empty state when no holdings imported.

UI Elements:
- Centered layout
- Wallet icon (◈ or similar glyph)
- Headline: "No holdings imported yet"
- Description: "Connect your brokerage or import holdings to track your portfolio"
- CTA button: "Import Holdings" (teal filled button)
- Feature cards (optional):
  - "Secure Sync" - 256-bit encryption
  - "Deep Analysis" - asset allocation insights
  - "Auto Updates" - automatic portfolio updates

Props:
```typescript
type InvestmentEmptyStateProps = {
  onImportPress: () => void;
};
```

**Depends on:** Nothing
**Estimated complexity:** Low

---

## Phase 2: Main Screen

### Task F2.1: Investment Screen
**File:** `src/screens/InvestmentScreen.tsx`
**Description:** Main investment screen that composes all components.

Structure:
1. Account Filter (top)
2. Portfolio Summary Card
3. Asset Type Toggle (All/Equity/Debt)
4. Period Selector (1M, 3M, etc.) - for future returns display
5. Sort & Group Controls
6. Holdings List OR AMC Grouped List OR Empty State

State management:
- selectedAccount: string | null
- assetType: 'all' | 'equity' | 'debt'
- selectedPeriod: Period
- sortBy: SortBy
- groupBy: GroupBy
- expandedHoldingId: number | null
- expandedAmcName: string | null

Data fetching:
- Use portfolioService.getPortfolioSummary()
- Use portfolioService.getHoldings() with filters
- Use portfolioService.getAccounts()

Props (from App.tsx):
```typescript
type InvestmentScreenProps = {
  onGoToImport: () => void;
};
```

**Depends on:** All F1.x tasks
**Estimated complexity:** High

---

## Phase 3: App Integration

### Task F3.1: Update Bottom Navigation
**File:** `src/components/BottomNav.tsx`
**Description:** Add 4th tab for Investments.

Changes:
- Add 'investments' to sections
- Add glyph: ◈ (or similar investment/chart icon)
- Update layout for 4 tabs

**Depends on:** Nothing
**Estimated complexity:** Low

---

### Task F3.2: Update App.tsx
**File:** `App.tsx`
**Description:** Integrate InvestmentScreen into app navigation.

Changes:
- Add 'investments' to appSections array
- Add section label: 'Investments'
- Add InvestmentScreen render in main pane
- Wire up onGoToImport handler

**Depends on:** Task F2.1, F3.1
**Estimated complexity:** Low

---

### Task F3.3: Update Import Screen
**File:** `src/screens/ImportScreen.tsx`
**Description:** Add holdings and transaction import options.

Changes:
- Add "Import Holdings" section with file picker
- Add "Import Transactions" section with file picker
- Account name input/selector
- Investment app selector (Groww default)
- Show import summary after import
- Wire up to importHoldings and importInvestmentTransactions

**Depends on:** Nothing
**Estimated complexity:** Medium

---

## Dependency Graph

```
Phase 1 (Parallel):
  F1.1 PortfolioSummaryCard ─────┐
  F1.2 HoldingCard ──────────────┤
  F1.3 AMCGroupCard (needs F1.2) ┤
  F1.4 PeriodSelector ───────────┼───→ F2.1 InvestmentScreen ──→ F3.2 App.tsx
  F1.5 AssetTypeToggle ──────────┤
  F1.6 AccountFilter ────────────┤
  F1.7 SortGroupControls ────────┤
  F1.8 EmptyState ───────────────┘

  F3.1 BottomNav ────────────────────→ F3.2 App.tsx
  F3.3 ImportScreen (independent)
```

## Parallel Execution Plan

**Batch 1 (start immediately):**
- F1.1: Portfolio Summary Card
- F1.2: Holding Card
- F1.4: Period Selector
- F1.5: Asset Type Toggle
- F1.6: Account Filter
- F1.7: Sort & Group Controls
- F1.8: Empty State
- F3.1: Update Bottom Nav
- F3.3: Update Import Screen

**Batch 2 (after F1.2 done):**
- F1.3: AMC Group Card

**Batch 3 (after all F1.x done):**
- F2.1: Investment Screen

**Batch 4 (final):**
- F3.2: Update App.tsx
