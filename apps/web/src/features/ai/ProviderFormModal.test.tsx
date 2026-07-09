import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProviderFormModal } from './ProviderFormModal';
import * as hooks from '../../lib/hooks';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient();
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('ProviderFormModal', () => {
  beforeEach(() => {
    vi.spyOn(hooks, 'useCreateProvider').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
  });

  it('shows API key for gemini and hides it for bedrock (region/profile instead)', () => {
    wrap(<ProviderFormModal open onClose={() => {}} onSubmit={() => {}} />);
    // default dialect gemini → key field present
    expect(screen.getByLabelText(/API key/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/dialect/i), { target: { value: 'bedrock' } });
    expect(screen.queryByLabelText(/API key/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/region/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/profile/i)).toBeInTheDocument();
  });
});
