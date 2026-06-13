import { asc, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { assetContributions } from '../db/schema';
import type { AssetContribution } from '../types';
import type { AssetContributionRepo } from './types';

export function makeAssetContributionRepo(db: Db): AssetContributionRepo {
  return {
    listByAsset(assetId) {
      return db
        .select()
        .from(assetContributions)
        .where(eq(assetContributions.assetId, assetId))
        .orderBy(asc(assetContributions.contributionDate))
        .all()
        .map(
          (r): AssetContribution => ({
            id: r.id,
            assetId: r.assetId,
            contributionDate: r.contributionDate,
            amount: r.amount,
            note: r.note,
          }),
        );
    },
    insert(c) {
      const row = db
        .insert(assetContributions)
        .values({
          assetId: c.assetId,
          contributionDate: c.contributionDate,
          amount: c.amount,
          note: c.note ?? null,
        })
        .returning({ id: assetContributions.id })
        .get();
      return row.id;
    },
  };
}
