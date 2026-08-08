import type { FastifyInstance } from 'fastify';
import {
  extractMerchantKey,
  saveCategoryMemoryRule,
  recategorizeNonManualTransactions,
  resolveCategoryFromRules,
  createCategorizationInput,
} from '@myfinance/core';
import { parseCcStatement, LlmError } from '@myfinance/agents';
import { badRequest, notFound } from '../errors';
import type { Gateway } from '../plugins/gateway';
import { makeRunInTransaction } from '../plugins/txRunner';
import { readMultipart } from '../lib/multipart';
import { extractPdfText, PdfPasswordRequiredError, PdfPasswordIncorrectError } from '../lib/pdfText';
import { reconcile } from '../lib/ccSplit';

type TransactionsQuery = {
  limit?: string;
  offset?: string;
  categoryId?: string;
};

type UpdateCategoryBody = {
  categoryId: string | null;
  createRuleMerchant?: boolean;
  createRuleKeyword?: boolean;
  keyword?: string;
};

type UpdateTransactionBody = {
  amount?: number;
  note?: string | null;
};

type CreateTransactionBody = {
  transactionDate: string;
  description: string;
  amount: number;
  direction: 'debit' | 'credit';
  categoryId?: string | null;
  note?: string | null;
  accountId?: number | null;
};

/**
 * GET /transactions — paginated expense transactions.
 * Query: limit (default 50), offset (default 0), categoryId (optional).
 * Returns { data: rows }.
 */
