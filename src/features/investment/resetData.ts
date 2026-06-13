import type { SQLiteDatabase } from 'expo-sqlite';
import { Alert } from 'react-native';

/**
 * Delete all investment data — schemes, holdings, transactions, import history.
 */
export async function resetAllInvestmentData(db: SQLiteDatabase): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM investment_transactions');
    await db.runAsync('DELETE FROM investment_holdings');
    await db.runAsync('DELETE FROM investment_import_history');
    await db.runAsync('DELETE FROM investment_schemes');
  });
  console.log('[resetData] All investment data deleted.');
}

/**
 * Delete all finance data — transactions, rules, merchants, categories.
 */
export async function resetAllFinanceData(db: SQLiteDatabase): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM transactions');
    await db.runAsync('DELETE FROM categorization_rules');
  });
  console.log('[resetData] All finance data deleted.');
}

/**
 * Shows a confirmation alert then resets investment data.
 * Wire to a long-press on the screen title.
 */
export function confirmResetInvestments(db: SQLiteDatabase, onDone?: () => void): void {
  Alert.alert(
    'Reset Investment Data',
    'This will delete ALL investment schemes, holdings, transactions, and import history. This cannot be undone.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete All',
        style: 'destructive',
        onPress: async () => {
          await resetAllInvestmentData(db);
          onDone?.();
        },
      },
    ]
  );
}

/**
 * Shows a confirmation alert then resets finance data.
 * Wire to a long-press on the screen title.
 */
export function confirmResetFinances(db: SQLiteDatabase, onDone?: () => void): void {
  Alert.alert(
    'Reset Finance Data',
    'This will delete ALL bank transactions and categorization rules. This cannot be undone.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete All',
        style: 'destructive',
        onPress: async () => {
          await resetAllFinanceData(db);
          onDone?.();
        },
      },
    ]
  );
}

/**
 * Delete only transactions (keeps holdings and schemes).
 */
export async function resetTransactions(db: SQLiteDatabase): Promise<void> {
  await db.runAsync('DELETE FROM investment_transactions');
  console.log('[resetData] All transactions deleted.');
}

/**
 * Delete only holdings (keeps transactions and schemes).
 */
export async function resetHoldings(db: SQLiteDatabase): Promise<void> {
  await db.runAsync('DELETE FROM investment_holdings');
  await db.runAsync("DELETE FROM investment_import_history WHERE import_type = 'holdings'");
  console.log('[resetData] All holdings deleted.');
}

/**
 * Reset AMFI codes on all schemes (forces re-match on next import).
 */
export async function resetAmfiCodes(db: SQLiteDatabase): Promise<void> {
  await db.runAsync('UPDATE investment_schemes SET amfi_code = NULL');
  console.log('[resetData] All AMFI codes cleared.');
}
