const BASE = import.meta.env.VITE_API_BASE ?? '/api';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
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
    return new ApiError(res.status, body?.error?.message ?? res.statusText);
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
  method: 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()).data as T;
}

export async function apiUpload<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: 'POST', body: form });
  if (!res.ok) throw await parseError(res);
  return (await res.json()).data as T;
}
