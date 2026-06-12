import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SchemeRepo } from '../../src/repositories/types';
import type { Scheme } from '../../src/types';

// Mock the navService module the matcher depends on.
vi.mock('../../src/domain/nav/navService', () => ({
  searchSchemes: vi.fn(),
  getSchemeInfo: vi.fn(),
}));

import { searchSchemes, getSchemeInfo, type SchemeInfo } from '../../src/domain/nav/navService';
import {
  extractVariant,
  autoMatchAmfiCodes,
  verifySchemeNAV,
} from '../../src/domain/amfiMatcher';

const searchMock = vi.mocked(searchSchemes);
const schemeInfoMock = vi.mocked(getSchemeInfo);

function info(amfiCode: string, schemeName: string): SchemeInfo {
  return { amfiCode, schemeName, fundHouse: '', category: '' };
}

// Build a fake SchemeRepo backed by an in-memory array.
function makeFakeSchemeRepo(schemes: Scheme[]) {
  const updates: Array<{ schemeId: number; amfiCode: string }> = [];
  const repo: SchemeRepo = {
    getSchemeById: (id) => schemes.find((s) => s.id === id) ?? null,
    getSchemes: () => schemes.slice(),
    findSchemeByName: (name) => schemes.find((s) => s.schemeName === name) ?? null,
    getSchemesWithAmfi: () => [],
    updateAmfiCode: (schemeId, amfiCode) => {
      updates.push({ schemeId, amfiCode });
      const s = schemes.find((x) => x.id === schemeId);
      if (s) s.amfiCode = amfiCode;
    },
    matchOrCreateScheme: () => 0,
    getUnmatchedSchemes: () => schemes.filter((s) => s.amfiCode === null),
  };
  return { repo, updates };
}

function scheme(id: number, schemeName: string, amfiCode: string | null = null): Scheme {
  return { id, schemeName, amfiCode, isin: null, amcName: null, category: null, subCategory: null };
}

describe('extractVariant', () => {
  it('classifies direct + growth', () => {
    expect(extractVariant('Parag Parikh Flexi Cap Direct Growth')).toEqual({
      plan: 'direct',
      dist: 'growth',
    });
  });

  it('classifies regular + idcw', () => {
    expect(extractVariant('Axis ELSS Tax Saver Regular IDCW')).toEqual({
      plan: 'regular',
      dist: 'idcw',
    });
  });

  it('classifies dividend and unknown plan', () => {
    expect(extractVariant('SBI Bluechip Fund Dividend')).toEqual({
      plan: 'unknown',
      dist: 'dividend',
    });
  });

  it('returns unknown/unknown when neither is present', () => {
    expect(extractVariant('Some Random Fund')).toEqual({ plan: 'unknown', dist: 'unknown' });
  });
});

describe('autoMatchAmfiCodes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches the candidate whose plan+dist agrees and calls updateAmfiCode', async () => {
    // User scheme is Direct/Growth — the matcher must pick the Direct/Growth code.
    searchMock.mockResolvedValue([
      info('122640', 'Parag Parikh Flexi Cap Fund - Regular Plan - Growth'),
      info('122639', 'Parag Parikh Flexi Cap Fund - Direct Plan - Growth'),
    ]);

    const { repo, updates } = makeFakeSchemeRepo([
      scheme(1, 'Parag Parikh Flexi Cap Fund - Direct Plan - Growth'),
    ]);

    const result = await autoMatchAmfiCodes({ schemeRepo: repo }, { dryRun: false });

    expect(updates).toEqual([{ schemeId: 1, amfiCode: '122639' }]);
    expect(result.matched).toBe(1);
    expect(result.total).toBe(1);
    expect(result.matches).toEqual([
      { schemeName: 'Parag Parikh Flexi Cap Fund - Direct Plan - Growth', amfiCode: '122639' },
    ]);
  });

  it('does not write on dryRun but still reports matches', async () => {
    searchMock.mockResolvedValue([
      info('122639', 'Parag Parikh Flexi Cap Fund - Direct Plan - Growth'),
    ]);
    const { repo, updates } = makeFakeSchemeRepo([
      scheme(1, 'Parag Parikh Flexi Cap Fund - Direct Plan - Growth'),
    ]);

    const result = await autoMatchAmfiCodes({ schemeRepo: repo }, { dryRun: true });

    expect(updates).toEqual([]);
    expect(result.matched).toBe(1);
    expect(result.matches[0].amfiCode).toBe('122639');
  });

  it('skips schemes with no good core match', async () => {
    searchMock.mockResolvedValue([
      info('999999', 'Completely Different Fund Name Here Direct Growth'),
    ]);
    const { repo, updates } = makeFakeSchemeRepo([
      scheme(1, 'Parag Parikh Flexi Cap Fund - Direct Plan - Growth'),
    ]);

    const result = await autoMatchAmfiCodes({ schemeRepo: repo }, { dryRun: false });

    expect(updates).toEqual([]);
    expect(result.matched).toBe(0);
    expect(result.total).toBe(1);
  });

  it('only processes schemes returned by getUnmatchedSchemes', async () => {
    searchMock.mockResolvedValue([
      info('122639', 'Parag Parikh Flexi Cap Fund - Direct Plan - Growth'),
    ]);
    const { repo } = makeFakeSchemeRepo([
      scheme(1, 'Parag Parikh Flexi Cap Fund - Direct Plan - Growth'), // unmatched
      scheme(2, 'Already Matched Fund Direct Growth', '500001'), // has amfi_code
    ]);

    const result = await autoMatchAmfiCodes({ schemeRepo: repo }, { dryRun: true });

    expect(result.total).toBe(1);
    expect(searchMock).toHaveBeenCalledTimes(1);
  });
}, 20000);

describe('verifySchemeNAV', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns true when scheme info is found', async () => {
    schemeInfoMock.mockResolvedValue(info('122639', 'Parag Parikh Flexi Cap'));
    expect(await verifySchemeNAV('122639')).toBe(true);
  });

  it('returns false when info is null', async () => {
    schemeInfoMock.mockResolvedValue(null);
    expect(await verifySchemeNAV('000000')).toBe(false);
  });

  it('returns false when getSchemeInfo throws', async () => {
    schemeInfoMock.mockRejectedValue(new Error('boom'));
    expect(await verifySchemeNAV('000000')).toBe(false);
  });
});
