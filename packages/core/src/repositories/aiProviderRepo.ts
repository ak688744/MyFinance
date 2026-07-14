import { eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { aiModels, aiProviders } from '../db/schema';
import type { AiProviderRepo, AiProviderRow, AiDialect } from './types';

export function makeAiProviderRepo(db: Db): AiProviderRepo {
  const rows = () => db.select().from(aiProviders);
  return {
    list: () => rows().all() as AiProviderRow[],
    get: (id) => (rows().where(eq(aiProviders.id, id)).get() as AiProviderRow) ?? null,
    create: (p) => { db.insert(aiProviders).values({
      id: p.id, dialect: p.dialect, label: p.label, secretEnc: p.secretEnc, configJson: p.configJson,
    }).run(); },
    update: (id, patch) => { db.update(aiProviders).set(patch).where(eq(aiProviders.id, id)).run(); },
    delete: (id) => { db.delete(aiProviders).where(eq(aiProviders.id, id)).run(); },
    countModels: (providerId) =>
      (db.select({ n: sql<number>`count(*)` }).from(aiModels).where(eq(aiModels.providerId, providerId)).get()?.n) ?? 0,
  };
}
