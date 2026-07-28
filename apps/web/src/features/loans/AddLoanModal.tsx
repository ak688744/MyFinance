import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { useCreateLiability } from '../../lib/hooks';
import { formatINR } from '../../lib/format';
import { computeEmi } from '../../lib/loans';

const emptyForm = () => ({
  name: '',
  loanType: 'personal' as 'home' | 'car' | 'personal' | 'other',
  principal: '',
  annualRate: '',
  startDate: '',
  tenureMonths: '',
  outstandingBalance: '',
  emiAmount: '',
});

export function AddLoanModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createLiability = useCreateLiability();
  const [form, setForm] = useState(emptyForm);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setForm(emptyForm());
      setErr(null);
    }
  }, [open]);

  const principalNum = Number(form.principal);
  const remainingNum = form.outstandingBalance.trim()
    ? Number(form.outstandingBalance)
    : principalNum;
  const repaidPreview = Number.isFinite(principalNum) && Number.isFinite(remainingNum)
    ? Math.max(0, principalNum - remainingNum)
    : null;

  const formulaEmi = useMemo(() => {
    const p = Number(form.principal);
    const r = Number(form.annualRate);
    const t = Number(form.tenureMonths);
    if (!Number.isFinite(p) || !Number.isFinite(r) || !Number.isFinite(t) || t <= 0 || p <= 0) {
      return null;
    }
    return computeEmi(p, r, t);
  }, [form.principal, form.annualRate, form.tenureMonths]);

  const submit = async () => {
    setErr(null);
    const { name, loanType, principal, annualRate, startDate, tenureMonths, outstandingBalance, emiAmount } = form;
    if (!name || !principal || !annualRate || !startDate || !tenureMonths) {
      setErr('Name, principal, rate, start date, and tenure are required.');
      return;
    }
    const p = Number(principal);
    const remaining = outstandingBalance.trim() ? Number(outstandingBalance) : null;
    if (!Number.isFinite(p) || p <= 0) {
      setErr('Principal must be a positive number.');
      return;
    }
    if (remaining != null && (!Number.isFinite(remaining) || remaining < 0 || remaining > p)) {
      setErr('Remaining balance must be between 0 and the original loan amount.');
      return;
    }
    const emi = emiAmount.trim() ? Number(emiAmount) : null;
    if (emi != null && (!Number.isFinite(emi) || emi <= 0)) {
      setErr('Monthly EMI must be a positive number.');
      return;
    }
    const body = {
      name,
      loanType,
      principal: p,
      annualRate: Number(annualRate),
      startDate,
      tenureMonths: Number(tenureMonths),
      ...(remaining != null ? { outstandingBalance: remaining } : {}),
      ...(emi != null ? { emiAmount: emi } : {}),
    };
    try {
      await createLiability.mutateAsync(body);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to create loan.');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Loan">
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-xs text-ink-subtle">
          Enter the original loan terms. If you have already repaid part of the loan, set the current remaining balance below.
        </p>

        <label className="flex flex-col gap-1">
          <span className="text-ink-muted">Name</span>
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="input-field"
            placeholder="e.g., Home loan, Car loan"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-ink-muted">Loan type</span>
          <select
            value={form.loanType}
            onChange={(e) => setForm((f) => ({ ...f, loanType: e.target.value as typeof form.loanType }))}
            className="input-field"
          >
            <option value="home">Home</option>
            <option value="car">Car</option>
            <option value="personal">Personal</option>
            <option value="other">Other</option>
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-ink-muted">Original loan amount (₹)</span>
          <input
            value={form.principal}
            onChange={(e) => setForm((f) => ({ ...f, principal: e.target.value }))}
            type="number"
            min={0}
            step="0.01"
            className="input-field"
            placeholder="e.g., 1000000"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-ink-muted">Remaining balance (₹)</span>
          <input
            value={form.outstandingBalance}
            onChange={(e) => setForm((f) => ({ ...f, outstandingBalance: e.target.value }))}
            type="number"
            min={0}
            step="0.01"
            className="input-field"
            placeholder={form.principal ? `Defaults to ${form.principal}` : 'Leave blank if nothing repaid yet'}
          />
          <span className="text-xs text-ink-subtle">
            Set after prepayments or partial repayments. Leave blank to assume full principal is still outstanding.
          </span>
        </label>

        {repaidPreview != null && repaidPreview > 0 && (
          <div className="rounded-lg bg-canvas border border-border p-3 text-xs text-ink-muted">
            Amount repaid so far: <span className="font-semibold text-gain tabular">{formatINR(repaidPreview)}</span>
          </div>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-ink-muted">Interest rate (% p.a.)</span>
          <input
            value={form.annualRate}
            onChange={(e) => setForm((f) => ({ ...f, annualRate: e.target.value }))}
            type="number"
            min={0}
            step="0.01"
            className="input-field"
            placeholder="e.g., 8.5"
          />
          <span className="text-xs text-ink-subtle">You can update this later if your lender changes the rate.</span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-ink-muted">Start date</span>
          <input
            value={form.startDate}
            onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
            type="date"
            className="input-field"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-ink-muted">Tenure (months)</span>
          <input
            value={form.tenureMonths}
            onChange={(e) => setForm((f) => ({ ...f, tenureMonths: e.target.value }))}
            type="number"
            min={1}
            className="input-field"
            placeholder="e.g., 240 for 20 years"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-ink-muted">Monthly EMI (₹)</span>
          <input
            value={form.emiAmount}
            onChange={(e) => setForm((f) => ({ ...f, emiAmount: e.target.value }))}
            type="number"
            min={0}
            step="0.01"
            className="input-field"
            placeholder={formulaEmi != null ? `Formula: ${formatINR(formulaEmi)}` : 'Optional — override computed EMI'}
          />
          <span className="text-xs text-ink-subtle">
            {formulaEmi != null
              ? `Computed from principal/rate/tenure is ${formatINR(formulaEmi)}. Enter your actual EMI if you pay more (e.g. voluntary prepayment each month).`
              : 'Optional. Leave blank to use the standard EMI formula from principal, rate, and tenure.'}
          </span>
        </label>

        {err && <div className="text-loss text-xs">{err}</div>}
        <button
          type="button"
          onClick={() => void submit()}
          disabled={createLiability.isPending}
          className="btn-primary mt-1"
        >
          {createLiability.isPending ? 'Saving…' : 'Add loan'}
        </button>
      </div>
    </Modal>
  );
}
