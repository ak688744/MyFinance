import { Pressable, StyleSheet, Text, View } from 'react-native';

import { palette } from '../theme/palette';

type ImportScreenProps = {
  isImporting: boolean;
  importMessage: string;
  onImportPress: () => void;
};

export function ImportScreen({
  isImporting,
  importMessage,
  onImportPress,
}: ImportScreenProps) {
  return (
    <>
      <View style={styles.screenHeader}>
        <Text style={styles.screenTitle}>Import</Text>
        <Text style={styles.screenSubtitle}>
          Import your HDFC bank statement to add transactions
        </Text>
      </View>

      <View style={styles.section}>
        <View style={styles.importInfoRow}>
          <View style={styles.importIconBadge}>
            <Text style={styles.iconGlyph}>⌗</Text>
          </View>
          <View style={styles.importInfoCopy}>
            <Text style={styles.sectionTitleSmall}>Local Import</Text>
            <Text style={styles.bodyText}>
              Your bank statement is processed entirely on your device. No data
              is uploaded to any server.
            </Text>
            <Text style={styles.fieldLabel}>Supported Format</Text>
            <Text style={styles.helperText}>
              HDFC Bank Excel statements (.xls), duplicate-safe imports, and
              automatic rule-based categorization.
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
            {isImporting ? 'Importing...' : 'Select Excel File'}
          </Text>
        </Pressable>
        <Text style={styles.importStatus}>
          Tap to browse and select your HDFC statement
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitleSmall}>Import Summary</Text>
        <Text style={styles.importStatus}>{importMessage}</Text>
      </View>

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
  importButton: {
    alignItems: 'center',
    backgroundColor: palette.accent,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  importButtonBusy: {
    opacity: 0.7,
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
  privacyCard: {
    backgroundColor: palette.secondarySurface,
  },
  privacyTitle: {
    color: palette.primaryText,
    fontSize: 13,
    fontWeight: '600',
  },
});
