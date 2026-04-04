  # MyFinance

MyFinance is an Android-first personal finance app for private, local-first financial tracking.

The north star is to make this the single place where a person can track all of their finances: daily expenses first, then investments, loans, and other assets over time.

Today, the app focuses on manual bank statement import and local expense tracking. It currently supports HDFC statement import, but that is the starting point rather than the final product boundary. Over time, the app is expected to support additional statement formats and broader financial workflows.

All parsing, categorization, rule management, and reporting currently happen on-device. There is no backend, no cloud sync, and no bank API dependency in the current version. Local-first is the present product model, while future integrations may be explored once the core finance-tracking experience is solid.

## Product Goal

The immediate goal is to turn raw bank statement data into a clean, editable financial ledger on the phone.

The longer-term goal is to evolve MyFinance into a unified personal finance workspace that helps the user track:
- daily expenses
- investments
- loans
- other assets and liabilities

The product is intentionally phased:
- start with daily expense tracking and statement import
- make categorization trustworthy and editable
- expand from expenses into full personal finance coverage

Core workflows:
- import supported bank statements from device storage
- parse transactions locally
- dedupe repeated imports safely
- categorize transactions from narration using rules
- let the user manually correct categories
- learn from those corrections through merchant memory and UPI note rules

## Current Product Model

The app is organized into 3 user-facing sections:

- `Finances`
  Shows debit/credit summaries, category filtering, and the transaction ledger.
- `Rules`
  Lets the user create and edit categorization rules and manage categories.
- `Import`
  Handles statement import and communicates import status. HDFC `.xls` is the currently supported format.

Current scope:
- local-first only
- manual statement import
- expense-ledger focused

Planned expansion areas:
- additional bank statement formats
- broader finance entities beyond expense transactions
- future integrations where they meaningfully improve the product

## Categorization Strategy

Categorization is deterministic and local.

Priority order:
1. manual transaction override
2. saved merchant rule
3. saved UPI note keyword rule
4. built-in fallback rule
5. uncategorized

This is intentional. The app should be explainable and controllable, not opaque.

## Data Model

SQLite is the source of truth on device.

Main tables:
- `transactions`
- `categories`
- `category_rules`
- `import_history`

Transactions store:
- date
- amount
- direction (`debit` / `credit`)
- raw description
- merchant key
- UPI note keyword
- assigned category
- category source
- import metadata

## Tech Stack

- `Expo`
- `React Native`
- `TypeScript`
- `expo-sqlite`
- `expo-document-picker`
- `xlsx`

No cloud infra is used in the current version.

## Code Structure

Top-level:
- [App.tsx](/Users/vkhandelwal/Documents/MyFinance/App.tsx)
  App shell, shared dashboard state, screen orchestration, and DB-backed actions.

Screens:
- [src/screens/FinancesScreen.tsx](/Users/vkhandelwal/Documents/MyFinance/src/screens/FinancesScreen.tsx)
  Finance dashboard and transaction ledger UI.
- [src/screens/RulesScreen.tsx](/Users/vkhandelwal/Documents/MyFinance/src/screens/RulesScreen.tsx)
  Rule management and category management UI.
- [src/screens/ImportScreen.tsx](/Users/vkhandelwal/Documents/MyFinance/src/screens/ImportScreen.tsx)
  Import flow UI.

Shared UI:
- [src/components/AppHeader.tsx](/Users/vkhandelwal/Documents/MyFinance/src/components/AppHeader.tsx)
  Top app header and section menu.
- [src/components/BottomNav.tsx](/Users/vkhandelwal/Documents/MyFinance/src/components/BottomNav.tsx)
  Bottom navigation for `Finances`, `Rules`, and `Import`.

Business logic:
- [src/features/import/hdfcParser.ts](/Users/vkhandelwal/Documents/MyFinance/src/features/import/hdfcParser.ts)
  HDFC `.xls` parsing. This is the current import implementation and likely the template for future statement parsers.
- [src/features/import/importTransactions.ts](/Users/vkhandelwal/Documents/MyFinance/src/features/import/importTransactions.ts)
  Import pipeline, dedupe, DB insertion.
- [src/features/categorization/categorizeTransaction.ts](/Users/vkhandelwal/Documents/MyFinance/src/features/categorization/categorizeTransaction.ts)
  Categorization engine, rule resolution, merchant memory, recategorization.
- [src/features/categorization/manageRules.ts](/Users/vkhandelwal/Documents/MyFinance/src/features/categorization/manageRules.ts)
  Rule CRUD and rule reapplication.
- [src/features/categories/manageCategories.ts](/Users/vkhandelwal/Documents/MyFinance/src/features/categories/manageCategories.ts)
  Category CRUD and cascading updates.
- [src/features/transactions/presentTransaction.ts](/Users/vkhandelwal/Documents/MyFinance/src/features/transactions/presentTransaction.ts)
  Converts raw narration into cleaner display fields.

Persistence:
- [src/db/initializeDatabase.ts](/Users/vkhandelwal/Documents/MyFinance/src/db/initializeDatabase.ts)
  SQLite schema setup, migrations, and initial category seeding.

Theme:
- [src/theme/palette.ts](/Users/vkhandelwal/Documents/MyFinance/src/theme/palette.ts)
  Shared color tokens.

## Design Direction

The UI direction is:
- premium utility
- quiet, precise, and trustworthy
- ledger-first, not marketing-first
- modern but not flashy
- local-first and privacy-conscious

Recent design work has been aligned to Stitch-generated mobile designs, but implemented natively in Expo rather than copied from web code.

## How To Run

```bash
cd /Users/vkhandelwal/Documents/MyFinance
source ~/.zshrc
pnpm run android
```

Typecheck:

```bash
source ~/.zshrc
pnpm exec tsc --noEmit
```

## Important Notes For Future Agents

- The product vision is broader than HDFC import. HDFC is the first supported import path, not the final boundary.
- The product vision is broader than expense tracking. Expenses are phase 1, not the end state.
- Keep the app local-first by default. Do not introduce backend/cloud dependencies casually.
- Preserve deterministic categorization behavior unless explicitly changing the product direction.
- Prefer extending the existing `features/` modules over adding business logic directly into screens.
- Keep `App.tsx` as orchestration. New UI should generally go into `screens/` or `components/`.
- If importing new statement formats, keep HDFC `.xls` support stable while generalizing the import architecture.
- If changing rules or category behavior, remember historical transactions are expected to update accordingly.

## Next Good Refactors

If continuing cleanup, the next useful steps are:
- extract a `useDashboardData` hook from `App.tsx`
- split `FinancesScreen` into smaller reusable components
- split `RulesScreen` into `RuleForm`, `RuleList`, and `CategoryManager`
- continue tightening UI fidelity against the selected Stitch designs
