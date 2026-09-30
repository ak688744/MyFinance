import { eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { investmentReviewCache } from '../db/schema';
import type { InvestmentReviewCacheRepo, InvestmentReviewCacheRow } from './types';

export function makeInvestmentReviewCacheRepo(db: Db): InvestmentReviewCacheRepo {
  return {
    get(signature) {
      return (db.select().from(investmentReviewCache).where(eq(investmentReviewCache.signature, signature)).get() as
        | InvestmentReviewCacheRow
        | undefined) ?? null;
    },
    put(row) {
      db.insert(investmentReviewCache)
        .values({ signature: row.signature, reviewJson: row.reviewJson, model: row.model ?? null })
        .onConflictDoUpdate({
          target: investmentReviewCache.signature,
          set: { reviewJson: row.reviewJson, model: row.model ?? null, createdAt: sql`CURRENT_TIMESTAMP` },
        })
        .run();
    },
  };
}
