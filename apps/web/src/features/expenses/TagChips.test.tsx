import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TagChips } from './TagChips';

describe('TagChips', () => {
  it('renders user + agent tags with distinct styling and calls onRemove', () => {
    const onRemove = vi.fn();
    render(<TagChips tags={[{ tag: 'subscription', source: 'agent' }, { tag: 'work', source: 'user' }]} onRemove={onRemove} onAdd={() => {}} />);
    expect(screen.getByText('subscription')).toBeInTheDocument();
    expect(screen.getByText('work')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Remove tag subscription'));
    expect(onRemove).toHaveBeenCalledWith('subscription');
  });
});
