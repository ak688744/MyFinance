import { inArray, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { expenseInsightTriage } from '../db/schema';
import type { ExpenseInsightTriageRepo, ExpenseInsightTriageRow } from './types';

export function makeExpenseInsightTriageRepo(db: Db): ExpenseInsightTriageRepo {
  return {
    getMany(signatures) {
      if (signatures.length === 0) return [];
      return db
        .select()
        .from(expenseInsightTriage)
        .where(inArray(expenseInsightTriage.signature, signatures))
        .all() as ExpenseInsightTriageRow[];
    },
    upsert(row) {
      db.insert(expenseInsightTriage)
        .values({
          signature: row.signature,
          month: row.month,
          verdictJson: row.verdictJson,
          ...(row.triagedAt ? { triagedAt: row.triagedAt } : {}),
        })
        .onConflictDoUpdate({
          target: expenseInsightTriage.signature,
          set: {
            month: row.month,
            verdictJson: row.verdictJson,
            triagedAt: row.triagedAt ?? sql`CURRENT_TIMESTAMP`,
          },
        })
        .run();
    },
  };
}
