import { Pressable, StyleSheet, Text, View } from 'react-native';

import { palette } from '../../theme/palette';

export type HoldingCardProps = {
  holding: {
    id: number;
    schemeName: string;
    amcName: string | null;
    category: 'equity' | 'debt' | 'hybrid' | 'other' | null;
    subCategory: string | null;
    accountName: string;
    units: number;
    investedValue: number;
    currentValue: number;
    returnsAmount: number;
    returnsPercent: number;
    returnsXirr: number | null;
  };
  isExpanded: boolean;
  onToggle: () => void;
};

const COLORS = {
  gain: '#3a6847',
  loss: '#862c1f',
  muted: '#6f797a',
  cardBackground: '#ffffff',
  border: '#e4e2dd',
};

function formatCurrency(amount: number): string {
  const absAmount = Math.abs(amount);
  return `₹${absAmount.toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function formatUnits(units: number): string {
  return `${units.toFixed(2)} units`;
}

function formatPercent(percent: number): string {
  const sign = percent >= 0 ? '+' : '';
  return `${sign}${percent.toFixed(2)}%`;
}

function formatReturns(amount: number, percent: number): string {
  const sign = amount >= 0 ? '+' : '-';
  return `${sign}${formatCurrency(amount)} (${formatPercent(percent)})`;
}

function truncateName(name: string, maxLength: number = 20): string {
  if (name.length <= maxLength) {
    return name;
  }
  return `${name.slice(0, maxLength - 1)}…`;
}

function getCategoryLabel(
  category: HoldingCardProps['holding']['category'],
  subCategory: string | null
): string | null {
  if (subCategory) {
    return subCategory;
  }
  if (category) {
    const labels: Record<string, string> = {
      equity: 'Equity',
      debt: 'Debt',
      hybrid: 'Hybrid',
      other: 'Other',
    };
    return labels[category] || category;
  }
  return null;
}

export function HoldingCard({ holding, isExpanded, onToggle }: HoldingCardProps) {
  const isGain = holding.returnsAmount >= 0;
  const returnsColor = isGain ? COLORS.gain : COLORS.loss;
  const categoryLabel = getCategoryLabel(holding.category, holding.subCategory);

  return (
    <Pressable
      onPress={onToggle}
      style={({ pressed }) => [
        styles.card,
        pressed && styles.cardPressed,
      ]}
    >
      {/* Main Content Row */}
      <View style={styles.mainRow}>
        {/* Left Side: Fund Info */}
        <View style={styles.fundInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.fundName} numberOfLines={1}>
              {truncateName(holding.schemeName)}
            </Text>
            {categoryLabel && (
              <View style={styles.categoryBadge}>
                <Text style={styles.categoryText}>{categoryLabel}</Text>
              </View>
            )}
          </View>
          <Text style={styles.unitsText}>{formatUnits(holding.units)}</Text>
        </View>

        {/* Right Side: Value and Returns */}
        <View style={styles.valueSection}>
          <Text style={styles.currentValue}>{formatCurrency(holding.currentValue)}</Text>
          <Text style={[styles.returnsText, { color: returnsColor }]}>
            {formatReturns(holding.returnsAmount, holding.returnsPercent)}
          </Text>
        </View>

        {/* Chevron */}
        <Text style={styles.chevron}>{isExpanded ? '▴' : '▾'}</Text>
      </View>

      {/* Expanded Section */}
      {isExpanded && (
        <>
          <View style={styles.divider} />
          <View style={styles.detailsGrid}>
            {holding.amcName && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>AMC</Text>
                <Text style={styles.detailValue} numberOfLines={1}>
                  {holding.amcName}
                </Text>
              </View>
            )}
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Account</Text>
              <Text style={styles.detailValue} numberOfLines={1}>
                {holding.accountName}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Invested</Text>
              <Text style={styles.detailValue}>{formatCurrency(holding.investedValue)}</Text>
            </View>
            {holding.returnsXirr !== null && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>XIRR</Text>
                <Text
                  style={[
                    styles.detailValue,
                    { color: holding.returnsXirr >= 0 ? COLORS.gain : COLORS.loss },
                  ]}
                >
                  {formatPercent(holding.returnsXirr)}
                </Text>
              </View>
            )}
          </View>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
  },
  cardPressed: {
    backgroundColor: palette.surfaceContainerLow,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  fundInfo: {
    flex: 1,
    gap: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  fundName: {
    fontSize: 15,
    fontWeight: '600',
    color: palette.primaryText,
    flexShrink: 1,
  },
  categoryBadge: {
    backgroundColor: palette.surfaceContainerLow,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  categoryText: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.muted,
  },
  unitsText: {
    fontSize: 12,
    color: COLORS.muted,
  },
  valueSection: {
    alignItems: 'flex-end',
    marginLeft: 12,
  },
  currentValue: {
    fontSize: 16,
    fontWeight: '600',
    color: palette.primaryText,
  },
  returnsText: {
    fontSize: 12,
    fontWeight: '500',
  },
  chevron: {
    fontSize: 14,
    color: COLORS.muted,
    marginLeft: 8,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 12,
  },
  detailsGrid: {
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 13,
    color: COLORS.muted,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '500',
    color: palette.primaryText,
    maxWidth: '60%',
    textAlign: 'right',
  },
});
