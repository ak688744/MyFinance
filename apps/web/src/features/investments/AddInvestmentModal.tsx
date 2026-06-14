import { useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { useAccounts, useCreateAsset } from '../../lib/hooks';

const COMPUTED_CLASSES = ['fd', 'ppf', 'epf', 'nps'];
const MANUAL_CLASSES = ['gold', 'real_estate', 'cash'];

export function AddInvestmentModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const accounts = useAccounts('investment');
  const createAsset = useCreateAsset();
  const [assetClass, setAssetClass] = useState('fd');
  const [name, setName] = useState('');
  const [accountId, setAccountId] = useState<number | ''>('');
  const [principal, setPrincipal] = useState('');
  const [rate, setRate] = useState('');
  const [startDate, setStartDate] = useState('');
  const [value, setValue] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const isComputed = COMPUTED_CLASSES.includes(assetClass);
  const valuationStrategy = isComputed ? 'computed' : 'manual';

  const submit = async () => {
    setErr(null);
    if (!name || accountId === '') { setErr('Name and account are required.'); return; }
    if (isComputed && (!principal || !rate || !startDate)) {
      setErr('Principal, rate, and start date are required for computed assets.');
      return;
    }
    if (!isComputed && !value) {
      setErr('Current value is required.');
      return;
    }
    const body: Record<string, unknown> = {
      accountId: Number(accountId), assetClass, name, valuationStrategy, ingestionMode: 'manual_entry',
    };
    if (isComputed) {
      body.params = { principal: Number(principal) };
      body.contributions = [{ contributionDate: startDate, amount: Number(principal) }];
      body.rates = [{ effectiveFrom: startDate, rate: Number(rate) }];
    } else {
      body.valuation = { value: Number(value), valuedAt: startDate || new Date().toISOString().slice(0, 10) };
    }
    try { await createAsset.mutateAsync(body); onClose(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Failed to create.'); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Investment">
      <div className="flex flex-col gap-3">
        <label className="text-sm">Asset class
          <select value={assetClass} onChange={(e) => setAssetClass(e.target.value)} className="w-full border rounded p-2 mt-1">
            {[...COMPUTED_CLASSES, ...MANUAL_CLASSES].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <div className="text-xs text-gray-500">
          {isComputed ? 'COMPUTED — current value is derived from interest to today.' : 'MANUAL — you state the current value.'}
        </div>
        <label className="text-sm">Name
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border rounded p-2 mt-1" />
        </label>
        <label className="text-sm">Account
          <select value={accountId} onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : '')} className="w-full border rounded p-2 mt-1">
            <option value="">Select…</option>
            {(accounts.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.institution} · {a.label}</option>)}
          </select>
        </label>
        {isComputed ? (
          <>
            <label className="text-sm">Principal
              <input value={principal} onChange={(e) => setPrincipal(e.target.value)} type="number" className="w-full border rounded p-2 mt-1" />
            </label>
            <label className="text-sm">Annual rate %
              <input value={rate} onChange={(e) => setRate(e.target.value)} type="number" className="w-full border rounded p-2 mt-1" />
            </label>
            <label className="text-sm">Start date
              <input value={startDate} onChange={(e) => setStartDate(e.target.value)} type="date" className="w-full border rounded p-2 mt-1" />
            </label>
          </>
        ) : (
          <>
            <label className="text-sm">Current value
              <input value={value} onChange={(e) => setValue(e.target.value)} type="number" className="w-full border rounded p-2 mt-1" />
            </label>
            <label className="text-sm">Valued on
              <input value={startDate} onChange={(e) => setStartDate(e.target.value)} type="date" className="w-full border rounded p-2 mt-1" />
            </label>
          </>
        )}
        {err && <div className="text-loss text-sm">{err}</div>}
        <button onClick={submit} disabled={createAsset.isPending} className="bg-brand text-white rounded-lg py-2 mt-2">
          {createAsset.isPending ? 'Saving…' : 'Add investment'}
        </button>
      </div>
    </Modal>
  );
}
