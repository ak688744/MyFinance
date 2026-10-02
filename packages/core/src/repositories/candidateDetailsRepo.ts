import { eq, lt, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { candidateDetails } from '../db/schema';
import type { CandidateDetailsRepo, CandidateDetailsRow } from './types';

export function makeCandidateDetailsRepo(db: Db): CandidateDetailsRepo {
  return {
    get(amfiCode) {
      return (db.select().from(candidateDetails).where(eq(candidateDetails.amfiCode, amfiCode)).get() as
        | CandidateDetailsRow
        | undefined) ?? null;
    },
    upsert(row) {
      db.insert(candidateDetails)
        .values({ amfiCode: row.amfiCode, detailsJson: row.detailsJson })
        .onConflictDoUpdate({
          target: candidateDetails.amfiCode,
          set: { detailsJson: row.detailsJson, fetchedAt: sql`CURRENT_TIMESTAMP` },
        })
        .run();
    },
    pruneOlderThan(isoDate) {
      return db.delete(candidateDetails).where(lt(candidateDetails.fetchedAt, isoDate)).run().changes;
    },
  };
}
