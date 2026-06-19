import { useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { useImportFile } from '../../lib/hooks';

type ImportKind = 'expenses' | 'investments/holdings' | 'investments/transactions';

export function ImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const importFile = useImportFile();
  const [kind, setKind] = useState<ImportKind>('expenses');
  const [file, setFile] = useState<File | null>(null);
  const [platform, setPlatform] = useState('');
  const [accountName, setAccountName] = useState('');
  const [investmentApp, setInvestmentApp] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const isInvestment = kind.startsWith('investments/');

  const submit = async () => {
    setErr(null);
    if (!file) {
      setErr('Please select a file.');
      return;
    }
    if (isInvestment && (!accountName || !investmentApp)) {
      setErr('Account name and investment app are required for investment imports.');
      return;
    }

    const form = new FormData();
    form.append('file', file);

    if (isInvestment) {
      form.append('accountName', accountName);
      form.append('investmentApp', investmentApp);
      form.append('platform', platform || 'groww');
    } else {
      form.append('platform', platform || 'hdfc');
    }

    const path = kind === 'expenses' ? '/imports/expenses' : `/imports/${kind}`;

    try {
      await importFile.mutateAsync({ path, form });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Import failed.');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Import File">
      <div className="flex flex-col gap-3">
        <label className="text-sm">
          Import type
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as ImportKind)}
            className="w-full border rounded p-2 mt-1"
          >
            <option value="expenses">Expense statement</option>
            <option value="investments/holdings">Investment holdings</option>
            <option value="investments/transactions">Investment transactions</option>
          </select>
        </label>

        <label className="text-sm">
          File
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full border rounded p-2 mt-1"
          />
        </label>

        {isInvestment ? (
          <>
            <label className="text-sm">
              Account name
              <input
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                className="w-full border rounded p-2 mt-1"
                placeholder="e.g., Primary"
              />
            </label>
            <label className="text-sm">
              Investment app
              <input
                value={investmentApp}
                onChange={(e) => setInvestmentApp(e.target.value)}
                className="w-full border rounded p-2 mt-1"
                placeholder="e.g., Groww"
              />
            </label>
            <label className="text-sm">
              Platform (optional)
              <input
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="w-full border rounded p-2 mt-1"
                placeholder="default: groww"
              />
            </label>
          </>
        ) : (
          <label className="text-sm">
            Platform (optional)
            <input
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="w-full border rounded p-2 mt-1"
              placeholder="default: hdfc"
            />
          </label>
        )}

        {err && <div className="text-loss text-sm">{err}</div>}
        <button
          onClick={submit}
          disabled={importFile.isPending}
          className="bg-brand text-white rounded-lg py-2 mt-2"
        >
          {importFile.isPending ? 'Importing…' : 'Import file'}
        </button>
      </div>
    </Modal>
  );
}
