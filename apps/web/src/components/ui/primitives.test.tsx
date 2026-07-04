import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KPIStat, Badge } from './primitives';

describe('ui primitives', () => {
  it('renders a KPI stat with value', () => {
    render(<KPIStat label="Net Worth" value="₹1.84Cr" delta={9.4} />);
    expect(screen.getByText('₹1.84Cr')).toBeInTheDocument();
    expect(screen.getByText('+9.4%')).toBeInTheDocument();
  });
  it('renders a valuation badge', () => {
    render(<Badge strategy="market" />);
    expect(screen.getByText('market')).toBeInTheDocument();
  });
});
