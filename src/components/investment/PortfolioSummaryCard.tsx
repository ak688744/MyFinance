import { StyleSheet, Text, View } from 'react-native';

import { palette } from '../../theme/palette';

export type PortfolioSummaryCardProps = {
  currentValue: number;
  investedValue: number;
  returns: number;
  returnsPercent: number;
  xirr: number | null;
  periodLabel?: string;
  redeemedValue?: number;
  isLoading?: boolean;
};

/**
 * Format currency as Indian rupee format
 * For values >= 1 lakh, shows as X.XL (e.g., 10.8L)
 * For smaller values, shows as full number with commas (e.g., 13,26,223)
 */
function formatCurrency(amount: number): string {
  const absAmount = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';

  if (absAmount >= 100000) {
    // Format as lakhs
    const lakhs = absAmount / 100000;
    const formatted = lakhs >= 10 ? lakhs.toFixed(1) : lakhs.toFixed(2);
    // Remove trailing zeros after decimal
    const cleaned = formatted.replace(/\.?0+$/, '');
    return `${sign}\u20B9${cleaned}L`;
  }

  // Format with Indian number system (commas)
  const formatted = absAmount.toLocaleString('en-IN', {
    maximumFractionDigits: 0,
  });
  return `${sign}\u20B9${formatted}`;
}

/**
 * Format percentage with sign
 */
function formatPercent(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export function PortfolioSummaryCard({
  currentValue,
  investedValue,
  returns,
  returnsPercent,
  xirr,
  periodLabel,
  redeemedValue,
  isLoading,
}: PortfolioSummaryCardProps) {
  const isGain = returns >= 0;
  const returnsColor = isGain ? palette.success : palette.danger;

  // Calculate progress bar ratio (invested / current)
  // Clamped between 0 and 1
  const progressRatio =
    currentValue > 0 ? Math.min(Math.max(investedValue / currentValue, 0), 1) : 0;
  const progressPercent = progressRatio * 100;

  return (
    <View style={[styles.card, isLoading && styles.cardLoading]}>
      {/* Period label if showing period returns */}
      {periodLabel && (
        <Text style={styles.periodLabel}>{periodLabel}</Text>
      )}

      {/* Top row: Current value + XIRR badge */}
      <View style={styles.topRow}>
        <Text style={styles.currentValue}>{formatCurrency(currentValue)}</Text>
        {xirr !== null && (
          <View style={styles.xirrBadge}>
            <Text style={styles.xirrText}>{(xirr * 100).toFixed(2)}% XIRR</Text>
          </View>
        )}
      </View>

      {/* Progress bar */}
      <View style={styles.progressBarContainer}>
        <View
          style={[styles.progressBarFill, { width: `${progressPercent}%` }]}
        />
      </View>

      {/* Bottom row: Invested + Returns */}
      <View style={styles.bottomRow}>
        <Text style={styles.investedText}>
          Invested {formatCurrency(investedValue)}
        </Text>
        <Text style={[styles.returnsText, { color: returnsColor }]}>
          {returns >= 0 ? '+' : ''}
          {formatCurrency(returns)} ({formatPercent(returnsPercent)})
        </Text>
      </View>

      {redeemedValue !== undefined && redeemedValue > 0 && (
        <View style={styles.redeemedRow}>
          <Text style={styles.investedText}>
            Redeemed {formatCurrency(redeemedValue)}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 16,
    gap: 12,
  },
  cardLoading: {
    opacity: 0.7,
  },
  periodLabel: {
    fontSize: 12,
    color: palette.mutedText,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  currentValue: {
    fontSize: 28,
    fontWeight: '700',
    color: palette.primaryText,
  },
  xirrBadge: {
    backgroundColor: palette.accent,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  xirrText: {
    color: palette.surface,
    fontSize: 13,
    fontWeight: '600',
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: palette.accentSoftMuted,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: palette.accent,
    borderRadius: 4,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  investedText: {
    fontSize: 14,
    color: palette.mutedText,
    fontWeight: '500',
  },
  returnsText: {
    fontSize: 14,
    fontWeight: '600',
  },
  redeemedRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
});
