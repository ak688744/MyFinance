import type { OwnedFund } from './types';

export type OverlapResult = {
  overlapPct: number;
  commonSecurities: { name: string; weightA: number; weightB: number; minWeight: number }[];
};

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function holdingKey(h: OwnedFund['holdings'][number]): string {
  if (h.isin) return `isin:${h.isin}`;
  return `name:${normalizeName(h.securityName)}`;
}

function buildWeightMap(fund: OwnedFund): Map<string, { name: string; weight: number }> {
  const map = new Map<string, { name: string; weight: number }>();
  for (const h of fund.holdings) {
    const key = holdingKey(h);
    map.set(key, { name: h.securityName, weight: h.weightPct });
  }
  return map;
}

export function fundOverlap(a: OwnedFund, b: OwnedFund): OverlapResult {
  const mapA = buildWeightMap(a);
  const mapB = buildWeightMap(b);
  const commonSecurities: OverlapResult['commonSecurities'] = [];
  let overlapPct = 0;

  for (const [key, entryA] of mapA) {
    const entryB = mapB.get(key);
    if (!entryB) continue;
    const minWeight = Math.min(entryA.weight, entryB.weight);
    overlapPct += minWeight;
    commonSecurities.push({
      name: entryA.name,
      weightA: entryA.weight,
      weightB: entryB.weight,
      minWeight,
    });
  }

  commonSecurities.sort((x, y) => y.minWeight - x.minWeight);
  return { overlapPct, commonSecurities };
}

export function overlapMatrix(funds: OwnedFund[]): { schemeIdA: number; schemeIdB: number; overlapPct: number }[] {
  const pairs: { schemeIdA: number; schemeIdB: number; overlapPct: number }[] = [];
  for (let i = 0; i < funds.length; i++) {
    for (let j = i + 1; j < funds.length; j++) {
      const { overlapPct } = fundOverlap(funds[i], funds[j]);
      pairs.push({ schemeIdA: funds[i].schemeId, schemeIdB: funds[j].schemeId, overlapPct });
    }
  }
  return pairs;
}
