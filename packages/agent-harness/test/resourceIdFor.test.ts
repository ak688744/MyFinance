import { describe, it, expect } from 'vitest';
import { resourceIdFor } from '../src/runChat';

describe('resourceIdFor', () => {
  it('maps each agent to its isolated memory resource', () => {
    expect(resourceIdFor('wealth')).toBe('user');
    expect(resourceIdFor('expense')).toBe('expense-agent');
    expect(resourceIdFor('investment')).toBe('investment-agent');
  });
});
