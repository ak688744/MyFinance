import { describe, it, expect, vi, afterEach } from 'vitest';
import { apiGet, ApiError } from './apiClient';

afterEach(() => vi.restoreAllMocks());

describe('apiGet', () => {
  it('unwraps the { data } envelope', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: { ok: 1 } }), { status: 200 })));
    expect(await apiGet('/health')).toEqual({ ok: 1 });
  });

  it('throws ApiError with parsed message on non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { message: 'bad', statusCode: 400 } }), { status: 400 })));
    await expect(apiGet('/x')).rejects.toMatchObject({ status: 400, message: 'bad' } satisfies Partial<ApiError>);
  });

  it('builds query strings from params', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 }));
    vi.stubGlobal('fetch', f);
    await apiGet('/expenses', { from: '2025-01-01', direction: 'in' });
    expect(f).toHaveBeenCalledWith(expect.stringContaining('/expenses?from=2025-01-01&direction=in'), expect.anything());
  });
});
