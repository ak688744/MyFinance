// packages/api/src/routes/imports.ts
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  importTransactions,
  importHoldings,
  importInvestmentTransactions,
  autoMatchAmfiCodes,
  type ParsedTransaction,
  type ParsedHoldingsData,
  type ParsedTransactionData,
  type SchemeRepo,
} from '@myfinance/core';
import { makeRunInTransaction } from '../plugins/txRunner';
import { readMultipart, type ParsedMultipart } from '../lib/multipart';
import { resolveParser } from '../import/registry';

export type AmfiMatch = (deps: { schemeRepo: SchemeRepo }) => Promise<{
  matched: number;
  total: number;
}>;

export type ImportRoutesOpts = { amfiMatch?: AmfiMatch };

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

export async function importRoutes(
  app: FastifyInstance,
  opts: ImportRoutesOpts,
): Promise<void> {
  const amfiMatch = opts.amfiMatch ?? autoMatchAmfiCodes;
  const runInTransaction = makeRunInTransaction(app.sqlite);

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

  // POST /imports/investments/holdings
  app.post('/imports/investments/holdings', async (req, reply) => {
    const { file, fields } = await requireUpload(req);
    const accountName = requireField(fields, 'accountName');
    const investmentApp = requireField(fields, 'investmentApp');
    // Non-financial sync: ensure an investment account exists for this
    // (investmentApp, accountName). Does NOT touch XIRR/portfolio math.
    app.repos.accountRepo.ensureAccount({
      domain: 'investment',
      institution: investmentApp,
      label: accountName,
    });
    const platform = fields.platform?.trim() || 'groww';
    const parse = resolveParser(platform, 'holdings');

    let parsedData: ParsedHoldingsData;
    try {
      parsedData = parse(file!.buffer, file!.filename) as ParsedHoldingsData;
    } catch (e) {
      throw badRequest((e as Error).message);
    }

    const result = await importHoldings(
      {
        schemeRepo: app.repos.schemeRepo,
        holdingsRepo: app.repos.holdingsRepo,
        importHistoryRepo: app.repos.importHistoryRepo,
        runInTransaction,
        amfiMatch,
      },
      { accountName, investmentApp, parsedData, fileName: file!.filename },
    );
    return reply.send({ data: result });
  });

  // POST /imports/investments/transactions
  app.post('/imports/investments/transactions', async (req, reply) => {
    const { file, fields } = await requireUpload(req);
    const accountName = requireField(fields, 'accountName');
    const investmentApp = requireField(fields, 'investmentApp');
    // Non-financial sync: ensure an investment account exists for this
    // (investmentApp, accountName). Does NOT touch XIRR/portfolio math.
    app.repos.accountRepo.ensureAccount({
      domain: 'investment',
      institution: investmentApp,
      label: accountName,
    });
    const platform = fields.platform?.trim() || 'groww';
    const parse = resolveParser(platform, 'transactions');

    let parsedData: ParsedTransactionData;
    try {
      parsedData = parse(file!.buffer) as ParsedTransactionData;
    } catch (e) {
      throw badRequest((e as Error).message);
    }

    const result = await importInvestmentTransactions(
      {
        schemeRepo: app.repos.schemeRepo,
        txRepo: app.repos.txRepo,
        importHistoryRepo: app.repos.importHistoryRepo,
        runInTransaction,
      },
      { accountName, investmentApp, parsedData, fileName: file!.filename },
    );
    return reply.send({ data: result }); // success | unmatched_schemes, both 200 (D2)
  });

  // GET /imports
  app.get('/imports', async () => {
    return { data: app.repos.importHistoryRepo.listAll() };
  });
}
