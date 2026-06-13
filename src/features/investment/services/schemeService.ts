import type { SQLiteDatabase } from 'expo-sqlite';

export type Scheme = {
  id: number;
  schemeName: string;
  amfiCode: string | null;
  isin: string | null;
  amcName: string | null;
  category: 'equity' | 'debt' | 'hybrid' | 'other' | null;
  subCategory: string | null;
};

type SchemeRow = {
  id: number;
  scheme_name: string;
  amfi_code: string | null;
  isin: string | null;
  amc_name: string | null;
  category: 'equity' | 'debt' | 'hybrid' | 'other' | null;
  sub_category: string | null;
};

function mapRowToScheme(row: SchemeRow): Scheme {
  return {
    id: row.id,
    schemeName: row.scheme_name,
    amfiCode: row.amfi_code,
    isin: row.isin,
    amcName: row.amc_name,
    category: row.category,
    subCategory: row.sub_category,
  };
}

/**
 * Find existing scheme or create new one, return scheme_id
 *
 * Matching logic:
 * 1. Try exact match on scheme_name + amc_name (both non-null)
 * 2. If amc_name is null, try match on scheme_name only
 * 3. If no match found, INSERT new scheme
 */
export async function matchOrCreateScheme(
  db: SQLiteDatabase,
  params: {
    schemeName: string;
    amcName?: string;
    category?: 'equity' | 'debt' | 'hybrid' | 'other';
    subCategory?: string;
  }
): Promise<number> {
  const { schemeName, amcName, category, subCategory } = params;

  let existingScheme: SchemeRow | null = null;

  if (amcName) {
    // Try exact match on scheme_name + amc_name
    existingScheme = await db.getFirstAsync<SchemeRow>(
      `
        SELECT id, scheme_name, amfi_code, isin, amc_name, category, sub_category
        FROM investment_schemes
        WHERE scheme_name = ? AND amc_name = ?
      `,
      schemeName,
      amcName
    );
  } else {
    // Try match on scheme_name only when amc_name is null
    existingScheme = await db.getFirstAsync<SchemeRow>(
      `
        SELECT id, scheme_name, amfi_code, isin, amc_name, category, sub_category
        FROM investment_schemes
        WHERE scheme_name = ? AND amc_name IS NULL
      `,
      schemeName
    );
  }

  if (existingScheme) {
    return existingScheme.id;
  }

  // No match found, insert new scheme
  const result = await db.runAsync(
    `
      INSERT INTO investment_schemes (scheme_name, amc_name, category, sub_category)
      VALUES (?, ?, ?, ?)
    `,
    schemeName,
    amcName ?? null,
    category ?? null,
    subCategory ?? null
  );

  return result.lastInsertRowId;
}

/**
 * Search/filter schemes
 */
export async function getSchemes(
  db: SQLiteDatabase,
  filters?: {
    category?: 'equity' | 'debt' | 'hybrid' | 'other';
    amc?: string;
    search?: string;
  }
): Promise<Scheme[]> {
  const conditions: string[] = [];
  const params: (string | null)[] = [];

  if (filters?.category) {
    conditions.push('category = ?');
    params.push(filters.category);
  }

  if (filters?.amc) {
    conditions.push('amc_name = ?');
    params.push(filters.amc);
  }

  if (filters?.search) {
    conditions.push('scheme_name LIKE ?');
    params.push(`%${filters.search}%`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = await db.getAllAsync<SchemeRow>(
    `
      SELECT id, scheme_name, amfi_code, isin, amc_name, category, sub_category
      FROM investment_schemes
      ${whereClause}
      ORDER BY scheme_name ASC
    `,
    ...params
  );

  return rows.map(mapRowToScheme);
}

/**
 * Find a scheme by its name only (ignoring AMC).
 * Used by transaction import to validate that a holdings import has already
 * created the scheme record.
 */
export async function findSchemeByName(
  db: SQLiteDatabase,
  schemeName: string
): Promise<Scheme | null> {
  const row = await db.getFirstAsync<SchemeRow>(
    `
      SELECT id, scheme_name, amfi_code, isin, amc_name, category, sub_category
      FROM investment_schemes
      WHERE scheme_name = ?
    `,
    schemeName
  );
  return row ? mapRowToScheme(row) : null;
}

/**
 * Update scheme with AMFI code (for NAV API linking)
 */
export async function updateSchemeAmfiCode(
  db: SQLiteDatabase,
  schemeId: number,
  amfiCode: string
): Promise<void> {
  await db.runAsync(
    `
      UPDATE investment_schemes
      SET amfi_code = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    amfiCode,
    schemeId
  );
}

/**
 * Get scheme by ID
 */
export async function getSchemeById(
  db: SQLiteDatabase,
  schemeId: number
): Promise<Scheme | null> {
  const row = await db.getFirstAsync<SchemeRow>(
    `
      SELECT id, scheme_name, amfi_code, isin, amc_name, category, sub_category
      FROM investment_schemes
      WHERE id = ?
    `,
    schemeId
  );

  if (!row) {
    return null;
  }

  return mapRowToScheme(row);
}
