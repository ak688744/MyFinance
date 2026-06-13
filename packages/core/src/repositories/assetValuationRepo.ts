import { asc, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { assetValuations } from '../db/schema';
import type { AssetValuation } from '../types';
import type { AssetValuationRepo } from './types';

export function makeAssetValuationRepo(db: Db): AssetValuationRepo {
  return {
    listByAsset(assetId) {
      return db
        .select()
        .from(assetValuations)
        .where(eq(assetValuations.assetId, assetId))
        .orderBy(asc(assetValuations.valuedAt))
        .all()
        .map(
          (r): AssetValuation => ({
            id: r.id,
            assetId: r.assetId,
            value: r.value,
            valuedAt: r.valuedAt,
            note: r.note,
          }),
        );
    },
    insert(v) {
      const row = db
        .insert(assetValuations)
        .values({
          assetId: v.assetId,
          value: v.value,
          valuedAt: v.valuedAt,
          note: v.note ?? null,
        })
        .returning({ id: assetValuations.id })
        .get();
      return row.id;
    },
  };
}
