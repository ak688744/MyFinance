// packages/core/src/repositories/aiUsageRepo.ts
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { aiUsageEvents } from '../db/schema';
import type { AiUsageRepo, AiUsageEventRow } from './types';

export function makeAiUsageRepo(db: Db): AiUsageRepo {
  const rangeWhere = (from?: string, to?: string, task?: string) => {
    const conds = [];
    if (from) conds.push(gte(aiUsageEvents.ts, from));
    if (to) conds.push(lte(aiUsageEvents.ts, to));
    if (task) conds.push(eq(aiUsageEvents.task, task));
    return conds.length ? and(...conds) : undefined;
  };
  return {
    insert: (e) => {
      const r = db.insert(aiUsageEvents).values(e).run();
      return Number(r.lastInsertRowid);
    },
    listEvents: ({ from, to, task, limit, offset }) => {
      const w = rangeWhere(from, to, task);
      let q = db.select().from(aiUsageEvents).$dynamic();
      if (w) q = q.where(w);
      return q.orderBy(desc(aiUsageEvents.ts), desc(aiUsageEvents.id)).limit(limit).offset(offset).all() as AiUsageEventRow[];
    },
    summary: ({ from, to }) => {
      const w = rangeWhere(from, to);
      const base = () => { let q = db.select().from(aiUsageEvents).$dynamic(); if (w) q = q.where(w); return q; };
      const rows = base().all() as AiUsageEventRow[];
      const totalCostUsd = rows.reduce((a, r) => a + (r.costUsd ?? 0), 0);
      const totalInput = rows.reduce((a, r) => a + r.inputTokens, 0);
      const totalOutput = rows.reduce((a, r) => a + r.outputTokens, 0);
      const callCount = rows.length;
      const unpricedCount = rows.filter((r) => r.costUsd === null).length;
      const group = <K extends string>(key: (r: AiUsageEventRow) => string, label: K) => {
        const m = new Map<string, { costUsd: number; inputTokens: number; outputTokens: number; calls: number }>();
        for (const r of rows) {
          const k = key(r);
          const g = m.get(k) ?? { costUsd: 0, inputTokens: 0, outputTokens: 0, calls: 0 };
          g.costUsd += r.costUsd ?? 0; g.inputTokens += r.inputTokens; g.outputTokens += r.outputTokens; g.calls += 1;
          m.set(k, g);
        }
        return [...m.entries()].map(([k, v]) => ({ [label]: k, ...v })) as any[];
      };
      const byDay = [...rows.reduce((m, r) => {
        const d = r.ts.slice(0, 10);
        m.set(d, (m.get(d) ?? 0) + (r.costUsd ?? 0)); return m;
      }, new Map<string, number>()).entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([day, costUsd]) => ({ day, costUsd }));
      return {
        totalCostUsd, totalInput, totalOutput, callCount, unpricedCount,
        byTask: group((r) => r.task, 'task'),
        byModel: group((r) => r.model, 'model'),
        byDay,
      };
    },
  };
}
