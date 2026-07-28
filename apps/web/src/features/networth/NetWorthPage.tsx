import { useState } from 'react';
import { useNetWorth, useNetWorthHistory } from '../../lib/hooks';
import { DataState } from '../../components/ui/DataState';
import { Card, KPIStat, RangeToggle, SectionTitle } from '../../components/ui/primitives';
import { AIInsightCard } from '../../components/ui/AIInsightCard';
import { TrendChart } from '../../components/ui/charts';
import { CHART_PALETTE } from '../../lib/chartPalette';
import { formatCompactINR, formatINR } from '../../lib/format';
import { classLabel } from '../../lib/transforms';

export function NetWorthPage() {
  const [range, setRange] = useState('6M');
  const nw = useNetWorth();
  const history = useNetWorthHistory('');

  return (
    <div className="flex flex-col gap-4">
      <DataState isLoading={nw.isLoading} error={nw.error} onRetry={nw.refetch}>
        {nw.data && (() => {
          const byClass = nw.data.byAssetClass;
          return (
            <>
              {/* KPI strip — skill: bullet-chart grid for dashboard KPIs */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <KPIStat label="Total Assets" value={formatCompactINR(nw.data.totalAssets)} accent="brand" />
                <KPIStat label="Liabilities" value={formatCompactINR(nw.data.totalLiabilities)} accent="loss" />
                <KPIStat label="Net Worth" value={formatCompactINR(nw.data.netWorth)} accent="gain" />
              </div>

              {/* Hero + performance */}
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(280px,1fr)_1.7fr] gap-4">
                <Card accent="brand" className="relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-brand/5 rounded-full -translate-y-1/2 translate-x-1/2" aria-hidden />
                  <div className="relative">
                    <div className="text-xs text-ink-muted uppercase tracking-wider font-medium">Command Center</div>
                    <div className="text-sm text-ink-muted mt-1">Total Net Worth</div>
                    <div className="font-mono text-4xl mt-2 tabular font-bold text-ink tracking-tight">
                      {formatCompactINR(nw.data.netWorth)}
                    </div>
                    <div className="text-xs text-ink-subtle mt-2 font-mono tabular">{formatINR(nw.data.netWorth)}</div>
                  </div>
                </Card>
                <Card>
                  <SectionTitle action={<RangeToggle value={range} onChange={setRange} />}>
                    Performance
                  </SectionTitle>
                  <TrendChart
                    data={(history.data ?? []).map((p) => ({ date: p.date, value: p.netWorth }))}
                    emptyHint="Net-worth history will appear once historical valuations are available."
                  />
                </Card>
              </div>

              {/* Composition + summary */}
              <div className="grid grid-cols-1 lg:grid-cols-[1.7fr_minmax(260px,1fr)] gap-4">
                <Card interactive>
                  <SectionTitle>Asset Composition</SectionTitle>
                  {byClass.length === 0 ? (
                    <div className="text-sm text-ink-subtle py-8 text-center">No assets tracked yet.</div>
                  ) : (
                    <>
                      <div className="flex w-full h-2.5 rounded-full overflow-hidden mb-4 ring-1 ring-border">
                        {byClass.map((c, i) => (
                          <div
                            key={c.assetClass}
                            className="h-full transition-opacity duration-200 hover:opacity-80"
                            style={{ width: `${c.percentage}%`, background: CHART_PALETTE[i % CHART_PALETTE.length] }}
                            title={`${classLabel(c.assetClass)} ${c.percentage.toFixed(1)}%`}
                          />
                        ))}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {byClass.map((c, i) => (
                          <div key={c.assetClass} className="flex items-start gap-2 p-2 rounded-lg hover:bg-canvas transition-colors duration-200">
                            <span
                              className="w-2.5 h-2.5 rounded-full mt-1 shrink-0 ring-2 ring-white"
                              style={{ background: CHART_PALETTE[i % CHART_PALETTE.length] }}
                            />
                            <div className="leading-tight min-w-0">
                              <div className="text-xs text-ink-muted truncate">{classLabel(c.assetClass)}</div>
                              <div className="text-sm font-mono font-semibold tabular text-ink">{formatCompactINR(c.value)}</div>
                              <div className="text-[11px] text-ink-subtle">{c.percentage.toFixed(1)}%</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </Card>

                <Card>
                  <SectionTitle>Summary</SectionTitle>
                  <div className="space-y-0">
                    <div className="flex justify-between items-center py-2.5 border-b border-border">
                      <span className="text-sm text-ink-muted">Total Assets</span>
                      <span className="tabular font-mono font-semibold text-ink">{formatCompactINR(nw.data.totalAssets)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2.5 border-b border-border">
                      <span className="text-sm text-ink-muted">Liabilities</span>
                      <span className="tabular font-mono font-semibold text-loss">
                        {nw.data.totalLiabilities > 0 ? `−${formatCompactINR(nw.data.totalLiabilities)}` : formatCompactINR(0)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2.5 bg-brand/5 -mx-4 px-4 rounded-lg mt-1">
                      <span className="text-sm font-semibold text-brand">Net Worth</span>
                      <span className="tabular font-mono font-bold text-brand text-lg">{formatCompactINR(nw.data.netWorth)}</span>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Per-class mini cards */}
              {byClass.length > 0 && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {byClass.slice(0, 4).map((c, i) => (
                    <Card key={c.assetClass} interactive>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-ink truncate">{classLabel(c.assetClass)}</span>
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: CHART_PALETTE[i % CHART_PALETTE.length] }}
                        />
                      </div>
                      <div className="font-mono text-xl mt-2 tabular font-semibold text-ink">{formatCompactINR(c.value)}</div>
                      <div className="text-xs text-ink-subtle mt-1">{c.percentage.toFixed(1)}% of assets</div>
                    </Card>
                  ))}
                </div>
              )}

              <AIInsightCard text="Your net worth reflects all tracked assets minus liabilities. Ask the assistant for allocation insights or spending patterns." />
            </>
          );
        })()}
      </DataState>
    </div>
  );
}
