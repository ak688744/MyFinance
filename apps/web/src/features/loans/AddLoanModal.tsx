import { useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { useCreateLiability } from '../../lib/hooks';

export function AddLoanModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createLiability = useCreateLiability();
  const [name, setName] = useState('');
  const [loanType, setLoanType] = useState<'home' | 'car' | 'personal' | 'other'>('personal');
  const [principal, setPrincipal] = useState('');
  const [annualRate, setAnnualRate] = useState('');
  const [startDate, setStartDate] = useState('');
  const [tenureMonths, setTenureMonths] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    if (!name || !principal || !annualRate || !startDate || !tenureMonths) {
      setErr('All fields are required.');
      return;
    }
    const body = {
      name,
      loanType,
      principal: Number(principal),
      annualRate: Number(annualRate),
      startDate,
      tenureMonths: Number(tenureMonths),
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
      <div className="flex flex-col gap-3">
        <label className="text-sm">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border rounded p-2 mt-1"
            placeholder="e.g., Home loan, Car loan"
          />
        </label>
        <label className="text-sm">
          Loan type
          <select
            value={loanType}
            onChange={(e) => setLoanType(e.target.value as 'home' | 'car' | 'personal' | 'other')}
            className="w-full border rounded p-2 mt-1"
          >
            <option value="home">Home</option>
            <option value="car">Car</option>
            <option value="personal">Personal</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className="text-sm">
          Principal
          <input
            value={principal}
            onChange={(e) => setPrincipal(e.target.value)}
            type="number"
            className="w-full border rounded p-2 mt-1"
            placeholder="e.g., 1000000"
          />
        </label>
        <label className="text-sm">
          Annual rate %
          <input
            value={annualRate}
            onChange={(e) => setAnnualRate(e.target.value)}
            type="number"
            className="w-full border rounded p-2 mt-1"
            placeholder="e.g., 8.5"
          />
        </label>
        <label className="text-sm">
          Start date
          <input
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            type="date"
            className="w-full border rounded p-2 mt-1"
          />
        </label>
        <label className="text-sm">
          Tenure (months)
          <input
            value={tenureMonths}
            onChange={(e) => setTenureMonths(e.target.value)}
            type="number"
            className="w-full border rounded p-2 mt-1"
            placeholder="e.g., 240 for 20 years"
          />
        </label>
        {err && <div className="text-loss text-sm">{err}</div>}
        <button
          onClick={submit}
          disabled={createLiability.isPending}
          className="bg-brand text-white rounded-lg py-2 mt-2"
        >
          {createLiability.isPending ? 'Saving…' : 'Add loan'}
        </button>
      </div>
    </Modal>
  );
}
