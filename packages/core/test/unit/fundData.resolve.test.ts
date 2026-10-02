import { describe, it, expect } from 'vitest';
import {
  pickGrowwSlug, pickKuveraCode, pickTickertapeSid, nameTokens, tokenOverlap, growwSearchQueries,
} from '../../src/domain/fundData/resolve';

// Shapes below mirror the real payloads captured during the live probe.

describe('pickGrowwSlug', () => {
  const search = {
    data: {
      content: [
        { title: 'Parag Parikh Flexi Cap Fund', entity_type: 'Scheme', scheme_code: 122639, search_id: 'parag-parikh-long-term-value-fund-direct-growth', id: 'parag-parikh-long-term-value-fund-direct-growth' },
        { title: 'HDFC Flexi Cap Direct Plan-Growth', entity_type: 'Scheme', scheme_code: 118989, search_id: 'hdfc-equity-fund-direct-growth' },
      ],
    },
  };
  it('matches on scheme_code (== AMFI code) and returns the slug', () => {
    expect(pickGrowwSlug(search, '122639')).toBe('parag-parikh-long-term-value-fund-direct-growth');
  });
  it('returns null when no result matches the AMFI code', () => {
    expect(pickGrowwSlug(search, '999999')).toBeNull();
    expect(pickGrowwSlug({}, '122639')).toBeNull();
  });
});

describe('pickKuveraCode', () => {
  // category -> subCategory -> AMC -> [{ c, n }]
  const list = {
    Equity: {
      'Flexi Cap Fund': {
        PPFAS_MF: [{ c: 'PP001ZG-GR', n: 'Parag Parikh Flexi Cap Growth Direct Plan' }],
        HDFC_MF: [{ c: 'HDFCEQ-GR', n: 'HDFC Flexi Cap Growth Direct Plan' }],
      },
    },
  };
  it('token-matches a scheme name to the Kuvera code despite word-order variance', () => {
    // AMFI name "Parag Parikh Flexi Cap Fund Direct Growth" vs Kuvera "...Growth Direct Plan"
    expect(pickKuveraCode(list, 'Parag Parikh Flexi Cap Fund Direct Growth')).toBe('PP001ZG-GR');
  });
  it('returns null when nothing matches strongly', () => {
    expect(pickKuveraCode(list, 'Some Unrelated Debt Gilt Fund')).toBeNull();
  });
});

describe('pickTickertapeSid', () => {
  const search = {
    data: {
      stocks: [{ sid: 'M_QULP', name: 'Parag Parikh Flexi Cap Fund', type: 'mutualfund' }],
      brands: [{ sid: 'SOMESTOCK', name: 'Not a fund' }],
    },
  };
  it('picks the M_ sid best-matching the scheme name', () => {
    expect(pickTickertapeSid(search, 'Parag Parikh Flexi Cap Fund Direct Growth')).toBe('M_QULP');
  });
  it('returns null when no M_ sid matches', () => {
    expect(pickTickertapeSid({ data: { stocks: [] } }, 'Parag Parikh')).toBeNull();
  });
});

describe('name matching helpers', () => {
  it('nameTokens drops stop-words and short tokens', () => {
    expect([...nameTokens('Parag Parikh Flexi Cap Fund Direct Growth')].sort())
      .toEqual(['cap', 'flexi', 'parag', 'parikh']);
  });
  it('tokenOverlap is 1 for identical significant tokens', () => {
    expect(tokenOverlap(nameTokens('Axis ELSS Tax Saver Direct Growth'), nameTokens('Axis ELSS Tax Saver Growth Direct Plan'))).toBe(1);
  });
});

describe('growwSearchQueries', () => {
  it('yields the full name then a plan-qualifier-trimmed variant (Groww ranks better without the suffix)', () => {
    expect(growwSearchQueries('Axis Nifty 50 Index Fund Direct Growth'))
      .toEqual(['Axis Nifty 50 Index Fund Direct Growth', 'Axis Nifty 50 Index Fund']);
  });
  it('yields a single query when there is no plan suffix to trim', () => {
    expect(growwSearchQueries('Quant Small Cap')).toEqual(['Quant Small Cap']);
  });
});
