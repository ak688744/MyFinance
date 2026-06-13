import { StyleSheet, Text, View } from 'react-native';

import { palette } from '../../theme/palette';

export type RedemptionTileProps = {
  redemption: {
    schemeId: number;
    schemeName: string;
    amcName: string | null;
    accountName: string;
    amount: number;
    latestDate: string;
  };
};

function formatCurrency(amount: number): string {
  const absAmount = Math.abs(amount);
  return `\u20B9${absAmount.toLocaleString('en-IN', {
    maximumFractionDigits: 0,
  })}`;
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthIdx = Number(m) - 1;
  if (monthIdx < 0 || monthIdx > 11) return iso;
  return `${d} ${months[monthIdx]} ${y}`;
}

export function RedemptionTile({ redemption }: RedemptionTileProps) {
  return (
    <View style={styles.tile}>
      <View style={styles.header}>
        <View style={styles.titleBlock}>
          <Text style={styles.schemeName} numberOfLines={2}>
            {redemption.schemeName}
          </Text>
          {redemption.amcName ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {redemption.amcName}
            </Text>
          ) : null}
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Redeemed</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.amountText}>+{formatCurrency(redemption.amount)}</Text>
        <Text style={styles.dateText}>{formatDate(redemption.latestDate)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: palette.card,
    borderRadius: 10,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: palette.border,
    borderLeftWidth: 3,
    borderLeftColor: '#B07A3C',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  titleBlock: {
    flex: 1,
    gap: 2,
  },
  schemeName: {
    color: palette.primaryText,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
  },
  subtitle: {
    color: palette.mutedText,
    fontSize: 12,
  },
  badge: {
    backgroundColor: '#FBEADD',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    color: '#8B5A2B',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  amountText: {
    color: palette.primaryText,
    fontSize: 15,
    fontWeight: '700',
  },
  dateText: {
    color: palette.mutedText,
    fontSize: 12,
  },
});
