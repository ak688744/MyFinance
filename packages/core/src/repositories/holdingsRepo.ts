import { and, eq, sql, asc } from 'drizzle-orm';
import type { Db } from '../db/client';
import { investmentHoldings as holdings } from '../db/schema';
import { investmentSchemes as schemes } from '../db/schema';
import type { HoldingsRepo } from './types';

/**
 * Faithful port of the holdings-reading SQL (getHoldingsValue) in
 * src/features/investment/returnsCalculator.ts plus a holdings insert.
 *
 * better-sqlite3 is synchronous, so every method is synchronous (no Promises).
 * Repos own all Drizzle/SQL and return domain types.
 */

export function makeHoldingsRepo(db: Db): HoldingsRepo {
  return {
    list(filters) {
      const conditions = [
        filters?.account !== undefined ? eq(holdings.accountName, filters.account) : undefined,
      ].filter((c): c is NonNullable<typeof c> => c !== undefined);

      return db
        .select({
          id: holdings.id,
          schemeId: holdings.schemeId,
          schemeName: holdings.schemeName,
          accountName: holdings.accountName,
          investmentApp: holdings.investmentApp,
          folioNumber: holdings.folioNumber,
          units: holdings.units,
          investedValue: holdings.investedValue,
          currentValue: holdings.currentValue,
          returnsAmount: holdings.returnsAmount,
          returnsXirr: holdings.returnsXirr,
          asOfDate: holdings.asOfDate,
          amcName: schemes.amcName,
          category: schemes.category,
          subCategory: schemes.subCategory,
        })
        .from(holdings)
        .leftJoin(schemes, eq(holdings.schemeId, schemes.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(asc(holdings.schemeName))
        .all();
    },

    getHoldingsValue(filters) {
      // SELECT COALESCE(SUM(current_value),0), COALESCE(SUM(invested_value),0)
      // FROM investment_holdings [WHERE account_name = ? AND scheme_id = ?]
      const conditions = [
        filters.account !== undefined ? eq(holdings.accountName, filters.account) : undefined,
        filters.schemeId !== undefined ? eq(holdings.schemeId, filters.schemeId) : undefined,
      ].filter((c): c is NonNullable<typeof c> => c !== undefined);

      const result = db
        .select({
          currentValue: sql<number>`COALESCE(SUM(${holdings.currentValue}), 0)`,
          investedValue: sql<number>`COALESCE(SUM(${holdings.investedValue}), 0)`,
        })
        .from(holdings)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .get();

      return {
        currentValue: result?.currentValue ?? 0,
        investedValue: result?.investedValue ?? 0,
      };
    },

    insert(h) {
      const result = db
        .insert(holdings)
        .values({
          importHistoryId: h.importHistoryId,
          schemeId: h.schemeId,
          accountName: h.accountName,
          investmentApp: h.investmentApp,
          schemeName: h.schemeName,
          folioNumber: h.folioNumber,
          units: h.units,
          investedValue: h.investedValue,
          currentValue: h.currentValue,
          returnsAmount: h.returnsAmount,
          returnsXirr: h.returnsXirr,
          asOfDate: h.asOfDate,
        })
        .returning({ id: holdings.id })
        .get();

      return result.id;
    },

    deleteByAccountAppDate(account, app, asOfDate) {
      // DELETE FROM investment_holdings WHERE account_name = ? AND
      // investment_app = ? AND as_of_date = ?
      const result = db
        .delete(holdings)
        .where(
          and(
            eq(holdings.accountName, account),
            eq(holdings.investmentApp, app),
            eq(holdings.asOfDate, asOfDate),
          ),
        )
        .run();
      return result.changes;
    },
  };
}
