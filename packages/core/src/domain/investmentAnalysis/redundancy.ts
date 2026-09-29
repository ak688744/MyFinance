import type { OwnedFund } from './types';
import { overlapMatrix } from './overlap';
import { inferSubCategory } from './subCategory';

export type RedundancyResult = {
  highOverlapPairs: { schemeIdA: number; schemeIdB: number; overlapPct: number }[];
  overCrowdedCategories: { category: string; count: number }[];
  /** Funds in the same sub-category that also overlap heavily — true redundancy. */
  redundantGroups: RedundantGroup[];
};

export type RedundantGroup = {
  subCategory: string;
  subCategoryLabel: string;
  schemeIds: number[];
  pairs: { schemeIdA: number; schemeIdB: number; overlapPct: number; duplicatedInr: number }[];
  maxOverlapPct: number;
  /** Money that would be duplicated if the group were merged into its largest fund. */
  duplicatedInr: number;
};

const DEFAULT_OVERLAP_THRESHOLD = 50;
const DEFAULT_SAME_CATEGORY_MIN = 3;

export function detectRedundancy(
  funds: OwnedFund[],
  opts?: { overlapThresholdPct?: number; sameCategoryMin?: number },
): RedundancyResult {
  const overlapThreshold = opts?.overlapThresholdPct ?? DEFAULT_OVERLAP_THRESHOLD;
  const sameCategoryMin = opts?.sameCategoryMin ?? DEFAULT_SAME_CATEGORY_MIN;

  const highOverlapPairs = overlapMatrix(funds).filter((p) => p.overlapPct > overlapThreshold);

  const categoryCounts = new Map<string, number>();
  for (const f of funds) {
    const cat = f.category ?? 'other';
    categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1);
  }

  const overCrowdedCategories = [...categoryCounts.entries()]
    .filter(([, count]) => count >= sameCategoryMin)
    .map(([category, count]) => ({ category, count }));

  const redundantGroups = buildRedundantGroups(funds, highOverlapPairs);

  return { highOverlapPairs, overCrowdedCategories, redundantGroups };
}

function buildRedundantGroups(
  funds: OwnedFund[],
  heavyPairs: { schemeIdA: number; schemeIdB: number; overlapPct: number }[],
): RedundantGroup[] {
  const byId = new Map(funds.map((f) => [f.schemeId, f]));
  const groups = new Map<string, RedundantGroup>();

  for (const p of heavyPairs) {
    const a = byId.get(p.schemeIdA);
    const b = byId.get(p.schemeIdB);
    if (!a || !b) continue;
    const subA = inferSubCategory(a.schemeName);
    const subB = inferSubCategory(b.schemeName);
    if (!subA || !subB || subA.key !== subB.key) continue;

    const duplicatedInr = (p.overlapPct / 100) * Math.min(a.currentValueInr, b.currentValueInr);
    const g = groups.get(subA.key) ?? {
      subCategory: subA.key,
      subCategoryLabel: subA.label,
      schemeIds: [],
      pairs: [],
      maxOverlapPct: 0,
      duplicatedInr: 0,
    };
    for (const id of [p.schemeIdA, p.schemeIdB]) if (!g.schemeIds.includes(id)) g.schemeIds.push(id);
    g.pairs.push({ ...p, duplicatedInr });
    g.maxOverlapPct = Math.max(g.maxOverlapPct, p.overlapPct);
    groups.set(subA.key, g);
  }

  for (const g of groups.values()) {
    const values = g.schemeIds.map((id) => byId.get(id)!.currentValueInr);
    const largest = Math.max(...values);
    const sumPairs = g.pairs.reduce((sum, p) => sum + p.duplicatedInr, 0);
    // Pair sums double-count in 3+ fund groups; merging into the largest is the ceiling.
    g.duplicatedInr = Math.min(sumPairs, values.reduce((a, b) => a + b, 0) - largest);
  }
  return [...groups.values()];
}
