// packages/api/src/routes/imports.ts
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  importTransactions,
  buildCasImport,
  CasImportError,
  CasParseError,
  CasServiceError,
  importCas,
  fetchAmfiNavList,
  parseAmfiNavList,
  buildIsinIndex,
  type ParsedTransaction,
  type SchemeRepo,
} from '@myfinance/core';
import { makeRunInTransaction } from '../plugins/txRunner';
import { readMultipart, type ParsedMultipart } from '../lib/multipart';
import { resolveParser } from '../import/registry';
import { extractPdfLines, PdfPasswordRequiredError, PdfPasswordIncorrectError } from '../lib/pdfText';
import { makePanHasher } from '../lib/panHash';

export type AmfiMatch = (deps: { schemeRepo: SchemeRepo }) => Promise<{
  matched: number;
  total: number;
}>;

export type IsinIndexLoader = () => Promise<Map<string, string>>;

export type ImportRoutesOpts = { amfiMatch?: AmfiMatch; isinIndexLoader?: IsinIndexLoader };

/** An empty index means the AMFI list format drifted/errored: fail rather than create null-code schemes. */
export function makeDefaultIsinIndexLoader(fetchList: () => Promise<string> = fetchAmfiNavList): IsinIndexLoader {
  return async () => {
    const idx = buildIsinIndex(parseAmfiNavList(await fetchList()));
    if (idx.size === 0) throw new Error('AMFI list returned no ISINs');
    return idx;
  };
}
const defaultIsinIndexLoader = makeDefaultIsinIndexLoader();

function badRequest(message: string): Error & { statusCode?: number } {
  const err = new Error(message) as Error & { statusCode?: number };
  err.statusCode = 400;
  return err;
}

/** Read multipart, requiring a file part; map any parser/multipart issue to 400. */
async function requireUpload(req: FastifyRequest): Promise<ParsedMultipart> {
  const mp = await readMultipart(req);
  if (!mp.file) throw badRequest('Missing file upload (field "file").');
  return mp;
}

function requireField(fields: Record<string, string>, name: string): string {
  const v = fields[name]?.trim();
  if (!v) throw badRequest(`Missing required field "${name}".`);
  return v;
}

function logImport(
  req: FastifyRequest,
  level: 'info' | 'warn' | 'error',
  event: string,
  fields: Record<string, unknown>,
): void {
  req.log[level]({ import: event, ...fields }, `import:${event}`);
}

/** CAS route only: never echo an unexpected error's text (may carry statement content). */
function maskUnexpected(req: FastifyRequest, accountName: string, e: unknown): Error {
  logImport(req, 'error', 'cas_unexpected_error', { accountName, errorType: (e as Error)?.constructor?.name });
  const err = new Error('CAS import failed') as Error & { statusCode?: number };
  err.statusCode = 500;
  return err;
}

/** Reuse an existing investment account's exact spelling when the input differs only by case/whitespace. */
function canonicalAccountName(app: FastifyInstance, name: string): string {
  const norm = (x: string) => x.trim().replace(/\s+/g, ' ').toLowerCase();
  const existing = [...new Set([
    ...app.repos.txRepo.getAccounts(),
    ...app.repos.accountRepo.list({ domain: 'investment' }).map((a) => a.label),
  ])];
  if (existing.includes(name)) return name;
  const matches = existing.filter((n) => norm(n) === norm(name));
  return matches.length === 1 ? matches[0] : name;
}

