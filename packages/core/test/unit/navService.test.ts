import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getLatestNAV,
  getNAVForDate,
  getNAVHistory,
  searchSchemes,
  getSchemeInfo,
  clearCache,
} from '../../src/domain/nav/navService';

// Realistic mfapi.in shape. Data is sorted newest-first; dates are DD-MM-YYYY.
const SCHEME_RESPONSE = {
  meta: {
    fund_house: 'PPFAS Mutual Fund',
    scheme_type: 'Open Ended',
    scheme_category: 'Flexi Cap',
    scheme_code: 122639,
    scheme_name: 'Parag Parikh Flexi Cap Fund - Direct Plan - Growth',
  },
  data: [
    { date: '23-05-2026', nav: '123.4567' },
    { date: '22-05-2026', nav: '122.1111' },
    { date: '20-05-2026', nav: '120.5000' },
    { date: '15-05-2026', nav: '118.0000' },
  ],
};

const SEARCH_RESPONSE = [
  { schemeCode: 122639, schemeName: 'Parag Parikh Flexi Cap Fund - Direct Plan - Growth' },
  { schemeCode: 122640, schemeName: 'Parag Parikh Flexi Cap Fund - Regular Plan - Growth' },
];

function jsonResponse(body: unknown, init?: { status?: number; ok?: boolean }) {
  const status = init?.status ?? 200;
  return {
    status,
    ok: init?.ok ?? (status >= 200 && status < 300),
    statusText: 'OK',
    json: async () => body,
  } as unknown as Response;
}

describe('navService', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    clearCache();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('getLatestNAV', () => {
    it('parses the latest (first) data entry nav as a number', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(SCHEME_RESPONSE));
      const nav = await getLatestNAV('122639');
      expect(nav).toBe(123.4567);
      expect(typeof nav).toBe('number');
    });

    it('returns null when the scheme has no data', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ meta: SCHEME_RESPONSE.meta, data: [] }));
      const nav = await getLatestNAV('999999');
      expect(nav).toBeNull();
    });

    it('returns null on a 404', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(null, { status: 404, ok: false }));
      const nav = await getLatestNAV('000000');
      expect(nav).toBeNull();
    });
  });

  describe('getNAVForDate', () => {
    it('converts API DD-MM-YYYY dates and resolves the exact nav for a YYYY-MM-DD date', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(SCHEME_RESPONSE));
      const result = await getNAVForDate('122639', '2026-05-22');
      expect(result).toEqual({ date: '2026-05-22', nav: 122.1111 });
    });

    it('falls back to the closest earlier date when no exact match', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(SCHEME_RESPONSE));
      // 2026-05-21 has no entry; closest earlier is 2026-05-20.
      const result = await getNAVForDate('122639', '2026-05-21');
      expect(result).toEqual({ date: '2026-05-20', nav: 120.5 });
    });

    it('returns null when the target predates all entries', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(SCHEME_RESPONSE));
      const result = await getNAVForDate('122639', '2026-05-01');
      expect(result).toBeNull();
    });
  });

  describe('getNAVHistory', () => {
    it('returns entries in the range sorted oldest-to-newest', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(SCHEME_RESPONSE));
      const history = await getNAVHistory('122639', '2026-05-20', '2026-05-23');
      expect(history).toEqual([
        { date: '2026-05-20', nav: 120.5 },
        { date: '2026-05-22', nav: 122.1111 },
        { date: '2026-05-23', nav: 123.4567 },
      ]);
    });
  });

  describe('in-memory cache', () => {
    it('does not fetch a second time within the TTL', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(SCHEME_RESPONSE));
      const a = await getLatestNAV('122639');
      const b = await getLatestNAV('122639');
      expect(a).toBe(123.4567);
      expect(b).toBe(123.4567);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('clearCache forces a fresh fetch', async () => {
      fetchMock.mockResolvedValue(jsonResponse(SCHEME_RESPONSE));
      await getLatestNAV('122639');
      clearCache();
      await getLatestNAV('122639');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('searchSchemes', () => {
    it('maps API results to SchemeInfo with stringified codes', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(SEARCH_RESPONSE));
      const results = await searchSchemes('Parag Parikh Flexi Cap');
      expect(results).toEqual([
        { amfiCode: '122639', schemeName: SEARCH_RESPONSE[0].schemeName, fundHouse: '', category: '' },
        { amfiCode: '122640', schemeName: SEARCH_RESPONSE[1].schemeName, fundHouse: '', category: '' },
      ]);
    });

    it('returns [] for an empty search term without fetching', async () => {
      const results = await searchSchemes('   ');
      expect(results).toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('getSchemeInfo', () => {
    it('maps meta to SchemeInfo', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(SCHEME_RESPONSE));
      const info = await getSchemeInfo('122639');
      expect(info).toEqual({
        amfiCode: '122639',
        schemeName: SCHEME_RESPONSE.meta.scheme_name,
        fundHouse: 'PPFAS Mutual Fund',
        category: 'Flexi Cap',
      });
    });
  });
});
