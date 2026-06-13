import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { accounts } from '../db/schema';
import type { Account, AccountDomain } from '../types';
import type { AccountRepo } from './types';

function toDomain(row: typeof accounts.$inferSelect): Account {
  return {
    id: row.id,
    domain: row.domain as AccountDomain,
    assetClass: row.assetClass,
    institution: row.institution,
    label: row.label,
  };
}

export function makeAccountRepo(db: Db): AccountRepo {
  return {
    list(filters) {
      const rows = db
        .select()
        .from(accounts)
        .where(filters?.domain ? eq(accounts.domain, filters.domain) : undefined)
        .all();
      return rows.map(toDomain);
    },

    getById(id) {
      const row = db.select().from(accounts).where(eq(accounts.id, id)).get();
      return row ? toDomain(row) : null;
    },

    create(a) {
      const row = db
        .insert(accounts)
        .values({
          domain: a.domain,
          assetClass: a.assetClass ?? null,
          institution: a.institution,
          label: a.label,
        })
        .returning({ id: accounts.id })
        .get();
      return row.id;
    },

    findByTriple(domain, institution, label) {
      const row = db
        .select()
        .from(accounts)
        .where(
          and(
            eq(accounts.domain, domain),
            eq(accounts.institution, institution),
            eq(accounts.label, label),
          ),
        )
        .get();
      return row ? toDomain(row) : null;
    },

    ensureAccount(a) {
      const existing = this.findByTriple(a.domain, a.institution, a.label);
      if (existing) return existing.id;
      return this.create(a);
    },
  };
}
