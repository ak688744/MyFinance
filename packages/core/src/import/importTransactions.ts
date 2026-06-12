import { resolveCategoryFromRules } from '../domain/categorize';
import type {
  CategoryRuleRepo,
  ExpenseTransactionRepo,
  ImportHistoryRepo,
} from '../repositories/types';
import type { ParsedTransaction } from './hdfcParser';

/**
 * Port of src/features/import/importTransactions.ts (HDFC expense import).
 *
 * Source took an expo-sqlite handle + raw SQL + db.withExclusiveTransactionAsync.
 * Here the DB access is repo-injected and SYNCHRONOUS (better-sqlite3): the
 * import_history INSERT, getActiveCategoryRules and each INSERT OR IGNORE go
 * through repos. Atomicity for the per-transaction insert loop is provided by
 * an injected `runInTransaction` runner.
 *
 * Ordering preserved verbatim from source:
 * 1. INSERT import_history (OUTSIDE the transaction) -> importHistoryId.
 * 2. Read active category rules.
 * 3. Inside a transaction, for each parsed tx: resolve category via
 *    resolveCategoryFromRules using the parsed tx's own
 *    description/merchantKey/upiNoteKeyword (NOT re-derived), then
 *    INSERT OR IGNORE into transactions; accumulate inserted (changes).
 *
 * Returns { importHistoryId, detectedCount, insertedCount, skippedCount }.
 * Dedupe is by the UNIQUE dedupe_key (INSERT OR IGNORE) — identical to source.
 */

export type ImportTransactionsResult = {
  importHistoryId: number;
  detectedCount: number;
  insertedCount: number;
  skippedCount: number;
};

export type ImportTransactionsDeps = {
  importHistoryRepo: ImportHistoryRepo;
  ruleRepo: CategoryRuleRepo;
  txRepo: ExpenseTransactionRepo;
  runInTransaction: <T>(fn: () => T) => T;
};

export function importTransactions(
  deps: ImportTransactionsDeps,
  input: {
    sourceName: string;
    sourceType: 'xls';
    transactions: ParsedTransaction[];
  },
): Promise<ImportTransactionsResult> {
  const { importHistoryRepo, ruleRepo, txRepo, runInTransaction } = deps;

  const importHistoryId = importHistoryRepo.create({
    sourceName: input.sourceName,
    sourceType: input.sourceType,
    transactionCount: input.transactions.length,
  });

  const activeRules = ruleRepo.getActiveRules();

  const insertedCount = runInTransaction(() => {
    let inserted = 0;
    for (const transaction of input.transactions) {
      const resolution = resolveCategoryFromRules(
        {
          description: transaction.description,
          merchantKey: transaction.merchantKey,
          upiNoteKeyword: transaction.upiNoteKeyword,
        },
        activeRules,
      );

      inserted += txRepo.insertIgnore({
        transactionDate: transaction.transactionDate,
        valueDate: transaction.valueDate,
        referenceNumber: transaction.referenceNumber,
        description: transaction.description,
        normalizedDescription: transaction.normalizedDescription,
        merchantKey: transaction.merchantKey,
        upiNoteKeyword: transaction.upiNoteKeyword,
        amount: transaction.amount,
        direction: transaction.direction,
        categoryId: resolution.categoryId,
        categorySource: resolution.categorySource,
        balance: transaction.balance,
        sourceType: transaction.sourceType,
        importHistoryId,
        dedupeKey: transaction.dedupeKey,
      });
    }
    return inserted;
  });

  return Promise.resolve({
    importHistoryId,
    detectedCount: input.transactions.length,
    insertedCount,
    skippedCount: input.transactions.length - insertedCount,
  });
}
