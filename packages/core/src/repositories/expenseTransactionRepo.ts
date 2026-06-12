import { desc, eq, ne, or, isNull, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { transactions } from '../db/schema';
import type { ExpenseTransactionRepo } from './types';

/**
 * Faithful port of the transactions-reading/updating SQL in
 * src/features/categorization/categorizeTransaction.ts
 * (recategorizeNonManualTransactions SELECT + UPDATE) plus a paginated list.
 *
 * better-sqlite3 is synchronous, so every method is synchronous (no Promises).
 * Repos own all Drizzle/SQL and return domain (camelCase) rows.
 */
export function makeExpenseTransactionRepo(db: Db): ExpenseTransactionRepo {
  return {
    list(filters = {}) {
      let query = db
        .select()
        .from(transactions)
        .where(
          filters.categoryId !== undefined
            ? eq(transactions.categoryId, filters.categoryId)
            : undefined,
        )
        .orderBy(desc(transactions.transactionDate))
        .$dynamic();

      if (filters.limit !== undefined) {
        query = query.limit(filters.limit);
      }
      if (filters.offset !== undefined) {
        query = query.offset(filters.offset);
      }

      return query.all();
    },

    getNonManualForRecategorization() {
      // SELECT id, description, merchant_key, upi_note_keyword FROM transactions
      // WHERE category_source IS NULL OR category_source != 'manual'
      return db
        .select({
          id: transactions.id,
          description: transactions.description,
          merchantKey: transactions.merchantKey,
          upiNoteKeyword: transactions.upiNoteKeyword,
        })
        .from(transactions)
        .where(
          or(
            isNull(transactions.categorySource),
            ne(transactions.categorySource, 'manual'),
          ),
        )
        .all();
    },

    updateCategory(id, categoryId, categorySource) {
      // UPDATE transactions SET category_id = ?, category_source = ?,
      //   updated_at = CURRENT_TIMESTAMP WHERE id = ?
      db.update(transactions)
        .set({
          categoryId,
          categorySource,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(transactions.id, id))
        .run();
    },
  };
}
