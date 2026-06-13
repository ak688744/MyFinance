import { Pressable, StyleSheet, Text, View } from 'react-native';

import { palette } from '../../theme/palette';

export type AssetType = 'all' | 'equity' | 'debt';

export type AssetTypeToggleProps = {
  selected: AssetType;
  onSelect: (type: AssetType) => void;
};

const ASSET_TYPE_OPTIONS: { value: AssetType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'equity', label: 'Equity' },
  { value: 'debt', label: 'Debt' },
];

export function AssetTypeToggle({ selected, onSelect }: AssetTypeToggleProps) {
  return (
    <View style={styles.container}>
      {ASSET_TYPE_OPTIONS.map((option) => {
        const isActive = selected === option.value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onSelect(option.value)}
            style={[styles.segment, isActive && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, isActive && styles.segmentTextActive]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 10,
    backgroundColor: palette.surface,
    overflow: 'hidden',
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: {
    backgroundColor: '#006d77',
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '500',
    color: palette.mutedText,
  },
  segmentTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
});