export async function transactionRoutes(app: FastifyInstance, opts: { gateway: Gateway }): Promise<void> {
  const deps = () => ({ ruleRepo: app.repos.categoryRuleRepo, txRepo: app.repos.expenseTxRepo });
  const runInTransaction = makeRunInTransaction(app.sqlite);

  app.get<{ Querystring: TransactionsQuery }>('/transactions', async (req) => {
    const limit = req.query.limit !== undefined ? Number(req.query.limit) : 50;
    const offset = req.query.offset !== undefined ? Number(req.query.offset) : 0;
    const categoryId = req.query.categoryId;

    const rows = app.repos.expenseTxRepo.list({ limit, offset, categoryId });
    return { data: rows };
  });

  // POST /transactions — manual transaction entry
  app.post<{ Body: CreateTransactionBody }>('/transactions', async (req) => {
    const { transactionDate, description, amount, direction, categoryId, note, accountId } = req.body ?? {} as any;
    if (!transactionDate || !description || !amount || !direction) {
      throw badRequest('transactionDate, description, amount, direction are required.');
    }
    if (direction !== 'debit' && direction !== 'credit') throw badRequest('direction must be debit or credit.');
    if (typeof amount !== 'number' || amount <= 0) throw badRequest('Amount must be a positive number.');
    const id = app.repos.expenseTxRepo.insertManual({ transactionDate, description, amount, direction, categoryId, note, accountId });
    return { data: { id } };
  });

  // PATCH /transactions/:id — update amount and/or note
  app.patch<{ Params: { id: string }; Body: UpdateTransactionBody }>(
    '/transactions/:id',
    async (req) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) throw badRequest('Invalid transaction id.');
      const { amount, note } = req.body ?? {};
      if (amount !== undefined) {
        if (typeof amount !== 'number' || amount <= 0) throw badRequest('Amount must be a positive number.');
        app.repos.expenseTxRepo.updateAmount(id, amount);
      }
      if (note !== undefined) {
        app.repos.expenseTxRepo.updateNote(id, note);
      }
      return { data: { ok: true } };
    },
  );

  // DELETE /transactions/:id
  app.delete<{ Params: { id: string } }>(
    '/transactions/:id',
    async (req) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) throw badRequest('Invalid transaction id.');
      app.repos.expenseTxRepo.deleteTransaction(id);
      return { data: { ok: true } };
    },
  );

  // PATCH /transactions/:id/category
  app.patch<{ Params: { id: string }; Body: UpdateCategoryBody }>(
    '/transactions/:id/category',
    async (req) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) {
        throw new Error('Invalid transaction id.');
      }

      const { categoryId, createRuleMerchant } = req.body ?? ({} as UpdateCategoryBody);

      // Fetch the transaction to verify it exists and get its description
      const txn = app.repos.expenseTxRepo.getById(id);
      if (!txn) throw notFound('Transaction not found.');

      // Update the transaction's category
      app.repos.expenseTxRepo.updateCategory(id, categoryId, 'manual');

      // If createRuleMerchant flag is set and categoryId is not null, create a merchant rule
      if (createRuleMerchant && categoryId !== null) {
        const merchantKey = extractMerchantKey(txn.description);
        if (merchantKey) {
          saveCategoryMemoryRule(deps(), {
            ruleType: 'merchant',
            patternValue: merchantKey,
            categoryId,
            createdFromTransactionId: id,
          });
          // Recategorize non-manual transactions with the new rule
          recategorizeNonManualTransactions(deps());
        }
      }

      // If createRuleKeyword flag is set and categoryId is not null, create a keyword rule
      const { createRuleKeyword, keyword } = req.body ?? ({} as UpdateCategoryBody);
      if (createRuleKeyword && categoryId !== null) {
        const pattern = (keyword ?? '').trim();
        if (pattern.length >= 2) {
          try {
            saveCategoryMemoryRule(deps(), {
              ruleType: 'keyword',
              patternValue: pattern,
              categoryId,
              createdFromTransactionId: id,
            });
          } catch (e) {
            // Ignore unique-constraint (rule already exists); rethrow anything else.
            if (!/unique/i.test((e as Error).message)) throw e;
          }
          recategorizeNonManualTransactions(deps());
        }
      }

      return { data: { ok: true } };
    },
  );

  // PATCH /transactions/:id/tags
  app.patch<{ Params: { id: string }; Body: { tags?: string[]; mode?: 'add' | 'replace' } }>(
    '/transactions/:id/tags',
    async (req) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) throw badRequest('Invalid transaction id.');
      const { tags, mode } = req.body ?? {};
      if (!Array.isArray(tags) || (mode !== 'add' && mode !== 'replace')) {
        throw badRequest('Body must be { tags: string[], mode: "add"|"replace" }.');
      }
      if (!app.repos.expenseTxRepo.getById(id)) throw notFound('Transaction not found.');
      const incoming = tags.map((t) => ({ tag: t, source: 'user' as const }));
      if (mode === 'replace') app.repos.expenseTxRepo.setTags(id, incoming);
      else app.repos.expenseTxRepo.addTags(id, incoming);
      return { data: { tags: app.repos.expenseTxRepo.getTags(id) } };
    },
  );

  // DELETE /transactions/:id/tags/:tag
  app.delete<{ Params: { id: string; tag: string } }>(
    '/transactions/:id/tags/:tag',
    async (req) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) throw badRequest('Invalid transaction id.');
      if (!app.repos.expenseTxRepo.getById(id)) throw notFound('Transaction not found.');
      app.repos.expenseTxRepo.removeTag(id, decodeURIComponent(req.params.tag));
      return { data: { tags: app.repos.expenseTxRepo.getTags(id) } };
    },
  );

  // POST /transactions/:id/split-from-statement — upload a CC statement PDF, parse it
  // via the LLM, and create categorized child transactions under this bill. The
  // password (optional multipart field) is used only to open the PDF; never stored.
  app.post<{ Params: { id: string } }>('/transactions/:id/split-from-statement', async (req, reply) => {
    const parentId = Number(req.params.id);
    if (!Number.isInteger(parentId)) throw badRequest('Invalid transaction id.');

    if (!app.repos.expenseTxRepo.getById(parentId)) throw notFound('Transaction not found.');

    const parent = app.repos.expenseTxRepo.getFullById(parentId);
    if (!parent) throw notFound('Transaction not found.');
    const parentAmount = parent.amount;
    const parentAccountId = parent.accountId;

    if (app.repos.expenseTxRepo.listChildren(parentId).length > 0) {
      const err = new Error('This transaction is already split.') as Error & { statusCode?: number };
      err.statusCode = 409;
      throw err;
    }

    const mp = await readMultipart(req);
    if (!mp.file) throw badRequest('Missing file upload (field "file").');
    const password = mp.fields.password?.trim() || undefined;

    let text: string;
    try {
      text = await extractPdfText(mp.file.buffer, password);
    } catch (e) {
      if (e instanceof PdfPasswordRequiredError) throw badRequest('This statement is password-protected. Enter the PDF password and try again.');
      if (e instanceof PdfPasswordIncorrectError) throw badRequest("Couldn't open the PDF — the password may be incorrect.");
      throw badRequest("Couldn't read the PDF file.");
    }

    let parsed;
    try {
      parsed = await opts.gateway.runTask('cc_statement_parse', (complete) => parseCcStatement(complete, text));
    } catch (e) {
      if (e instanceof LlmError && e.kind === 'auth') {
        const err = new Error('AI provider auth failed.') as Error & { statusCode?: number };
        err.statusCode = 502;
        throw err;
      }
      if (e instanceof LlmError && e.kind === 'provider_not_configured') {
        throw badRequest('No AI model is configured for statement parsing. Set it in AI Settings.');
      }
      throw badRequest("Couldn't read line items from this statement.");
    }

    if (!parsed.lineItems.length) throw badRequest("Couldn't read line items from this statement.");

    const rules = app.repos.categoryRuleRepo.getActiveRules();
    runInTransaction(() => {
      for (const li of parsed.lineItems) {
        const direction: 'debit' | 'credit' = li.amount < 0 ? 'credit' : 'debit';
        const res = resolveCategoryFromRules(createCategorizationInput(li.merchant), rules);
        app.repos.expenseTxRepo.insertChild(parentId, {
          transactionDate: li.date,
          description: li.merchant,
          amount: Math.abs(li.amount),
          direction,
          categoryId: res.categoryId,
          categorySource: res.categorySource,
          accountId: parentAccountId,
        });
      }
    });

    const rec = reconcile(parsed.lineItems, parsed.detectedTotal, parentAmount);
    return reply.send({
      data: {
        parentId,
        parentAmount,
        detectedTotal: rec.detectedTotal,
        parsedTotal: rec.parsedTotal,
        matched: rec.matched,
        reconciledAgainst: rec.reconciledAgainst,
        carryover: rec.carryover,
        children: app.repos.expenseTxRepo.listChildren(parentId),
      },
    });
  });
}
