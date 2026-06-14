import { and, desc, eq, gte, lte, like, ne, or, isNull, sql } from 'drizzle-orm';
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

    insertIgnore(tx) {
      // INSERT OR IGNORE INTO transactions (...) — the UNIQUE dedupe_key drives
      // the conflict. onConflictDoNothing == OR IGNORE. Returns changes (1/0).
      const result = db
        .insert(transactions)
        .values({
          transactionDate: tx.transactionDate,
          valueDate: tx.valueDate,
          referenceNumber: tx.referenceNumber,
          description: tx.description,
          normalizedDescription: tx.normalizedDescription,
          merchantKey: tx.merchantKey,
          upiNoteKeyword: tx.upiNoteKeyword,
          amount: tx.amount,
          direction: tx.direction,
          categoryId: tx.categoryId,
          categorySource: tx.categorySource,
          balance: tx.balance,
          sourceType: tx.sourceType,
          importHistoryId: tx.importHistoryId,
          dedupeKey: tx.dedupeKey,
          accountId: tx.accountId ?? null,
        })
        .onConflictDoNothing()
        .run();
      return result.changes;
    },

    updateAccount(id, accountId) {
      db.update(transactions)
        .set({ accountId })
        .where(eq(transactions.id, id))
        .run();
    },

    query(filters = {}) {
      const conds = [];
      if (filters.from !== undefined) conds.push(gte(transactions.transactionDate, filters.from));
      if (filters.to !== undefined) conds.push(lte(transactions.transactionDate, filters.to));
      if (filters.direction !== undefined) {
        conds.push(eq(transactions.direction, filters.direction === 'in' ? 'credit' : 'debit'));
      }
      if (filters.search !== undefined) conds.push(like(transactions.description, `%${filters.search}%`));
      if (filters.categoryId !== undefined) conds.push(eq(transactions.categoryId, filters.categoryId));
      if (filters.accountId !== undefined) conds.push(eq(transactions.accountId, filters.accountId));

      let q = db
        .select({
          id: transactions.id,
          transactionDate: transactions.transactionDate,
          description: transactions.description,
          amount: transactions.amount,
          direction: transactions.direction,
          categoryId: transactions.categoryId,
          accountId: transactions.accountId,
          balance: transactions.balance,
        })
        .from(transactions)
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(transactions.transactionDate), desc(transactions.id))
        .$dynamic();

      if (filters.limit !== undefined) q = q.limit(filters.limit);
      if (filters.offset !== undefined) q = q.offset(filters.offset);
      return q.all();
    },

    summary(filters = {}) {
      const conds = [];
      if (filters.from !== undefined) conds.push(gte(transactions.transactionDate, filters.from));
      if (filters.to !== undefined) conds.push(lte(transactions.transactionDate, filters.to));
      if (filters.accountId !== undefined) conds.push(eq(transactions.accountId, filters.accountId));
      const where = conds.length ? and(...conds) : undefined;

      const totalsRow = db
        .select({
          totalSpent: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.direction} = 'debit' THEN ${transactions.amount} ELSE 0 END), 0)`,
          totalIncome: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.direction} = 'credit' THEN ${transactions.amount} ELSE 0 END), 0)`,
        })
        .from(transactions)
        .where(where)
        .get() ?? { totalSpent: 0, totalIncome: 0 };

      const byCategory = db
        .select({
          categoryId: transactions.categoryId,
          amount: sql<number>`COALESCE(SUM(${transactions.amount}), 0)`,
        })
        .from(transactions)
        .where(conds.length ? and(...conds, eq(transactions.direction, 'debit')) : eq(transactions.direction, 'debit'))
        .groupBy(transactions.categoryId)
        .all();

      const byMonth = db
        .select({
          month: sql<string>`substr(${transactions.transactionDate}, 1, 7)`,
          spent: sql<number>`COALESCE(SUM(${transactions.amount}), 0)`,
        })
        .from(transactions)
        .where(conds.length ? and(...conds, eq(transactions.direction, 'debit')) : eq(transactions.direction, 'debit'))
        .groupBy(sql`substr(${transactions.transactionDate}, 1, 7)`)
        .orderBy(sql`substr(${transactions.transactionDate}, 1, 7)`)
        .all();

      return {
        totalSpent: totalsRow.totalSpent,
        totalIncome: totalsRow.totalIncome,
        saved: totalsRow.totalIncome - totalsRow.totalSpent,
        byCategory,
        byMonth,
      };
    },
  };
}
