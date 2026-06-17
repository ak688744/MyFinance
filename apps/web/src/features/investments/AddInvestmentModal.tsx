import { useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { useAccounts, useCreateAccount, useCreateAsset, useImportFile } from '../../lib/hooks';
import type { Account } from '../../types';

/**
 * One unified "Add investment" flow. Step 1 picks the investment type; step 2
 * shows only the fields that type needs:
 *  - Mutual Fund  → platform + account label + holdings/transactions file import
 *  - FD/PPF/EPF/NPS (computed) → platform + label + principal/rate/start date
 *  - Gold/Real estate (manual) → label only + current value (self-held; the
 *    underlying account is stored under institution 'Personal').
 */

type TypeKey = 'mutual_fund' | 'fd' | 'ppf' | 'epf' | 'nps' | 'gold' | 'real_estate';

const TYPES: { key: TypeKey; label: string; hint: string }[] = [
  { key: 'mutual_fund', label: 'Mutual Fund', hint: 'Import holdings & transactions from your platform' },
  { key: 'fd', label: 'Fixed Deposit', hint: 'Value computed from interest to date' },
  { key: 'ppf', label: 'PPF', hint: 'Public Provident Fund — computed' },
  { key: 'epf', label: 'EPF', hint: 'Employee Provident Fund — computed' },
  { key: 'nps', label: 'NPS', hint: 'National Pension System — computed' },
  { key: 'gold', label: 'Gold', hint: 'You state the current value' },
  { key: 'real_estate', label: 'Real Estate', hint: 'You state the current value' },
];

const COMPUTED: TypeKey[] = ['fd', 'ppf', 'epf', 'nps'];
const PERSONAL_INSTITUTION = 'Personal';
const today = () => new Date().toISOString().slice(0, 10);

const fieldCls = 'w-full border rounded p-2 mt-1';

export function AddInvestmentModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [type, setType] = useState<TypeKey | null>(null);

  const handleClose = () => {
    setType(null);
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title={type ? `Add ${TYPES.find((t) => t.key === type)!.label}` : 'Add Investment'}>
      {type === null ? (
        <div className="flex flex-col gap-2">
          <div className="text-sm text-gray-500 mb-1">What would you like to add?</div>
          {TYPES.map((t) => (
            <button
              key={t.key}
              onClick={() => setType(t.key)}
              className="text-left border border-gray-200 rounded-lg px-4 py-3 hover:border-brand hover:bg-blue-50/40 transition-colors"
            >
              <div className="font-medium text-sm">{t.label}</div>
              <div className="text-xs text-gray-400">{t.hint}</div>
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <button onClick={() => setType(null)} className="text-xs text-brand hover:underline self-start">← Change type</button>
          {type === 'mutual_fund' ? (
            <MutualFundForm onDone={handleClose} />
          ) : COMPUTED.includes(type) ? (
            <ComputedForm assetClass={type} onDone={handleClose} />
          ) : (
            <ManualForm assetClass={type} onDone={handleClose} />
          )}
        </div>
      )}
    </Modal>
  );
}

/** Resolve (institution,label) → investment account id; create if absent. */
function useResolveAccount() {
  const accounts = useAccounts('investment');
  const createAccount = useCreateAccount();
  const find = (list: Account[], institution: string, label: string) =>
    list.find((a) => a.institution === institution && a.label === label);
  return async (institution: string, label: string): Promise<number> => {
    const existing = find(accounts.data ?? [], institution, label);
    if (existing) return existing.id;
    try {
      const created = await createAccount.mutateAsync({ domain: 'investment', institution, label });
      return created.id;
    } catch (e) {
      // Lost a create race (account already exists) — refetch and find it.
      const fresh = await accounts.refetch();
      const found = find(fresh.data ?? [], institution, label);
      if (found) return found.id;
      throw e;
    }
  };
}

function MutualFundForm({ onDone }: { onDone: () => void }) {
  const importFile = useImportFile();
  const [platform, setPlatform] = useState('');
  const [label, setLabel] = useState('');
  const [holdingsFile, setHoldingsFile] = useState<File | null>(null);
  const [txFile, setTxFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    if (!platform.trim() || !label.trim()) { setErr('Platform and account label are required.'); return; }
    if (!holdingsFile && !txFile) { setErr('Select at least a holdings or transactions file to import.'); return; }
    try {
      // Imports ensure the (investmentApp, accountName) account exists server-side.
      if (holdingsFile) {
        const form = new FormData();
        form.append('file', holdingsFile);
        form.append('accountName', label.trim());
        form.append('investmentApp', platform.trim());
        form.append('platform', platform.trim().toLowerCase());
        await importFile.mutateAsync({ path: '/imports/investments/holdings', form });
      }
      if (txFile) {
        const form = new FormData();
        form.append('file', txFile);
        form.append('accountName', label.trim());
        form.append('investmentApp', platform.trim());
        form.append('platform', platform.trim().toLowerCase());
        await importFile.mutateAsync({ path: '/imports/investments/transactions', form });
      }
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Import failed.');
    }
  };

  return (
    <>
      <label className="text-sm">Platform name
        <input value={platform} onChange={(e) => setPlatform(e.target.value)} className={fieldCls} placeholder="e.g., Groww, Zerodha" />
      </label>
      <label className="text-sm">Account label
        <input value={label} onChange={(e) => setLabel(e.target.value)} className={fieldCls} placeholder="e.g., Primary" />
      </label>
      <label className="text-sm">Holdings file (.xls)
        <input type="file" onChange={(e) => setHoldingsFile(e.target.files?.[0] ?? null)} className={fieldCls} />
      </label>
      <label className="text-sm">Transactions file (.xls)
        <input type="file" onChange={(e) => setTxFile(e.target.files?.[0] ?? null)} className={fieldCls} />
      </label>
      {err && <div className="text-loss text-sm">{err}</div>}
      <button onClick={submit} disabled={importFile.isPending} className="bg-brand text-white rounded-lg py-2 mt-2">
        {importFile.isPending ? 'Importing…' : 'Import mutual funds'}
      </button>
    </>
  );
}

function ComputedForm({ assetClass, onDone }: { assetClass: TypeKey; onDone: () => void }) {
  const resolveAccount = useResolveAccount();
  const createAsset = useCreateAsset();
  const [platform, setPlatform] = useState('');
  const [label, setLabel] = useState('');
  const [name, setName] = useState('');
  const [principal, setPrincipal] = useState('');
  const [rate, setRate] = useState('');
  const [startDate, setStartDate] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const busy = createAsset.isPending;

  const submit = async () => {
    setErr(null);
    if (!platform.trim() || !label.trim() || !name.trim()) { setErr('Platform, account label and name are required.'); return; }
    if (!principal || !rate || !startDate) { setErr('Principal, rate and start date are required.'); return; }
    try {
      const accountId = await resolveAccount(platform.trim(), label.trim());
      await createAsset.mutateAsync({
        accountId, assetClass, name: name.trim(),
        valuationStrategy: 'computed', ingestionMode: 'manual_entry',
        params: { principal: Number(principal) },
        contributions: [{ contributionDate: startDate, amount: Number(principal) }],
        rates: [{ effectiveFrom: startDate, rate: Number(rate) }],
      });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to create.');
    }
  };

  return (
    <>
      <div className="text-xs text-gray-500">Current value is derived from interest compounding to today.</div>
      <label className="text-sm">Platform name
        <input value={platform} onChange={(e) => setPlatform(e.target.value)} className={fieldCls} placeholder="e.g., SBI, Post Office" />
      </label>
      <label className="text-sm">Account label
        <input value={label} onChange={(e) => setLabel(e.target.value)} className={fieldCls} placeholder="e.g., Primary" />
      </label>
      <label className="text-sm">Name
        <input value={name} onChange={(e) => setName(e.target.value)} className={fieldCls} placeholder="e.g., SBI Tax Saver FD" />
      </label>
      <label className="text-sm">Principal
        <input value={principal} onChange={(e) => setPrincipal(e.target.value)} type="number" className={fieldCls} />
      </label>
      <label className="text-sm">Annual rate %
        <input value={rate} onChange={(e) => setRate(e.target.value)} type="number" className={fieldCls} />
      </label>
      <label className="text-sm">Start date
        <input value={startDate} onChange={(e) => setStartDate(e.target.value)} type="date" className={fieldCls} />
      </label>
      {err && <div className="text-loss text-sm">{err}</div>}
      <button onClick={submit} disabled={busy} className="bg-brand text-white rounded-lg py-2 mt-2">
        {busy ? 'Saving…' : 'Add investment'}
      </button>
    </>
  );
}

function ManualForm({ assetClass, onDone }: { assetClass: TypeKey; onDone: () => void }) {
  const resolveAccount = useResolveAccount();
  const createAsset = useCreateAsset();
  const [label, setLabel] = useState('');
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [valuedAt, setValuedAt] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const busy = createAsset.isPending;

  const submit = async () => {
    setErr(null);
    if (!label.trim() || !name.trim()) { setErr('Account label and name are required.'); return; }
    if (!value) { setErr('Current value is required.'); return; }
    try {
      const accountId = await resolveAccount(PERSONAL_INSTITUTION, label.trim());
      await createAsset.mutateAsync({
        accountId, assetClass, name: name.trim(),
        valuationStrategy: 'manual', ingestionMode: 'manual_entry',
        valuation: { value: Number(value), valuedAt: valuedAt || today() },
      });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to create.');
    }
  };

  return (
    <>
      <div className="text-xs text-gray-500">Self-held — you state the current value.</div>
      <label className="text-sm">Account label
        <input value={label} onChange={(e) => setLabel(e.target.value)} className={fieldCls} placeholder={assetClass === 'gold' ? 'e.g., Locker, SafeGold' : 'e.g., Apartment, Plot'} />
      </label>
      <label className="text-sm">Name
        <input value={name} onChange={(e) => setName(e.target.value)} className={fieldCls} placeholder={assetClass === 'gold' ? 'e.g., Sovereign Gold' : 'e.g., Flat in Pune'} />
      </label>
      <label className="text-sm">Current value
        <input value={value} onChange={(e) => setValue(e.target.value)} type="number" className={fieldCls} />
      </label>
      <label className="text-sm">Valued on
        <input value={valuedAt} onChange={(e) => setValuedAt(e.target.value)} type="date" className={fieldCls} />
      </label>
      {err && <div className="text-loss text-sm">{err}</div>}
      <button onClick={submit} disabled={busy} className="bg-brand text-white rounded-lg py-2 mt-2">
        {busy ? 'Saving…' : 'Add investment'}
      </button>
    </>
  );
}
