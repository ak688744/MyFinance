import { useState } from 'react';
import { useLiabilities } from '../../lib/hooks';
import { DataState } from '../../components/ui/DataState';
import { Card } from '../../components/ui/primitives';
import { AIInsightCard } from '../../components/ui/AIInsightCard';
import { formatINR, formatPercent } from '../../lib/format';
import { AmortizationDrawer } from './AmortizationDrawer';

export function LoansPage() {
  const loans = useLiabilities('active');
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl">Loans</h1>
      <DataState isLoading={loans.isLoading} error={loans.error} isEmpty={(loans.data ?? []).length === 0} emptyMessage="No loans tracked." onRetry={loans.refetch}>
        <div className="flex flex-col gap-4">
          {(loans.data ?? []).map((l) => (
            <Card key={l.id}>
              <div className="flex justify-between items-center">
                <div>
                  <div className="font-heading font-semibold capitalize">{l.name}</div>
                  <div className="text-xs text-gray-500 capitalize">{l.loanType} · {formatPercent(l.annualRate)} · EMI {formatINR(l.emiAmount)}</div>
                </div>
                <div className="text-right">
                  <div className="tabular font-semibold">{formatINR(l.principal)}</div>
                  <button onClick={() => setOpenId(String(l.id))} className="text-brand text-xs hover:underline mt-1">View amortization schedule</button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </DataState>
      <AIInsightCard text="Prepayment-optimization advice will be provided by the assistant in L4." />
      <AmortizationDrawer id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
