import { useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { useSplitFromStatement } from '../../lib/hooks';
import type { SplitResult } from '../../types';

export function SplitStatementModal({ txId, merchantLabel, open, onClose, onSplit }: {
  txId: number;
  merchantLabel: string;
  open: boolean;
  onClose: () => void;
  onSplit: (r: SplitResult) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const split = useSplitFromStatement();

  const submit = async () => {
    if (!file) { setError('Choose a statement PDF first.'); return; }
    setError(null);
    try {
      const r = await split.mutateAsync({ id: txId, file, password: password || undefined });
      onSplit(r);
      onClose();
      setFile(null);
      setPassword('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to parse the statement.');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Upload statement">
      <p className="text-sm text-gray-500 mb-3">{merchantLabel} · matched by amount &amp; narration</p>
      <label className="block border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer text-[12.5px] text-gray-500">
        <input type="file" accept="application/pdf" className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        {file ? file.name : 'Drop statement.pdf or click to browse'}
      </label>
      <input type="password" placeholder="PDF password (if protected)" value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
      {error && <p className="mt-2 text-sm text-loss">{error}</p>}
      <button onClick={submit} disabled={split.isPending}
        className="mt-4 w-full rounded-lg bg-brand text-white py-2 text-sm font-medium disabled:opacity-60">
        {split.isPending ? 'Parsing…' : 'Parse statement'}
      </button>
    </Modal>
  );
}
