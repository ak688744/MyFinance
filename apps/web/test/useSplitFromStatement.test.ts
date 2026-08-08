import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/lib/apiClient', () => ({
  apiUpload: vi.fn(async () => ({ parentId: 1, parentAmount: 8000, detectedTotal: 2000, parsedTotal: 2000, matched: true, reconciledAgainst: 'statementTotal', carryover: 6000, children: [] })),
  apiGet: vi.fn(), apiSend: vi.fn(),
}));

import { apiUpload } from '../src/lib/apiClient';
import { useSplitFromStatement } from '../src/lib/hooks';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient();
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('useSplitFromStatement', () => {
  beforeEach(() => vi.clearAllMocks());
  it('uploads multipart to the split endpoint', async () => {
    const { result } = renderHook(() => useSplitFromStatement(), { wrapper });
    const file = new File([new Uint8Array([1, 2, 3])], 'stmt.pdf', { type: 'application/pdf' });
    await result.current.mutateAsync({ id: 42, file });
    await waitFor(() => expect(apiUpload).toHaveBeenCalled());
    const [path, form] = (apiUpload as any).mock.calls[0];
    expect(path).toBe('/transactions/42/split-from-statement');
    expect(form.get('file')).toBeInstanceOf(File);
  });
});
