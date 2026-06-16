import { useState } from 'react';
import { useLiabilities, useLiability } from '../../lib/hooks';
import { DataState } from '../../components/ui/DataState';
import { Card, KPIStat } from '../../components/ui/primitives';
import { AIInsightCard } from '../../components/ui/AIInsightCard';
import { formatINR, formatCompactINR, formatPercent, formatDate } from '../../lib/format';
import type { LiabilityListItem } from '../../types';
import { AmortizationDrawer } from './AmortizationDrawer';
import { AddLoanModal } from './AddLoanModal';
import { LoansIcon } from '../../components/ui/icons';

function LoanCard({ loan, onOpen }: { loan: LiabilityListItem; onOpen: () => void }) {
  // Per-loan derived state (outstanding / next due / progress) comes from the
  // detail endpoint's loanStatus. A handful of loans → fine to fetch per card.
  const detail = useLiability(String(loan.id));
  const st = detail.data?.status;
  return (
    <Card>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-brand/10 text-brand flex items-center justify-center shrink-0">
          <LoansIcon />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-heading font-semibold capitalize">{loan.name}</div>
          <div className="text-xs text-gray-400 capitalize">{loan.loanType} loan</div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
        <div>
          <div className="text-[11px] text-gray-400 uppercase">Outstanding</div>
          <div className="tabular font-semibold text-loss">{formatINR(st?.outstanding ?? loan.principal)}</div>
        </div>
        <div>
          <div className="text-[11px] text-gray-400 uppercase">EMI</div>
          <div className="tabular font-semibold">{formatINR(loan.emi)}<span className="text-xs text-gray-400">/mo</span></div>
        </div>
        <div>
          <div className="text-[11px] text-gray-400 uppercase">Interest Rate</div>
          <div className="tabular font-semibold">{formatPercent(loan.annualRate)} p.a.</div>
        </div>
        <div>
          <div className="text-[11px] text-gray-400 uppercase">Next Due</div>
          <div className="tabular font-semibold">{st?.nextDueDate ? formatDate(st.nextDueDate) : '—'}</div>
        </div>
      </div>

      {st && (
        <div className="mt-4">
          <div className="flex justify-between text-[11px] text-gray-500 mb-1">
            <span>Repayment progress: {st.progressPercent.toFixed(0)}%</span>
            <span>Original: {formatINR(loan.principal)}</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full bg-brand" style={{ width: `${Math.min(100, Math.max(0, st.progressPercent))}%` }} />
          </div>
          <div className="flex justify-between items-center mt-2">
            <span className="text-[11px] text-gray-400">{st.monthsRemaining} months remaining</span>
            <button onClick={onOpen} className="text-brand text-xs hover:underline">View amortization schedule →</button>
          </div>
        </div>
      )}
      {!st && (
        <div className="mt-3 text-right">
          <button onClick={onOpen} className="text-brand text-xs hover:underline">View amortization schedule →</button>
        </div>
      )}
    </Card>
  );
}

export function LoansPage() {
  const loans = useLiabilities('active');
  const [openId, setOpenId] = useState<string | null>(null);
  const [addLoanOpen, setAddLoanOpen] = useState(false);

  const rows = loans.data ?? [];
  const totalEmi = rows.reduce((s, l) => s + (l.emi ?? 0), 0);
  const totalPrincipal = rows.reduce((s, l) => s + l.principal, 0);
  const avgRate = rows.length > 0 ? rows.reduce((s, l) => s + l.annualRate, 0) / rows.length : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end">
        <button onClick={() => setAddLoanOpen(true)} className="bg-brand text-white rounded-lg px-4 py-2 text-sm">+ Add loan</button>
      </div>

      <DataState isLoading={loans.isLoading} error={loans.error} isEmpty={rows.length === 0} emptyMessage="No loans tracked." onRetry={loans.refetch}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPIStat label="Total Principal" value={formatCompactINR(totalPrincipal)} />
          <KPIStat label="Monthly EMI" value={formatINR(totalEmi)} />
          <KPIStat label="Active Loans" value={String(rows.length)} />
          <KPIStat label="Avg Interest Rate" value={avgRate !== null ? `${avgRate.toFixed(1)}%` : '—'} />
        </div>

        <div className="text-sm font-semibold text-gray-700 mt-1">Active Loans</div>
        <div className="flex flex-col gap-4">
          {rows.map((l) => (
            <LoanCard key={l.id} loan={l} onOpen={() => setOpenId(String(l.id))} />
          ))}
        </div>
      </DataState>

      <AIInsightCard text="Prepayment-optimization advice will be provided by the assistant in L4." />
      <AmortizationDrawer id={openId} onClose={() => setOpenId(null)} />
      <AddLoanModal open={addLoanOpen} onClose={() => setAddLoanOpen(false)} />
    </div>
  );
}
