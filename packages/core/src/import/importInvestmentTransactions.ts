import type {
  ImportHistoryRepo,
  InvestmentTxRepo,
  SchemeRepo,
} from '../repositories/types';
import type { ParsedTransactionData } from './transactionParser';

/**
 * Port of src/features/import/importInvestmentTransactions.ts.
 *
 * Source took an expo-sqlite handle + raw SQL + db.withTransactionAsync. Here
 * the DB access is repo-injected and SYNCHRONOUS (better-sqlite3): findSchemeByName,
 * the date-range DELETE, the investment_import_history INSERT and each
 * investment_transactions INSERT all go through repos. Atomicity is provided by
 * an injected `runInTransaction` runner (built by the caller from the
 * better-sqlite3 handle's `.transaction()`).
 *
 * Strategy preserved verbatim:
 * 1. Pre-flight: resolve EVERY tx's scheme via findSchemeByName. If any is
 *    missing, return {status:'unmatched_schemes', unmatchedSchemes: sorted[]}
 *    WITHOUT touching the DB.
 * 2. Else, inside a transaction: DELETE existing transactions in the date range
 *    for this account/app; INSERT investment_import_history ('transactions');
 *    INSERT each transaction with its resolved scheme_id.
 *
 * Duplicate transactions in the file (same scheme/date/amount) are valid
 * separate SIPs and all get inserted — matches source (no dedupe here).
 */

export type ImportTransactionsResult =
  | {
      status: 'success';
      importedCount: number;
      deletedCount: number;
      importHistoryId: number;
    }
  | {
      status: 'unmatched_schemes';
      unmatchedSchemes: string[];
    };

export type ImportInvestmentTransactionsDeps = {
  schemeRepo: SchemeRepo;
  txRepo: InvestmentTxRepo;
  importHistoryRepo: ImportHistoryRepo;
  runInTransaction: <T>(fn: () => T) => T;
};

export function importInvestmentTransactions(
  deps: ImportInvestmentTransactionsDeps,
  params: {
    accountName: string;
    investmentApp: string;
    parsedData: ParsedTransactionData;
    fileName?: string;
  },
): Promise<ImportTransactionsResult> {
  const { schemeRepo, txRepo, importHistoryRepo, runInTransaction } = deps;
  const { accountName, investmentApp, parsedData, fileName } = params;
  const { startDate, endDate, holderName, holderPan, transactions } = parsedData;

  // Pre-flight: resolve every scheme before touching the DB.
  const schemeIdByName = new Map<string, number>();
  const unmatched = new Set<string>();

  for (const tx of transactions) {
    if (schemeIdByName.has(tx.schemeName) || unmatched.has(tx.schemeName)) {
      continue;
    }
    const scheme = schemeRepo.findSchemeByName(tx.schemeName);
    if (scheme) {
      schemeIdByName.set(tx.schemeName, scheme.id);
    } else {
      unmatched.add(tx.schemeName);
    }
  }

  if (unmatched.size > 0) {
    return Promise.resolve({
      status: 'unmatched_schemes',
      unmatchedSchemes: Array.from(unmatched).sort(),
    });
  }

  const result = runInTransaction(() => {
    const deletedCount = txRepo.deleteByAccountAppDateRange(
      accountName,
      investmentApp,
      startDate,
      endDate,
    );

    const importHistoryId = importHistoryRepo.createInvestmentImport({
      accountName,
      investmentApp,
      importType: 'transactions',
      fileName,
      startDate,
      endDate,
      recordCount: transactions.length,
      holderName,
      holderPan,
    });

    let importedCount = 0;
    for (const transaction of transactions) {
      // Non-null: pre-flight guaranteed every scheme resolved.
      const schemeId = schemeIdByName.get(transaction.schemeName)!;

      txRepo.insert({
        schemeId,
        accountName,
        investmentApp,
        schemeName: transaction.schemeName,
        transactionType: transaction.transactionType,
        units: transaction.units,
        nav: transaction.nav,
        amount: transaction.amount,
        transactionDate: transaction.transactionDate,
      });

      importedCount += 1;
    }

    return { importedCount, deletedCount, importHistoryId };
  });

  return Promise.resolve({ status: 'success', ...result });
}
