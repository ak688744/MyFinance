import { useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { useCreateAccount } from '../../lib/hooks';

export function AddAccountModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createAccount = useCreateAccount();
  const [domain, setDomain] = useState<'investment' | 'expense'>('investment');
  const [institution, setInstitution] = useState('');
  const [label, setLabel] = useState('');
  const [assetClass, setAssetClass] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    if (!institution || !label) {
      setErr('Institution and label are required.');
      return;
    }
    const body: Record<string, unknown> = { domain, institution, label };
    if (domain === 'investment' && assetClass) {
      body.assetClass = assetClass;
    } else if (domain === 'investment') {
      body.assetClass = null;
    }
    try {
      await createAccount.mutateAsync(body);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to create account.');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Account">
      <div className="flex flex-col gap-3">
        <label className="text-sm">
          Domain
          <select
            value={domain}
            onChange={(e) => setDomain(e.target.value as 'investment' | 'expense')}
            className="w-full border rounded p-2 mt-1"
          >
            <option value="investment">Investment</option>
            <option value="expense">Expense</option>
          </select>
        </label>
        <label className="text-sm">
          Institution
          <input
            value={institution}
            onChange={(e) => setInstitution(e.target.value)}
            className="w-full border rounded p-2 mt-1"
            placeholder="e.g., HDFC, Groww, Zerodha"
          />
        </label>
        <label className="text-sm">
          Label
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full border rounded p-2 mt-1"
            placeholder="e.g., Primary, Secondary"
          />
        </label>
        {domain === 'investment' && (
          <label className="text-sm">
            Asset class (optional)
            <input
              value={assetClass}
              onChange={(e) => setAssetClass(e.target.value)}
              className="w-full border rounded p-2 mt-1"
              placeholder="e.g., mutual_fund, stocks"
            />
          </label>
        )}
        {err && <div className="text-loss text-sm">{err}</div>}
        <button
          onClick={submit}
          disabled={createAccount.isPending}
          className="bg-brand text-white rounded-lg py-2 mt-2"
        >
          {createAccount.isPending ? 'Saving…' : 'Add account'}
        </button>
      </div>
    </Modal>
  );
}
