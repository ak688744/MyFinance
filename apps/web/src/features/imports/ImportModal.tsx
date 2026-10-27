import { useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { useImportFile } from '../../lib/hooks';
import { CasImportForm } from './CasImportForm';

type ImportKind = 'expenses' | 'cas';

export function ImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const importFile = useImportFile();
  const [kind, setKind] = useState<ImportKind>('expenses');
  const [file, setFile] = useState<File | null>(null);
  const [platform, setPlatform] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    if (!file) {
      setErr('Please select a file.');
      return;
    }
    const form = new FormData();
    form.append('file', file);
    form.append('platform', platform || 'hdfc');
    try {
      await importFile.mutateAsync({ path: '/imports/expenses', form });
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
            <option value="cas">Investments (CAMS CAS PDF)</option>
          </select>
        </label>

        {kind === 'cas' ? (
          <CasImportForm onDone={onClose} />
        ) : (
          <>
            <label className="text-sm">
              File
              <input
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="w-full border rounded p-2 mt-1"
              />
            </label>
            <label className="text-sm">
              Platform (optional)
              <input
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="w-full border rounded p-2 mt-1"
                placeholder="default: hdfc"
              />
            </label>
            {err && <div className="text-loss text-sm">{err}</div>}
            <button
              onClick={submit}
              disabled={importFile.isPending}
              className="bg-brand text-white rounded-lg py-2 mt-2"
            >
              {importFile.isPending ? 'Importing…' : 'Import file'}
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
