/**
 * Characterization fixtures for the ported returns pipeline.
 *
 * Each scenario is a fully self-contained, deterministic end-to-end case:
 * seed `schemes` + `transactions` into a real in-memory SQLite, run the REAL
 * repos + REAL `getPeriodReturns` with a stub NAV lookup that returns the
 * canned values in `navByScheme`, and assert the outputs match the
 * independently hand-computed `expected` block.
 *
 * All scenarios are schemeId-scoped and use period 'ALL', so the NAV path the
 * domain exercises is exactly:
 *   - startDate  = earliest transaction date for the scheme
 *   - getNAVForDate(amfiCode, startDate)   (start NAV — but startPosition is 0
 *                                            units, so startValue collapses to 0)
 *   - getLatestNAV(amfiCode)               (end NAV — endValue = endUnits * NAV)
 *
 * Because the day-before-earliest-transaction position is always 0 units / 0
 * invested, startValue = 0, which means the XIRR cash flows are simply the
 * seeded purchase/redemption cash flows plus a terminal positive flow equal to
 * endValue on endDate. The test re-derives the expected XIRR by feeding those
 * same cash flows to the SAME `calculateXIRR`, proving the pipeline assembles
 * identical flows (sign conventions, dates, NAV valuation, terminal value).
 */

export type TransactionType =
  | 'PURCHASE'
  | 'REDEMPTION'
  | 'SWITCH_IN'
  | 'SWITCH_OUT'
  | 'DIVIDEND';

export type FixtureScheme = {
  id: number;
  schemeName: string;
  amfiCode: string;
  amcName: string | null;
  category: 'equity' | 'debt' | 'hybrid' | 'other' | null;
  subCategory: string | null;
};

export type FixtureTransaction = {
  schemeId: number;
  accountName: string;
  investmentApp: string;
  schemeName: string;
  transactionType: TransactionType;
  units: number;
  nav: number;
  amount: number;
  transactionDate: string;
};

export type FixtureNav = {
  /** Value returned by getLatestNAV — used for endValue. */
  latest: number;
  /** Date-keyed NAVs returned by getNAVForDate(amfiCode, date). */
  byDate: Record<string, number>;
};

export type CharacterizationScenario = {
  name: string;
  /** schemeId to scope the returns query to (exercises single-scheme NAV path). */
  schemeId: number;
  schemes: FixtureScheme[];
  transactions: FixtureTransaction[];
  navByScheme: Record<string, FixtureNav>;
  /** Injected as params.today for deterministic period math. */
  today: string;
  expected: {
    period: 'ALL';
    startDate: string;
    endDate: string;
    investedInPeriod: number;
    startValue: number;
    endValue: number;
    /** Approx returns = endValue - startValue - investedInPeriod. */
    returnsApprox: number;
    /**
     * Independently-derived expected XIRR cash flows (purchase = negative,
     * redemption = positive) PLUS the terminal endValue flow on endDate. The
     * test feeds these to calculateXIRR and asserts getPeriodReturns returns
     * the SAME number. (xirrApprox is the precomputed convergent value, used
     * as a sanity check on the hand-derived flows.)
     */
    xirrCashFlows: Array<{ date: string; amount: number }>;
    xirrApprox: number;
  };
};

