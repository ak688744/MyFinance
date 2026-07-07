import { describe, it, expect, beforeEach } from 'vitest';
import { runMigrations } from '../../src/db/migrate';
import { makeAiProviderRepo } from '../../src/repositories/aiProviderRepo';
import { makeAiModelRepo } from '../../src/repositories/aiModelRepo';

function setup() {
  const { db, sqlite } = runMigrations(':memory:');
  return { providers: makeAiProviderRepo(db), models: makeAiModelRepo(db), sqlite };
}

describe('aiProviderRepo + aiModelRepo', () => {
  it('creates, gets, lists, updates, deletes a provider', () => {
    const { providers } = setup();
    providers.create({ id: 'gemini', dialect: 'gemini', label: 'Gemini', secretEnc: 'enc', configJson: null });
    expect(providers.get('gemini')?.label).toBe('Gemini');
    providers.update('gemini', { label: 'Gemini 2' });
    expect(providers.get('gemini')?.label).toBe('Gemini 2');
    expect(providers.list()).toHaveLength(1);
    providers.delete('gemini');
    expect(providers.get('gemini')).toBeNull();
  });

  it('models: create/list-by-provider + countRoutes/countModels guards', () => {
    const { providers, models } = setup();
    providers.create({ id: 'gemini', dialect: 'gemini', label: 'G', secretEnc: 'e', configJson: null });
    models.create({ id: 'flash', providerId: 'gemini', modelString: 'gemini-2.5-flash', label: 'Flash', inputPerM: 0.3, outputPerM: 2.5 });
    expect(models.list({ providerId: 'gemini' })).toHaveLength(1);
    expect(providers.countModels('gemini')).toBe(1);
    expect(models.countRoutes('flash')).toBe(0);
    models.update('flash', { inputPerM: 0.4 });
    expect(models.get('flash')?.inputPerM).toBe(0.4);
  });
});
