import { useParams } from 'react-router-dom';
import { useHoldings } from '../../lib/hooks';
import { DataState } from '../../components/ui/DataState';
import { Card, KPIStat } from '../../components/ui/primitives';
import { AIInsightCard } from '../../components/ui/AIInsightCard';
import { TrendChart } from '../../components/ui/charts';
import { formatINR, formatPercent } from '../../lib/format';

export function InvestmentAnalyzerPage() {
  const { schemeId } = useParams();
  const holdings = useHoldings();
  const holding = (holdings.data ?? []).find((h) => String(h.schemeId) === schemeId);

  return (
    <div className="flex flex-col gap-6">
      <DataState isLoading={holdings.isLoading} error={holdings.error} isEmpty={!holding} emptyMessage="Holding not found.">
        {holding && (
          <>
            <h1 className="font-heading text-2xl">{holding.schemeName}</h1>
            <div className="grid grid-cols-4 gap-4">
              <KPIStat label="Current Value" value={formatINR(holding.currentValue)} />
              <KPIStat label="Invested" value={formatINR(holding.investedValue)} />
              <KPIStat label="Total Returns" value={formatINR(holding.returnsAmount)} />
              <KPIStat label="XIRR" value={formatPercent(holding.returnsXirr)} />
            </div>
            <Card>
              <div className="text-sm font-semibold mb-3">Performance Trend</div>
              <TrendChart data={[]} emptyHint="Per-holding history will appear once historical NAV is wired." />
            </Card>
            <AIInsightCard text="Detailed fund analytics (sector split, benchmark, news) arrive with the L4 assistant." />
          </>
        )}
      </DataState>
    </div>
  );
}
