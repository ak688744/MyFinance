import { and, desc, eq, notInArray, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { schemeHoldings } from '../db/schema';
import type { StoredFundHolding } from '../types';
import type { SchemeHoldingsRepo } from './types';

export function makeSchemeHoldingsRepo(db: Db): SchemeHoldingsRepo {
  return {
    replaceSnapshot(schemeId, asOfDate, rows) {
      db.delete(schemeHoldings)
        .where(and(eq(schemeHoldings.schemeId, schemeId), eq(schemeHoldings.asOfDate, asOfDate)))
        .run();
      for (const r of rows) {
        db.insert(schemeHoldings).values({
          schemeId,
          asOfDate,
          securityName: r.securityName,
          isin: r.isin,
          weightPct: r.weightPct,
          sector: r.sector,
          marketCapBucket: r.marketCapBucket,
        }).run();
      }
    },
    getLatestSnapshot(schemeId) {
      const latest = db.select({ d: sql<string>`MAX(${schemeHoldings.asOfDate})` })
        .from(schemeHoldings).where(eq(schemeHoldings.schemeId, schemeId)).get();
      if (!latest?.d) return [];
      return db.select().from(schemeHoldings)
        .where(and(eq(schemeHoldings.schemeId, schemeId), eq(schemeHoldings.asOfDate, latest.d)))
        .all() as StoredFundHolding[];
    },
    listAsOfDates(schemeId) {
      return db.selectDistinct({ d: schemeHoldings.asOfDate }).from(schemeHoldings)
        .where(eq(schemeHoldings.schemeId, schemeId))
        .orderBy(desc(schemeHoldings.asOfDate)).all().map((r) => r.d);
    },
    prune(schemeId, keep) {
      const dates = this.listAsOfDates(schemeId);
      const keepDates = dates.slice(0, keep);
      if (keepDates.length === dates.length) return 0;
      const res = db.delete(schemeHoldings)
        .where(and(eq(schemeHoldings.schemeId, schemeId), notInArray(schemeHoldings.asOfDate, keepDates)))
        .run();
      return res.changes;
    },
  };
}
