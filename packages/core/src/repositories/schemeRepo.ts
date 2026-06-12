import { and, asc, eq, isNull, like, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import {
  investmentHoldings as holdings,
  investmentSchemes as schemes,
} from '../db/schema';
import type { Scheme } from '../types';
import type { SchemeRepo } from './types';

/**
 * Faithful port of src/features/investment/services/schemeService.ts and the
 * scheme-reading SQL (getSchemesWithAmfi) in
 * src/features/investment/returnsCalculator.ts.
 *
 * better-sqlite3 is synchronous, so every method is synchronous (no Promises).
 * Repos own all Drizzle/SQL and return domain types.
 */

type SchemeCategory = 'equity' | 'debt' | 'hybrid' | 'other';

// The columns projected by SCHEME_COLUMNS (createdAt/updatedAt are excluded).
type SchemeRow = {
  id: number;
  schemeName: string;
  amfiCode: string | null;
  isin: string | null;
  amcName: string | null;
  category: SchemeCategory | null;
  subCategory: string | null;
};

function mapRowToScheme(row: SchemeRow): Scheme {
  return {
    id: row.id,
    schemeName: row.schemeName,
    amfiCode: row.amfiCode,
    isin: row.isin,
    amcName: row.amcName,
    category: row.category,
    subCategory: row.subCategory,
  };
}

const SCHEME_COLUMNS = {
  id: schemes.id,
  schemeName: schemes.schemeName,
  amfiCode: schemes.amfiCode,
  isin: schemes.isin,
  amcName: schemes.amcName,
  category: schemes.category,
  subCategory: schemes.subCategory,
} as const;

export function makeSchemeRepo(db: Db): SchemeRepo {
  return {
    getSchemeById(id: number): Scheme | null {
      const row = db
        .select(SCHEME_COLUMNS)
        .from(schemes)
        .where(eq(schemes.id, id))
        .get();
      return row ? mapRowToScheme(row) : null;
    },

    getSchemes(filters = {}) {
      const conditions = [
        filters.category !== undefined ? eq(schemes.category, filters.category) : undefined,
        filters.amc !== undefined ? eq(schemes.amcName, filters.amc) : undefined,
        filters.search !== undefined
          ? like(schemes.schemeName, `%${filters.search}%`)
          : undefined,
      ].filter((c): c is NonNullable<typeof c> => c !== undefined);

      return db
        .select(SCHEME_COLUMNS)
        .from(schemes)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(asc(schemes.schemeName))
        .all()
        .map(mapRowToScheme);
    },

    findSchemeByName(schemeName: string): Scheme | null {
      // Match scheme_name only, ignoring AMC; first row or null.
      const row = db
        .select(SCHEME_COLUMNS)
        .from(schemes)
        .where(eq(schemes.schemeName, schemeName))
        .get();
      return row ? mapRowToScheme(row) : null;
    },

    getSchemesWithAmfi(filters) {
      // SELECT DISTINCT h.scheme_id, s.amfi_code
      // FROM investment_holdings h JOIN investment_schemes s ON h.scheme_id = s.id
      // WHERE s.amfi_code IS NOT NULL [AND h.account_name = ?]
      const conditions = [
        sql`${schemes.amfiCode} IS NOT NULL`,
        filters.account !== undefined ? eq(holdings.accountName, filters.account) : undefined,
      ].filter((c): c is NonNullable<typeof c> => c !== undefined);

      const rows = db
        .selectDistinct({ schemeId: holdings.schemeId, amfiCode: schemes.amfiCode })
        .from(holdings)
        .innerJoin(schemes, eq(holdings.schemeId, schemes.id))
        .where(and(...conditions))
        .all();

      // amfi_code is guaranteed non-null by the WHERE clause; scheme_id is the
      // join key so it is non-null for any matched row.
      return rows.map((r) => ({
        schemeId: r.schemeId as number,
        amfiCode: r.amfiCode as string,
      }));
    },

    updateAmfiCode(schemeId: number, amfiCode: string): void {
      db.update(schemes)
        .set({ amfiCode, updatedAt: sql`CURRENT_TIMESTAMP` })
        .where(eq(schemes.id, schemeId))
        .run();
    },

    matchOrCreateScheme(p) {
      const { schemeName, amcName, category, subCategory } = p;

      // Matching: amcName provided -> (scheme_name AND amc_name);
      //           else             -> (scheme_name AND amc_name IS NULL).
      const existing = db
        .select({ id: schemes.id })
        .from(schemes)
        .where(
          amcName
            ? and(eq(schemes.schemeName, schemeName), eq(schemes.amcName, amcName))
            : and(eq(schemes.schemeName, schemeName), isNull(schemes.amcName)),
        )
        .get();

      if (existing) {
        return existing.id;
      }

      const result = db
        .insert(schemes)
        .values({
          schemeName,
          amcName: amcName ?? null,
          category: (category ?? null) as SchemeCategory | null,
          subCategory: subCategory ?? null,
        })
        .returning({ id: schemes.id })
        .get();

      return result.id;
    },
  };
}
