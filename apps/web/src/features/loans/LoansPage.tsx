import { useState } from 'react';
import { useLiabilities } from '../../lib/hooks';
import { DataState } from '../../components/ui/DataState';
import { Card, KPIStat } from '../../components/ui/primitives';
import { AIInsightCard } from '../../components/ui/AIInsightCard';
import { formatINR, formatCompactINR, formatPercent, formatDate } from '../../lib/format';
import type { LiabilityListItem } from '../../types';
import { AmortizationDrawer } from './AmortizationDrawer';
import { AddLoanModal } from './AddLoanModal';
import { EditLoanModal } from './EditLoanModal';
import { LoansIcon } from '../../components/ui/icons';

function LoanCard({
  loan,
  onOpen,
  onEdit,
}: {
  loan: LiabilityListItem;
  onOpen: () => void;
  onEdit: () => void;
}) {
  const repaid = Math.max(0, loan.principal - loan.outstanding);
  return (
    <Card interactive>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-brand/10 text-brand flex items-center justify-center shrink-0">
          <LoansIcon />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-heading font-semibold capitalize">{loan.name}</div>
          <div className="text-xs text-ink-subtle capitalize">{loan.loanType} loan</div>
        </div>
        <button type="button" onClick={onEdit} className="btn-secondary text-xs py-1.5 px-2.5">
          Edit
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
        <div>
          <div className="text-[11px] text-ink-subtle uppercase">Original amount</div>
          <div className="tabular font-semibold">{formatINR(loan.principal)}</div>
        </div>
        <div>
          <div className="text-[11px] text-ink-subtle uppercase">Remaining</div>
          <div className="tabular font-semibold text-loss">{formatINR(loan.outstanding)}</div>
        </div>
        <div>
          <div className="text-[11px] text-ink-subtle uppercase">Repaid</div>
          <div className="tabular font-semibold text-gain">{formatINR(repaid)}</div>
        </div>
        <div>
          <div className="text-[11px] text-ink-subtle uppercase">Interest rate</div>
          <div className="tabular font-semibold">{formatPercent(loan.annualRate)} p.a.</div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-2 gap-3 mt-3 pt-3 border-t border-border">
        <div>
          <div className="text-[11px] text-ink-subtle uppercase">EMI</div>
          <div className="tabular font-semibold">{formatINR(loan.emi)}<span className="text-xs text-ink-subtle">/mo</span></div>
        </div>
        <div>
          <div className="text-[11px] text-ink-subtle uppercase">Next due</div>
          <div className="tabular font-semibold">{loan.nextDueDate ? formatDate(loan.nextDueDate) : '—'}</div>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex justify-between text-[11px] text-ink-muted mb-1">
          <span>Repayment progress: {loan.progressPercent.toFixed(0)}%</span>
          <span>{loan.monthsRemaining} months remaining</span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-canvas overflow-hidden">
          <div className="h-full bg-brand" style={{ width: `${Math.min(100, Math.max(0, loan.progressPercent))}%` }} />
        </div>
        <div className="flex justify-end mt-2">
          <button type="button" onClick={onOpen} className="text-brand text-xs hover:underline cursor-pointer">
            View amortization schedule →
          </button>
        </div>
      </div>
    </Card>
  );
}

export function LoansPage() {
  const loans = useLiabilities('active');
  const [openId, setOpenId] = useState<string | null>(null);
  const [editLoan, setEditLoan] = useState<LiabilityListItem | null>(null);
  const [addLoanOpen, setAddLoanOpen] = useState(false);

  const rows = loans.data ?? [];
  const totalEmi = rows.reduce((s, l) => s + (l.emi ?? 0), 0);
  const totalPrincipal = rows.reduce((s, l) => s + l.principal, 0);
  const totalOutstanding = rows.reduce((s, l) => s + l.outstanding, 0);
  const totalRepaid = Math.max(0, totalPrincipal - totalOutstanding);
  const avgRate = rows.length > 0 ? rows.reduce((s, l) => s + l.annualRate, 0) / rows.length : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end">
        <button type="button" onClick={() => setAddLoanOpen(true)} className="btn-primary">+ Add loan</button>
      </div>

      <DataState isLoading={loans.isLoading} error={loans.error} isEmpty={rows.length === 0} emptyMessage="No loans tracked." onRetry={loans.refetch}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPIStat label="Original Principal" value={formatCompactINR(totalPrincipal)} />
          <KPIStat label="Outstanding" value={formatCompactINR(totalOutstanding)} accent="loss" />
          <KPIStat label="Repaid" value={formatCompactINR(totalRepaid)} accent="gain" />
          <KPIStat label="Avg Interest Rate" value={avgRate !== null ? `${avgRate.toFixed(2)}%` : '—'} />
        </div>
        <div className="text-xs text-ink-subtle -mt-2">Monthly EMI total: {formatINR(totalEmi)}</div>

        <div className="text-sm font-semibold text-ink mt-1">Active Loans</div>
        <div className="flex flex-col gap-4">
          {rows.map((l) => (
            <LoanCard
              key={l.id}
              loan={l}
              onOpen={() => setOpenId(String(l.id))}
              onEdit={() => setEditLoan(l)}
            />
          ))}
        </div>
      </DataState>

      <AIInsightCard text="Update remaining balance after prepayments and keep your interest rate current for accurate net-worth and payoff projections." />
      <AmortizationDrawer id={openId} onClose={() => setOpenId(null)} />
      <EditLoanModal loan={editLoan} onClose={() => setEditLoan(null)} />
      <AddLoanModal open={addLoanOpen} onClose={() => setAddLoanOpen(false)} />
    </div>
  );
}
