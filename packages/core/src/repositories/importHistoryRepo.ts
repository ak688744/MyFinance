import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { importHistory, investmentImportHistory } from '../db/schema';
import type { ImportHistoryRepo, ImportRecord } from './types';

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

    findInvestmentImports(filters) {
      // SELECT id FROM investment_import_history WHERE account_name = ? AND
      // investment_app = ? AND import_type = ? AND start_date = ? AND end_date = ?
      return db
        .select({ id: investmentImportHistory.id })
        .from(investmentImportHistory)
        .where(
          and(
            eq(investmentImportHistory.accountName, filters.account),
            eq(investmentImportHistory.investmentApp, filters.app),
            eq(investmentImportHistory.importType, filters.importType),
            eq(investmentImportHistory.startDate, filters.startDate),
            eq(investmentImportHistory.endDate, filters.endDate),
          ),
        )
        .all();
    },

    deleteInvestmentImport(id) {
      db.delete(investmentImportHistory)
        .where(eq(investmentImportHistory.id, id))
        .run();
    },

    listAll(): ImportRecord[] {
      const expenses = db
        .select()
        .from(importHistory)
        .all()
        .map((r): ImportRecord => ({
          kind: 'expense',
          id: r.id,
          sourceName: r.sourceName,
          importType: null,
          recordCount: r.transactionCount,
          accountName: null,
          investmentApp: null,
          importedAt: r.importedAt,
        }));

      const investments = db
        .select()
        .from(investmentImportHistory)
        .all()
        .map((r): ImportRecord => ({
          kind: 'investment',
          id: r.id,
          sourceName: r.fileName ?? null,
          importType: r.importType,
          recordCount: r.recordCount ?? null,
          accountName: r.accountName,
          investmentApp: r.investmentApp,
          importedAt: r.importedAt,
        }));

      return [...expenses, ...investments].sort((a, b) => {
        if (a.importedAt !== b.importedAt) {
          return a.importedAt < b.importedAt ? 1 : -1; // desc
        }
        if (a.kind !== b.kind) return a.kind < b.kind ? 1 : -1;
        return b.id - a.id;
      });
    },
  };
}
