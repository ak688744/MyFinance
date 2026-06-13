import React from 'react';
import { ScrollView, Pressable, Text, StyleSheet } from 'react-native';
import { palette } from '../../theme/palette';

export type Period = '1M' | '3M' | '6M' | '1Y' | '3Y' | '5Y' | 'ALL';

export type PeriodSelectorProps = {
  selected: Period;
  onSelect: (period: Period) => void;
};

const PERIODS: Period[] = ['1M', '3M', '6M', '1Y', '3Y', '5Y', 'ALL'];

export const PeriodSelector: React.FC<PeriodSelectorProps> = ({
  selected,
  onSelect,
}) => {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {PERIODS.map((period) => {
        const isActive = period === selected;
        return (
          <Pressable
            key={period}
            onPress={() => onSelect(period)}
            style={[
              styles.pill,
              isActive ? styles.pillActive : styles.pillInactive,
            ]}
          >
            <Text
              style={[
                styles.pillText,
                isActive ? styles.pillTextActive : styles.pillTextInactive,
              ]}
            >
              {period}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
  },
  pill: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 16,
  },
  pillActive: {
    backgroundColor: palette.accent,
  },
  pillInactive: {
    backgroundColor: palette.surfaceContainerLow,
  },
  pillText: {
    fontSize: 14,
    fontWeight: '500',
  },
  pillTextActive: {
    color: '#ffffff',
  },
  pillTextInactive: {
    color: palette.primaryText,
  },
});

export default PeriodSelector;
