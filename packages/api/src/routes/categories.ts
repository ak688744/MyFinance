import type { FastifyInstance } from 'fastify';
import {
  createRule,
  updateRuleCategory,
  deleteRule,
  recategorizeNonManualTransactions,
  slugifyCategoryName,
  type CategoryRuleType,
} from '@myfinance/core';
import { categorizeWithAI, LlmError, type LlmProvider, type CategoryForPrompt } from '@myfinance/agents';

function badRequest(message: string): Error & { statusCode?: number } {
  const err = new Error(message) as Error & { statusCode?: number };
  err.statusCode = 400;
  return err;
}

function notFound(message: string): Error & { statusCode?: number } {
  const err = new Error(message) as Error & { statusCode?: number };
  err.statusCode = 404;
  return err;
}

function conflict(message: string): Error & { statusCode?: number } {
  const err = new Error(message) as Error & { statusCode?: number };
  err.statusCode = 409;
  return err;
}

function badGateway(message: string): Error & { statusCode?: number } {
  const err = new Error(message) as Error & { statusCode?: number };
  err.statusCode = 502;
  return err;
}

type RuleCreateBody = { ruleType: CategoryRuleType; patternValue: string; categoryId: string };
type RuleUpdateBody = { categoryId: string; ruleType: CategoryRuleType };
type CategoryCreateBody = { name: string; icon?: string | null };
type CategoryRenameBody = { name: string };

export async function categoryRoutes(
  app: FastifyInstance,
  opts: { llmProvider: LlmProvider | null },
): Promise<void> {
  const deps = () => ({ ruleRepo: app.repos.categoryRuleRepo, txRepo: app.repos.expenseTxRepo });

  const AI_SUGGEST_CAP = 200;

  // GET /categories
  app.get('/categories', async () => ({ data: app.repos.categoryRepo.list() }));

  // GET /categories/rules — must be before /categories/:id to avoid route collision
  app.get('/categories/rules', async () => ({
    data: app.repos.categoryRuleRepo.getActiveRules(),
  }));

  // POST /categories
  app.post<{ Body: CategoryCreateBody }>('/categories', async (req, reply) => {
    const { name, icon } = req.body ?? ({} as CategoryCreateBody);
    if (!name || name.trim() === '') throw badRequest('name is required.');

    const id = slugifyCategoryName(name);
    if (app.repos.categoryRepo.exists(id)) {
      throw conflict('Category already exists.');
    }

    app.repos.categoryRepo.create({ id, name, icon: icon ?? null });
    return reply.status(201).send({ data: { id } });
  });

  // PATCH /categories/:id
  app.patch<{ Params: { id: string }; Body: CategoryRenameBody }>(
    '/categories/:id',
    async (req) => {
      const { id } = req.params;
      const { name } = req.body ?? ({} as CategoryRenameBody);
      if (!name || name.trim() === '') throw badRequest('name is required.');
      if (!app.repos.categoryRepo.exists(id)) throw notFound('Category not found.');

      app.repos.categoryRepo.rename(id, name);
      return { data: { id } };
    },
  );

  // DELETE /categories/:id
  app.delete<{ Params: { id: string } }>('/categories/:id', async (req) => {
    const { id } = req.params;
    if (!app.repos.categoryRepo.exists(id)) throw notFound('Category not found.');

    app.repos.categoryRepo.delete(id);
    return { data: { ok: true } };
  });

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

  // POST /categories/ai-suggest — month-bounded, uncategorized-only AI categorization
  app.post<{ Body: { from?: string; to?: string } }>('/categories/ai-suggest', async (req) => {
    const { from, to } = req.body ?? {};
    if (!from || !to) throw badRequest('from and to are required.');
    if (!opts.llmProvider) throw badRequest('AI provider not configured. Set GEMINI_API_KEY.');

    const all = app.repos.expenseTxRepo.listUncategorizedInRange({ from, to, limit: AI_SUGGEST_CAP + 1 });
    const warnings: string[] = [];
    let candidates = all;
    if (all.length > AI_SUGGEST_CAP) {
      candidates = all.slice(0, AI_SUGGEST_CAP);
      warnings.push(`Only the first ${AI_SUGGEST_CAP} uncategorized transactions were processed; run again for the rest.`);
    }

    if (candidates.length === 0) {
      return { data: { suggestions: [], counts: { suggested: 0, skipped: 0, total: 0 }, usage: { inputTokens: 0, outputTokens: 0 }, warnings } };
    }

    const categories: CategoryForPrompt[] = app.repos.categoryRepo.list().map((c) => ({ id: c.id, name: c.name }));

    let result;
    try {
      result = await categorizeWithAI(
        candidates.map((t) => ({ id: t.id, description: t.description, amount: t.amount, direction: t.direction })),
        { provider: opts.llmProvider, categories },
      );
    } catch (e) {
      // network/rate_limit no longer throw (they degrade to skipped inside categorizeWithAI).
      // Only hard failures reach here: auth → 502, provider misconfig → 400.
      if (e instanceof LlmError && e.kind === 'auth') throw badGateway('AI provider auth failed.');
      if (e instanceof LlmError && e.kind === 'provider_not_configured') throw badRequest('AI provider not configured. Set GEMINI_API_KEY.');
      throw e;
    }

    // Apply each suggestion as ai_suggested (keyword stays transient — returned only).
    for (const s of result.suggestions) {
      app.repos.expenseTxRepo.updateCategory(s.transactionId, s.categoryId, 'ai_suggested');
    }
    if (result.skipped > 0) warnings.push(`AI could not categorize ${result.skipped} transaction(s) — try again.`);

    return {
      data: {
        suggestions: result.suggestions,
        counts: { suggested: result.suggestions.length, skipped: result.skipped, total: candidates.length },
        usage: result.usage,
        warnings,
      },
    };
  });

  // POST /recategorize
  app.post('/recategorize', async () => {
    recategorizeNonManualTransactions(deps());
    return { data: { ok: true } };
  });
}
