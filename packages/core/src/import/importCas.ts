// CAS import orchestrator (spec D4-D7). Order: PAN guard -> resolve every ISIN
// to a scheme id (outside the DB transaction) -> one transaction that replaces
// the account's rows up to periodEnd (all apps) and inserts the CAS rows.
import type { HoldingsRepo, ImportHistoryRepo, InvestmentTxRepo, SchemeRepo } from '../repositories/types';
import type { ParsedCasImport } from './casReconcile';

export type ImportCasDeps = {
  schemeRepo: SchemeRepo;
  txRepo: InvestmentTxRepo;
  holdingsRepo: HoldingsRepo;
  importHistoryRepo: ImportHistoryRepo;
  runInTransaction: <T>(fn: () => T) => T;
  loadIsinIndex: () => Promise<Map<string, string>>;
  panHash: ((pan: string) => string) | null;
};

export type ImportCasResult = {
  importedCount: number;
  deletedCount: number;
  deletedHoldings: number;
  replacedOtherApps: Record<string, number>;
  importHistoryId: number;
  schemesCreated: string[];
  panGuard: 'checked' | 'skipped';
  panGuardReason?: 'no_key' | 'no_pan_in_statement';
};

export class CasServiceError extends Error {
  statusCode: number;
  code?: string;
  constructor(statusCode: number, message: string, code?: string) {
    super(message);
    this.name = 'CasServiceError';
    this.statusCode = statusCode;
    if (code) this.code = code;
  }
}

const RE_DEBT = /ultra short|liquid|overnight|money market|bond|gilt|debt|duration|credit risk|floater|corporate|banking\s*&?\s*psu|low duration|short term|medium term/i;
const RE_HYBRID = /arbitrage|hybrid|balanced|multi.?asset|equity savings|dynamic asset|aggressive|conservative|equity\s*&\s*debt/i;
const RE_EQUITY = /elss|tax saver|flexi|multi.?cap|large|mid|small|focused|value|contra|bluechip|blue chip|index|nifty|sensex|equity|dividend yield/i;

export function inferCategory(title: string): 'equity' | 'debt' | 'hybrid' | null {
  // Hybrid first: 'Equity & Debt Fund' contains a debt keyword but is hybrid.
  if (RE_HYBRID.test(title)) return 'hybrid';
  if (RE_DEBT.test(title)) return 'debt';
  if (RE_EQUITY.test(title)) return 'equity';
  return null;
}

/**
 * Cleans a raw CAS folio title for use as a scheme name: drops parenthetical
 * groups, then a leading AMC product-code segment (contains a digit, or is a
 * single all-caps 3-10 letter token) when other segments follow.
 */
export function cleanSchemeTitle(title: string): string {
  let t = title;
  let prev: string;
  do { prev = t; t = t.replace(/\([^()]*\)/g, ' '); } while (t !== prev);
  t = t.replace(/\s+/g, ' ').trim().replace(/(?:\s-){2,}(?=\s|$)/g, ' -');
  const parts = t.split(' - ').map((x) => x.trim()).filter((x) => x !== '' && x !== '-');
  if (parts.length > 1 && (/^(?=.*\d)[A-Za-z0-9 ]{1,15}$/.test(parts[0]) || /^[A-Z]{3,10}$/.test(parts[0]))) parts.shift();
  return parts.join(' - ').replace(/\s*-\s*$/, '').trim();
}

const APP = 'CAS';

