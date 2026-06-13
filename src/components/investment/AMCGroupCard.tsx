import { Pressable, StyleSheet, Text, View } from 'react-native';

import { palette } from '../../theme/palette';
import { HoldingCard, HoldingCardProps } from './HoldingCard';

export type AMCGroupCardProps = {
  amcName: string;
  holdings: HoldingCardProps['holding'][];
  totalValue: number;
  isExpanded: boolean;
  onToggle: () => void;
  expandedHoldingId: number | null;
  onHoldingToggle: (id: number) => void;
};

const COLORS = {
  headerBackground: '#ffffff',
  border: '#e4e2dd',
  text: '#1b1c19',
  muted: '#6f797a',
  accent: '#006d77',
};

function formatLakhsCurrency(amount: number): string {
  const absAmount = Math.abs(amount);
  if (absAmount >= 100000) {
    const lakhs = absAmount / 100000;
    return `₹${lakhs.toFixed(1)}L`;
  }
  return `₹${absAmount.toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

export function AMCGroupCard({
  amcName,
  holdings,
  totalValue,
  isExpanded,
  onToggle,
  expandedHoldingId,
  onHoldingToggle,
}: AMCGroupCardProps) {
  const fundCount = holdings.length;
  const fundLabel = fundCount === 1 ? 'fund' : 'funds';

  return (
    <View style={styles.container}>
      {/* Header Section */}
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [
          styles.header,
          pressed && styles.headerPressed,
        ]}
      >
        <View style={styles.headerLeft}>
          <Text style={styles.folderIcon}>▤</Text>
          <View style={styles.headerInfo}>
            <Text style={styles.amcName} numberOfLines={1}>
              {amcName}
            </Text>
            <Text style={styles.fundCount}>
              {fundCount} {fundLabel}
            </Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          <Text style={styles.totalValue}>{formatLakhsCurrency(totalValue)}</Text>
          <Text style={styles.chevron}>{isExpanded ? '▴' : '▾'}</Text>
        </View>
      </Pressable>

      {/* Expanded Holdings Section */}
      {isExpanded && holdings.length > 0 && (
        <View style={styles.holdingsContainer}>
          {holdings.map((holding) => (
            <HoldingCard
              key={`${holding.id}-${holding.accountName}`}
              holding={holding}
              isExpanded={expandedHoldingId === holding.id}
              onToggle={() => onHoldingToggle(holding.id)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.headerBackground,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    backgroundColor: COLORS.headerBackground,
  },
  headerPressed: {
    backgroundColor: palette.surfaceContainerLow,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  folderIcon: {
    fontSize: 18,
    color: COLORS.accent,
  },
  headerInfo: {
    flex: 1,
    gap: 2,
  },
  amcName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  fundCount: {
    fontSize: 12,
    color: COLORS.muted,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  totalValue: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  chevron: {
    fontSize: 14,
    color: COLORS.muted,
  },
  holdingsContainer: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 4,
    gap: 10,
    backgroundColor: palette.surfaceContainerLow,
  },
});
