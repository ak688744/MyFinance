import { eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { liabilities } from '../db/schema';
import type { Liability } from '../types';
import type { LiabilityRepo } from './types';

function toDomain(row: typeof liabilities.$inferSelect): Liability {
  return {
    id: row.id,
    accountId: row.accountId,
    name: row.name,
    loanType: row.loanType as Liability['loanType'],
    principal: row.principal,
    annualRate: row.annualRate,
    tenureMonths: row.tenureMonths,
    emiAmount: row.emiAmount,
    startDate: row.startDate,
    status: row.status as 'active' | 'closed',
  };
}

export function makeLiabilityRepo(db: Db): LiabilityRepo {
  return {
    list(filters) {
      const rows = db
        .select()
        .from(liabilities)
        .where(filters?.status ? eq(liabilities.status, filters.status) : undefined)
        .all();
      return rows.map(toDomain);
    },
    getById(id) {
      const row = db.select().from(liabilities).where(eq(liabilities.id, id)).get();
      return row ? toDomain(row) : null;
    },
    create(l) {
      const row = db
        .insert(liabilities)
        .values({
          accountId: l.accountId ?? null,
          name: l.name,
          loanType: l.loanType,
          principal: l.principal,
          annualRate: l.annualRate,
          tenureMonths: l.tenureMonths ?? null,
          emiAmount: l.emiAmount ?? null,
          startDate: l.startDate,
          status: l.status ?? 'active',
        })
        .returning({ id: liabilities.id })
        .get();
      return row.id;
    },
    update(id, patch) {
      const values: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      for (const k of [
        'name', 'loanType', 'principal', 'annualRate', 'tenureMonths', 'emiAmount', 'startDate', 'status',
      ] as const) {
        if (patch[k] !== undefined) values[k] = patch[k];
      }
      db.update(liabilities).set(values).where(eq(liabilities.id, id)).run();
    },
    delete(id) {
      db.delete(liabilities).where(eq(liabilities.id, id)).run();
    },
  };
}
