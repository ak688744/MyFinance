// packages/api/src/routes/aiSettings.ts
import type { FastifyInstance } from 'fastify';
import { AI_TASKS, isAiTask, pricingHint } from '@myfinance/agents';
import { encryptSecret } from '@myfinance/core';
import { badRequest, conflict, notFound } from '../errors';

export async function aiSettingsRoutes(app: FastifyInstance) {
  const r = () => app.repos;

  // Providers
  app.get('/ai/providers', async () =>
    ({ data: r().aiProviderRepo.list().map((p) => ({
      id: p.id, dialect: p.dialect, label: p.label, hasSecret: p.secretEnc != null,
      config: p.configJson ? JSON.parse(p.configJson) : null, createdAt: p.createdAt,
    })) }));

  app.post<{ Body: { id: string; dialect: string; label: string; apiKey?: string; config?: object } }>(
    '/ai/providers', async (req, reply) => {
      const { id, dialect, label, apiKey, config } = req.body ?? ({} as any);
      if (!id || !label || !['gemini', 'openai-compatible', 'bedrock'].includes(dialect)) throw badRequest('id, label and a valid dialect are required.');
      const secretEnc = dialect === 'bedrock' ? null : (apiKey ? encryptSecret(apiKey) : null);
      r().aiProviderRepo.create({ id, dialect: dialect as any, label, secretEnc, configJson: config ? JSON.stringify(config) : null });
      reply.code(201); return { data: { id } };
    });

  app.patch<{ Params: { id: string }; Body: { label?: string; apiKey?: string; config?: object } }>(
    '/ai/providers/:id', async (req) => {
      const p = r().aiProviderRepo.get(req.params.id); if (!p) throw notFound('Provider not found.');
      const patch: any = {};
      if (req.body?.label != null) patch.label = req.body.label;
      if (req.body?.config != null) patch.configJson = JSON.stringify(req.body.config);
      if (req.body?.apiKey != null) patch.secretEnc = req.body.apiKey ? encryptSecret(req.body.apiKey) : null;
      r().aiProviderRepo.update(req.params.id, patch);
      return { data: { ok: true } };
    });

  app.delete<{ Params: { id: string } }>('/ai/providers/:id', async (req) => {
    if (!r().aiProviderRepo.get(req.params.id)) throw notFound('Provider not found.');
    if (r().aiProviderRepo.countModels(req.params.id) > 0) throw conflict('Provider has models; delete them first.');
    r().aiProviderRepo.delete(req.params.id); return { data: { ok: true } };
  });

  // Models
  app.get<{ Querystring: { providerId?: string } }>('/ai/models', async (req) =>
    ({ data: r().aiModelRepo.list(req.query.providerId ? { providerId: req.query.providerId } : undefined) }));

  app.post<{ Body: { id: string; providerId: string; modelString: string; label: string; inputPerM: number; outputPerM: number } }>(
    '/ai/models', async (req, reply) => {
      const b = req.body ?? ({} as any);
      if (!b.id || !b.providerId || !b.modelString || !b.label) throw badRequest('id, providerId, modelString, label are required.');
      if (typeof b.inputPerM !== 'number' || typeof b.outputPerM !== 'number' || b.inputPerM < 0 || b.outputPerM < 0) throw badRequest('inputPerM and outputPerM must be numbers >= 0.');
      if (!r().aiProviderRepo.get(b.providerId)) throw badRequest('Unknown providerId.');
      r().aiModelRepo.create(b); reply.code(201); return { data: { id: b.id } };
    });

  app.patch<{ Params: { id: string }; Body: { label?: string; inputPerM?: number; outputPerM?: number } }>(
    '/ai/models/:id', async (req) => {
      if (!r().aiModelRepo.get(req.params.id)) throw notFound('Model not found.');
      r().aiModelRepo.update(req.params.id, req.body ?? {});
      return { data: { ok: true } };
    });

  app.delete<{ Params: { id: string } }>('/ai/models/:id', async (req) => {
    if (!r().aiModelRepo.get(req.params.id)) throw notFound('Model not found.');
    if (r().aiModelRepo.countRoutes(req.params.id) > 0) throw conflict('Model is assigned to a task; unassign it first.');
    r().aiModelRepo.delete(req.params.id); return { data: { ok: true } };
  });

  app.get<{ Querystring: { modelString?: string } }>('/ai/pricing-hints', async (req) =>
    ({ data: req.query.modelString ? pricingHint(req.query.modelString) : null }));

  // Tasks (registry ∪ DB routes)
  app.get('/ai/tasks', async () => {
    const routes = new Map(r().aiTaskRouteRepo.list().map((x) => [x.task, x.modelId]));
    const data = Object.entries(AI_TASKS).map(([task, meta]) => ({
      task, label: meta.label, description: meta.description,
      defaultDialect: (meta as any).defaultDialect ?? null,
      assignedModelId: routes.get(task) ?? null, configured: routes.has(task),
    }));
    return { data };
  });

  app.put<{ Params: { task: string }; Body: { modelId: string } }>('/ai/tasks/:task/route', async (req) => {
    if (!isAiTask(req.params.task)) throw badRequest(`Unknown task "${req.params.task}".`);
    const modelId = req.body?.modelId;
    if (!modelId || !r().aiModelRepo.get(modelId)) throw badRequest('Unknown modelId.');
    r().aiTaskRouteRepo.upsert(req.params.task, modelId, new Date().toISOString());
    return { data: { ok: true } };
  });

  app.delete<{ Params: { task: string } }>('/ai/tasks/:task/route', async (req) => {
    r().aiTaskRouteRepo.delete(req.params.task); return { data: { ok: true } };
  });
}
