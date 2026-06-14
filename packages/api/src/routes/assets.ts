import type { FastifyInstance } from 'fastify';
import {
  getAllAssets,
  getHoldings,
  getLatestNAV,
  getNAVForDate,
  type NavLookup,
  type AssetClass,
} from '@myfinance/core';

const ASSET_CLASSES = ['ppf', 'epf', 'nps', 'fd', 'gold', 'real_estate', 'cash'];

function httpError(message: string, statusCode: number): Error & { statusCode?: number } {
  const err = new Error(message) as Error & { statusCode?: number };
  err.statusCode = statusCode;
  return err;
}

const nav: NavLookup = {
  getNAVForDate: (code, date) => getNAVForDate(code, date),
  getLatestNAV: (code) => getLatestNAV(code),
};

type CreateAssetBody = {
  accountId?: number;
  assetClass?: string;
  name?: string;
  valuationStrategy?: 'computed' | 'manual';
  ingestionMode?: 'manual_entry' | 'file_import';
  params?: Record<string, unknown> | null;
  contributions?: { contributionDate: string; amount: number; note?: string }[];
  rates?: { effectiveFrom: string; rate: number }[];
  valuation?: { value: number; valuedAt: string; note?: string };
};

export async function assetRoutes(app: FastifyInstance): Promise<void> {
  // Build the rollup deps from app.repos; MF holdings via the untouched pipeline.
  const netWorthDeps = () => ({
    assetRepo: app.repos.assetRepo,
    contributionRepo: app.repos.assetContributionRepo,
    rateRepo: app.repos.assetRateRepo,
    valuationRepo: app.repos.assetValuationRepo,
    liabilityRepo: app.repos.liabilityRepo,
    getMfHoldings: (filters: { account?: string }) =>
      getHoldings({ txRepo: app.repos.txRepo, nav }, filters),
  });

  app.get<{ Querystring: { account?: string; assetClass?: string } }>(
    '/assets',
    async (req) => {
      const filters = req.query.account ? { account: Number(req.query.account) } : {};
      const all = await getAllAssets(netWorthDeps(), filters);
      const data = req.query.assetClass
        ? all.filter((a) => a.assetClass === req.query.assetClass)
        : all;
      return { data };
    },
  );

  app.post<{ Body: CreateAssetBody }>('/assets', async (req, reply) => {
    const b = req.body ?? {};
    if (typeof b.accountId !== 'number') throw httpError("Field 'accountId' is required.", 400);
    if (!b.assetClass || !ASSET_CLASSES.includes(b.assetClass)) {
      throw httpError(`Invalid assetClass. Expected one of ${ASSET_CLASSES.join(', ')}.`, 400);
    }
    if (!b.name) throw httpError("Field 'name' is required.", 400);
    if (b.valuationStrategy !== 'computed' && b.valuationStrategy !== 'manual') {
      throw httpError("Field 'valuationStrategy' must be 'computed' or 'manual'.", 400);
    }

    const id = app.repos.assetRepo.create({
      accountId: b.accountId,
      assetClass: b.assetClass as AssetClass,
      name: b.name,
      valuationStrategy: b.valuationStrategy,
      ingestionMode: b.ingestionMode ?? 'manual_entry',
      params: b.params ?? null,
    });

    for (const c of b.contributions ?? []) {
      app.repos.assetContributionRepo.insert({ assetId: id, ...c });
    }
    for (const r of b.rates ?? []) {
      app.repos.assetRateRepo.insert({ assetId: id, ...r });
    }
    if (b.valuation) {
      app.repos.assetValuationRepo.insert({ assetId: id, ...b.valuation });
    }

    reply.code(201);
    return { data: { id } };
  });

  app.post<{ Params: { id: string }; Body: { contributionDate: string; amount: number; note?: string } }>(
    '/assets/:id/contributions',
    async (req, reply) => {
      const assetId = Number(req.params.id);
      if (!app.repos.assetRepo.getById(assetId)) throw httpError(`Asset ${assetId} not found.`, 404);
      const b = req.body ?? ({} as any);
      if (!b.contributionDate || typeof b.amount !== 'number') {
        throw httpError("Fields 'contributionDate' and 'amount' are required.", 400);
      }
      const cid = app.repos.assetContributionRepo.insert({ assetId, contributionDate: b.contributionDate, amount: b.amount, note: b.note });
      reply.code(201);
      return { data: { id: cid } };
    },
  );

  app.post<{ Params: { id: string }; Body: { value: number; valuedAt: string; note?: string } }>(
    '/assets/:id/valuations',
    async (req, reply) => {
      const assetId = Number(req.params.id);
      if (!app.repos.assetRepo.getById(assetId)) throw httpError(`Asset ${assetId} not found.`, 404);
      const b = req.body ?? ({} as any);
      if (typeof b.value !== 'number' || !b.valuedAt) {
        throw httpError("Fields 'value' and 'valuedAt' are required.", 400);
      }
      const vid = app.repos.assetValuationRepo.insert({ assetId, value: b.value, valuedAt: b.valuedAt, note: b.note });
      reply.code(201);
      return { data: { id: vid } };
    },
  );

  app.post<{ Params: { id: string }; Body: { effectiveFrom: string; rate: number } }>(
    '/assets/:id/rates',
    async (req, reply) => {
      const assetId = Number(req.params.id);
      if (!app.repos.assetRepo.getById(assetId)) throw httpError(`Asset ${assetId} not found.`, 404);
      const b = req.body ?? ({} as any);
      if (!b.effectiveFrom || typeof b.rate !== 'number') {
        throw httpError("Fields 'effectiveFrom' and 'rate' are required.", 400);
      }
      const rid = app.repos.assetRateRepo.insert({ assetId, effectiveFrom: b.effectiveFrom, rate: b.rate });
      reply.code(201);
      return { data: { id: rid } };
    },
  );

  app.patch<{ Params: { id: string }; Body: { name?: string; status?: 'active' | 'closed'; params?: Record<string, unknown> | null } }>(
    '/assets/:id',
    async (req) => {
      const id = Number(req.params.id);
      if (!app.repos.assetRepo.getById(id)) throw httpError(`Asset ${id} not found.`, 404);
      const b = req.body ?? {};
      app.repos.assetRepo.update(id, {
        ...(b.name !== undefined ? { name: b.name } : {}),
        ...(b.status !== undefined ? { status: b.status } : {}),
        ...(b.params !== undefined ? { params: b.params } : {}),
      });
      return { data: { id } };
    },
  );

  app.delete<{ Params: { id: string } }>('/assets/:id', async (req) => {
    const id = Number(req.params.id);
    if (!app.repos.assetRepo.getById(id)) throw httpError(`Asset ${id} not found.`, 404);
    app.repos.assetRepo.delete(id);
    return { data: { id } };
  });
}
