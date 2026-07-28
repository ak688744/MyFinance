import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { useUpdateLiability } from '../../lib/hooks';
import { formatINR } from '../../lib/format';
import { computeEmi } from '../../lib/loans';
import type { LiabilityListItem } from '../../types';

type Props = {
  loan: LiabilityListItem | null;
  onClose: () => void;
};

export function EditLoanModal({ loan, onClose }: Props) {
  const update = useUpdateLiability();
  const [annualRate, setAnnualRate] = useState('');
  const [outstandingBalance, setOutstandingBalance] = useState('');
  const [emiAmount, setEmiAmount] = useState('');

  useEffect(() => {
    if (!loan) return;
    setAnnualRate(String(loan.annualRate));
    setOutstandingBalance(
      loan.outstandingBalance != null ? String(loan.outstandingBalance) : String(loan.outstanding),
    );
    setEmiAmount(loan.emiAmount != null ? String(loan.emiAmount) : '');
  }, [loan]);

  const formulaEmi = useMemo(() => {
    if (!loan?.tenureMonths) return null;
    return computeEmi(loan.principal, loan.annualRate, loan.tenureMonths);
  }, [loan]);

  if (!loan) return null;

  const loanId = loan.id;
  const loanPrincipal = loan.principal;

  async function submit() {
    const rate = Number(annualRate);
    const remaining = Number(outstandingBalance);
    const emi = emiAmount.trim() ? Number(emiAmount) : null;
    if (!Number.isFinite(rate) || rate < 0) return;
    if (!Number.isFinite(remaining) || remaining < 0 || remaining > loanPrincipal) return;
    if (emi != null && (!Number.isFinite(emi) || emi <= 0)) return;
    await update.mutateAsync({
      id: loanId,
      body: {
        annualRate: rate,
        outstandingBalance: remaining,
        emiAmount: emi,
      },
    });
    onClose();
  }

  return (
    <Modal open title={`Edit ${loan.name}`} onClose={onClose}>
      <div className="flex flex-col gap-3 text-sm">
        <div className="rounded-lg bg-canvas border border-border p-3 space-y-1">
          <div className="flex justify-between">
            <span className="text-ink-muted">Original loan amount</span>
            <span className="tabular font-semibold">₹{loan.principal.toLocaleString('en-IN')}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-muted">Amount repaid</span>
            <span className="tabular font-semibold text-gain">
              ₹{Math.max(0, loan.principal - Number(outstandingBalance || loan.outstanding)).toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-ink-muted">Remaining balance (₹)</span>
          <input
            type="number"
            min={0}
            max={loan.principal}
            step="0.01"
            className="input-field"
            value={outstandingBalance}
            onChange={(e) => setOutstandingBalance(e.target.value)}
          />
          <span className="text-xs text-ink-subtle">Set this after prepayments so outstanding reflects reality.</span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-ink-muted">Interest rate (% p.a.)</span>
          <input
            type="number"
            min={0}
            step="0.01"
            className="input-field"
            value={annualRate}
            onChange={(e) => setAnnualRate(e.target.value)}
          />
          <span className="text-xs text-ink-subtle">Update when your lender changes the rate.</span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-ink-muted">Monthly EMI (₹)</span>
          <input
            type="number"
            min={0}
            step="0.01"
            className="input-field"
            value={emiAmount}
            onChange={(e) => setEmiAmount(e.target.value)}
            placeholder={formulaEmi != null ? `Formula: ${formatINR(formulaEmi)}` : 'Enter your actual EMI'}
          />
          <span className="text-xs text-ink-subtle">
            {formulaEmi != null
              ? `Formula EMI is ${formatINR(formulaEmi)}. Clear this field to revert to the formula.`
              : 'Set your actual monthly payment if it differs from the formula.'}
          </span>
        </label>

        {update.error && (
          <div className="text-loss text-xs">
            {update.error instanceof Error ? update.error.message : 'Update failed'}
          </div>
        )}

        <button
          type="button"
          className="btn-primary mt-1"
          disabled={update.isPending}
          onClick={() => void submit()}
        >
          {update.isPending ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </Modal>
  );
}
