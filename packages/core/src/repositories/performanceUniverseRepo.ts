import { and, asc, eq, getTableColumns, inArray, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { categoryStats, fundMonthlyNav, fundPerformance, fundUniverse } from '../db/schema';
import type { CategoryStatRow, FundPerformanceRow, NavPoint, UniverseFund } from '../types';
import type { PerformanceUniverseRepo, PerformanceWithName } from './types';

function chunk<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

export function makePerformanceUniverseRepo(db: Db): PerformanceUniverseRepo {
  return {
    replaceAll(s) {
      db.delete(fundMonthlyNav).run();
      db.delete(fundPerformance).run();
      db.delete(categoryStats).run();
      db.delete(fundUniverse).run();
      for (const c of chunk(s.funds, 200)) db.insert(fundUniverse).values(c).run();
      for (const c of chunk(s.monthlyNav, 500)) db.insert(fundMonthlyNav).values(c).run();
      for (const c of chunk(s.performance, 100)) db.insert(fundPerformance).values(c).run();
      for (const c of chunk(s.categoryStats, 200)) db.insert(categoryStats).values(c).run();
    },
    getMeta() {
      const b = db.select({ v: sql<string | null>`MAX(${fundUniverse.builtAt})` }).from(fundUniverse).get();
      if (!b?.v) return null;
      const a = db.select({ v: sql<string | null>`MAX(${fundPerformance.asOf})` }).from(fundPerformance).get();
      return { builtAt: b.v, asOf: a?.v ?? null };
    },
    getFund(amfiCode) {
      return (db.select().from(fundUniverse).where(eq(fundUniverse.amfiCode, amfiCode)).get() as UniverseFund | undefined) ?? null;
    },
    listFunds(filter = {}) {
      const conds = [];
      if (filter.category) conds.push(eq(fundUniverse.category, filter.category));
      if (filter.rankableOnly) conds.push(eq(fundUniverse.rankable, true));
      const q = db.select().from(fundUniverse);
      return (conds.length ? q.where(and(...conds)) : q).orderBy(asc(fundUniverse.schemeName)).all() as UniverseFund[];
    },
    getMonthlyNav(amfiCode) {
      return db
        .select({ date: fundMonthlyNav.monthEnd, nav: fundMonthlyNav.nav })
        .from(fundMonthlyNav)
        .where(eq(fundMonthlyNav.amfiCode, amfiCode))
        .orderBy(asc(fundMonthlyNav.monthEnd))
        .all() as NavPoint[];
    },
    getPerformance(amfiCodes) {
      if (amfiCodes.length === 0) return [];
      return db.select().from(fundPerformance).where(inArray(fundPerformance.amfiCode, amfiCodes)).all() as FundPerformanceRow[];
    },
    listPerformanceByCategory(category) {
      return db
        .select({ ...getTableColumns(fundPerformance), schemeName: fundUniverse.schemeName, rankable: fundUniverse.rankable })
        .from(fundPerformance)
        .innerJoin(fundUniverse, eq(fundUniverse.amfiCode, fundPerformance.amfiCode))
        .where(eq(fundUniverse.category, category))
        .all() as PerformanceWithName[];
    },
    getCategoryStats(category) {
      return db.select().from(categoryStats).where(eq(categoryStats.category, category)).all() as CategoryStatRow[];
    },
    listAllCategoryStats() {
      return db.select().from(categoryStats).orderBy(asc(categoryStats.category)).all() as CategoryStatRow[];
    },
    listCategories() {
      return db.selectDistinct({ c: fundUniverse.category }).from(fundUniverse).orderBy(asc(fundUniverse.category)).all().map((r) => r.c);
    },
  };
}
