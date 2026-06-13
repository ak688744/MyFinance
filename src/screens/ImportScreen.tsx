import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { importHoldings } from '../features/import/importHoldings';
import { parseGrowwHoldingsXls } from '../features/import/holdingsParser';
import { importInvestmentTransactions } from '../features/import/importInvestmentTransactions';
import { parseGrowwTransactionXls } from '../features/import/transactionParser';
import { autoMatchAmfiCodes } from '../features/investment/amfiMatcher';
import { confirmResetFinances, confirmResetInvestments } from '../features/investment/resetData';
import { palette } from '../theme/palette';

type ImportScreenProps = {
  isImporting: boolean;
  importMessage: string;
  onImportPress: () => void;
};

type HoldingsPreview = {
  asOfDate: string;
  count: number;
  totalInvested: number;
  totalCurrentValue: number;
};

type TransactionsPreview = {
  startDate: string;
  endDate: string;
  count: number;
};

type InvestmentStep = 1 | 2;

export function ImportScreen({
  isImporting,
  importMessage,
  onImportPress,
}: ImportScreenProps) {
  const db = useSQLiteContext();

  // Shared across the two-step flow
  const [accountName, setAccountName] = useState('');
  const [investmentApp, setInvestmentApp] = useState('groww');
  const [step, setStep] = useState<InvestmentStep>(1);

  // Step 1: Holdings
  const [isImportingHoldings, setIsImportingHoldings] = useState(false);
  const [holdingsMessage, setHoldingsMessage] = useState('');
  const [holdingsPreview, setHoldingsPreview] = useState<HoldingsPreview | null>(null);
  const [holdingsParsedData, setHoldingsParsedData] = useState<ReturnType<typeof parseGrowwHoldingsXls> | null>(null);
  const [holdingsFileName, setHoldingsFileName] = useState<string | null>(null);

  // Step 2: Transactions
  const [isImportingTransactions, setIsImportingTransactions] = useState(false);
  const [transactionsMessage, setTransactionsMessage] = useState('');
  const [transactionsPreview, setTransactionsPreview] = useState<TransactionsPreview | null>(null);
  const [transactionsParsedData, setTransactionsParsedData] = useState<ReturnType<typeof parseGrowwTransactionXls> | null>(null);
  const [transactionsFileName, setTransactionsFileName] = useState<string | null>(null);
  const [unmatchedSchemes, setUnmatchedSchemes] = useState<string[]>([]);

  // AMFI matching
  const [isMatchingAmfi, setIsMatchingAmfi] = useState(false);
  const [amfiMatchMessage, setAmfiMatchMessage] = useState('');

  function resetInvestmentFlow() {
    setStep(1);
    setHoldingsMessage('');
    setHoldingsPreview(null);
    setHoldingsParsedData(null);
    setHoldingsFileName(null);
    setTransactionsMessage('');
    setTransactionsPreview(null);
    setTransactionsParsedData(null);
    setTransactionsFileName(null);
    setUnmatchedSchemes([]);
  }

  async function handlePickHoldingsFile() {
    try {
      setIsImportingHoldings(true);
      setHoldingsMessage('Waiting for file selection...');
      setHoldingsPreview(null);
      setHoldingsParsedData(null);
      setHoldingsFileName(null);

      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/octet-stream',
          '*/*',
        ],
        multiple: false,
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) {
        setHoldingsMessage('File selection cancelled.');
        setIsImportingHoldings(false);
        return;
      }

      const asset = result.assets[0];
      const pickedFile = new File(asset.uri);
      const fileBuffer = await pickedFile.arrayBuffer();
      const parsed = parseGrowwHoldingsXls(fileBuffer, asset.name);

      setHoldingsParsedData(parsed);
      setHoldingsFileName(asset.name);
      setHoldingsPreview({
        asOfDate: parsed.asOfDate,
        count: parsed.holdings.length,
        totalInvested: parsed.summary.totalInvested,
        totalCurrentValue: parsed.summary.totalCurrentValue,
      });
      setHoldingsMessage(`Parsed ${parsed.holdings.length} holdings as of ${parsed.asOfDate}. Ready to import.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setHoldingsMessage(`Parse failed: ${message}`);
      setHoldingsPreview(null);
      setHoldingsParsedData(null);
    } finally {
      setIsImportingHoldings(false);
    }
  }

  async function handleImportHoldings() {
    if (!holdingsParsedData || !accountName.trim()) {
      setHoldingsMessage('Please enter an account name and select a file first.');
      return;
    }

    try {
      setIsImportingHoldings(true);
      setHoldingsMessage('Importing holdings...');

      const result = await importHoldings(db, {
        accountName: accountName.trim(),
        investmentApp,
        parsedData: holdingsParsedData,
        fileName: holdingsFileName ?? undefined,
      });

      const replacedNote = result.deletedCount > 0
        ? ` Replaced ${result.deletedCount} existing records.`
        : '';
      const amfiNote = result.amfiTotal > 0
        ? ` Linked NAV data for ${result.amfiMatched}/${result.amfiTotal} new schemes.`
        : '';
      setHoldingsMessage(
        `Imported ${result.importedCount} holdings.${replacedNote}${amfiNote} Continue to Step 2 to import transactions.`
      );
      setStep(2);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setHoldingsMessage(`Import failed: ${message}`);
    } finally {
      setIsImportingHoldings(false);
    }
  }

  async function handlePickTransactionsFile() {
    try {
      setIsImportingTransactions(true);
      setTransactionsMessage('Waiting for file selection...');
      setTransactionsPreview(null);
      setTransactionsParsedData(null);
      setTransactionsFileName(null);
      setUnmatchedSchemes([]);

      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/octet-stream',
          '*/*',
        ],
        multiple: false,
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) {
        setTransactionsMessage('File selection cancelled.');
        setIsImportingTransactions(false);
        return;
      }

      const asset = result.assets[0];
      const pickedFile = new File(asset.uri);
      const fileBuffer = await pickedFile.arrayBuffer();
      const parsed = parseGrowwTransactionXls(fileBuffer);

      setTransactionsParsedData(parsed);
      setTransactionsFileName(asset.name);
      setTransactionsPreview({
        startDate: parsed.startDate,
        endDate: parsed.endDate,
        count: parsed.transactions.length,
      });
      setTransactionsMessage(
        `Parsed ${parsed.transactions.length} transactions from ${parsed.startDate} to ${parsed.endDate}. Ready to import.`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setTransactionsMessage(`Parse failed: ${message}`);
      setTransactionsPreview(null);
      setTransactionsParsedData(null);
    } finally {
      setIsImportingTransactions(false);
    }
  }

  async function handleImportTransactions() {
    if (!transactionsParsedData || !accountName.trim()) {
      setTransactionsMessage('Please enter an account name and select a file first.');
      return;
    }

    try {
      setIsImportingTransactions(true);
      setTransactionsMessage('Importing transactions...');
      setUnmatchedSchemes([]);

      const result = await importInvestmentTransactions(db, {
        accountName: accountName.trim(),
        investmentApp,
        parsedData: transactionsParsedData,
        fileName: transactionsFileName ?? undefined,
      });

      if (result.status === 'unmatched_schemes') {
        setUnmatchedSchemes(result.unmatchedSchemes);
        setTransactionsMessage(
          `Cannot import: ${result.unmatchedSchemes.length} scheme(s) in this file are not present in your holdings. Import an up-to-date holdings file first.`
        );
        return;
      }

      setTransactionsMessage(
        `Imported ${result.importedCount} transactions.${result.deletedCount > 0 ? ` Replaced ${result.deletedCount} existing records in date range.` : ''}`
      );
      setTransactionsPreview(null);
      setTransactionsParsedData(null);
      setTransactionsFileName(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setTransactionsMessage(`Import failed: ${message}`);
    } finally {
      setIsImportingTransactions(false);
    }
  }

  async function handleMatchAmfiCodes() {
    try {
      setIsMatchingAmfi(true);
      setAmfiMatchMessage('Re-matching all schemes with AMFI codes...');

      const result = await autoMatchAmfiCodes(db, { force: true });

      if (result.matched > 0) {
        setAmfiMatchMessage(
          `Re-matched ${result.matched} of ${result.total} schemes with AMFI codes. NAV data will now reflect the latest matches.`
        );
      } else if (result.total === 0) {
        setAmfiMatchMessage('No schemes found to match.');
      } else {
        setAmfiMatchMessage(
          `Could not find AMFI code matches for ${result.total} schemes. You may need to match them manually.`
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setAmfiMatchMessage(`Matching failed: ${message}`);
    } finally {
      setIsMatchingAmfi(false);
    }
  }

  function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  }

  return (
    <>
      <View style={styles.screenHeader}>
        <Text style={styles.screenTitle}>Import</Text>
        <Text style={styles.screenSubtitle}>
          Import bank statements and investment data
        </Text>
      </View>

      {/* Bank Statement Import Section */}
      <View style={styles.section}>
        <View style={styles.importInfoRow}>
          <View style={styles.importIconBadge}>
            <Text style={styles.iconGlyph}>B</Text>
          </View>
          <View style={styles.importInfoCopy}>
            <Text style={styles.sectionTitleSmall}>Bank Statement</Text>
            <Text style={styles.bodyText}>
              Import HDFC bank statements to track your transactions.
            </Text>
            <Text style={styles.helperText}>
              Supported: HDFC Excel statements (.xls)
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Pressable
          onPress={onImportPress}
          style={[styles.importButton, isImporting && styles.importButtonBusy]}
          disabled={isImporting}
        >
          <Text style={styles.importButtonText}>
            {isImporting ? 'Importing...' : 'Select Bank Statement'}
          </Text>
        </Pressable>
        <Text style={styles.importStatus}>{importMessage}</Text>
      </View>

      {/* Import Investments — 2-step guided flow */}
      <View style={styles.section}>
        <View style={styles.importInfoRow}>
          <View style={[styles.importIconBadge, styles.holdingsIconBadge]}>
            <Text style={styles.iconGlyph}>I</Text>
          </View>
          <View style={styles.importInfoCopy}>
            <Text style={styles.sectionTitleSmall}>Import Investments</Text>
            <Text style={styles.bodyText}>
              Import mutual fund holdings and transactions from Groww.
            </Text>
            <Text style={styles.helperText}>
              Step 1: Holdings snapshot  ·  Step 2: Transaction history
            </Text>
          </View>
        </View>

        <View style={styles.stepperRow}>
          <View style={[styles.stepPill, step === 1 && styles.stepPillActive]}>
            <Text style={[styles.stepPillText, step === 1 && styles.stepPillTextActive]}>
              1. Holdings
            </Text>
          </View>
          <View style={styles.stepDivider} />
          <View style={[styles.stepPill, step === 2 && styles.stepPillActive]}>
            <Text style={[styles.stepPillText, step === 2 && styles.stepPillTextActive]}>
              2. Transactions
            </Text>
          </View>
        </View>

        <Text style={styles.fieldLabel}>Account Name</Text>
        <TextInput
          style={styles.textInput}
          value={accountName}
          onChangeText={setAccountName}
          placeholder="e.g., My Groww Account"
          placeholderTextColor={palette.mutedText}
        />

        <Text style={styles.fieldLabel}>Investment App</Text>
        <View style={styles.appSelectorRow}>
          <Pressable
            style={[
              styles.appOption,
              investmentApp === 'groww' && styles.appOptionSelected,
            ]}
            onPress={() => setInvestmentApp('groww')}
          >
            <Text
              style={[
                styles.appOptionText,
                investmentApp === 'groww' && styles.appOptionTextSelected,
              ]}
            >
              Groww
            </Text>
          </Pressable>
        </View>

        {step === 1 && (
          <>
            <Text style={styles.stepHeading}>Step 1 — Holdings</Text>
            <Text style={styles.helperText}>
              Select your Groww Holdings Statement (.xls/.xlsx). This creates the scheme records that transactions will link against.
            </Text>

            <Pressable
              onPress={handlePickHoldingsFile}
              style={[styles.importButton, styles.secondaryButton, isImportingHoldings && styles.importButtonBusy]}
              disabled={isImportingHoldings}
            >
              <Text style={[styles.importButtonText, styles.secondaryButtonText]}>
                {isImportingHoldings ? 'Reading...' : 'Select Holdings File'}
              </Text>
            </Pressable>

            {holdingsPreview && (
              <View style={styles.previewCard}>
                <Text style={styles.previewTitle}>Preview</Text>
                <Text style={styles.previewText}>As of: {holdingsPreview.asOfDate}</Text>
                <Text style={styles.previewText}>Holdings: {holdingsPreview.count}</Text>
                <Text style={styles.previewText}>
                  Invested: {formatCurrency(holdingsPreview.totalInvested)}
                </Text>
                <Text style={styles.previewText}>
                  Current: {formatCurrency(holdingsPreview.totalCurrentValue)}
                </Text>
              </View>
            )}

            {holdingsParsedData && (
              <>
                {!accountName.trim() && (
                  <Text style={styles.warningText}>
                    Enter an account name above to enable import.
                  </Text>
                )}
                <Pressable
                  onPress={handleImportHoldings}
                  style={[styles.importButton, isImportingHoldings && styles.importButtonBusy, !accountName.trim() && styles.importButtonDisabled]}
                  disabled={isImportingHoldings || !accountName.trim()}
                >
                  <Text style={styles.importButtonText}>
                    {isImportingHoldings ? 'Importing...' : 'Import Holdings & Continue'}
                  </Text>
                </Pressable>
              </>
            )}

            {holdingsMessage ? (
              <Text style={styles.importStatus}>{holdingsMessage}</Text>
            ) : null}
          </>
        )}

        {step === 2 && (
          <>
            <Text style={styles.stepHeading}>Step 2 — Transactions</Text>
            <Text style={styles.helperText}>
              Select your Groww Transaction History (.xls/.xlsx). Every scheme in the file must already exist from Step 1, otherwise the import will be blocked.
            </Text>

            <Pressable
              onPress={handlePickTransactionsFile}
              style={[styles.importButton, styles.secondaryButton, isImportingTransactions && styles.importButtonBusy]}
              disabled={isImportingTransactions}
            >
              <Text style={[styles.importButtonText, styles.secondaryButtonText]}>
                {isImportingTransactions ? 'Reading...' : 'Select Transactions File'}
              </Text>
            </Pressable>

            {transactionsPreview && (
              <View style={styles.previewCard}>
                <Text style={styles.previewTitle}>Preview</Text>
                <Text style={styles.previewText}>
                  Date Range: {transactionsPreview.startDate} to {transactionsPreview.endDate}
                </Text>
                <Text style={styles.previewText}>
                  Transactions: {transactionsPreview.count}
                </Text>
              </View>
            )}

            {transactionsParsedData && (
              <Pressable
                onPress={handleImportTransactions}
                style={[styles.importButton, isImportingTransactions && styles.importButtonBusy]}
                disabled={isImportingTransactions || !accountName.trim()}
              >
                <Text style={styles.importButtonText}>
                  {isImportingTransactions ? 'Importing...' : 'Import Transactions'}
                </Text>
              </Pressable>
            )}

            {unmatchedSchemes.length > 0 && (
              <View style={styles.errorCard}>
                <Text style={styles.errorTitle}>Missing Schemes</Text>
                <Text style={styles.errorBody}>
                  These {unmatchedSchemes.length} scheme(s) aren't in your holdings yet. Re-import a newer holdings file that includes them, then retry.
                </Text>
                {unmatchedSchemes.map((name) => (
                  <Text key={name} style={styles.errorItem}>
                    • {name}
                  </Text>
                ))}
              </View>
            )}

            {transactionsMessage ? (
              <Text style={styles.importStatus}>{transactionsMessage}</Text>
            ) : null}

            <Pressable onPress={resetInvestmentFlow} style={styles.linkButton}>
              <Text style={styles.linkButtonText}>Start Over</Text>
            </Pressable>
          </>
        )}
      </View>

      {/* AMFI Code Matching Section */}
      <View style={styles.section}>
        <View style={styles.importInfoRow}>
          <View style={[styles.importIconBadge, styles.amfiIconBadge]}>
            <Text style={styles.iconGlyph}>N</Text>
          </View>
          <View style={styles.importInfoCopy}>
            <Text style={styles.sectionTitleSmall}>Re-link NAV Data</Text>
            <Text style={styles.bodyText}>
              NAV codes are linked automatically during holdings import. Use this only to retry schemes that failed to match.
            </Text>
          </View>
        </View>

        <Pressable
          onPress={handleMatchAmfiCodes}
          style={[styles.importButton, styles.secondaryButton, isMatchingAmfi && styles.importButtonBusy]}
          disabled={isMatchingAmfi}
        >
          <Text style={[styles.importButtonText, styles.secondaryButtonText]}>
            {isMatchingAmfi ? 'Matching...' : 'Retry AMFI Matching'}
          </Text>
        </Pressable>

        {amfiMatchMessage ? (
          <Text style={styles.importStatus}>{amfiMatchMessage}</Text>
        ) : null}
      </View>

      {/* Danger Zone */}
      <View style={[styles.section, styles.dangerSection]}>
        <Text style={styles.dangerTitle}>Danger Zone</Text>
        <Text style={styles.helperText}>
          Permanently delete all data. This cannot be undone.
        </Text>

        <Pressable
          onPress={() => confirmResetFinances(db)}
          style={[styles.importButton, styles.dangerButton]}
        >
          <Text style={styles.dangerButtonText}>Reset All Finance Data</Text>
        </Pressable>

        <Pressable
          onPress={() => confirmResetInvestments(db)}
          style={[styles.importButton, styles.dangerButton]}
        >
          <Text style={styles.dangerButtonText}>Reset All Investment Data</Text>
        </Pressable>
      </View>

      {/* Privacy Card */}
      <View style={[styles.section, styles.privacyCard]}>
        <Text style={styles.privacyTitle}>Privacy First</Text>
        <Text style={styles.helperText}>
          All financial data stays on your device. MyFinance does not sync to
          the cloud and does not transmit data externally.
        </Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screenHeader: {
    paddingHorizontal: 4,
    gap: 4,
  },
  screenTitle: {
    color: palette.primaryText,
    fontSize: 24,
    fontWeight: '600',
  },
  screenSubtitle: {
    color: palette.mutedText,
    fontSize: 14,
    lineHeight: 20,
  },
  section: {
    backgroundColor: palette.surface,
    borderRadius: 14,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: palette.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  importInfoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  importIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.accentSoft,
  },
  holdingsIconBadge: {
    backgroundColor: '#E8F5E9',
  },
  transactionsIconBadge: {
    backgroundColor: '#FFF3E0',
  },
  amfiIconBadge: {
    backgroundColor: '#E3F2FD',
  },
  iconGlyph: {
    color: palette.accent,
    fontSize: 18,
    fontWeight: '700',
  },
  importInfoCopy: {
    flex: 1,
    gap: 8,
  },
  sectionTitleSmall: {
    color: palette.primaryText,
    fontSize: 16,
    fontWeight: '600',
  },
  bodyText: {
    color: palette.secondaryText,
    fontSize: 13,
    lineHeight: 20,
  },
  fieldLabel: {
    color: palette.primaryText,
    fontSize: 14,
    fontWeight: '500',
  },
  helperText: {
    color: palette.mutedText,
    fontSize: 12,
    lineHeight: 18,
  },
  textInput: {
    backgroundColor: palette.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: palette.primaryText,
  },
  appSelectorRow: {
    flexDirection: 'row',
    gap: 8,
  },
  appOption: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.background,
  },
  appOptionSelected: {
    borderColor: palette.accent,
    backgroundColor: palette.accentSoft,
  },
  appOptionText: {
    fontSize: 14,
    color: palette.secondaryText,
    fontWeight: '500',
  },
  appOptionTextSelected: {
    color: palette.accent,
  },
  importButton: {
    alignItems: 'center',
    backgroundColor: palette.accent,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  secondaryButton: {
    backgroundColor: palette.background,
    borderWidth: 1,
    borderColor: palette.accent,
  },
  secondaryButtonText: {
    color: palette.accent,
  },
  importButtonBusy: {
    opacity: 0.7,
  },
  importButtonDisabled: {
    opacity: 0.4,
  },
  warningText: {
    color: '#B07A3C',
    fontSize: 12,
    fontWeight: '500',
  },
  importButtonText: {
    color: palette.surface,
    fontSize: 15,
    fontWeight: '600',
  },
  importStatus: {
    color: palette.mutedText,
    fontSize: 13,
    lineHeight: 20,
  },
  previewCard: {
    backgroundColor: palette.secondarySurface,
    borderRadius: 8,
    padding: 12,
    gap: 4,
  },
  previewTitle: {
    color: palette.primaryText,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  previewText: {
    color: palette.secondaryText,
    fontSize: 13,
    lineHeight: 18,
  },
  dangerSection: {
    borderColor: '#F5B7B1',
  },
  dangerTitle: {
    color: '#C0392B',
    fontSize: 14,
    fontWeight: '700',
  },
  dangerButton: {
    backgroundColor: palette.background,
    borderWidth: 1,
    borderColor: '#C0392B',
  },
  dangerButtonText: {
    color: '#C0392B',
    fontSize: 15,
    fontWeight: '600',
  },
  privacyCard: {
    backgroundColor: palette.secondarySurface,
  },
  privacyTitle: {
    color: palette.primaryText,
    fontSize: 13,
    fontWeight: '600',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.background,
  },
  stepPillActive: {
    borderColor: palette.accent,
    backgroundColor: palette.accentSoft,
  },
  stepPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.mutedText,
  },
  stepPillTextActive: {
    color: palette.accent,
  },
  stepDivider: {
    flex: 1,
    height: 1,
    backgroundColor: palette.border,
  },
  stepHeading: {
    color: palette.primaryText,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  errorCard: {
    backgroundColor: '#FDECEA',
    borderRadius: 8,
    padding: 12,
    gap: 4,
    borderWidth: 1,
    borderColor: '#F5B7B1',
  },
  errorTitle: {
    color: '#C0392B',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  errorBody: {
    color: '#922B21',
    fontSize: 13,
    lineHeight: 18,
  },
  errorItem: {
    color: '#922B21',
    fontSize: 12,
    lineHeight: 18,
  },
  linkButton: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
  },
  linkButtonText: {
    color: palette.accent,
    fontSize: 13,
    fontWeight: '600',
  },
});
