import type { FastifyInstance } from 'fastify';
import {
  extractMerchantKey,
  saveCategoryMemoryRule,
  recategorizeNonManualTransactions,
} from '@myfinance/core';

type TransactionsQuery = {
  limit?: string;
  offset?: string;
  categoryId?: string;
};

type UpdateCategoryBody = {
  categoryId: string | null;
  createRuleMerchant?: boolean;
};

function notFound(message: string): Error & { statusCode?: number } {
  const err = new Error(message) as Error & { statusCode?: number };
  err.statusCode = 404;
  return err;
}

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

      return { data: { ok: true } };
    },
  );
}
