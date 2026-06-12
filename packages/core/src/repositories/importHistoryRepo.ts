import type { Db } from '../db/client';
import { importHistory, investmentImportHistory } from '../db/schema';
import type { ImportHistoryRepo } from './types';

/**
 * Faithful port of the import_history insert in
 * src/features/import/importTransactions.ts plus the investment_import_history
 * insert.
 *
 * better-sqlite3 is synchronous, so every method is synchronous (no Promises).
 * Repos own all Drizzle/SQL and return domain types.
 */
export function makeImportHistoryRepo(db: Db): ImportHistoryRepo {
  return {
    create(r) {
      // INSERT INTO import_history (source_name, source_type, transaction_count)
      const result = db
        .insert(importHistory)
        .values({
          sourceName: r.sourceName,
          sourceType: r.sourceType,
          transactionCount: r.transactionCount,
        })
        .returning({ id: importHistory.id })
        .get();

      return result.id;
    },

    createInvestmentImport(r) {
      const result = db
        .insert(investmentImportHistory)
        .values({
          accountName: r.accountName,
          investmentApp: r.investmentApp,
          importType: r.importType,
          fileName: r.fileName ?? null,
          startDate: r.startDate,
          endDate: r.endDate,
          recordCount: r.recordCount ?? null,
          totalInvested: r.totalInvested ?? null,
          totalCurrentValue: r.totalCurrentValue ?? null,
          totalXirr: r.totalXirr ?? null,
          holderName: r.holderName ?? null,
          holderPan: r.holderPan ?? null,
        })
        .returning({ id: investmentImportHistory.id })
        .get();

      return result.id;
    },
  };
}
