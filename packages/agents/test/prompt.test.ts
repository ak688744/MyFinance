import { describe, it, expect } from 'vitest';
import { buildCategorizationPrompt } from '../src/categorize/prompt';

describe('buildCategorizationPrompt', () => {
  const cats = [{ id: 'food', name: 'Food' }, { id: 'transport', name: 'Transport' }];
  const txns = [{ id: 7, description: 'SWIGGY ORDER 123', amount: 250, direction: 'debit' as const }];

  it('includes every category id and each transaction id/description', () => {
    const p = buildCategorizationPrompt(txns, cats);
    expect(p).toContain('food');
    expect(p).toContain('transport');
    expect(p).toContain('7');
    expect(p).toContain('SWIGGY ORDER 123');
  });
  it('instructs the model to choose a distinctive substring keyword', () => {
    const p = buildCategorizationPrompt(txns, cats).toLowerCase();
    expect(p).toContain('keyword');
    expect(p).toContain('substring');
  });
});
