import type { FastifyInstance } from 'fastify';
import {
  extractMerchantKey,
  saveCategoryMemoryRule,
  recategorizeNonManualTransactions,
} from '@myfinance/core';
import { badRequest, notFound } from '../errors';

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
export async function transactionRoutes(app: FastifyInstance): Promise<void> {
  const deps = () => ({ ruleRepo: app.repos.categoryRuleRepo, txRepo: app.repos.expenseTxRepo });

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
}
