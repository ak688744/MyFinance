import type { SQLiteDatabase } from 'expo-sqlite';

import type { ParsedHoldingsData } from './holdingsParser';
import { matchOrCreateScheme } from '../investment/services/schemeService';
import { autoMatchAmfiCodes } from '../investment/amfiMatcher';

export type ImportHoldingsResult = {
  importedCount: number;
  deletedCount: number;
  importHistoryId: number;
  amfiMatched: number;
  amfiTotal: number;
};

/**
 * Imports parsed holdings data into the database with date-range replacement.
 *
 * This function:
 * 1. Deletes existing holdings for the same account/app/date
 * 2. Deletes corresponding import_history record if any
 * 3. Creates new import_history record
 * 4. For each holding, matches or creates scheme, then inserts holding
 *
 * All operations are wrapped in a transaction for atomicity.
 */
export async function importHoldings(
  db: SQLiteDatabase,
  params: {
    accountName: string;
    investmentApp: string;
    parsedData: ParsedHoldingsData;
    fileName?: string;
  }
): Promise<ImportHoldingsResult> {
  const { accountName, investmentApp, parsedData, fileName } = params;
  const { asOfDate, summary, holdings } = parsedData;

  let importedCount = 0;
  let deletedCount = 0;
  let importHistoryId = 0;

  await db.withTransactionAsync(async () => {
    // Step 1: Find existing import_history record(s) for this account/app/date
    const existingImportHistory = await db.getAllAsync<{ id: number }>(
      `
        SELECT id
        FROM investment_import_history
        WHERE account_name = ?
          AND investment_app = ?
          AND import_type = 'holdings'
          AND start_date = ?
          AND end_date = ?
      `,
      accountName,
      investmentApp,
      asOfDate,
      asOfDate
    );

    // Step 2: Delete existing holdings for this account/app/date
    const deleteResult = await db.runAsync(
      `
        DELETE FROM investment_holdings
        WHERE account_name = ?
          AND investment_app = ?
          AND as_of_date = ?
      `,
      accountName,
      investmentApp,
      asOfDate
    );
    deletedCount = deleteResult.changes;

    // Step 3: Delete existing import_history records
    for (const historyRecord of existingImportHistory) {
      await db.runAsync(
        `DELETE FROM investment_import_history WHERE id = ?`,
        historyRecord.id
      );
    }

    // Step 4: Create new import_history record
    const importHistoryResult = await db.runAsync(
      `
        INSERT INTO investment_import_history (
          account_name,
          investment_app,
          import_type,
          file_name,
          start_date,
          end_date,
          record_count,
          total_invested,
          total_current_value,
          total_xirr,
          holder_name,
          holder_pan
        )
        VALUES (?, ?, 'holdings', ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      accountName,
      investmentApp,
      fileName ?? null,
      asOfDate,
      asOfDate,
      holdings.length,
      summary.totalInvested,
      summary.totalCurrentValue,
      summary.totalXirr,
      summary.holderName ?? null,
      summary.holderPan ?? null
    );
    importHistoryId = importHistoryResult.lastInsertRowId;

    // Step 5: For each holding, match/create scheme and insert holding
    for (const holding of holdings) {
      // Match or create scheme
      const schemeId = await matchOrCreateScheme(db, {
        schemeName: holding.schemeName,
        amcName: holding.amcName || undefined,
        category: holding.category,
        subCategory: holding.subCategory || undefined,
      });

      // Insert holding record
      await db.runAsync(
        `
          INSERT INTO investment_holdings (
            import_history_id,
            scheme_id,
            account_name,
            investment_app,
            scheme_name,
            folio_number,
            units,
            invested_value,
            current_value,
            returns_amount,
            returns_xirr,
            as_of_date
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        importHistoryId,
        schemeId,
        accountName,
        investmentApp,
        holding.schemeName,
        holding.folioNumber || null,
        holding.units,
        holding.investedValue,
        holding.currentValue,
        holding.returnsAmount,
        holding.returnsXirr,
        asOfDate
      );

      importedCount++;
    }
  });

  // Post-import: auto-match AMFI codes for any schemes without them.
  // Best-effort — failures here shouldn't fail the import.
  // Small delay to let the DB transaction fully settle before network calls.
  let amfiMatched = 0;
  let amfiTotal = 0;
  try {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const result = await autoMatchAmfiCodes(db);
    amfiMatched = result.matched;
    amfiTotal = result.total;
  } catch (error) {
    console.warn('AMFI auto-match failed:', error);
  }

  return {
    importedCount,
    deletedCount,
    importHistoryId,
    amfiMatched,
    amfiTotal,
  };
}
