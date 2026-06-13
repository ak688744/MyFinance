import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { assets } from '../db/schema';
import type { Asset, AssetParams } from '../types';
import type { AssetRepo } from './types';

function toDomain(row: typeof assets.$inferSelect): Asset {
  return {
    id: row.id,
    accountId: row.accountId,
    assetClass: row.assetClass as Asset['assetClass'],
    name: row.name,
    valuationStrategy: row.valuationStrategy as 'computed' | 'manual',
    ingestionMode: row.ingestionMode as Asset['ingestionMode'],
    params: row.params ? (JSON.parse(row.params) as AssetParams) : null,
    status: row.status as 'active' | 'closed',
    openedAt: row.openedAt,
  };
}

export function makeAssetRepo(db: Db): AssetRepo {
  return {
    list(filters) {
      const conditions = [
        filters?.account !== undefined ? eq(assets.accountId, filters.account) : undefined,
        filters?.assetClass !== undefined
          ? eq(assets.assetClass, filters.assetClass as Asset['assetClass'])
          : undefined,
        filters?.status !== undefined ? eq(assets.status, filters.status) : undefined,
      ].filter((c): c is NonNullable<typeof c> => c !== undefined);
      const rows = db
        .select()
        .from(assets)
        .where(conditions.length ? and(...conditions) : undefined)
        .all();
      return rows.map(toDomain);
    },

    getById(id) {
      const row = db.select().from(assets).where(eq(assets.id, id)).get();
      return row ? toDomain(row) : null;
    },

    create(a) {
      const row = db
        .insert(assets)
        .values({
          accountId: a.accountId,
          assetClass: a.assetClass,
          name: a.name,
          valuationStrategy: a.valuationStrategy,
          ingestionMode: a.ingestionMode ?? 'manual_entry',
          params: a.params ? JSON.stringify(a.params) : null,
          status: a.status ?? 'active',
          openedAt: a.openedAt ?? null,
        })
        .returning({ id: assets.id })
        .get();
      return row.id;
    },

    update(id, patch) {
      const values: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      if (patch.name !== undefined) values.name = patch.name;
      if (patch.status !== undefined) values.status = patch.status;
      if (patch.openedAt !== undefined) values.openedAt = patch.openedAt;
      if (patch.params !== undefined)
        values.params = patch.params ? JSON.stringify(patch.params) : null;
      db.update(assets).set(values).where(eq(assets.id, id)).run();
    },

    delete(id) {
      db.delete(assets).where(eq(assets.id, id)).run();
    },
  };
}
