import { describe, it, expect } from 'vitest';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { runMigrations } from '../../src/db/migrate';
import { makeInvestmentTxRepo } from '../../src/repositories/investmentTxRepo';
import { makeSchemeRepo } from '../../src/repositories/schemeRepo';
import { makeHoldingsRepo } from '../../src/repositories/holdingsRepo';
import { getPeriodReturns } from '../../src/domain/returns';
import { calculateXIRR } from '../../src/domain/xirr';
import type { NavLookup } from '../../src/types';
import {
  characterizationScenarios,
  type CharacterizationScenario,
} from '../fixtures/characterizationPortfolio';

/**
 * Characterization (integration) tests: pin the ported domain pipeline
 * (real in-memory SQLite -> real repos -> real getPeriodReturns) to
 * independently hand-computed expected outputs. A stub NavLookup supplies
 * canned NAVs so results are fully deterministic (no network).
 *
 * These do NOT re-test the unit math in isolation — they prove the END-TO-END
 * data path: seeding -> repo SQL -> domain assembly -> XIRR routes data
 * correctly (sign conventions, dates, NAV valuation, terminal value).
 */

const MONEY_TOLERANCE = 0.01;
const XIRR_TOLERANCE = 1e-4;

/** Seed schemes + transactions into a fresh in-memory DB (FK parents first). */
function seed(scenario: CharacterizationScenario): {
  db: ReturnType<typeof runMigrations>['db'];
  sqlite: SqliteDatabase;
} {
  const { db, sqlite } = runMigrations(':memory:');

  const insertScheme = sqlite.prepare(
    `INSERT INTO investment_schemes
      (id, scheme_name, amfi_code, amc_name, category, sub_category)
      VALUES (?, ?, ?, ?, ?, ?)`,
  );
  for (const s of scenario.schemes) {
    insertScheme.run(
      s.id,
      s.schemeName,
      s.amfiCode,
      s.amcName,
      s.category,
      s.subCategory,
    );
  }

  const insertTx = sqlite.prepare(
    `INSERT INTO investment_transactions
      (scheme_id, account_name, investment_app, scheme_name,
       transaction_type, units, nav, amount, transaction_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const t of scenario.transactions) {
    insertTx.run(
      t.schemeId,
      t.accountName,
      t.investmentApp,
      t.schemeName,
      t.transactionType,
      t.units,
      t.nav,
      t.amount,
      t.transactionDate,
    );
  }

  return { db, sqlite };
}

/** Stub NavLookup backed by the scenario's canned NAVs. */
function makeStubNav(scenario: CharacterizationScenario): NavLookup {
  return {
    async getNAVForDate(amfiCode: string, date: string) {
      const entry = scenario.navByScheme[amfiCode];
      if (!entry) return null;
      const nav = entry.byDate[date];
      if (nav === undefined) return null;
      return { date, nav };
    },
    async getLatestNAV(amfiCode: string) {
      const entry = scenario.navByScheme[amfiCode];
      return entry ? entry.latest : null;
    },
  };
}

describe('returns characterization (real DB + repos + domain)', () => {
  for (const scenario of characterizationScenarios) {
    describe(scenario.name, () => {
      it('produces returns matching independently-computed expected values', async () => {
        const { db } = seed(scenario);
        const deps = {
          txRepo: makeInvestmentTxRepo(db),
          schemeRepo: makeSchemeRepo(db),
          holdingsRepo: makeHoldingsRepo(db),
          nav: makeStubNav(scenario),
        };

        const result = await getPeriodReturns(deps, {
          period: 'ALL',
          schemeId: scenario.schemeId,
          today: new Date(`${scenario.today}T00:00:00`),
        });

        const exp = scenario.expected;

        // Structural / date fields are exact.
        expect(result.period).toBe(exp.period);
        expect(result.startDate).toBe(exp.startDate);
        expect(result.endDate).toBe(exp.endDate);

        // Money fields within tolerance.
        expect(result.investedInPeriod).toBeCloseTo(exp.investedInPeriod, 2);
        expect(Math.abs(result.startValue - exp.startValue)).toBeLessThan(
          MONEY_TOLERANCE,
        );
        expect(Math.abs(result.endValue - exp.endValue)).toBeLessThan(
          MONEY_TOLERANCE,
        );
        expect(Math.abs(result.returns - exp.returnsApprox)).toBeLessThan(
          MONEY_TOLERANCE,
        );

        // returnsPercent re-derived from the same definition the domain uses:
        //   baseValue = startValue + investedInPeriod
        //   returnsPercent = baseValue > 0 ? returns/baseValue*100 : 0
        const baseValue = exp.startValue + exp.investedInPeriod;
        const expectedReturnsPercent =
          baseValue > 0 ? (exp.returnsApprox / baseValue) * 100 : 0;
        expect(
          Math.abs(result.returnsPercent - expectedReturnsPercent),
        ).toBeLessThan(MONEY_TOLERANCE);

        // XIRR: re-derive from the same calculateXIRR fed the independently
        // hand-listed cash flows. This proves the pipeline assembled IDENTICAL
        // flows (signs, dates, terminal endValue) and routed them into XIRR.
        const expectedXirr = calculateXIRR(exp.xirrCashFlows);
        expect(expectedXirr).not.toBeNull();
        expect(result.xirr).not.toBeNull();
        expect(Math.abs((result.xirr as number) - (expectedXirr as number))).toBeLessThan(
          XIRR_TOLERANCE,
        );
      });
    });
  }
});
