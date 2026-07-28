import type {
  ImportHistoryRepo,
  InvestmentTxRepo,
  SchemeRepo,
} from '../repositories/types';
import type { ParsedTransactionData } from './transactionParser';

/**
 * Port of src/features/import/importInvestmentTransactions.ts.
 *
 * Strategy:
 * 1. Resolve every tx's scheme: findSchemeByName, else matchOrCreateScheme (name-only).
 *    Redeemed funds that no longer appear in a holdings file still get a scheme row so
 *    historical PURCHASE/REDEMPTION rows import cleanly.
 * 2. Inside a transaction: DELETE existing transactions in the date range for this
 *    account/app; INSERT investment_import_history ('transactions'); INSERT each row.
 *
 * Duplicate transactions in the file (same scheme/date/amount) are valid separate SIPs.
 */

export type ImportTransactionsResult = {
  status: 'success';
  importedCount: number;
  deletedCount: number;
  importHistoryId: number;
  /** Scheme names auto-created during this import (e.g. fully redeemed, not in holdings). */
  schemesCreated: string[];
};

export type ImportInvestmentTransactionsDeps = {
  schemeRepo: SchemeRepo;
  txRepo: InvestmentTxRepo;
  importHistoryRepo: ImportHistoryRepo;
  runInTransaction: <T>(fn: () => T) => T;
};

function resolveSchemeId(
  schemeRepo: SchemeRepo,
  schemeName: string,
): { schemeId: number; created: boolean } {
  const existing = schemeRepo.findSchemeByName(schemeName);
  if (existing) {
    return { schemeId: existing.id, created: false };
  }
  const schemeId = schemeRepo.matchOrCreateScheme({ schemeName });
  return { schemeId, created: true };
}

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

  const schemeIdByName = new Map<string, number>();
  const schemesCreated: string[] = [];

  for (const tx of transactions) {
    if (schemeIdByName.has(tx.schemeName)) continue;
    const { schemeId, created } = resolveSchemeId(schemeRepo, tx.schemeName);
    schemeIdByName.set(tx.schemeName, schemeId);
    if (created) schemesCreated.push(tx.schemeName);
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

  return Promise.resolve({
    status: 'success',
    ...result,
    schemesCreated: schemesCreated.sort((a, b) => a.localeCompare(b)),
  });
}
