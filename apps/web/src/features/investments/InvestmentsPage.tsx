import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useInvestmentSummary, useHoldings, useAssets, useInvestmentAccounts } from '../../lib/hooks';
import { DataState } from '../../components/ui/DataState';
import { Card, KPIStat, Badge } from '../../components/ui/primitives';
import { formatINR, formatPercent } from '../../lib/format';
import { classLabel } from '../../lib/transforms';
import type { ValuedAsset } from '../../types';
import { AddInvestmentModal } from './AddInvestmentModal';
import { AddAccountModal } from '../accounts/AddAccountModal';
import { ImportModal } from '../imports/ImportModal';

const delta = (n: number | null | undefined) =>
  n == null ? 'text-gray-700' : n >= 0 ? 'text-gain' : 'text-loss';

export function InvestmentsPage() {
  const [addOpen, setAddOpen] = useState(false);
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [account, setAccount] = useState<string | undefined>(undefined);

  const summary = useInvestmentSummary();
  const accounts = useInvestmentAccounts();
  const holdings = useHoldings(account);
  const assets = useAssets();

  const mf = holdings.data ?? [];
  // Generic (non-MF) assets grouped by class. /assets also projects MF — drop it
  // here (MF is rendered from /investments/holdings above). See BUG-002.
  const genericGroups = useMemo(() => {
    const map = new Map<string, ValuedAsset[]>();
    for (const a of assets.data ?? []) {
      if (a.assetClass === 'mutual_fund') continue;
      const list = map.get(a.assetClass) ?? [];
      list.push(a);
      map.set(a.assetClass, list);
    }
    return [...map.entries()];
  }, [assets.data]);

  const mfValue = mf.reduce((s, h) => s + h.currentValue, 0);
  const genericValue = (assets.data ?? []).filter((a) => a.assetClass !== 'mutual_fund').reduce((s, a) => s + a.currentValue, 0);
  const allAssetsValue = mfValue + genericValue;
  const isEmpty = mf.length === 0 && genericGroups.length === 0;

  const chips = ['All', ...(accounts.data ?? [])];

  return (
    <div className="flex flex-col gap-5">
      {/* Account filter + actions */}
      <div className="flex justify-between items-center gap-3 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          {chips.map((c) => {
            const active = (c === 'All' && !account) || c === account;
            return (
              <button
                key={c}
                onClick={() => setAccount(c === 'All' ? undefined : c)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${active ? 'bg-brand text-white border-brand' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
              >
                {c}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setImportOpen(true)} className="border border-brand text-brand rounded-lg px-4 py-2 text-sm">+ Import file</button>
          <button onClick={() => setAddAccountOpen(true)} className="border border-brand text-brand rounded-lg px-4 py-2 text-sm">+ Add account</button>
          <button onClick={() => setAddOpen(true)} className="bg-brand text-white rounded-lg px-4 py-2 text-sm">+ Add investment</button>
        </div>
      </div>

      {/* KPI strip: MF portfolio + all-assets total */}
      <DataState isLoading={summary.isLoading} error={summary.error} onRetry={summary.refetch}>
        {summary.data && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPIStat label="Total Invested" value={formatINR(summary.data.totalInvested)} />
            <KPIStat label="MF Current Value" value={formatINR(summary.data.totalCurrentValue)} delta={summary.data.totalInvested > 0 ? (summary.data.totalReturns / summary.data.totalInvested) * 100 : null} />
            <KPIStat label="Total Returns" value={formatINR(summary.data.totalReturns)} />
            <KPIStat label="Portfolio XIRR" value={formatPercent(summary.data.xirr)} />
          </div>
        )}
      </DataState>

      <DataState
        isLoading={holdings.isLoading || assets.isLoading}
        error={holdings.error ?? assets.error}
        isEmpty={isEmpty}
        emptyMessage="No investments yet. Add your first."
        onRetry={() => { holdings.refetch(); assets.refetch(); }}
      >
        <div className="flex flex-col gap-4">
          <div className="flex justify-between items-center text-sm text-gray-500 px-1">
            <span>Total value across all investment assets</span>
            <span className="tabular font-semibold text-gray-900">{formatINR(allAssetsValue)}</span>
          </div>

          {/* Mutual funds — full table */}
          {mf.length > 0 && (
            <Card>
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-brand" />
                  <span className="font-heading font-semibold">{classLabel('mutual_fund')}</span>
                  <Badge strategy="market" />
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-gray-400 uppercase">Value</div>
                  <div className="tabular font-semibold">{formatINR(mfValue)}</div>
                </div>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase text-gray-400 text-left">
                    <th className="font-medium py-1">Asset Name</th>
                    <th className="font-medium py-1 text-right">Invested</th>
                    <th className="font-medium py-1 text-right">Current Value</th>
                    <th className="font-medium py-1 text-right">Returns</th>
                    <th className="font-medium py-1 text-right">XIRR</th>
                  </tr>
                </thead>
                <tbody>
                  {mf.map((h) => (
                    <tr key={h.id} className="border-t border-gray-50">
                      <td className="py-2">
                        {h.schemeId ? (
                          <Link to={`/investments/${h.schemeId}`} className="text-brand hover:underline">{h.schemeName}</Link>
                        ) : <span>{h.schemeName}</span>}
                        <div className="text-[11px] text-gray-400">{[h.category, h.investmentApp].filter(Boolean).join(' · ')}</div>
                      </td>
                      <td className="py-2 text-right tabular">{formatINR(h.investedValue)}</td>
                      <td className="py-2 text-right tabular">{formatINR(h.currentValue)}</td>
                      <td className={`py-2 text-right tabular ${delta(h.returnsAmount)}`}>
                        {formatINR(h.returnsAmount)}
                        <div className="text-[11px]">{formatPercent(h.returnsPercent)}</div>
                      </td>
                      <td className={`py-2 text-right tabular ${delta(h.returnsXirr)}`}>{formatPercent(h.returnsXirr)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          {/* Other asset classes — name + current value (+ invested/returns when present) */}
          {genericGroups.map(([cls, items]) => {
            const total = items.reduce((s, a) => s + a.currentValue, 0);
            const strategy = items[0]?.valuationStrategy ?? 'manual';
            return (
              <Card key={cls}>
                <div className="flex justify-between items-center mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    <span className="font-heading font-semibold">{classLabel(cls)}</span>
                    <Badge strategy={strategy} />
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] text-gray-400 uppercase">Value</div>
                    <div className="tabular font-semibold">{formatINR(total)}</div>
                  </div>
                </div>
                <div className="flex flex-col">
                  {items.map((a, i) => (
                    <div key={a.assetId ?? i} className="flex justify-between items-center text-sm py-2 border-t border-gray-50">
                      <span>{a.name}</span>
                      <div className="flex items-center gap-3">
                        {a.returns != null && <span className={`text-xs tabular ${delta(a.returns)}`}>{formatINR(a.returns)}</span>}
                        <span className="tabular">{formatINR(a.currentValue)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      </DataState>

      <AddInvestmentModal open={addOpen} onClose={() => setAddOpen(false)} />
      <AddAccountModal open={addAccountOpen} onClose={() => setAddAccountOpen(false)} />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}
