import { describe, it, expect } from 'vitest';
import { runMigrations } from '../../src/db/migrate';
import { seedDatabase } from '../../src/db/seed';
import { makeCategoryRepo } from '../../src/repositories/categoryRepo';
import { starterCategories } from '../../src/data/starterCategories';
import * as core from '../../src/index';

describe('seedDatabase', () => {
  it('seeds all starter categories', () => {
    const { db } = runMigrations(':memory:');
    seedDatabase(db);

    const categoryRepo = makeCategoryRepo(db);
    const seeded = categoryRepo.list();

    expect(seeded).toHaveLength(starterCategories.length);
    const seededIds = new Set(seeded.map((c) => c.id));
    for (const sc of starterCategories) {
      expect(seededIds.has(sc.id)).toBe(true);
    }
  });

  it('is idempotent — a 2nd call does not error or duplicate', () => {
    const { db } = runMigrations(':memory:');
    seedDatabase(db);
    const categoryRepo = makeCategoryRepo(db);
    const countAfterFirst = categoryRepo.list().length;

    expect(() => seedDatabase(db)).not.toThrow();

    const countAfterSecond = categoryRepo.list().length;
    expect(countAfterSecond).toBe(countAfterFirst);
    expect(countAfterSecond).toBe(starterCategories.length);
  });
});

describe('public package surface (index.ts)', () => {
  it('exports key DB + repo + domain + import symbols', () => {
    // DB
    expect(core.createDb).toBeDefined();
    expect(core.runMigrations).toBeDefined();
    expect(core.seedDatabase).toBeDefined();
    expect(core.schema).toBeDefined();
    // Repos
    expect(core.makeInvestmentTxRepo).toBeDefined();
    expect(core.makeSchemeRepo).toBeDefined();
    expect(core.makeHoldingsRepo).toBeDefined();
    expect(core.makeCategoryRepo).toBeDefined();
    expect(core.makeCategoryRuleRepo).toBeDefined();
    expect(core.makeExpenseTransactionRepo).toBeDefined();
    expect(core.makeImportHistoryRepo).toBeDefined();
    // Domain
    expect(core.calculateXIRR).toBeDefined();
    expect(core.getPeriodReturns).toBeDefined();
    expect(core.getPortfolioSummary).toBeDefined();
    expect(core.recategorizeNonManualTransactions).toBeDefined();
    expect(core.getLatestNAV).toBeDefined();
    expect(core.autoMatchAmfiCodes).toBeDefined();
    // Import
    expect(core.parseGrowwTransactionXls).toBeDefined();
    expect(core.parseHdfcStatementXls).toBeDefined();
    expect(core.parseGrowwHoldingsXls).toBeDefined();
    expect(core.importTransactions).toBeDefined();
    expect(core.importHoldings).toBeDefined();
    expect(core.importInvestmentTransactions).toBeDefined();
  });
});