// ──────────────────────────────────────────────────────────────────────────
// Scenario A: single scheme, two PURCHASEs, no redemption, known latest NAV.
//
//   PURCHASE 2024-01-01: 100 units @ NAV 10  -> amount 1000
//   PURCHASE 2024-07-01: 100 units @ NAV 20  -> amount 2000
//   latest NAV = 30
//
//   endUnits     = 200
//   endValue     = 200 * 30 = 6000
//   invested     = 1000 + 2000 = 3000
//   startDate    = 2024-01-01 (earliest); startValue = 0 (no units day before)
//   returns      = 6000 - 0 - 3000 = 3000
//   XIRR flows (sorted by date):
//     2024-01-01: -1000
//     2024-07-01: -2000
//     2025-01-01: +6000   (terminal, endDate = today)
// ──────────────────────────────────────────────────────────────────────────
const scenarioA: CharacterizationScenario = {
  name: 'A: single scheme, two purchases, no redemption',
  schemeId: 1,
  schemes: [
    {
      id: 1,
      schemeName: 'Alpha Equity Fund',
      amfiCode: '100001',
      amcName: 'Alpha AMC',
      category: 'equity',
      subCategory: 'Large Cap',
    },
  ],
  transactions: [
    {
      schemeId: 1,
      accountName: 'ACC1',
      investmentApp: 'groww',
      schemeName: 'Alpha Equity Fund',
      transactionType: 'PURCHASE',
      units: 100,
      nav: 10,
      amount: 1000,
      transactionDate: '2024-01-01',
    },
    {
      schemeId: 1,
      accountName: 'ACC1',
      investmentApp: 'groww',
      schemeName: 'Alpha Equity Fund',
      transactionType: 'PURCHASE',
      units: 100,
      nav: 20,
      amount: 2000,
      transactionDate: '2024-07-01',
    },
  ],
  navByScheme: {
    '100001': {
      latest: 30,
      byDate: {
        // startDate NAV — value is irrelevant to startValue (0 units) but the
        // pipeline DOES query it, so provide it.
        '2024-01-01': 10,
      },
    },
  },
  today: '2025-01-01',
  expected: {
    period: 'ALL',
    startDate: '2024-01-01',
    endDate: '2025-01-01',
    investedInPeriod: 3000,
    startValue: 0,
    endValue: 6000,
    returnsApprox: 3000,
    xirrCashFlows: [
      { date: '2024-01-01', amount: -1000 },
      { date: '2024-07-01', amount: -2000 },
      { date: '2025-01-01', amount: 6000 },
    ],
    xirrApprox: 0, // placeholder; the test asserts equality against calculateXIRR(flows)
  },
};

// ──────────────────────────────────────────────────────────────────────────
// Scenario B: single scheme, PURCHASE then partial REDEMPTION, known NAV.
//
//   PURCHASE   2023-01-01: 200 units @ NAV 10 -> amount 2000
//   REDEMPTION 2024-01-01:  50 units @ NAV 24 -> amount 1200
//   latest NAV = 25
//
//   endUnits     = 200 - 50 = 150
//   endValue     = 150 * 25 = 3750
//   invested     = 2000 - 1200 = 800   (REDEMPTION subtracts amount)
//   startDate    = 2023-01-01 (earliest); startValue = 0
//   returns      = 3750 - 0 - 800 = 2950
//   XIRR flows (sorted by date):
//     2023-01-01: -2000
//     2024-01-01: +1200
//     2025-01-01: +3750   (terminal)
// ──────────────────────────────────────────────────────────────────────────
const scenarioB: CharacterizationScenario = {
  name: 'B: single scheme, purchase then partial redemption',
  schemeId: 2,
  schemes: [
    {
      id: 2,
      schemeName: 'Beta Hybrid Fund',
      amfiCode: '200002',
      amcName: 'Beta AMC',
      category: 'hybrid',
      subCategory: null,
    },
  ],
  transactions: [
    {
      schemeId: 2,
      accountName: 'ACC1',
      investmentApp: 'groww',
      schemeName: 'Beta Hybrid Fund',
      transactionType: 'PURCHASE',
      units: 200,
      nav: 10,
      amount: 2000,
      transactionDate: '2023-01-01',
    },
    {
      schemeId: 2,
      accountName: 'ACC1',
      investmentApp: 'groww',
      schemeName: 'Beta Hybrid Fund',
      transactionType: 'REDEMPTION',
      units: 50,
      nav: 24,
      amount: 1200,
      transactionDate: '2024-01-01',
    },
  ],
  navByScheme: {
    '200002': {
      latest: 25,
      byDate: {
        '2023-01-01': 10,
      },
    },
  },
  today: '2025-01-01',
  expected: {
    period: 'ALL',
    startDate: '2023-01-01',
    endDate: '2025-01-01',
    investedInPeriod: 800,
    startValue: 0,
    endValue: 3750,
    returnsApprox: 2950,
    xirrCashFlows: [
      { date: '2023-01-01', amount: -2000 },
      { date: '2024-01-01', amount: 1200 },
      { date: '2025-01-01', amount: 3750 },
    ],
    xirrApprox: 0, // placeholder
  },
};

