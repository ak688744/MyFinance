import { and, asc, between, desc, eq, gte, lte, min, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { investmentTransactions as tx } from '../db/schema';
import type {
  CashFlow,
  InvestmentTransaction,
  TransactionSummary,
  TransactionType,
} from '../types';
import type { InvestmentTxRepo } from './types';

/**
 * Faithful port of src/features/investment/services/transactionService.ts and
 * the transaction-reading SQL in src/features/investment/returnsCalculator.ts.
 *
 * better-sqlite3 is synchronous, so every method is synchronous (no Promises).
 * Repos own all Drizzle/SQL and return domain types.
 */

type Row = typeof tx.$inferSelect;

function mapRow(row: Row): InvestmentTransaction {
  return {
    id: row.id,
    schemeId: row.schemeId,
    schemeName: row.schemeName,
    accountName: row.accountName,
    investmentApp: row.investmentApp,
    transactionType: row.transactionType,
    units: row.units,
    nav: row.nav,
    amount: row.amount,
    transactionDate: row.transactionDate,
  };
}

/**
 * Replicate the original date-range branching exactly:
 *   - startDate && endDate -> BETWEEN start AND end
 *   - startDate only       -> >= start
 *   - endDate only         -> <= end
 */
function dateRangeCondition(startDate?: string, endDate?: string) {
  if (startDate && endDate) return between(tx.transactionDate, startDate, endDate);
  if (startDate) return gte(tx.transactionDate, startDate);
  if (endDate) return lte(tx.transactionDate, endDate);
  return undefined;
}

export function makeInvestmentTxRepo(db: Db): InvestmentTxRepo {
  return {
    getTransactions(filters = {}) {
      const conditions = [
        filters.account !== undefined ? eq(tx.accountName, filters.account) : undefined,
        filters.schemeId !== undefined ? eq(tx.schemeId, filters.schemeId) : undefined,
        filters.schemeName !== undefined ? eq(tx.schemeName, filters.schemeName) : undefined,
        filters.type !== undefined ? eq(tx.transactionType, filters.type) : undefined,
        dateRangeCondition(filters.startDate, filters.endDate),
      ].filter((c): c is NonNullable<typeof c> => c !== undefined);

      let query = db
        .select()
        .from(tx)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(tx.transactionDate))
        .$dynamic();

      if (filters.limit) {
        query = query.limit(filters.limit);
      }

      return query.all().map(mapRow);
    },

    getTransactionsByScheme(schemeId: number) {
      return db
        .select()
        .from(tx)
        .where(eq(tx.schemeId, schemeId))
        .orderBy(desc(tx.transactionDate))
        .all()
        .map(mapRow);
    },

    getCashFlows(filters = {}) {
      const conditions = [
        filters.account !== undefined ? eq(tx.accountName, filters.account) : undefined,
        filters.schemeId !== undefined ? eq(tx.schemeId, filters.schemeId) : undefined,
        dateRangeCondition(filters.startDate, filters.endDate),
      ].filter((c): c is NonNullable<typeof c> => c !== undefined);

      // PURCHASE/SWITCH_IN = money out (negative); everything else = money in (positive).
      const rows = db
        .select({
          date: tx.transactionDate,
          amount: sql<number>`CASE WHEN ${tx.transactionType} IN ('PURCHASE', 'SWITCH_IN') THEN -${tx.amount} ELSE ${tx.amount} END`,
        })
        .from(tx)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(asc(tx.transactionDate))
        .all();

      return rows as CashFlow[];
    },

    getTransactionSummary(filters = {}) {
      const conditions = [
        filters.account !== undefined ? eq(tx.accountName, filters.account) : undefined,
        dateRangeCondition(filters.startDate, filters.endDate),
      ].filter((c): c is NonNullable<typeof c> => c !== undefined);

      const result = db
        .select({
          totalPurchases: sql<number>`COALESCE(SUM(CASE WHEN ${tx.transactionType} IN ('PURCHASE', 'SWITCH_IN') THEN ${tx.amount} ELSE 0 END), 0)`,
          totalRedemptions: sql<number>`COALESCE(SUM(CASE WHEN ${tx.transactionType} IN ('REDEMPTION', 'SWITCH_OUT', 'DIVIDEND') THEN ${tx.amount} ELSE 0 END), 0)`,
          transactionCount: sql<number>`COUNT(*)`,
        })
        .from(tx)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .get();

      const totalPurchases = result?.totalPurchases ?? 0;
      const totalRedemptions = result?.totalRedemptions ?? 0;

      return {
        totalPurchases,
        totalRedemptions,
        netInvestment: totalPurchases - totalRedemptions,
        transactionCount: result?.transactionCount ?? 0,
      } satisfies TransactionSummary;
    },

    getEarliestTransactionDate(filters) {
      const conditions = [
        filters.account !== undefined ? eq(tx.accountName, filters.account) : undefined,
        filters.schemeId !== undefined ? eq(tx.schemeId, filters.schemeId) : undefined,
      ].filter((c): c is NonNullable<typeof c> => c !== undefined);

      const result = db
        .select({ earliest: min(tx.transactionDate) })
        .from(tx)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .get();

      return result?.earliest ?? null;
    },

    getUnitsPerSchemeUpTo(endDate, filters) {
      const conditions = [
        sql`${tx.schemeId} IS NOT NULL`,
        lte(tx.transactionDate, endDate),
        filters.account !== undefined ? eq(tx.accountName, filters.account) : undefined,
      ].filter((c): c is NonNullable<typeof c> => c !== undefined);

      // Original (returnsCalculator.calculateUnitsPerScheme) ran an unordered
      // SELECT and relied on natural chronological insertion order so that a
      // REDEMPTION/SWITCH_OUT is netted against prior PURCHASE units. Drizzle's
      // unordered select does NOT preserve that order, which would let the
      // Math.max(0, ...) clamp wipe a redemption that sorts before its purchase.
      // Order by transaction_date ASC to make the accumulation deterministic and
      // faithful to the original semantics.
      const rows = db
        .select({
          schemeId: tx.schemeId,
          transactionType: tx.transactionType,
          units: tx.units,
        })
        .from(tx)
        .where(and(...conditions))
        .orderBy(asc(tx.transactionDate))
        .all();

      const unitsMap = new Map<number, number>();
      for (const row of rows) {
        // scheme_id IS NOT NULL guaranteed by the WHERE clause.
        const schemeId = row.schemeId as number;
        const current = unitsMap.get(schemeId) ?? 0;
        switch (row.transactionType) {
          case 'PURCHASE':
          case 'SWITCH_IN':
            unitsMap.set(schemeId, current + row.units);
            break;
          case 'REDEMPTION':
          case 'SWITCH_OUT':
            unitsMap.set(schemeId, Math.max(0, current - row.units));
            break;
          // DIVIDEND: ignored (matches calculateUnitsPerScheme).
        }
      }

      return unitsMap;
    },

    insert(t: Omit<InvestmentTransaction, 'id'>) {
      const result = db
        .insert(tx)
        .values({
          schemeId: t.schemeId,
          accountName: t.accountName,
          investmentApp: t.investmentApp,
          schemeName: t.schemeName,
          transactionType: t.transactionType as TransactionType,
          units: t.units,
          nav: t.nav,
          amount: t.amount,
          transactionDate: t.transactionDate,
        })
        .returning({ id: tx.id })
        .get();

      return result.id;
    },
  };
}
