import { useRef, useState } from 'react';
import { useImportFile, useInvestmentAccounts } from '../../lib/hooks';
import { ApiError } from '../../lib/apiClient';

type CasResult = {
  importedCount: number;
  deletedCount: number;
  schemesCreated: string[];
  replacedOtherApps?: Record<string, number>;
  panGuard?: 'checked' | 'skipped';
  panGuardReason?: 'no_key' | 'no_pan_in_statement';
};

const MAX_ISSUES = 20;
const fieldCls = 'w-full border rounded p-2 mt-1';

/** `onSuccess` fires after a successful import; `onDone` (optional) adds a Done button = user dismissed the summary.
 * CAMS/KFintech CAS PDF import. The password lives only in an uncontrolled input and is cleared after every submit. */
export function CasImportForm({ onSuccess, onDone }: { onSuccess?: () => void; onDone?: () => void }) {
  const importFile = useImportFile();
  const accounts = useInvestmentAccounts();
  const accountNames = Array.isArray(accounts.data) ? accounts.data : [];
  const pwRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [accountName, setAccountName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  // Which confirmations the user has been asked for (and so sends on 'Continue anyway').
  const [confirms, setConfirms] = useState<{ pan: boolean; dropped: boolean }>({ pan: false, dropped: false });
  const [retryHint, setRetryHint] = useState(false);
  const [result, setResult] = useState<CasResult | null>(null);

  const clearPassword = () => { if (pwRef.current) pwRef.current.value = ''; };
  const invalidateConfirm = () => {
    if (!needsConfirm) return;
    setNeedsConfirm(false);
    setConfirms({ pan: false, dropped: false });
    setErr(null);
    setIssues([]);
  };

  const submit = async (confirming: boolean) => {
    setErr(null);
    setIssues([]);
    setRetryHint(false);
    setResult(null);
    if (!file || !accountName.trim()) {
      clearPassword();
      setErr(!file ? 'Please select your CAS PDF.' : 'Account name is required.');
      return;
    }
    const form = new FormData();
    form.append('file', file);
    const pw = pwRef.current?.value ?? '';
    if (pw) form.append('password', pw);
    form.append('accountName', accountName.trim());
    if (confirming && confirms.pan) form.append('confirmPanChange', 'true');
    if (confirming && confirms.dropped) form.append('confirmDroppedHistory', 'true');
    clearPassword();
    try {
      const data = (await importFile.mutateAsync({ path: '/imports/investments/cas', form })) as CasResult;
      setNeedsConfirm(false);
      setResult(data);
      onSuccess?.();
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      setErr(e instanceof Error ? e.message : 'Import failed.');
      if (e instanceof ApiError && e.issues) setIssues(e.issues.slice(0, MAX_ISSUES));
      setNeedsConfirm(status === 409);
      if (status === 409) {
        const dropped = e instanceof ApiError && e.code === 'dropped_history';
        setConfirms((c) => (dropped ? { ...c, dropped: true } : { ...c, pan: true }));
      }
      setRetryHint(status === 502);
    } finally {
      // Don't let the password (or file) linger in TanStack's retained mutation variables.
      form.delete('password');
      form.delete('file');
      importFile.reset();
    }
  };

  return (
    <>
      <div className="text-xs text-gray-500">
        Request your CAS from CAMS for the full period (since inception) and tick “include zero-balance folios”.
      </div>
      <label className="text-sm">Statement file (PDF)
        <input type="file" accept=".pdf,application/pdf" onChange={(e) => { setFile(e.target.files?.[0] ?? null); invalidateConfirm(); }} className={fieldCls} />
      </label>
      <label className="text-sm">PDF password
        <input ref={pwRef} type="password" autoComplete="off" className={fieldCls} />
      </label>
      <label className="text-sm">Account name
        <input value={accountName} list="cas-account-names" onChange={(e) => { setAccountName(e.target.value); invalidateConfirm(); }} className={fieldCls} placeholder="e.g., Primary" />
        <datalist id="cas-account-names">
          {accountNames.map((n) => <option key={n} value={n} />)}
        </datalist>
      </label>
      {err && <div role="alert" className="text-loss text-sm">{err}</div>}
      {issues.length > 0 && (
        <ul className="list-disc pl-5 text-xs text-loss">
          {issues.map((i, idx) => <li key={idx}>{i}</li>)}
        </ul>
      )}
      {retryHint && <div className="text-xs text-gray-500">The AMFI scheme list could not be reached. Please try again in a moment.</div>}
      {result && (
        <div className="text-sm text-gain flex flex-col gap-1">
          <div>{result.importedCount} imported, {result.deletedCount} replaced, {result.schemesCreated.length} schemes created.</div>
          {Object.entries(result.replacedOtherApps ?? {}).filter(([, n]) => n > 0).map(([app, n]) => (
            <div key={app}>Replaced {n} earlier {app} rows</div>
          ))}
          {result.panGuard === 'skipped' && (
            <div className="text-xs text-gray-500">
              {result.panGuardReason === 'no_pan_in_statement'
                ? 'PAN check skipped — no PAN found in the statement'
                : 'PAN check skipped — no secret key configured'}
            </div>
          )}
        </div>
      )}
      {result && onDone && (
        <button onClick={onDone} className="bg-brand text-white rounded-lg py-2 mt-2">Done</button>
      )}
      {needsConfirm ? (
        <>
          <div className="text-xs text-gray-500">Re-enter the password to continue with this statement.</div>
          <button onClick={() => submit(true)} disabled={importFile.isPending} className="bg-brand text-white rounded-lg py-2 mt-2">
            {importFile.isPending ? 'Importing…' : 'Continue anyway'}
          </button>
        </>
      ) : (
        <button onClick={() => submit(false)} disabled={importFile.isPending} className="bg-brand text-white rounded-lg py-2 mt-2">
          {importFile.isPending ? 'Importing…' : 'Import statement'}
        </button>
      )}
    </>
  );
}