// ──────────────────────────────────────────────────────────────────────────
// Scenario C: SIP-like — four monthly PURCHASEs into a single scheme.
//
//   PURCHASE 2024-01-01: 100 units @ NAV 10 -> 1000
//   PURCHASE 2024-02-01:  90 units @ NAV 11 -> ~990 (use 990)
//   PURCHASE 2024-03-01: 100 units @ NAV 12 -> 1200
//   PURCHASE 2024-04-01:  80 units @ NAV 12.5 -> 1000
//   latest NAV = 15
//
//   endUnits  = 100 + 90 + 100 + 80 = 370
//   endValue  = 370 * 15 = 5550
//   invested  = 1000 + 990 + 1200 + 1000 = 4190
//   startDate = 2024-01-01; startValue = 0
//   returns   = 5550 - 0 - 4190 = 1360
//   XIRR flows (sorted):
//     2024-01-01: -1000
//     2024-02-01: -990
//     2024-03-01: -1200
//     2024-04-01: -1000
//     2025-06-01: +5550 (terminal)
// ──────────────────────────────────────────────────────────────────────────
const scenarioC: CharacterizationScenario = {
  name: 'C: SIP-like four monthly purchases',
  schemeId: 3,
  schemes: [
    {
      id: 3,
      schemeName: 'Gamma Index Fund',
      amfiCode: '300003',
      amcName: 'Gamma AMC',
      category: 'equity',
      subCategory: 'Index',
    },
  ],
  transactions: [
    {
      schemeId: 3,
      accountName: 'ACC1',
      investmentApp: 'groww',
      schemeName: 'Gamma Index Fund',
      transactionType: 'PURCHASE',
      units: 100,
      nav: 10,
      amount: 1000,
      transactionDate: '2024-01-01',
    },
    {
      schemeId: 3,
      accountName: 'ACC1',
      investmentApp: 'groww',
      schemeName: 'Gamma Index Fund',
      transactionType: 'PURCHASE',
      units: 90,
      nav: 11,
      amount: 990,
      transactionDate: '2024-02-01',
    },
    {
      schemeId: 3,
      accountName: 'ACC1',
      investmentApp: 'groww',
      schemeName: 'Gamma Index Fund',
      transactionType: 'PURCHASE',
      units: 100,
      nav: 12,
      amount: 1200,
      transactionDate: '2024-03-01',
    },
    {
      schemeId: 3,
      accountName: 'ACC1',
      investmentApp: 'groww',
      schemeName: 'Gamma Index Fund',
      transactionType: 'PURCHASE',
      units: 80,
      nav: 12.5,
      amount: 1000,
      transactionDate: '2024-04-01',
    },
  ],
  navByScheme: {
    '300003': {
      latest: 15,
      byDate: {
        '2024-01-01': 10,
      },
    },
  },
  today: '2025-06-01',
  expected: {
    period: 'ALL',
    startDate: '2024-01-01',
    endDate: '2025-06-01',
    investedInPeriod: 4190,
    startValue: 0,
    endValue: 5550,
    returnsApprox: 1360,
    xirrCashFlows: [
      { date: '2024-01-01', amount: -1000 },
      { date: '2024-02-01', amount: -990 },
      { date: '2024-03-01', amount: -1200 },
      { date: '2024-04-01', amount: -1000 },
      { date: '2025-06-01', amount: 5550 },
    ],
    xirrApprox: 0, // placeholder
  },
};

export const characterizationScenarios: CharacterizationScenario[] = [
  scenarioA,
  scenarioB,
  scenarioC,
];
