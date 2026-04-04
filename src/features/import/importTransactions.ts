import type { SQLiteDatabase } from 'expo-sqlite';

import {
  getActiveCategoryRules,
  resolveCategoryFromRules,
} from '../categorization/categorizeTransaction';
import type { ParsedTransaction } from './hdfcParser';

export async function importTransactions(
  db: SQLiteDatabase,
  input: {
    sourceName: string;
    sourceType: 'xls';
    transactions: ParsedTransaction[];
  }
) {
  let insertedCount = 0;

  const importResult = await db.runAsync(
    `
      INSERT INTO import_history (source_name, source_type, transaction_count)
      VALUES (?, ?, ?)
    `,
    input.sourceName,
    input.sourceType,
    input.transactions.length
  );

  const importHistoryId = importResult.lastInsertRowId;
  const activeRules = await getActiveCategoryRules(db);

  await db.withExclusiveTransactionAsync(async () => {
    for (const transaction of input.transactions) {
      const resolution = resolveCategoryFromRules(
        {
          description: transaction.description,
          merchantKey: transaction.merchantKey,
          upiNoteKeyword: transaction.upiNoteKeyword,
        },
        activeRules
      );

      const result = await db.runAsync(
        `
          INSERT OR IGNORE INTO transactions (
            transaction_date,
            value_date,
            reference_number,
            description,
            normalized_description,
            merchant_key,
            upi_note_keyword,
            amount,
            direction,
            category_id,
            category_source,
            balance,
            source_type,
            import_history_id,
            dedupe_key
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        transaction.transactionDate,
        transaction.valueDate,
        transaction.referenceNumber,
        transaction.description,
        transaction.normalizedDescription,
        transaction.merchantKey,
        transaction.upiNoteKeyword,
        transaction.amount,
        transaction.direction,
        resolution.categoryId,
        resolution.categorySource,
        transaction.balance,
        transaction.sourceType,
        importHistoryId,
        transaction.dedupeKey
      );

      insertedCount += result.changes;
    }
  });

  return {
    importHistoryId,
    detectedCount: input.transactions.length,
    insertedCount,
    skippedCount: input.transactions.length - insertedCount,
  };
}
