import { useState } from 'react';
import { useNetWorth, useNetWorthHistory } from '../../lib/hooks';
import { DataState } from '../../components/ui/DataState';
import { Card, KPIStat, RangeToggle } from '../../components/ui/primitives';
import { AIInsightCard } from '../../components/ui/AIInsightCard';
import { TrendChart, DonutChart } from '../../components/ui/charts';
import { formatCompactINR, formatINR } from '../../lib/format';
import { allocationToChartData } from '../../lib/transforms';

export function NetWorthPage() {
  const [range, setRange] = useState('1Y');
  const nw = useNetWorth();
  // History dates are empty for now (MF history is the documented stretch gap);
  // the trend chart degrades gracefully. Wiring real dates is a follow-up.
  const history = useNetWorthHistory('');

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl">Net Worth</h1>
      <DataState isLoading={nw.isLoading} error={nw.error} onRetry={nw.refetch}>
        {nw.data && (
          <>
            <Card>
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-xs text-gray-500 uppercase">Net Worth</div>
                  <div className="font-heading text-4xl mt-1 tabular">{formatCompactINR(nw.data.netWorth)}</div>
                </div>
                <RangeToggle value={range} onChange={setRange} />
              </div>
              <div className="mt-4">
                <TrendChart
                  data={(history.data ?? []).map((p) => ({ date: p.date, value: p.netWorth }))}
                  emptyHint="Net-worth history will appear once historical valuations are available."
                />
              </div>
            </Card>

            <div className="grid grid-cols-3 gap-4">
              <KPIStat label="Total Assets" value={formatINR(nw.data.totalAssets)} />
              <KPIStat label="Total Liabilities" value={formatINR(nw.data.totalLiabilities)} />
              <KPIStat label="Net Worth" value={formatINR(nw.data.netWorth)} />
            </div>

            <Card>
              <div className="text-sm font-semibold mb-3">Asset Composition</div>
              <DonutChart data={allocationToChartData(nw.data.byAssetClass)} />
            </Card>

            <AIInsightCard text="Your net worth reflects all tracked assets minus liabilities. Connect more accounts to sharpen the picture." />
          </>
        )}
      </DataState>
    </div>
  );
}
