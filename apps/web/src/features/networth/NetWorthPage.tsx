import { useState } from 'react';
import { useNetWorth, useNetWorthHistory } from '../../lib/hooks';
import { DataState } from '../../components/ui/DataState';
import { Card, RangeToggle } from '../../components/ui/primitives';
import { AIInsightCard } from '../../components/ui/AIInsightCard';
import { TrendChart } from '../../components/ui/charts';
import { formatCompactINR, formatINR } from '../../lib/format';
import { classLabel } from '../../lib/transforms';

const PALETTE = ['#1463F3', '#0E9F6E', '#7C5CFC', '#F59E0B', '#EF4444', '#06B6D4', '#8B5CF6', '#10B981', '#6B7280'];

export function NetWorthPage() {
  const [range, setRange] = useState('6M');
  const nw = useNetWorth();
  // History dates are empty for now (MF history is the documented stretch gap);
  // the trend chart degrades gracefully. Wiring real dates is a follow-up.
  const history = useNetWorthHistory('');

  return (
    <div className="flex flex-col gap-5">
      <DataState isLoading={nw.isLoading} error={nw.error} onRetry={nw.refetch}>
        {nw.data && (() => {
          const byClass = nw.data.byAssetClass;
          return (
            <>
              {/* Hero + performance */}
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(280px,1fr)_1.6fr] gap-5">
                <Card className="flex flex-col justify-center">
                  <div className="text-sm text-gray-500">Total Net Worth</div>
                  <div className="font-heading text-4xl mt-2 tabular">{formatCompactINR(nw.data.netWorth)}</div>
                  <div className="text-xs text-gray-400 mt-2">{formatINR(nw.data.netWorth)}</div>
                </Card>
                <Card>
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-heading font-semibold">Performance</span>
                    <RangeToggle value={range} onChange={setRange} />
                  </div>
                  <TrendChart
                    data={(history.data ?? []).map((p) => ({ date: p.date, value: p.netWorth }))}
                    emptyHint="Net-worth history will appear once historical valuations are available."
                  />
                </Card>
              </div>

              {/* Composition + summary */}
              <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_minmax(260px,1fr)] gap-5">
                <Card>
                  <div className="font-heading text-lg font-semibold mb-4">Asset Composition</div>
                  {byClass.length === 0 ? (
                    <div className="text-sm text-gray-400 py-6">No assets tracked yet.</div>
                  ) : (
                    <>
                      <div className="flex w-full h-3 rounded-full overflow-hidden mb-5">
                        {byClass.map((c, i) => (
                          <div key={c.assetClass} style={{ width: `${c.percentage}%`, background: PALETTE[i % PALETTE.length] }} title={`${classLabel(c.assetClass)} ${c.percentage.toFixed(1)}%`} />
                        ))}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-4 gap-x-3">
                        {byClass.map((c, i) => (
                          <div key={c.assetClass} className="flex items-start gap-2">
                            <span className="w-2.5 h-2.5 rounded-full mt-1 shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
                            <div className="leading-tight">
                              <div className="text-xs text-gray-500">{classLabel(c.assetClass)}</div>
                              <div className="text-sm font-semibold tabular">{formatCompactINR(c.value)}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </Card>

                <Card className="flex flex-col">
                  <div className="font-heading text-lg font-semibold mb-4">Summary</div>
                  <div className="flex justify-between items-center py-3 border-b border-gray-100">
                    <span className="text-sm text-gray-500">Total Assets</span>
                    <span className="tabular font-semibold">{formatCompactINR(nw.data.totalAssets)}</span>
                  </div>
                  <div className="flex justify-between items-center py-3 border-b border-gray-100">
                    <span className="text-sm text-gray-500">Liabilities</span>
                    <span className="tabular font-semibold text-loss">{nw.data.totalLiabilities > 0 ? `-${formatCompactINR(nw.data.totalLiabilities)}` : formatCompactINR(0)}</span>
                  </div>
                  <div className="flex justify-between items-center py-3">
                    <span className="text-sm font-semibold text-brand">Net Worth</span>
                    <span className="tabular font-bold text-brand">{formatCompactINR(nw.data.netWorth)}</span>
                  </div>
                </Card>
              </div>

              {/* Per-class mini cards */}
              {byClass.length > 0 && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {byClass.slice(0, 4).map((c, i) => (
                    <Card key={c.assetClass}>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-gray-700">{classLabel(c.assetClass)}</span>
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
                      </div>
                      <div className="font-heading text-xl mt-2 tabular">{formatCompactINR(c.value)}</div>
                      <div className="text-xs text-gray-400 mt-1">{c.percentage.toFixed(1)}% of assets</div>
                    </Card>
                  ))}
                </div>
              )}

              <AIInsightCard text="Your net worth reflects all tracked assets minus liabilities. Connect more accounts to sharpen the picture." />
            </>
          );
        })()}
      </DataState>
    </div>
  );
}
