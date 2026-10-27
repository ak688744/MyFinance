import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { CasImportForm } from '../src/features/imports/CasImportForm';
import { ImportModal } from '../src/features/imports/ImportModal';
import { AddInvestmentModal } from '../src/features/investments/AddInvestmentModal';

const wrap = (ui: React.ReactNode) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

const okBody = { data: { importedCount: 12, deletedCount: 3, replacedOtherApps: {}, importHistoryId: 1, schemesCreated: ['A', 'B'], panGuard: 'first' } };
const resp = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

let fetchMock: ReturnType<typeof vi.fn>;
let accountsBody: unknown = { data: [] };
let snaps: { form: FormData; entries: Record<string, FormDataEntryValue> }[] = [];
beforeEach(() => {
  fetchMock = vi.fn();
  snaps = [];
  accountsBody = { data: [] };
  // Snapshot FormData at call time: the form's password is deleted once the mutation settles.
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    // The account-name datalist query is not under test here; keep it out of fetchMock.
    if (String(url).includes('/investments/accounts')) return resp(200, accountsBody);
    const b = init?.body;
    if (b instanceof FormData) snaps.push({ form: b, entries: Object.fromEntries(b.entries()) });
    return fetchMock(url, init);
  });
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const pdf = () => new File(['%PDF'], 'cas.pdf', { type: 'application/pdf' });
function fill(password = 'secret') {
  fireEvent.change(screen.getByLabelText(/statement file/i), { target: { files: [pdf()] } });
  fireEvent.change(screen.getByLabelText(/account name/i), { target: { value: 'Primary' } });
  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: password } });
}
const importCalls = () => fetchMock.mock.calls.filter((c) => String(c[0]).includes('/imports/'));
const lastForm = () => ({ get: (k: string) => snaps.at(-1)!.entries[k] ?? null });

describe('CasImportForm', () => {
  it('renders password, account name and guidance', () => {
    wrap(<CasImportForm />);
    expect((screen.getByLabelText(/password/i) as HTMLInputElement).type).toBe('password');
    expect(screen.getByLabelText(/account name/i)).toBeTruthy();
    expect(screen.getByText(/Request your CAS from CAMS for the full period \(since inception\) and tick “include zero-balance folios”\./)).toBeTruthy();
  });

  it('posts file, password, accountName and clears the password after success', async () => {
    fetchMock.mockReturnValue(resp(200, okBody));
    const onDone = vi.fn();
    wrap(<CasImportForm onSuccess={onDone} />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: /import/i }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(importCalls()[0][0]).toContain('/imports/investments/cas');
    const form = lastForm();
    expect((form.get('file') as File).name).toBe('cas.pdf');
    expect(form.get('password')).toBe('secret');
    expect(form.get('accountName')).toBe('Primary');
    expect(form.get('confirmPanChange')).toBeNull();
    expect((screen.getByLabelText(/password/i) as HTMLInputElement).value).toBe('');
    expect(screen.getByText(/12 imported/i)).toBeTruthy();
    expect(snaps[0].form.has('password')).toBe(false);
  });

  it('renders issues from a 400 and clears the password', async () => {
    fetchMock.mockReturnValue(resp(400, { error: { message: 'Reconciliation failed', statusCode: 400, issues: ['folio 1 mismatch', 'folio 2 mismatch'] } }));
    wrap(<CasImportForm />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: /import/i }));
    await screen.findByText('folio 1 mismatch');
    expect(screen.getByText('folio 2 mismatch')).toBeTruthy();
    expect(screen.getByText(/Reconciliation failed/)).toBeTruthy();
    expect((screen.getByLabelText(/password/i) as HTMLInputElement).value).toBe('');
  });

  it('on 409 shows confirm step and resubmits with confirmPanChange=true', async () => {
    fetchMock.mockReturnValueOnce(resp(409, { error: { message: 'PAN differs', statusCode: 409 } }));
    fetchMock.mockReturnValueOnce(resp(200, okBody));
    const onDone = vi.fn();
    wrap(<CasImportForm onSuccess={onDone} />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: /import/i }));
    const confirm = await screen.findByRole('button', { name: /continue anyway/i });
    expect((screen.getByLabelText(/password/i) as HTMLInputElement).value).toBe('');
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'again' } });
    fireEvent.click(confirm);
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const form = lastForm();
    expect(form.get('confirmPanChange')).toBe('true');
    expect(form.get('password')).toBe('again');
    expect((form.get('file') as File).name).toBe('cas.pdf');
    expect(form.get('accountName')).toBe('Primary');
  });

  it('shows a retry hint on 502', async () => {
    fetchMock.mockReturnValue(resp(502, { error: { message: 'AMFI unreachable', statusCode: 502 } }));
    wrap(<CasImportForm />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: /import/i }));
    await screen.findByText(/try again/i);
  });
});

