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
  - Month selector with prev/next navigation and month picker modal
  - Custom date range selection with quick presets (Last 14 days, 90 days, Current Quarter, 6 Months, Full Year, All Time)
  - Direction toggle (Expenses/Income)
  - Summary card with period totals and savings rate
  - Opening/Closing balance display (derived from bank statement balances)
  - Category insights with percentage breakdown and horizontal scrollable tiles
  - Multi-select category filtering
  - Transaction ledger with inline category editing
  - Category change confirmation modal (one-time vs create rule)

- `Rules`
  Lets the user create and edit categorization rules (merchant-based or UPI note-based) and manage categories.

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
- `transactions` - Financial transactions with categorization
- `categories` - User-defined and starter categories
- `category_rules` - Merchant and UPI note keyword rules
- `import_history` - Import audit trail

Transactions store:
- date (transaction_date, value_date)
- amount and direction (`debit` / `credit`)
- raw and normalized description
- merchant key (extracted from narration)
- UPI note keyword (extracted from UPI transactions)
- assigned category and category source (`manual`, `rule`, etc.)
- balance (from bank statement)
- dedupe key (prevents duplicate imports)
- import metadata (source file, import history reference)

Starter categories (seeded on first launch):
- Food, Groceries, Transport, Shopping
- Investment, Loan, Bills, Health
- Travel, Transfer

## Tech Stack

- `Expo` (~54.0.33) with New Architecture enabled
- `React Native` (0.81.5)
- `TypeScript` (~5.9.2)
- `expo-sqlite` - Local SQLite database
- `expo-document-picker` - File selection for statement import
- `expo-file-system` - Reading imported files
- `@react-native-community/datetimepicker` - Native date picker for custom date ranges
- `xlsx` - Parsing HDFC `.xls` bank statements

No cloud infra is used in the current version.

## Code Structure

Top-level:
- `App.tsx` - App shell, shared dashboard state, screen orchestration, and DB-backed actions.

Screens:
- `src/screens/FinancesScreen.tsx` - Finance dashboard and transaction ledger UI.
- `src/screens/RulesScreen.tsx` - Rule management and category management UI.
- `src/screens/ImportScreen.tsx` - Import flow UI.

Shared UI:
- `src/components/AppHeader.tsx` - Top app header and section menu.
- `src/components/BottomNav.tsx` - Bottom navigation for `Finances`, `Rules`, and `Import`.

Business logic:
- `src/features/import/hdfcParser.ts` - HDFC `.xls` parsing. This is the current import implementation and likely the template for future statement parsers.
- `src/features/import/importTransactions.ts` - Import pipeline, dedupe, DB insertion.
- `src/features/categorization/categorizeTransaction.ts` - Categorization engine, rule resolution, merchant memory, recategorization.
- `src/features/categorization/manageRules.ts` - Rule CRUD and rule reapplication.
- `src/features/categories/manageCategories.ts` - Category CRUD and cascading updates.
- `src/features/transactions/presentTransaction.ts` - Converts raw narration into cleaner display fields.

Persistence:
- `src/db/initializeDatabase.ts` - SQLite schema setup, migrations, and initial category seeding.

Data:
- `src/data/starterCategories.ts` - Default categories seeded on first launch (Food, Groceries, Transport, Shopping, Investment, Loan, Bills, Health, Travel, Transfer).

Theme:
- `src/theme/palette.ts` - Shared color tokens.

## Design Direction

The UI direction is:
- premium utility
- quiet, precise, and trustworthy
- ledger-first, not marketing-first
- modern but not flashy
- local-first and privacy-conscious

Color palette uses warm neutral tones with teal accent (`#006d77`), green for credits/success, and rust for debits/danger. See `src/theme/palette.ts` for the full token set.

Recent design work has been aligned to Stitch-generated mobile designs, but implemented natively in Expo rather than copied from web code.

## App Configuration

- Package: `com.vaibhavkhandelwal22.MyFinance`
- Orientation: Portrait only
- New Architecture: Enabled
- Edge-to-edge: Enabled (Android)

## How To Run

Development:
```bash
pnpm run android
```

Typecheck:
```bash
pnpm exec tsc --noEmit
```

## Building APK

The project uses EAS Build for creating APKs. There are several options:

**Option 1: EAS Cloud Build (may have queue wait times)**
```bash
eas build --platform android --profile preview
```

**Option 2: Local EAS Build (recommended, requires Android SDK)**
```bash
eas build --platform android --profile preview --local
```

**Option 3: Expo Prebuild + Gradle**
```bash
npx expo prebuild --platform android
cd android
./gradlew assembleRelease
```
APK will be in `android/app/build/outputs/apk/release/`

Prerequisites for local builds:
- Java JDK 17
- Android SDK (via Android Studio)
- `ANDROID_HOME` environment variable set

## Important Notes For Future Agents

- The product vision is broader than HDFC import. HDFC is the first supported import path, not the final boundary.
- The product vision is broader than expense tracking. Expenses are phase 1, not the end state.
- Keep the app local-first by default. Do not introduce backend/cloud dependencies casually.
- Preserve deterministic categorization behavior unless explicitly changing the product direction.
- Prefer extending the existing `features/` modules over adding business logic directly into screens.
- Keep `App.tsx` as orchestration. New UI should generally go into `screens/` or `components/`.
- If importing new statement formats, keep HDFC `.xls` support stable while generalizing the import architecture.
- If changing rules or category behavior, remember historical transactions are expected to update accordingly.

## Recent Changes

### April 2026

**Button Press Feedback in Category Modal**
- Added visual feedback (light blue background `#d0e8ff`) when pressing buttons in the category change confirmation modal
- Applies to "One time only", "Create a rule", "Merchant", "UPI Note", and "Cancel" buttons
- Uses Pressable with pressed state styling for immediate tactile feedback

**Month Date Range Bug Fix**
- Fixed issue where transactions on the 31st of months (January, March, etc.) were being excluded
- Root cause: timezone mismatch between transaction dates (parsed as UTC midnight) and date range boundaries (local midnight)
- Solution: Set end date to 23:59:59.999 local time to include all transactions throughout the last day of the month

**Category Dropdown Position Fix**
- Fixed category dropdown being cut off at the bottom of the transaction list
- For the last 2 transactions, dropdown now opens upward instead of downward

## Next Good Refactors

If continuing cleanup, the next useful steps are:
- extract a `useDashboardData` hook from `App.tsx`
- split `FinancesScreen` into smaller reusable components
- split `RulesScreen` into `RuleForm`, `RuleList`, and `CategoryManager`
- continue tightening UI fidelity against the selected Stitch designs
