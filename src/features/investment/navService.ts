/**
 * NAV Service for fetching mutual fund NAV data from mfapi.in
 */

const BASE_URL = 'https://api.mfapi.in/mf';

// Types
export type NAVData = {
  date: string; // YYYY-MM-DD format
  nav: number;
};

export type SchemeInfo = {
  amfiCode: string;
  schemeName: string;
  fundHouse: string;
  category: string;
};

type APINavEntry = {
  date: string; // DD-MM-YYYY format from API
  nav: string;
};

type APISchemeResponse = {
  meta: {
    fund_house: string;
    scheme_type: string;
    scheme_category: string;
    scheme_code: number;
    scheme_name: string;
  };
  data: APINavEntry[];
};

type APISearchResult = {
  schemeCode: number;
  schemeName: string;
};

// Simple in-memory cache
const schemeCache = new Map<string, { data: APISchemeResponse; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Convert date from DD-MM-YYYY (API format) to YYYY-MM-DD (standard format)
 */
function convertDateToISO(ddmmyyyy: string): string {
  const [day, month, year] = ddmmyyyy.split('-');
  return `${year}-${month}-${day}`;
}

/**
 * Convert date from YYYY-MM-DD to DD-MM-YYYY (API format)
 */
function convertDateToAPI(yyyymmdd: string): string {
  const [year, month, day] = yyyymmdd.split('-');
  return `${day}-${month}-${year}`;
}

/**
 * Parse a YYYY-MM-DD date string to a Date object
 */
function parseDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Fetch scheme data with caching
 */
async function fetchSchemeData(amfiCode: string): Promise<APISchemeResponse | null> {
  // Check cache
  const cached = schemeCache.get(amfiCode);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const response = await fetch(`${BASE_URL}/${amfiCode}`);

    if (response.status === 404) {
      console.warn(`Scheme not found: ${amfiCode}`);
      return null;
    }

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data: APISchemeResponse = await response.json();

    // Cache the result
    schemeCache.set(amfiCode, { data, timestamp: Date.now() });

    return data;
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Failed to fetch NAV data for ${amfiCode}: ${error.message}`);
    }
    throw new Error(`Network error while fetching scheme ${amfiCode}`);
  }
}

/**
 * Fetch latest NAV for a scheme
 * @param amfiCode - The AMFI code of the mutual fund scheme
 * @returns The latest NAV value or null if not found
 */
export async function getLatestNAV(amfiCode: string): Promise<number | null> {
  const schemeData = await fetchSchemeData(amfiCode);

  if (!schemeData || !schemeData.data || schemeData.data.length === 0) {
    return null;
  }

  // Data is sorted newest first, so first entry is latest
  const latestEntry = schemeData.data[0];
  return parseFloat(latestEntry.nav);
}

/**
 * Fetch NAV for a specific date (finds closest available date if exact match not found)
 * @param amfiCode - The AMFI code of the mutual fund scheme
 * @param date - The date in YYYY-MM-DD format
 * @returns NAV data for the date or closest earlier date, or null if not found
 */
export async function getNAVForDate(
  amfiCode: string,
  date: string // YYYY-MM-DD
): Promise<NAVData | null> {
  const schemeData = await fetchSchemeData(amfiCode);

  if (!schemeData || !schemeData.data || schemeData.data.length === 0) {
    return null;
  }

  const targetDate = parseDate(date);

  // Data is sorted newest first, find exact match or closest earlier date
  let closestEntry: APINavEntry | null = null;

  for (const entry of schemeData.data) {
    const entryDateISO = convertDateToISO(entry.date);
    const entryDate = parseDate(entryDateISO);

    // Exact match
    if (entryDateISO === date) {
      return {
        date: entryDateISO,
        nav: parseFloat(entry.nav),
      };
    }

    // If entry date is before or equal to target date, it's a candidate
    if (entryDate <= targetDate) {
      closestEntry = entry;
      break; // Since data is sorted newest first, first earlier date is closest
    }
  }

  if (closestEntry) {
    return {
      date: convertDateToISO(closestEntry.date),
      nav: parseFloat(closestEntry.nav),
    };
  }

  return null;
}

/**
 * Fetch NAV history for a date range
 * @param amfiCode - The AMFI code of the mutual fund scheme
 * @param startDate - Start date in YYYY-MM-DD format (inclusive)
 * @param endDate - End date in YYYY-MM-DD format (inclusive)
 * @returns Array of NAV data within the date range, sorted oldest to newest
 */
export async function getNAVHistory(
  amfiCode: string,
  startDate: string, // YYYY-MM-DD
  endDate: string // YYYY-MM-DD
): Promise<NAVData[]> {
  const schemeData = await fetchSchemeData(amfiCode);

  if (!schemeData || !schemeData.data || schemeData.data.length === 0) {
    return [];
  }

  const start = parseDate(startDate);
  const end = parseDate(endDate);

  const result: NAVData[] = [];

  for (const entry of schemeData.data) {
    const entryDateISO = convertDateToISO(entry.date);
    const entryDate = parseDate(entryDateISO);

    // Check if entry is within date range
    if (entryDate >= start && entryDate <= end) {
      result.push({
        date: entryDateISO,
        nav: parseFloat(entry.nav),
      });
    }

    // Since data is sorted newest first, stop if we've gone past start date
    if (entryDate < start) {
      break;
    }
  }

  // Return sorted oldest to newest
  return result.reverse();
}

/**
 * Search schemes by name (for AMFI code lookup)
 * @param searchTerm - The search term to find matching schemes
 * @returns Array of matching scheme info
 */
export async function searchSchemes(searchTerm: string): Promise<SchemeInfo[]> {
  if (!searchTerm || searchTerm.trim().length === 0) {
    return [];
  }

  try {
    const encodedQuery = encodeURIComponent(searchTerm.trim());
    const response = await fetch(`${BASE_URL}/search?q=${encodedQuery}`);

    if (!response.ok) {
      return [];
    }

    const results: APISearchResult[] = await response.json();

    return results.map((result) => ({
      amfiCode: result.schemeCode.toString(),
      schemeName: result.schemeName,
      fundHouse: '',
      category: '',
    }));
  } catch (error) {
    if (error instanceof Error) {
      console.warn(`[navService] searchSchemes failed: ${error.message}`);
    }
    return [];
  }
}

/**
 * Get full scheme info including fund house and category
 * @param amfiCode - The AMFI code of the mutual fund scheme
 * @returns Full scheme info or null if not found
 */
export async function getSchemeInfo(amfiCode: string): Promise<SchemeInfo | null> {
  const schemeData = await fetchSchemeData(amfiCode);

  if (!schemeData || !schemeData.meta) {
    return null;
  }

  return {
    amfiCode: schemeData.meta.scheme_code.toString(),
    schemeName: schemeData.meta.scheme_name,
    fundHouse: schemeData.meta.fund_house,
    category: schemeData.meta.scheme_category,
  };
}

/**
 * Clear the scheme cache (useful for testing or forcing fresh data)
 */
export function clearCache(): void {
  schemeCache.clear();
}