export async function importRoutes(
  app: FastifyInstance,
  opts: ImportRoutesOpts,
): Promise<void> {
  const runInTransaction = makeRunInTransaction(app.sqlite);
  const loadIsinIndex = opts.isinIndexLoader ?? defaultIsinIndexLoader;

  // POST /imports/expenses
  app.post('/imports/expenses', async (req: FastifyRequest, reply: FastifyReply) => {
    const { file, fields } = await requireUpload(req);
    const platform = fields.platform?.trim() || 'hdfc';
    const parse = resolveParser(platform, 'expense');

    let transactions: ParsedTransaction[];
    try {
      transactions = parse(file!.buffer) as ParsedTransaction[];
    } catch (e) {
      throw badRequest((e as Error).message);
    }

    const result = await importTransactions(
      {
        importHistoryRepo: app.repos.importHistoryRepo,
        ruleRepo: app.repos.categoryRuleRepo,
        txRepo: app.repos.expenseTxRepo,
        runInTransaction,
      },
      { sourceName: file!.filename, sourceType: 'xls', transactions },
    );
    return reply.send({ data: result });
  });

  // POST /imports/investments/cas  (CAMS/KFintech consolidated statement PDF)
  app.post('/imports/investments/cas', async (req, reply) => {
    const { file, fields } = await requireUpload(req);
    const accountName = canonicalAccountName(app, requireField(fields, 'accountName'));
    const password = fields.password ? fields.password : undefined; // verbatim; never logged
    const confirmPanChange = fields.confirmPanChange?.trim() === 'true';
    const confirmDroppedHistory = fields.confirmDroppedHistory?.trim() === 'true';
    const started = Date.now();

    logImport(req, 'info', 'cas_start', { accountName, fileBytes: file!.buffer.byteLength });

    let text: string;
    try {
      text = await extractPdfLines(file!.buffer, password);
    } catch (e) {
      if (e instanceof PdfPasswordRequiredError) throw badRequest('This PDF is password protected: password required.');
      if (e instanceof PdfPasswordIncorrectError) throw badRequest('Incorrect PDF password.');
      logImport(req, 'warn', 'cas_extract_failed', { accountName });
      throw badRequest('Could not read the PDF.');
    }

    let data;
    try {
      data = buildCasImport(text);
    } catch (e) {
      if (e instanceof CasParseError || e instanceof CasImportError) {
        const issues = (e as { issues?: string[] }).issues ?? [];
        logImport(req, 'warn', 'cas_rejected', { accountName, issueCount: issues.length });
        const err = badRequest(e.message) as Error & { issues?: string[] };
        err.issues = issues;
        throw err;
      }
      throw maskUnexpected(req, accountName, e);
    }

    try {
      const result = await importCas(
        {
          schemeRepo: app.repos.schemeRepo,
          txRepo: app.repos.txRepo,
          holdingsRepo: app.repos.holdingsRepo,
          importHistoryRepo: app.repos.importHistoryRepo,
          runInTransaction,
          loadIsinIndex,
          panHash: makePanHasher(),
        },
        { accountName, data, fileName: 'CAMS CAS', confirmPanChange, confirmDroppedHistory },
      );
      // Only after a successful import, so a rejected one leaves no account row.
      try {
        app.repos.accountRepo.ensureAccount({ domain: 'investment', institution: 'CAS', label: accountName });
      } catch (e) {
        // The import already committed; do not turn that into a failed request.
        logImport(req, 'error', 'cas_ensure_account_failed', { accountName, errorType: (e as Error)?.constructor?.name });
      }
      logImport(req, 'info', 'cas_success', {
        accountName,
        importedCount: result.importedCount,
        deletedCount: result.deletedCount,
        schemesCreated: result.schemesCreated.length,
        panGuard: result.panGuard,
        durationMs: Date.now() - started,
      });
      return reply.send({ data: result });
    } catch (e) {
      if (e instanceof CasServiceError) {
        logImport(req, 'warn', 'cas_service_error', { accountName, statusCode: e.statusCode });
        const err = new Error(e.message) as Error & { statusCode?: number; code?: string };
        err.statusCode = e.statusCode;
        if (e.code) err.code = e.code;
        throw err;
      }
      throw maskUnexpected(req, accountName, e);
    }
  });

  // GET /imports
  app.get('/imports', async () => {
    return { data: app.repos.importHistoryRepo.listAll() };
  });
}
