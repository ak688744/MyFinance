import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useInvestmentSummary, useHoldings, useAssets, useInvestmentAccounts, useAccounts, useInvestmentInsights, useInvestmentReview } from '../../lib/hooks';
import { DataState } from '../../components/ui/DataState';
import { Card, KPIStat, Badge } from '../../components/ui/primitives';
import { formatINR, formatPercent } from '../../lib/format';
import { classLabel } from '../../lib/transforms';
import type { ValuedAsset, ReviewCard } from '../../types';
import { AddInvestmentModal } from './AddInvestmentModal';
import { PortfolioReview } from './PortfolioReview';
import { UniverseStatusLine } from './UniverseStatusLine';
import { buildReviewSeed } from './reviewLanes';
import { FundDataStatus } from './FundDataStatus';
import { buildInvestmentInsightSeed } from './investmentInsightSeed';
import { useInvestmentInsightDismissal } from './useInvestmentInsightDismissal';
import { Drawer } from '../../components/ui/Drawer';
import { SparkleIcon } from '../../components/ui/icons';
import { ChatWorkspace } from '../assistant/ChatWorkspace';
import { useAgentChat } from '../assistant/useAgentChat';

const delta = (n: number | null | undefined) =>
  n == null ? 'text-gray-700' : n >= 0 ? 'text-gain' : 'text-loss';

export function InvestmentsPage() {
  const [addOpen, setAddOpen] = useState(false);
  const [account, setAccount] = useState<string | undefined>(undefined);
  const review = useInvestmentReview(account);
  const [aiOpen, setAiOpen] = useState(false);
  const aiChat = useAgentChat({ agent: 'investment', storageKey: 'myfinance.investments.chat.v2' });
  const queryClient = useQueryClient();

  const summary = useInvestmentSummary(account);
  const insights = useInvestmentInsights(account);
  const { dismiss, isDismissed } = useInvestmentInsightDismissal();
  const accounts = useInvestmentAccounts();
  const accountRows = useAccounts('investment');
  const selectedAccountId = useMemo(() => {
    if (!account) return undefined;
    return accountRows.data?.find((a) => a.label === account)?.id;
  }, [account, accountRows.data]);
  const holdings = useHoldings(account);
  const assets = useAssets(selectedAccountId !== undefined ? String(selectedAccountId) : undefined);

  const mf = holdings.data ?? [];
  const namesFor = (ids: number[]) => mf.filter((h) => ids.includes(h.schemeId ?? -1)).map((h) => h.schemeName);

  // Discuss: open the Investment Analyzer workspace on a NEW thread and send the seed once.
  // Runs from a click handler (not an effect), so StrictMode cannot double-send.
  const openDiscuss = (seed: string) => {
    setAiOpen(true);
    if (aiChat.isStreaming) return;
    aiChat.clearChat();
    void aiChat.send(seed);
  };

  const closeAi = () => {
    setAiOpen(false);
    for (const queryKey of [['investments'], ['assets'], ['networth'], ['investmentInsights']]) {
      queryClient.invalidateQueries({ queryKey });
    }
  };
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
  const scopeLabel = account ?? 'All accounts';
  const xirrLabel = account
    ? 'Portfolio XIRR'
    : 'Portfolio XIRR (tx history)';

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
                className={`chip ${active ? 'chip-active' : 'chip-inactive'}`}
              >
                {c}
              </button>
            );
          })}
        </div>
        <button type="button" onClick={() => setAddOpen(true)} className="btn-primary">+ Add investment</button>
      </div>

      {/* KPI strip — scoped to selected account chip */}
      <DataState isLoading={summary.isLoading} error={summary.error} onRetry={summary.refetch}>
        {summary.data && (
          <div className="flex flex-col gap-2">
            <div className="text-xs text-gray-500 px-1">Showing: {scopeLabel}</div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KPIStat label="Total Invested" value={formatINR(summary.data.totalInvested)} />
              <KPIStat label="MF Current Value" value={formatINR(summary.data.totalCurrentValue)} delta={summary.data.totalInvested > 0 ? (summary.data.totalReturns / summary.data.totalInvested) * 100 : null} />
              <KPIStat label="Total Returns" value={formatINR(summary.data.totalReturns)} />
              {/* getPortfolioSummary.xirr is a raw FRACTION (e.g. 0.0949 = 9.49%),
                  the Groww-validated core convention. Per-holding returnsXirr is
                  already pre-scaled to a percentage, but this one is not — scale
                  it here for display. Null when the account has no transaction history. */}
              <KPIStat label={xirrLabel} value={formatPercent(summary.data.xirr == null ? null : summary.data.xirr * 100)} />
            </div>
          </div>
        )}
      </DataState>

      <FundDataStatus account={account} />

      <UniverseStatusLine />

      <PortfolioReview
        review={review.data}
        loading={review.isLoading || review.isFetching}
        insights={insights.data ?? []}
        insightsLoading={insights.isLoading || insights.isFetching}
        isDismissed={isDismissed}
        onDismiss={dismiss}
        onDiscussCard={(c: ReviewCard) => openDiscuss(buildReviewSeed(c, namesFor(c.fundIds)))}
        onDiscussInsight={(i) => openDiscuss(buildInvestmentInsightSeed(i, namesFor(i.schemeIds)))}
      />

      <DataState
        isLoading={holdings.isLoading || assets.isLoading}
        error={holdings.error ?? assets.error}
        isEmpty={isEmpty}
        emptyMessage="No investments yet. Add your first."
        onRetry={() => { holdings.refetch(); assets.refetch(); }}
      >
        <div className="flex flex-col gap-4">
          <div className="flex justify-between items-center text-sm text-gray-500 px-1">
            <span>{account ? `Total value · ${account}` : 'Total value across all investment assets'}</span>
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

      <button
        type="button"
        aria-label="Ask AI about investments"
        onClick={() => setAiOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-[52px] h-[52px] rounded-full bg-ai text-white flex items-center justify-center shadow-[0_8px_20px_rgba(124,92,252,0.35)] hover:opacity-90 cursor-pointer"
      >
        <SparkleIcon width={24} height={24} />
      </button>
      <Drawer open={aiOpen} onClose={closeAi} ariaLabel="Investment Analyzer">
        <ChatWorkspace
          agent="investment"
          chat={aiChat}
          title="Investment Analyzer"
          placeholder="Ask about your investments…"
          suggestions={[
            `How is my portfolio performing${account ? ` in ${account}` : ''}?`,
            'Which funds are dragging my returns?',
            'Do my funds overlap or am I too concentrated?',
          ]}
          onClose={closeAi}
        />
      </Drawer>
    </div>
  );
}
