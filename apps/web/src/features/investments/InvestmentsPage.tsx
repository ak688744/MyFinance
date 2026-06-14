import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useInvestmentSummary, useHoldings, useAssets } from '../../lib/hooks';
import { DataState } from '../../components/ui/DataState';
import { Card, KPIStat, Badge } from '../../components/ui/primitives';
import { formatINR, formatPercent } from '../../lib/format';
import { groupHoldingsByClass } from '../../lib/transforms';
import { AddInvestmentModal } from './AddInvestmentModal';

export function InvestmentsPage() {
  const [addOpen, setAddOpen] = useState(false);
  const summary = useInvestmentSummary();
  const holdings = useHoldings();
  const assets = useAssets();

  const mfItems = (holdings.data ?? []).map((h) => ({ name: h.schemeName, currentValue: h.currentValue, schemeId: h.schemeId }));
  const groups = groupHoldingsByClass(
    mfItems,
    (assets.data ?? []).map((a) => ({ assetId: a.assetId, name: a.name, assetClass: a.assetClass, currentValue: a.currentValue, valuationStrategy: a.valuationStrategy })),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center">
        <h1 className="font-heading text-2xl">Investments</h1>
        <button onClick={() => setAddOpen(true)} className="bg-brand text-white rounded-lg px-4 py-2 text-sm">+ Add investment</button>
      </div>

      <DataState isLoading={summary.isLoading} error={summary.error} onRetry={summary.refetch}>
        {summary.data && (
          <div className="grid grid-cols-4 gap-4">
            <KPIStat label="Total Invested" value={formatINR(summary.data.totalInvested)} />
            <KPIStat label="Current Value" value={formatINR(summary.data.totalCurrentValue)} />
            <KPIStat label="Total Returns" value={formatINR(summary.data.totalReturns)} />
            <KPIStat label="Portfolio XIRR" value={formatPercent(summary.data.xirr)} />
          </div>
        )}
      </DataState>

      <DataState isLoading={holdings.isLoading || assets.isLoading} error={holdings.error ?? assets.error} isEmpty={groups.length === 0} emptyMessage="No investments yet. Add your first.">
        <div className="flex flex-col gap-4">
          {groups.map((g) => (
            <Card key={g.assetClass}>
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-2">
                  <span className="font-heading font-semibold">{g.label}</span>
                  <Badge strategy={g.valuationStrategy} />
                </div>
                <span className="tabular font-semibold">{formatINR(g.totalValue)}</span>
              </div>
              <div className="flex flex-col gap-1">
                {g.items.map((it, i) => {
                  const schemeId = 'schemeId' in it ? it.schemeId : null;
                  const assetId = 'assetId' in it ? it.assetId : null;
                  const rowKey = schemeId ?? assetId ?? i;
                  return (
                    <div key={rowKey} className="flex justify-between text-sm py-1 border-t border-gray-50">
                      {schemeId ? (
                        <Link to={`/investments/${schemeId}`} className="text-brand hover:underline">{it.name}</Link>
                      ) : <span>{it.name}</span>}
                      <span className="tabular">{formatINR(it.currentValue)}</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      </DataState>

      <AddInvestmentModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
