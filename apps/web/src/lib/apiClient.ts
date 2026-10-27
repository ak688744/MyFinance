const BASE = import.meta.env.VITE_API_BASE ?? '/api';

export class ApiError extends Error {
  status: number;
  issues?: string[];
  code?: string;
  constructor(status: number, message: string, issues?: string[], code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    if (issues) this.issues = issues;
    if (code) this.code = code;
  }
}

type Params = Record<string, string | number | undefined>;

function buildUrl(path: string, params?: Params): string {
  if (!params) return `${BASE}${path}`;
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) usp.append(k, String(v));
  const qs = usp.toString();
  return qs ? `${BASE}${path}?${qs}` : `${BASE}${path}`;
}

async function parseError(res: Response): Promise<ApiError> {
  try {
    const body = await res.json();
    const issues = Array.isArray(body?.error?.issues) ? (body.error.issues as unknown[]).map(String) : undefined;
    const code = typeof body?.error?.code === 'string' ? (body.error.code as string) : undefined;
    return new ApiError(res.status, body?.error?.message ?? res.statusText, issues, code);
  } catch {
    return new ApiError(res.status, res.statusText);
  }
}

export async function apiGet<T>(path: string, params?: Params): Promise<T> {
  const res = await fetch(buildUrl(path, params), { headers: { Accept: 'application/json' } });
  if (!res.ok) throw await parseError(res);
  return (await res.json()).data as T;
}

export async function apiSend<T>(
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  // Only declare a JSON content-type when we are actually sending a body.
  // Fastify rejects a request that advertises `application/json` but has an
  // empty body with 400 "Body cannot be empty…" — which broke body-less
  // DELETEs (categories/rules). See BUG-003.
  const hasBody = body !== undefined;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: hasBody
      ? { 'Content-Type': 'application/json', Accept: 'application/json' }
      : { Accept: 'application/json' },
    body: hasBody ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()).data as T;
}

export async function apiUpload<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: 'POST', body: form });
  if (!res.ok) {
    const err = await parseError(res);
    console.error('[MyFinance import]', path, { status: err.status });
    throw err;
  }
  return (await res.json()).data as T;
}
