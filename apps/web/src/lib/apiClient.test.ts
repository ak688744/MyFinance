import { describe, it, expect, vi, afterEach } from 'vitest';
import { apiGet, apiSend, ApiError } from './apiClient';

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

describe('apiSend', () => {
  it('omits Content-Type and body for body-less requests (BUG-003)', async () => {
    // A body-less DELETE that still advertised application/json was rejected by
    // Fastify with 400 "Body cannot be empty…". No content-type when no body.
    const f = vi.fn(async () => new Response(JSON.stringify({ data: { ok: true } }), { status: 200 }));
    vi.stubGlobal('fetch', f);
    await apiSend('DELETE', '/categories/rules/2');
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.method).toBe('DELETE');
    expect(init.body).toBeUndefined();
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });

  it('sets Content-Type and serializes the body when one is provided', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ data: { id: 'x' } }), { status: 200 }));
    vi.stubGlobal('fetch', f);
    await apiSend('POST', '/categories', { name: 'New' });
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.body).toBe(JSON.stringify({ name: 'New' }));
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });
});
