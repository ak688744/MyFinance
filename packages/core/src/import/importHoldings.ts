import { autoMatchAmfiCodes } from '../domain/amfiMatcher';
import type {
  HoldingsRepo,
  ImportHistoryRepo,
  SchemeRepo,
} from '../repositories/types';
import type { ParsedHoldingsData } from './holdingsParser';

/**
 * Port of src/features/import/importHoldings.ts.
 *
 * Source took an expo-sqlite handle + raw SQL + db.withTransactionAsync, then
 * (best-effort, after the transaction) ran a network AMFI auto-match. Here the
 * DB access is repo-injected and SYNCHRONOUS (better-sqlite3); atomicity comes
 * from the injected `runInTransaction` runner. The function stays ASYNC purely
 * because the post-import AMFI auto-match (`amfiMatch`) is async/network.
 *
 * Strategy preserved verbatim (inside one transaction):
 * 1. Find existing investment_import_history rows for
 *    (account, app, 'holdings', start=asOfDate, end=asOfDate).
 * 2. DELETE existing investment_holdings for (account, app, asOfDate).
 * 3. DELETE those import_history rows.
 * 4. INSERT new investment_import_history ('holdings', totals + holder).
 * 5. For each holding: matchOrCreateScheme then INSERT investment_holdings.
 *
 * After the transaction (best-effort, try/catch): a small settle delay, then the
 * AMFI auto-match. `amfiMatch` defaults to the real network matcher; tests inject
 * a stub so they never hit the network.
 */

export type ImportHoldingsResult = {
  importedCount: number;
  deletedCount: number;
  importHistoryId: number;
  amfiMatched: number;
  amfiTotal: number;
};

export type ImportHoldingsDeps = {
  schemeRepo: SchemeRepo;
  holdingsRepo: HoldingsRepo;
  importHistoryRepo: ImportHistoryRepo;
  runInTransaction: <T>(fn: () => T) => T;
  /**
   * Post-import AMFI auto-match. Defaults to the real network matcher. Injected
   * so tests can stub the network call. The delay before invocation is also
   * injectable for tests (defaults to 1000ms, matching source).
   */
  amfiMatch?: (deps: { schemeRepo: SchemeRepo }) => Promise<{
    matched: number;
    total: number;
  }>;
  settleDelayMs?: number;
};

export async function importHoldings(
  deps: ImportHoldingsDeps,
  params: {
    accountName: string;
    investmentApp: string;
    parsedData: ParsedHoldingsData;
    fileName?: string;
  },
): Promise<ImportHoldingsResult> {
  const {
    schemeRepo,
    holdingsRepo,
    importHistoryRepo,
    runInTransaction,
    amfiMatch = autoMatchAmfiCodes,
    settleDelayMs = 1000,
  } = deps;
  const { accountName, investmentApp, parsedData, fileName } = params;
  const { asOfDate, summary, holdings } = parsedData;

  const { importedCount, deletedCount, importHistoryId } = runInTransaction(
    () => {
      // Step 1: existing import_history rows for this account/app/date.
      const existing = importHistoryRepo.findInvestmentImports({
        account: accountName,
        app: investmentApp,
        importType: 'holdings',
        startDate: asOfDate,
        endDate: asOfDate,
      });

      // Step 2: delete existing holdings for this account/app/date.
      const deleted = holdingsRepo.deleteByAccountAppDate(
        accountName,
        investmentApp,
        asOfDate,
      );

      // Step 3: delete the corresponding import_history rows.
      for (const record of existing) {
        importHistoryRepo.deleteInvestmentImport(record.id);
      }

      // Step 4: create new import_history record.
      const historyId = importHistoryRepo.createInvestmentImport({
        accountName,
        investmentApp,
        importType: 'holdings',
        fileName,
        startDate: asOfDate,
        endDate: asOfDate,
        recordCount: holdings.length,
        totalInvested: summary.totalInvested,
        totalCurrentValue: summary.totalCurrentValue,
        totalXirr: summary.totalXirr ?? undefined,
        holderName: summary.holderName,
        holderPan: summary.holderPan,
      });

      // Step 5: match/create scheme + insert each holding.
      let imported = 0;
      for (const holding of holdings) {
        const schemeId = schemeRepo.matchOrCreateScheme({
          schemeName: holding.schemeName,
          amcName: holding.amcName || undefined,
          category: holding.category,
          subCategory: holding.subCategory || undefined,
        });

        holdingsRepo.insert({
          importHistoryId: historyId,
          schemeId,
          accountName,
          investmentApp,
          schemeName: holding.schemeName,
          folioNumber: holding.folioNumber || null,
          units: holding.units,
          investedValue: holding.investedValue,
          currentValue: holding.currentValue,
          returnsAmount: holding.returnsAmount,
          returnsXirr: holding.returnsXirr,
          asOfDate,
        });

        imported += 1;
      }

      return {
        importedCount: imported,
        deletedCount: deleted,
        importHistoryId: historyId,
      };
    },
  );

  // Post-import: auto-match AMFI codes for any schemes without them.
  // Best-effort — failures here must not fail the import. Small delay to let
  // the DB transaction fully settle before network calls (matches source).
  let amfiMatched = 0;
  let amfiTotal = 0;
  try {
    if (settleDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, settleDelayMs));
    }
    const result = await amfiMatch({ schemeRepo });
    amfiMatched = result.matched;
    amfiTotal = result.total;
  } catch (error) {
    console.warn('AMFI auto-match failed:', error);
  }

  return {
    importedCount,
    deletedCount,
    importHistoryId,
    amfiMatched,
    amfiTotal,
  };
}
