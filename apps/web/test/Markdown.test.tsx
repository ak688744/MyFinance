import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Markdown } from '../src/features/assistant/Markdown';

describe('Markdown', () => {
  it('renders a fenced (language-less) block as a single <pre> panel, not per-line pills', () => {
    const md = ['```', 'FIXED   ₹141,969', 'SURPLUS ₹167,915', '```'].join('\n');
    const { container } = render(<Markdown>{md}</Markdown>);
    const pre = container.querySelector('pre');
    expect(pre).not.toBeNull();
    // The multi-line content lives inside exactly one <pre> → one panel.
    expect(container.querySelectorAll('pre')).toHaveLength(1);
    // The block <code> must NOT carry the inline pill border class.
    const codeInPre = pre?.querySelector('code');
    expect(codeInPre?.className ?? '').not.toContain('rounded');
    expect(pre?.textContent).toContain('SURPLUS ₹167,915');
  });

  it('keeps inline code styled as a pill (no <pre>)', () => {
    const { container } = render(<Markdown>{'Use the `ask_user` tool.'}</Markdown>);
    expect(container.querySelector('pre')).toBeNull();
    const code = container.querySelector('code');
    expect(code).not.toBeNull();
    expect(code?.className ?? '').toContain('rounded');
  });

  it('renders GFM tables', () => {
    const md = ['| Category | Amount |', '|---|---|', '| Rent | ₹60,000 |'].join('\n');
    const { container } = render(<Markdown>{md}</Markdown>);
    expect(container.querySelector('table')).not.toBeNull();
    expect(container.textContent).toContain('₹60,000');
  });
});
