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

  it('accepts free-flowing text: adds a tag on Enter and strips a leading #', () => {
    const onAdd = vi.fn();
    render(<TagChips tags={[]} onRemove={() => {}} onAdd={onAdd} />);
    const input = screen.getByLabelText('Add tag');
    fireEvent.change(input, { target: { value: '#dinner' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onAdd).toHaveBeenCalledWith('dinner');
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('adds multiple comma-separated tags at once', () => {
    const onAdd = vi.fn();
    render(<TagChips tags={[]} onRemove={() => {}} onAdd={onAdd} />);
    const input = screen.getByLabelText('Add tag');
    fireEvent.change(input, { target: { value: 'treat, weekend' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onAdd).toHaveBeenNthCalledWith(1, 'treat');
    expect(onAdd).toHaveBeenNthCalledWith(2, 'weekend');
  });
});
