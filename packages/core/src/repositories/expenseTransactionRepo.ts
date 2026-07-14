import { and, asc, desc, eq, gte, lte, like, ne, or, isNull, notInArray, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { transactions } from '../db/schema.js';
import type { ExpenseTransactionRepo } from './types.js';

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
      // Rows whose category is safe to re-derive from rules: NULL source, or any
      // rule-derived source. 'manual' (user-set) and 'ai_suggested' (a pending AI
      // guess awaiting the user's confirm/cancel) are PROTECTED — the recategorize
      // sweep must not overwrite them, or confirming one AI suggestion would wipe
      // the sibling suggestions from the same run.
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
            notInArray(transactions.categorySource, ['manual', 'ai_suggested']),
          ),
        )
        .all();
    },

    updateCategory(id, categoryId, categorySource, aiKeyword = null) {
      // UPDATE transactions SET category_id = ?, category_source = ?,
      //   ai_keyword = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      // ai_keyword defaults to null: any transition OUT of 'ai_suggested'
      // (confirm → manual, recategorize sweep) clears the stale pending keyword;
      // only the ai-suggest endpoint passes a keyword to persist it.
      db.update(transactions)
        .set({
          categoryId,
          categorySource,
          aiKeyword,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(transactions.id, id))
        .run();
    },

    getById(id) {
      // SELECT id, description FROM transactions WHERE id = ? LIMIT 1
      const result = db
        .select({
          id: transactions.id,
          description: transactions.description,
        })
        .from(transactions)
        .where(eq(transactions.id, id))
        .limit(1)
        .get();
      return result ?? null;
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
          categorySource: transactions.categorySource,
          aiKeyword: transactions.aiKeyword,
          note: transactions.note,
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
      const excludeFromSpend = filters.excludeFromSpend ?? [];
      const investmentCategories = filters.investmentCategories ?? [];

      // Window conditions (date + account) shared by every aggregate below.
      const windowConds = [];
      if (filters.from !== undefined) windowConds.push(gte(transactions.transactionDate, filters.from));
      if (filters.to !== undefined) windowConds.push(lte(transactions.transactionDate, filters.to));
      if (filters.accountId !== undefined) windowConds.push(eq(transactions.accountId, filters.accountId));

      // Excludes only ever match non-null categories, so uncategorized (NULL)
      // debits always remain in spend. `NULL NOT IN (...)` is NULL (not true) in
      // SQL, so OR isNull to keep uncategorized rows.
      const excludeCond = excludeFromSpend.length
        ? or(isNull(transactions.categoryId), notInArray(transactions.categoryId, excludeFromSpend))
        : undefined;

      // totals: spend/income both drop excluded categories; invested sums the
      // investment-category debits regardless of the exclude list.
      const totalsRow = db
        .select({
          totalSpent: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.direction} = 'debit' AND (${transactions.categoryId} IS NULL OR ${transactions.categoryId} NOT IN ${excludeFromSpend.length ? excludeFromSpend : ['']}) THEN ${transactions.amount} ELSE 0 END), 0)`,
          totalIncome: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.direction} = 'credit' AND (${transactions.categoryId} IS NULL OR ${transactions.categoryId} NOT IN ${excludeFromSpend.length ? excludeFromSpend : ['']}) THEN ${transactions.amount} ELSE 0 END), 0)`,
          invested: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.direction} = 'debit' AND ${transactions.categoryId} IN ${investmentCategories.length ? investmentCategories : ['']} THEN ${transactions.amount} ELSE 0 END), 0)`,
        })
        .from(transactions)
        .where(windowConds.length ? and(...windowConds) : undefined)
        .get() ?? { totalSpent: 0, totalIncome: 0, invested: 0 };

      // byCategory / byMonth are the true-spend breakdowns: debit only, excluded
      // categories removed.
      const spendConds = [eq(transactions.direction, 'debit'), ...windowConds];
      if (excludeCond) spendConds.push(excludeCond);

      const byCategory = db
        .select({
          categoryId: transactions.categoryId,
          amount: sql<number>`COALESCE(SUM(${transactions.amount}), 0)`,
        })
        .from(transactions)
        .where(and(...spendConds))
        .groupBy(transactions.categoryId)
        .all();

      const byMonth = db
        .select({
          month: sql<string>`substr(${transactions.transactionDate}, 1, 7)`,
          spent: sql<number>`COALESCE(SUM(${transactions.amount}), 0)`,
        })
        .from(transactions)
        .where(and(...spendConds))
        .groupBy(sql`substr(${transactions.transactionDate}, 1, 7)`)
        .orderBy(sql`substr(${transactions.transactionDate}, 1, 7)`)
        .all();

      return {
        totalSpent: totalsRow.totalSpent,
        totalIncome: totalsRow.totalIncome,
        saved: totalsRow.totalIncome - totalsRow.totalSpent,
        invested: totalsRow.invested,
        byCategory,
        byMonth,
      };
    },

    listUncategorizedInRange({ from, to, limit }) {
      const rows = db
        .select({
          id: transactions.id,
          description: transactions.description,
          amount: transactions.amount,
          direction: transactions.direction,
        })
        .from(transactions)
        .where(and(
          isNull(transactions.categoryId),
          gte(transactions.transactionDate, from),
          lte(transactions.transactionDate, to),
        ))
        .orderBy(asc(transactions.transactionDate))
        .limit(limit ?? 1000)
        .all();
      return rows as { id: number; description: string; amount: number; direction: 'debit' | 'credit' }[];
    },

    updateAmount(id, amount) {
      db.update(transactions).set({ amount, updatedAt: sql`CURRENT_TIMESTAMP` }).where(eq(transactions.id, id)).run();
    },

    updateNote(id, note) {
      db.update(transactions).set({ note, updatedAt: sql`CURRENT_TIMESTAMP` }).where(eq(transactions.id, id)).run();
    },

    deleteTransaction(id) {
      db.delete(transactions).where(eq(transactions.id, id)).run();
    },

    insertManual(tx) {
      const dedupeKey = `manual_${tx.transactionDate}_${tx.description}_${tx.amount}_${Date.now()}`;
      const result = db.insert(transactions).values({
        transactionDate: tx.transactionDate,
        valueDate: null,
        referenceNumber: null,
        description: tx.description,
        normalizedDescription: tx.description.toLowerCase().trim(),
        merchantKey: null,
        upiNoteKeyword: null,
        amount: tx.amount,
        direction: tx.direction,
        categoryId: tx.categoryId ?? null,
        categorySource: tx.categoryId ? 'manual' : null,
        aiKeyword: null,
        note: tx.note ?? null,
        balance: null,
        sourceType: 'manual',
        importHistoryId: null,
        dedupeKey,
        accountId: tx.accountId ?? null,
      }).run();
      return Number(result.lastInsertRowid);
    },
  };
}
