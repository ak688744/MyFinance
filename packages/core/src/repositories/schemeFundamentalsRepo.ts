import { eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { schemeFundamentals } from '../db/schema';
import type { SchemeFundamentals } from '../types';
import type { SchemeFundamentalsRepo } from './types';

export function makeSchemeFundamentalsRepo(db: Db): SchemeFundamentalsRepo {
  return {
    upsert(row) {
      const values = {
        schemeId: row.schemeId,
        expenseRatioDirect: row.expenseRatioDirect,
        expenseRatioRegular: row.expenseRatioRegular,
        planType: row.planType,
        aum: row.aum,
        benchmarkName: row.benchmarkName,
        stdDev: row.stdDev,
        sharpe: row.sharpe,
        beta: row.beta,
        alpha: row.alpha,
        source: row.source,
        ...(row.fetchedAt ? { fetchedAt: row.fetchedAt } : {}),
      };
      db.insert(schemeFundamentals).values(values)
        .onConflictDoUpdate({
          target: schemeFundamentals.schemeId,
          set: { ...values, fetchedAt: row.fetchedAt ?? sql`CURRENT_TIMESTAMP` },
        })
        .run();
    },
    get(schemeId) {
      const r = db.select().from(schemeFundamentals).where(eq(schemeFundamentals.schemeId, schemeId)).get();
      return (r ?? null) as SchemeFundamentals | null;
    },
  };
}
