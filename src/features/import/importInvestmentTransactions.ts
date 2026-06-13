import type { SQLiteDatabase } from 'expo-sqlite';

import { findSchemeByName } from '../investment/services/schemeService';
import type { ParsedTransactionData } from './transactionParser';

export type ImportTransactionsResult =
  | {
      status: 'success';
      importedCount: number;
      deletedCount: number;
      importHistoryId: number;
    }
  | {
      status: 'unmatched_schemes';
      unmatchedSchemes: string[];
    };

/**
 * Import parsed transaction data into the database.
 *
 * Strategy:
 * 1. Pre-flight: Resolve every transaction's scheme via findSchemeByName.
 *    If any scheme is missing, abort and return the list of unmatched names
 *    so the user can import holdings first.
 * 2. Delete existing transactions in the date range for this account/app.
 * 3. Insert all transactions using the resolved scheme_ids.
 *
 * Duplicate transactions in the file (same scheme, date, amount) are valid
 * separate SIPs and will all be inserted.
 */
export async function importInvestmentTransactions(
  db: SQLiteDatabase,
  params: {
    accountName: string;
    investmentApp: string;
    parsedData: ParsedTransactionData;
    fileName?: string;
  }
): Promise<ImportTransactionsResult> {
  const { accountName, investmentApp, parsedData, fileName } = params;
  const { startDate, endDate, holderName, holderPan, transactions } =
    parsedData;

  // Pre-flight: resolve every scheme before touching the DB
  const schemeIdByName = new Map<string, number>();
  const unmatched = new Set<string>();

  for (const tx of transactions) {
    if (schemeIdByName.has(tx.schemeName) || unmatched.has(tx.schemeName)) {
      continue;
    }
    const scheme = await findSchemeByName(db, tx.schemeName);
    if (scheme) {
      schemeIdByName.set(tx.schemeName, scheme.id);
    } else {
      unmatched.add(tx.schemeName);
    }
  }

  if (unmatched.size > 0) {
    return {
      status: 'unmatched_schemes',
      unmatchedSchemes: Array.from(unmatched).sort(),
    };
  }

  let deletedCount = 0;
  let importedCount = 0;
  let importHistoryId = 0;

  await db.withTransactionAsync(async () => {
    const deleteResult = await db.runAsync(
      `
        DELETE FROM investment_transactions
        WHERE account_name = ?
          AND investment_app = ?
          AND transaction_date BETWEEN ? AND ?
      `,
      accountName,
      investmentApp,
      startDate,
      endDate
    );
    deletedCount = deleteResult.changes;

    const importResult = await db.runAsync(
      `
        INSERT INTO investment_import_history (
          account_name,
          investment_app,
          import_type,
          file_name,
          start_date,
          end_date,
          record_count,
          holder_name,
          holder_pan
        )
        VALUES (?, ?, 'transactions', ?, ?, ?, ?, ?, ?)
      `,
      accountName,
      investmentApp,
      fileName ?? null,
      startDate,
      endDate,
      transactions.length,
      holderName ?? null,
      holderPan ?? null
    );
    importHistoryId = importResult.lastInsertRowId;

    for (const transaction of transactions) {
      const schemeId = schemeIdByName.get(transaction.schemeName)!;

      await db.runAsync(
        `
          INSERT INTO investment_transactions (
            scheme_id,
            account_name,
            investment_app,
            scheme_name,
            transaction_type,
            units,
            nav,
            amount,
            transaction_date
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        schemeId,
        accountName,
        investmentApp,
        transaction.schemeName,
        transaction.transactionType,
        transaction.units,
        transaction.nav,
        transaction.amount,
        transaction.transactionDate
      );

      importedCount++;
    }
  });

  return {
    status: 'success',
    importedCount,
    deletedCount,
    importHistoryId,
  };
}
