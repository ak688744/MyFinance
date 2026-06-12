import { describe, it, expect } from 'vitest';
import { runMigrations } from '../../src/db/migrate';
import { makeInvestmentTxRepo } from '../../src/repositories/investmentTxRepo';
import { makeSchemeRepo } from '../../src/repositories/schemeRepo';
import { makeHoldingsRepo } from '../../src/repositories/holdingsRepo';
import { getPeriodReturns } from '../../src/domain/returns';
import type { NavLookup } from '../../src/types';
import fixture from '../fixtures/growwGolden.json';

/**
 * GROWW GOLDEN-MASTER — core-logic T1 validation gate.
 *
 * Validates the ported XIRR / period-returns math against REAL Groww-reported
 * per-scheme XIRR. For each of the 6 Groww-sourced schemes we:
 *   1. seed a fresh in-memory DB with that scheme + its PURCHASE transactions,
 *   2. run getPeriodReturns scoped to that scheme for period 'ALL',
 *   3. supply the scheme's currentNav as the latest NAV via a stub NavLookup,
 *   4. assert the computed xirr (decimal, e.g. -0.062) is within the fixture's
 *      tolerance (±0.5 percentage points = 0.005 absolute) of growwXirrPct/100.
 *
 * Per-scheme (not portfolio total) because the real portfolio also holds
 * External non-Groww positions with no transaction history; only the
 * Groww-sourced per-scheme XIRR is independently reproducible.
 *
 * NAV-stub wiring: each scheme is seeded with amfi_code = its label, and the
 * stub keys off that amfiCode. getNAVForDate returns { nav: currentNav } for
 * any date, and getLatestNAV returns currentNav. For period 'ALL' the start
 * units are 0 (startDate = earliest tx; day-before-start position is empty),
 * so startValue = 0 regardless of the start NAV, and the XIRR flows are the
 * purchase amounts (negative, on their dates) plus the terminal value
 * endUnits * currentNav (positive, at asOfDate) — exactly Groww's basis.
 * `today` is pinned to fixture.asOfDate so the terminal date matches Groww's.
 */

const TOLERANCE_ABS = fixture.toleranceXirrPct / 100; // 0.5 pp -> 0.005

type FixtureScheme = (typeof fixture.schemes)[number];
type FixtureTx = (typeof fixture.transactions)[number];

/** Seed one scheme + its PURCHASE transactions into a fresh in-memory DB. */
function seedScheme(scheme: FixtureScheme): {
  db: ReturnType<typeof runMigrations>['db'];
  schemeId: number;
} {
  const { db, sqlite } = runMigrations(':memory:');

  // FK parent first: investment_schemes. amfi_code = label so the NAV stub
  // can key off it.
  const insertScheme = sqlite.prepare(
    `INSERT INTO investment_schemes
      (scheme_name, amfi_code, amc_name, category, sub_category)
      VALUES (?, ?, ?, ?, ?)`,
  );
  const info = insertScheme.run(
    scheme.label,
    scheme.label,
    null,
    scheme.category,
    null,
  );
  const schemeId = Number(info.lastInsertRowid);

  const insertTx = sqlite.prepare(
    `INSERT INTO investment_transactions
      (scheme_id, account_name, investment_app, scheme_name,
       transaction_type, units, nav, amount, transaction_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const schemeTxs = (fixture.transactions as FixtureTx[]).filter(
    (t) => t.scheme === scheme.label,
  );
  for (const t of schemeTxs) {
    insertTx.run(
      schemeId,
      'Groww',
      'Groww',
      scheme.label,
      t.type,
      t.units,
      t.nav,
      t.amount,
      t.date,
    );
  }

  return { db, schemeId };
}

/** Stub NavLookup: every scheme's currentNav, keyed by amfiCode (== label). */
function makeStubNav(): NavLookup {
  const navByAmfi = new Map<string, number>();
  for (const s of fixture.schemes) {
    navByAmfi.set(s.label, s.currentNav);
  }
  return {
    async getNAVForDate(amfiCode: string, date: string) {
      const nav = navByAmfi.get(amfiCode);
      return nav === undefined ? null : { date, nav };
    },
    async getLatestNAV(amfiCode: string) {
      const nav = navByAmfi.get(amfiCode);
      return nav === undefined ? null : nav;
    },
  };
}

describe('Groww golden-master: per-scheme XIRR re-validation', () => {
  for (const scheme of fixture.schemes) {
    it(`${scheme.label}: computed XIRR within ${fixture.toleranceXirrPct}pp of Groww ${scheme.growwXirrPct}%`, async () => {
      const { db, schemeId } = seedScheme(scheme);
      const deps = {
        txRepo: makeInvestmentTxRepo(db),
        schemeRepo: makeSchemeRepo(db),
        holdingsRepo: makeHoldingsRepo(db),
        nav: makeStubNav(),
      };

      const result = await getPeriodReturns(deps, {
        period: 'ALL',
        schemeId,
        today: new Date(`${fixture.asOfDate}T00:00:00`),
      });

      const expected = scheme.growwXirrPct / 100;
      const computed = result.xirr;
      const diffPp =
        computed === null
          ? Number.NaN
          : Math.abs(computed - expected) * 100;

      const msg =
        `${scheme.label}: Groww=${scheme.growwXirrPct}% ` +
        `computed=${computed === null ? 'null' : (computed * 100).toFixed(3) + '%'} ` +
        `diff=${Number.isNaN(diffPp) ? 'N/A' : diffPp.toFixed(3)}pp ` +
        `(tolerance ${fixture.toleranceXirrPct}pp)`;

      expect(computed, `${msg} — XIRR should not be null`).not.toBeNull();
      expect(
        Math.abs((computed as number) - expected),
        msg,
      ).toBeLessThanOrEqual(TOLERANCE_ABS);
    });
  }
});