export async function importCas(
  deps: ImportCasDeps,
  params: { accountName: string; data: ParsedCasImport; fileName?: string; confirmPanChange?: boolean; confirmDroppedHistory?: boolean },
): Promise<ImportCasResult> {
  const { schemeRepo, txRepo, holdingsRepo, importHistoryRepo, runInTransaction } = deps;
  const { accountName, data, fileName } = params;

  // An empty statement would only delete: refuse before any write.
  if (data.transactions.length === 0) {
    throw new CasServiceError(400, 'The statement has no transactions to import');
  }

  // 1. PAN guard (D7): only a keyed hash is ever compared/stored.
  let holderPan: string | undefined;
  let panGuard: 'checked' | 'skipped' = 'skipped';
  let panGuardReason: 'no_key' | 'no_pan_in_statement' | undefined = deps.panHash ? undefined : 'no_key';
  if (deps.panHash) {
    const prev = importHistoryRepo.latestCasPanHash(accountName);
    if (data.holderPan) {
      holderPan = deps.panHash(data.holderPan);
      if (prev && prev !== holderPan && !params.confirmPanChange) {
        throw new CasServiceError(409, 'PAN differs from the previous CAS for this account — confirm to continue');
      }
      const others = importHistoryRepo.accountsWithPanHash(holderPan).filter((a) => a !== accountName);
      if (others.length > 0 && !params.confirmPanChange) {
        throw new CasServiceError(409, "This statement's PAN was already imported under another account label — confirm to continue.", 'pan_other_account');
      }
      panGuard = 'checked';
    } else if (prev && !params.confirmPanChange) {
      // No PAN to verify against a known holder: require explicit confirmation.
      // On confirm nothing is stored, so the latest non-null hash stays the baseline.
      throw new CasServiceError(409, 'No PAN found in the statement — confirm to continue');
    } else {
      panGuardReason = 'no_pan_in_statement';
    }
  }

  // 1b. Dropped-history guard (I1): fully-exited funds already stored for this account
  // (rows about to be deleted) that the statement does not carry would silently vanish.
  if (!params.confirmDroppedHistory) {
    let k = 0;
    for (const units of txRepo.getUnitsPerSchemeUpTo(data.periodEnd, { account: accountName }).values()) {
      if (Math.abs(units) < 0.001) k += 1;
    }
    if (k > data.exitedIsinCount) {
      const missing = k - data.exitedIsinCount;
      throw new CasServiceError(
        409,
        `${missing} fully-exited fund(s) in your existing data are not in this statement; their history would be deleted. Request the CAS with “include zero-balance folios”, or confirm to continue.`,
        'dropped_history',
      );
    }
  }

  // 2. Resolve every distinct ISIN before any write (D4).
  const titleByIsin = new Map<string, string>();
  for (const t of data.transactions) if (!titleByIsin.has(t.isin)) titleByIsin.set(t.isin, cleanSchemeTitle(t.schemeTitle));

  const schemeIdByIsin = new Map<string, number>();
  const unresolved: string[] = [];
  for (const isin of titleByIsin.keys()) {
    const s = schemeRepo.findByIsin(isin);
    if (s) schemeIdByIsin.set(isin, s.id);
    else unresolved.push(isin);
  }

  let index: Map<string, string> | null = null;
  if (unresolved.length > 0) {
    try {
      index = await deps.loadIsinIndex();
    } catch {
      throw new CasServiceError(502, 'AMFI list unreachable — retry the import');
    }
  }

  const schemesCreated: string[] = [];
  for (const isin of unresolved) {
    const title = titleByIsin.get(isin)!;
    const code = index!.get(isin) ?? null;
    let id: number | null = null;
    let nameTaken = false;

    if (code) {
      const byCode = schemeRepo.getByAmfiCode(code);
      if (byCode) {
        // Same fund, possibly another share-class ISIN: never overwrite a stored ISIN.
        if (byCode.isin == null) schemeRepo.setIsin(byCode.id, isin);
        id = byCode.id;
      }
    }
    if (id === null) {
      const byName = schemeRepo.findSchemeByName(title);
      // Reuse by name only when it cannot belong to a different ISIN.
      if (byName && (byName.isin == null || byName.isin === isin)
          && (byName.amfiCode == null || !code || byName.amfiCode === code)) {
        if (byName.isin == null) schemeRepo.setIsin(byName.id, isin);
        if (byName.amfiCode == null && code) schemeRepo.updateAmfiCode(byName.id, code);
        id = byName.id;
      }
      nameTaken = byName !== null && id === null;
    }
    if (id === null) {
      // createScheme dedupes on (scheme_name, amc_name); disambiguate when the name
      // is held by a scheme with a different ISIN so it is not merged.
      id = schemeRepo.createScheme({
        schemeName: nameTaken ? `${title} (${isin})` : title,
        isin,
        amfiCode: code ?? undefined,
        category: inferCategory(title) ?? undefined,
      });
      schemesCreated.push(title);
    }
    schemeIdByIsin.set(isin, id);
  }

  // One scheme, one name: transactions carry the resolved scheme's stored name.
  const nameByIsin = new Map<string, string>();
  for (const [isin, id] of schemeIdByIsin) nameByIsin.set(isin, schemeRepo.getSchemeById(id)!.schemeName);

  // 3. All writes in one transaction.
  const res = runInTransaction(() => {
    const del = txRepo.deleteByAccountUpToDate(accountName, data.periodEnd);
    // The CAS history supersedes any holdings snapshot (else holdings double up).
    const deletedHoldings = holdingsRepo.deleteByAccount(accountName);
    const importHistoryId = importHistoryRepo.createInvestmentImport({
      accountName,
      investmentApp: APP,
      importType: 'transactions',
      fileName,
      startDate: data.periodStart,
      endDate: data.periodEnd,
      recordCount: data.transactions.length,
      holderPan,
    });
    for (const t of data.transactions) {
      txRepo.insert({
        schemeId: schemeIdByIsin.get(t.isin)!,
        schemeName: nameByIsin.get(t.isin)!,
        accountName,
        investmentApp: APP,
        transactionType: t.transactionType,
        units: t.units,
        nav: t.nav,
        amount: t.amount,
        transactionDate: t.transactionDate,
      });
    }
    return { del, deletedHoldings, importHistoryId };
  });

  const { [APP]: _own, ...replacedOtherApps } = res.del.byApp;
  return {
    importedCount: data.transactions.length,
    deletedCount: res.del.deleted,
    deletedHoldings: res.deletedHoldings,
    replacedOtherApps,
    importHistoryId: res.importHistoryId,
    schemesCreated: schemesCreated.sort((a, b) => a.localeCompare(b)),
    panGuard,
    ...(panGuardReason ? { panGuardReason } : {}),
  };
}
