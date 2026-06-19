export const ASSET_CLASS_LABELS: Record<string, string> = {
  mutual_fund: 'Mutual Funds',
  stock: 'Stocks',
  ppf: 'PPF',
  epf: 'EPF',
  nps: 'NPS',
  fd: 'Fixed Deposits',
  gold: 'Gold',
  real_estate: 'Real Estate',
  cash: 'Cash',
};

export function classLabel(assetClass: string): string {
  return ASSET_CLASS_LABELS[assetClass] ?? assetClass;
}

type MfHolding = { name: string; currentValue: number; assetClass?: string; schemeId?: number | null };
type GenericAsset = { assetId: number | null; name: string; assetClass: string; currentValue: number; valuationStrategy: string };

export type HoldingGroup = {
  assetClass: string;
  label: string;
  valuationStrategy: string;
  items: Array<MfHolding | GenericAsset>;
  totalValue: number;
};

export function groupHoldingsByClass(mf: MfHolding[], assets: GenericAsset[]): HoldingGroup[] {
  const groups = new Map<string, HoldingGroup>();
  const push = (cls: string, strategy: string, item: MfHolding | GenericAsset, value: number) => {
    let g = groups.get(cls);
    if (!g) { g = { assetClass: cls, label: classLabel(cls), valuationStrategy: strategy, items: [], totalValue: 0 }; groups.set(cls, g); }
    g.items.push(item);
    g.totalValue += value;
  };
  for (const h of mf) push('mutual_fund', 'market', h, h.currentValue);
  for (const a of assets) {
    // MF holdings arrive via the `mf` param (from /investments/holdings).
    // /assets (getAllAssets) ALSO projects MF as assetClass 'mutual_fund';
    // skip those here so MF is not displayed/counted twice. See BUG-002.
    if (a.assetClass === 'mutual_fund') continue;
    push(a.assetClass, a.valuationStrategy, a, a.currentValue);
  }
  return [...groups.values()];
}

export function allocationToChartData(
  byAssetClass: Array<{ assetClass: string; value: number; percentage: number }>,
): Array<{ name: string; value: number; percentage: number }> {
  return byAssetClass.map((r) => ({ name: classLabel(r.assetClass), value: r.value, percentage: r.percentage }));
}

export function summaryByCategoryWithNames(
  byCategory: Array<{ categoryId: string | null; amount: number }>,
  categories: Array<{ id: string; name: string }>,
): Array<{ categoryId: string | null; name: string; amount: number }> {
  const byId = new Map(categories.map((c) => [c.id, c.name]));
  return byCategory.map((r) => ({
    categoryId: r.categoryId,
    name: r.categoryId ? byId.get(r.categoryId) ?? r.categoryId : 'Uncategorized',
    amount: r.amount,
  }));
}
