import { describe, it, expect, afterEach } from 'vitest';
import { runMigrations } from '../../src/db/migrate';

describe('category_rules keyword CHECK', () => {
  let handle: ReturnType<typeof runMigrations> | null = null;
  afterEach(() => {
    handle?.sqlite.close();
    handle = null;
  });

  it('accepts a keyword rule insert', () => {
    handle = runMigrations(':memory:');
    const { sqlite } = handle;
    sqlite.prepare("INSERT INTO categories (id, name) VALUES ('food', 'Food')").run();
    expect(() =>
      sqlite
        .prepare(
          "INSERT INTO category_rules (rule_type, pattern_value, category_id, priority) VALUES ('keyword','swiggy','food',50)",
        )
        .run(),
    ).not.toThrow();
  });

  it('still rejects an invalid rule_type', () => {
    handle = runMigrations(':memory:');
    const { sqlite } = handle;
    sqlite.prepare("INSERT INTO categories (id, name) VALUES ('food', 'Food')").run();
    expect(() =>
      sqlite
        .prepare(
          "INSERT INTO category_rules (rule_type, pattern_value, category_id, priority) VALUES ('bogus','x','food',1)",
        )
        .run(),
    ).toThrow();
  });
});