describe('ImportModal', () => {
  it('has the CAS option, no Groww options, expense still posts to /imports/expenses', async () => {
    fetchMock.mockReturnValue(resp(200, { data: {} }));
    wrap(<ImportModal open onClose={vi.fn()} />);
    expect(screen.queryByText(/Investment holdings/i)).toBeNull();
    expect(screen.queryByText(/Investment transactions/i)).toBeNull();
    expect(screen.getByRole('option', { name: /Investments \(CAMS CAS PDF\)/ })).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/file/i), { target: { files: [new File(['x'], 'a.xls')] } });
    fireEvent.click(screen.getByRole('button', { name: /import file/i }));
    await waitFor(() => expect(importCalls().length).toBeGreaterThan(0));
    expect(importCalls()[0][0]).toContain('/imports/expenses');
  });

  it('switching to CAS renders the CAS form', () => {
    wrap(<ImportModal open onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/import type/i), { target: { value: 'cas' } });
    expect(screen.getByLabelText(/password/i)).toBeTruthy();
  });
});

describe('AddInvestmentModal', () => {
  it('Mutual Fund branch renders CasImportForm without platform/holdings/transactions inputs', () => {
    fetchMock.mockReturnValue(resp(200, { data: [] }));
    wrap(<AddInvestmentModal open onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Mutual Fund'));
    expect(screen.getByLabelText(/password/i)).toBeTruthy();
    expect(screen.queryByText(/Platform name/i)).toBeNull();
    expect(screen.queryByText(/Holdings file/i)).toBeNull();
    expect(screen.queryByText(/Transactions file/i)).toBeNull();
  });

  it('manual flows still render', () => {
    fetchMock.mockReturnValue(resp(200, { data: [] }));
    wrap(<AddInvestmentModal open onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Fixed Deposit'));
    expect(screen.getByText(/Principal/)).toBeTruthy();
    cleanup();
    wrap(<AddInvestmentModal open onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Gold'));
    expect(screen.getByText(/Current value/)).toBeTruthy();
  });
});

const submitBtn = () => screen.getByRole('button', { name: /import statement/i });

describe('CasImportForm fixes', () => {
  it('I1: password is deleted from the FormData after a failed submit too', async () => {
    fetchMock.mockReturnValue(resp(400, { error: { message: 'bad', statusCode: 400 } }));
    wrap(<CasImportForm />);
    fill();
    fireEvent.click(submitBtn());
    await screen.findByText('bad');
    expect(snaps[0].entries.password).toBe('secret');
    expect(snaps[0].form.has('password')).toBe(false);
  });

  it('I2: changing account name or file after a 409 drops the confirm step', async () => {
    fetchMock.mockReturnValue(resp(409, { error: { message: 'PAN differs', statusCode: 409 } }));
    wrap(<CasImportForm />);
    fill();
    fireEvent.click(submitBtn());
    await screen.findByRole('button', { name: /continue anyway/i });
    fireEvent.change(screen.getByLabelText(/account name/i), { target: { value: 'Other' } });
    expect(screen.queryByRole('button', { name: /continue anyway/i })).toBeNull();
    expect(screen.queryByText(/PAN differs/)).toBeNull();
    fetchMock.mockReturnValue(resp(200, okBody));
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'pw' } });
    fireEvent.click(submitBtn());
    await screen.findByText(/12 imported/i);
    expect(lastForm().get('confirmPanChange')).toBeNull();
  });

  it('I2: changing the file after a 409 drops the confirm step', async () => {
    fetchMock.mockReturnValue(resp(409, { error: { message: 'PAN differs', statusCode: 409 } }));
    wrap(<CasImportForm />);
    fill();
    fireEvent.click(submitBtn());
    await screen.findByRole('button', { name: /continue anyway/i });
    fireEvent.change(screen.getByLabelText(/statement file/i), { target: { files: [pdf()] } });
    expect(screen.queryByRole('button', { name: /continue anyway/i })).toBeNull();
  });

  it('M1: validation failures clear the password and show messages', () => {
    wrap(<CasImportForm />);
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'secret' } });
    fireEvent.click(submitBtn());
    expect(screen.getByRole('alert').textContent).toMatch(/select your CAS PDF/i);
    expect((screen.getByLabelText(/password/i) as HTMLInputElement).value).toBe('');
    fireEvent.change(screen.getByLabelText(/statement file/i), { target: { files: [pdf()] } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'secret' } });
    fireEvent.click(submitBtn());
    expect(screen.getByRole('alert').textContent).toMatch(/account name is required/i);
    expect((screen.getByLabelText(/password/i) as HTMLInputElement).value).toBe('');
    expect(importCalls()).toHaveLength(0);
  });

  it('M2: a later failure does not show the earlier success', async () => {
    fetchMock.mockReturnValueOnce(resp(200, okBody));
    fetchMock.mockReturnValueOnce(resp(500, { error: { message: 'boom', statusCode: 500 } }));
    wrap(<CasImportForm />);
    fill();
    fireEvent.click(submitBtn());
    await screen.findByText(/12 imported/i);
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'x' } });
    fireEvent.click(submitBtn());
    await screen.findByText('boom');
    expect(screen.queryByText(/12 imported/i)).toBeNull();
  });

  it('M3: summary shows replaced other apps and PAN-check-skipped note', async () => {
    fetchMock.mockReturnValue(resp(200, { data: { ...okBody.data, replacedOtherApps: { Groww: 110 }, panGuard: 'skipped' } }));
    wrap(<CasImportForm />);
    fill();
    fireEvent.click(submitBtn());
    await screen.findByText(/Replaced 110 earlier Groww rows/);
    expect(screen.getByText(/PAN check skipped — no secret key configured/)).toBeTruthy();
  });

  it('caps issues at 20', async () => {
    const issues = Array.from({ length: 25 }, (_, i) => `issue-${i}`);
    fetchMock.mockReturnValue(resp(400, { error: { message: 'bad', statusCode: 400, issues } }));
    wrap(<CasImportForm />);
    fill();
    fireEvent.click(submitBtn());
    await screen.findByText('issue-0');
    expect(screen.getAllByText(/^issue-/).length).toBe(20);
  });

  it('I3: AddInvestmentModal stays open after success until Done', async () => {
    fetchMock.mockImplementation((url: string) => (String(url).includes('/imports/') ? resp(200, okBody) : resp(200, { data: [] })));
    const onClose = vi.fn();
    wrap(<AddInvestmentModal open onClose={onClose} />);
    fireEvent.click(screen.getByText('Mutual Fund'));
    fill();
    fireEvent.click(submitBtn());
    await screen.findByText(/12 imported/i);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /^done$/i }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('final review fixes', () => {
  it('M1: Done in the ImportModal closes the modal', async () => {
    fetchMock.mockReturnValue(resp(200, okBody));
    const onClose = vi.fn();
    wrap(<ImportModal open onClose={onClose} />);
    fireEvent.change(screen.getByLabelText(/import type/i), { target: { value: 'cas' } });
    fill();
    fireEvent.click(submitBtn());
    await screen.findByText(/12 imported/i);
    fireEvent.click(screen.getByRole('button', { name: /^done$/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('M2: PAN-skipped note depends on the reason', async () => {
    fetchMock.mockReturnValue(resp(200, { data: { ...okBody.data, panGuard: 'skipped', panGuardReason: 'no_pan_in_statement' } }));
    wrap(<CasImportForm />);
    fill();
    fireEvent.click(submitBtn());
    await screen.findByText(/PAN check skipped — no PAN found in the statement/);
    expect(screen.queryByText(/no secret key configured/)).toBeNull();
  });

  it('M2: no_key reason shows the secret-key note', async () => {
    fetchMock.mockReturnValue(resp(200, { data: { ...okBody.data, panGuard: 'skipped', panGuardReason: 'no_key' } }));
    wrap(<CasImportForm />);
    fill();
    fireEvent.click(submitBtn());
    await screen.findByText(/PAN check skipped — no secret key configured/);
  });

  it('M4: failed upload logs only path and status, never the server message', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockReturnValue(resp(400, { error: { message: 'Folio 1234567 INF123A01012 broke', statusCode: 400 } }));
    wrap(<CasImportForm />);
    fill();
    fireEvent.click(submitBtn());
    await screen.findByText(/Folio 1234567/); // still shown to the user
    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).not.toContain('1234567');
    expect(logged).not.toContain('INF123A01012');
    expect(logged).toContain('400');
  });

  it('I3c: account input offers existing investment account names via a datalist', async () => {
    accountsBody = { data: ['Primary', 'Joint'] };
    wrap(<CasImportForm />);
    const input = screen.getByLabelText(/account name/i) as HTMLInputElement;
    const listId = input.getAttribute('list');
    expect(listId).toBeTruthy();
    await waitFor(() => expect(document.querySelectorAll(`datalist#${listId} option`).length).toBe(2));
    expect([...document.querySelectorAll(`datalist#${listId} option`)].map((o) => o.getAttribute('value'))).toEqual(['Primary', 'Joint']);
  });

  it('I1: dropped_history 409 confirms with confirmDroppedHistory=true (not confirmPanChange)', async () => {
    fetchMock.mockReturnValueOnce(resp(409, { error: { message: '2 fully-exited fund(s) would be deleted', statusCode: 409, code: 'dropped_history' } }));
    fetchMock.mockReturnValueOnce(resp(200, okBody));
    wrap(<CasImportForm />);
    fill();
    fireEvent.click(submitBtn());
    const confirm = await screen.findByRole('button', { name: /continue anyway/i });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'again' } });
    fireEvent.click(confirm);
    await screen.findByText(/12 imported/i);
    expect(lastForm().get('confirmDroppedHistory')).toBe('true');
    expect(lastForm().get('confirmPanChange')).toBeNull();
  });

  it('I3b: pan_other_account 409 confirms with confirmPanChange=true', async () => {
    fetchMock.mockReturnValueOnce(resp(409, { error: { message: 'PAN already under another label', statusCode: 409, code: 'pan_other_account' } }));
    fetchMock.mockReturnValueOnce(resp(200, okBody));
    wrap(<CasImportForm />);
    fill();
    fireEvent.click(submitBtn());
    const confirm = await screen.findByRole('button', { name: /continue anyway/i });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'again' } });
    fireEvent.click(confirm);
    await screen.findByText(/12 imported/i);
    expect(lastForm().get('confirmPanChange')).toBe('true');
  });
});
