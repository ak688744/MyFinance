import type { FastifyInstance } from 'fastify';
import {
  createRule,
  updateRuleCategory,
  deleteRule,
  recategorizeNonManualTransactions,
  type CategoryRuleType,
} from '@myfinance/core';

function badRequest(message: string): Error & { statusCode?: number } {
  const err = new Error(message) as Error & { statusCode?: number };
  err.statusCode = 400;
  return err;
}

type RuleCreateBody = { ruleType: CategoryRuleType; patternValue: string; categoryId: string };
type RuleUpdateBody = { categoryId: string; ruleType: CategoryRuleType };

export async function categoryRoutes(app: FastifyInstance): Promise<void> {
  const deps = () => ({ ruleRepo: app.repos.categoryRuleRepo, txRepo: app.repos.expenseTxRepo });

  // GET /categories
  app.get('/categories', async () => ({ data: app.repos.categoryRepo.list() }));

  // POST /categories/rules
  app.post<{ Body: RuleCreateBody }>('/categories/rules', async (req, reply) => {
    const { ruleType, patternValue, categoryId } = req.body ?? ({} as RuleCreateBody);
    if (!ruleType || !categoryId) throw badRequest('ruleType and categoryId are required.');
    try {
      createRule(deps(), { ruleType, patternValue: patternValue ?? '', categoryId });
    } catch (e) {
      throw badRequest((e as Error).message);
    }
    return reply.status(201).send({ data: { ok: true } });
  });

  // PATCH /categories/rules/:id
  app.patch<{ Params: { id: string }; Body: RuleUpdateBody }>(
    '/categories/rules/:id',
    async (req) => {
      const ruleId = Number(req.params.id);
      if (!Number.isInteger(ruleId)) throw badRequest('Invalid rule id.');
      const { categoryId, ruleType } = req.body ?? ({} as RuleUpdateBody);
      if (!categoryId || !ruleType) throw badRequest('categoryId and ruleType are required.');
      updateRuleCategory(deps(), { ruleId, categoryId, ruleType });
      return { data: { ok: true } };
    },
  );

  // DELETE /categories/rules/:id
  app.delete<{ Params: { id: string } }>('/categories/rules/:id', async (req) => {
    const ruleId = Number(req.params.id);
    if (!Number.isInteger(ruleId)) throw badRequest('Invalid rule id.');
    deleteRule(deps(), { ruleId });
    return { data: { ok: true } };
  });

  // POST /recategorize
  app.post('/recategorize', async () => {
    recategorizeNonManualTransactions(deps());
    return { data: { ok: true } };
  });
}
