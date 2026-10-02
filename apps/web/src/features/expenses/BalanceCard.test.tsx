import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BalanceCard } from './BalanceCard';

describe('BalanceCard', () => {
  it('shows opening, closing and a green positive net', () => {
    render(<BalanceCard balance={{ opening: 100000, closing: 190680, net: 90680 }} />);
    expect(screen.getByText('Opening')).toBeInTheDocument();
    expect(screen.getByText('Closing')).toBeInTheDocument();
    const net = screen.getByText(/^\+/);
    expect(net.textContent).toContain('90,680');
    expect(net.className).toContain('text-gain');
  });
  it('shows a red minus for negative net', () => {
    render(<BalanceCard balance={{ opening: 50000, closing: 40000, net: -10000 }} />);
    const net = screen.getByText(/^−/);
    expect(net.textContent).toContain('10,000');
    expect(net.className).toContain('text-loss');
  });
  it('shows a dash and hint when balance is null', () => {
    render(<BalanceCard balance={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('No bank balance data this month')).toBeInTheDocument();
  });
});
