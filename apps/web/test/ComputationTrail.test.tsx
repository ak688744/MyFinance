import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ComputationTrail } from '../src/features/assistant/ComputationTrail';

const comp = { code: 'import numpy as np\nnp.mean([1,2,3])', stdout: 'hi\n', result: 2, durationMs: 1250 };

describe('ComputationTrail', () => {
  it('is collapsed by default with the verbatim label', () => {
    render(<ComputationTrail computations={[comp]} />);
    expect(screen.getByRole('button', { name: /How this was computed/ })).toBeTruthy();
    expect(screen.queryByText(/np\.mean/)).toBeNull();
  });
  it('expands to show code, output, result and run time', () => {
    render(<ComputationTrail computations={[comp]} />);
    fireEvent.click(screen.getByRole('button', { name: /How this was computed/ }));
    expect(screen.getByText(/np\.mean/)).toBeTruthy();
    expect(screen.getByText('hi')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText(/1\.3 s/)).toBeTruthy();
  });
  it('shows the count for several runs and the error text', () => {
    render(<ComputationTrail computations={[comp, { ...comp, error: 'ValueError: nope', result: null }]} />);
    fireEvent.click(screen.getByRole('button', { name: /How this was computed \(2\)/ }));
    expect(screen.getByText(/ValueError: nope/)).toBeTruthy();
  });
  it('renders nothing for an empty list', () => {
    const { container } = render(<ComputationTrail computations={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
