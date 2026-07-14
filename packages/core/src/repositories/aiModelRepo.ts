import { eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { aiModels, aiTaskRoutes } from '../db/schema';
import type { AiModelRepo, AiModelRow } from './types';

export function makeAiModelRepo(db: Db): AiModelRepo {
  return {
    list: (filters) => {
      const q = db.select().from(aiModels);
      const rows = (filters?.providerId
        ? q.where(eq(aiModels.providerId, filters.providerId))
        : q).all();
      return rows as AiModelRow[];
    },
    get: (id) => (db.select().from(aiModels).where(eq(aiModels.id, id)).get() as AiModelRow) ?? null,
    create: (m) => { db.insert(aiModels).values(m).run(); },
    update: (id, patch) => { db.update(aiModels).set(patch).where(eq(aiModels.id, id)).run(); },
    delete: (id) => { db.delete(aiModels).where(eq(aiModels.id, id)).run(); },
    countRoutes: (modelId) =>
      (db.select({ n: sql<number>`count(*)` }).from(aiTaskRoutes).where(eq(aiTaskRoutes.modelId, modelId)).get()?.n) ?? 0,
  };
}
