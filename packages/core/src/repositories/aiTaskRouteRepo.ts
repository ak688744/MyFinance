// packages/core/src/repositories/aiTaskRouteRepo.ts
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { aiTaskRoutes } from '../db/schema.js';
import type { AiTaskRouteRepo, AiTaskRouteRow } from './types.js';

export function makeAiTaskRouteRepo(db: Db): AiTaskRouteRepo {
  return {
    list: () => db.select().from(aiTaskRoutes).all() as AiTaskRouteRow[],
    getByTask: (task) => (db.select().from(aiTaskRoutes).where(eq(aiTaskRoutes.task, task)).get() as AiTaskRouteRow) ?? null,
    upsert: (task, modelId, updatedAt) => {
      db.insert(aiTaskRoutes).values({ task, modelId, updatedAt })
        .onConflictDoUpdate({ target: aiTaskRoutes.task, set: { modelId, updatedAt } }).run();
    },
    delete: (task) => { db.delete(aiTaskRoutes).where(eq(aiTaskRoutes.task, task)).run(); },
  };
}
