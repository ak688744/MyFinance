import type { FastifyInstance } from 'fastify';

type CreateAccountBody = {
  domain?: string;
  institution?: string;
  label?: string;
  assetClass?: string | null;
};

function badRequest(message: string): Error & { statusCode?: number } {
  const err = new Error(message) as Error & { statusCode?: number };
  err.statusCode = 400;
  return err;
}

export async function accountRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { domain?: string } }>('/accounts', async (req) => {
    const domain = req.query.domain;
    if (domain !== undefined && domain !== 'investment' && domain !== 'expense') {
      throw badRequest(`Invalid domain: ${domain}. Expected 'investment' or 'expense'.`);
    }
    const data = app.repos.accountRepo.list(
      domain ? { domain: domain as 'investment' | 'expense' } : undefined,
    );
    return { data };
  });

  app.post<{ Body: CreateAccountBody }>('/accounts', async (req, reply) => {
    const { domain, institution, label, assetClass } = req.body ?? {};
    if (domain !== 'investment' && domain !== 'expense') {
      throw badRequest("Field 'domain' must be 'investment' or 'expense'.");
    }
    if (!institution || !label) {
      throw badRequest("Fields 'institution' and 'label' are required.");
    }
    const id = app.repos.accountRepo.create({
      domain,
      institution,
      label,
      assetClass: assetClass ?? null,
    });
    reply.code(201);
    return { data: { id } };
  });
}
