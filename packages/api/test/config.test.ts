import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config';

describe('loadConfig', () => {
  it('loads default dbPath when DB_PATH is unset', () => {
    delete process.env.DB_PATH;
    const cfg = loadConfig();
    expect(cfg.dbPath).toBe('myfinance.db');
  });

  it('loads default port when PORT is unset', () => {
    delete process.env.PORT;
    const cfg = loadConfig();
    expect(cfg.port).toBe(3001);
  });
});
