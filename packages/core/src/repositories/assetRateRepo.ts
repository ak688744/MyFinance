import { asc, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { assetRates } from '../db/schema.js';
import type { AssetRate } from '../types.js';
import type { AssetRateRepo } from './types.js';

export function makeAssetRateRepo(db: Db): AssetRateRepo {
  return {
    listByAsset(assetId) {
      return db
        .select()
        .from(assetRates)
        .where(eq(assetRates.assetId, assetId))
        .orderBy(asc(assetRates.effectiveFrom))
        .all()
        .map(
          (r): AssetRate => ({
            id: r.id,
            assetId: r.assetId,
            effectiveFrom: r.effectiveFrom,
            rate: r.rate,
          }),
        );
    },
    insert(r) {
      const row = db
        .insert(assetRates)
        .values({ assetId: r.assetId, effectiveFrom: r.effectiveFrom, rate: r.rate })
        .returning({ id: assetRates.id })
        .get();
      return row.id;
    },
  };
}
