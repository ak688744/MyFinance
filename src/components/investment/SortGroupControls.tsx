import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { palette } from '../../theme/palette';

export type SortBy = 'currentValue' | 'returns' | 'returnsPercent' | 'xirr' | 'invested';
export type GroupBy = 'none' | 'amc' | 'category';

export type SortGroupControlsProps = {
  sortBy: SortBy;
  groupBy: GroupBy;
  onSortChange: (sort: SortBy) => void;
  onGroupChange: (group: GroupBy) => void;
};

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'currentValue', label: 'Current Value' },
  { value: 'returns', label: 'Returns' },
  { value: 'returnsPercent', label: 'Returns %' },
  { value: 'xirr', label: 'XIRR' },
  { value: 'invested', label: 'Invested' },
];

const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'amc', label: 'AMC' },
  { value: 'category', label: 'Category' },
];

export function SortGroupControls({
  sortBy,
  groupBy,
  onSortChange,
  onGroupChange,
}: SortGroupControlsProps) {
  const [openDropdown, setOpenDropdown] = useState<'sort' | 'group' | null>(null);

  const sortLabel = SORT_OPTIONS.find((opt) => opt.value === sortBy)?.label ?? 'Current Value';
  const groupLabel = GROUP_OPTIONS.find((opt) => opt.value === groupBy)?.label ?? 'None';

  const handleSortSelect = (value: SortBy) => {
    onSortChange(value);
    setOpenDropdown(null);
  };

  const handleGroupSelect = (value: GroupBy) => {
    onGroupChange(value);
    setOpenDropdown(null);
  };

  const toggleDropdown = (dropdown: 'sort' | 'group') => {
    setOpenDropdown(openDropdown === dropdown ? null : dropdown);
  };

  return (
    <View style={styles.container}>
      {/* Sort Dropdown */}
      <View style={styles.dropdownWrapper}>
        <Pressable
          style={styles.dropdownButton}
          onPress={() => toggleDropdown('sort')}
        >
          <Text style={styles.dropdownLabel}>Sort by: </Text>
          <Text style={styles.dropdownValue}>{sortLabel}</Text>
          <Text style={styles.dropdownChevron}>{openDropdown === 'sort' ? '▴' : '▾'}</Text>
        </Pressable>

        {openDropdown === 'sort' && (
          <View style={styles.dropdownMenu}>
            {SORT_OPTIONS.map((option) => (
              <Pressable
                key={option.value}
                style={[
                  styles.dropdownOption,
                  sortBy === option.value && styles.dropdownOptionSelected,
                ]}
                onPress={() => handleSortSelect(option.value)}
              >
                <Text
                  style={[
                    styles.dropdownOptionText,
                    sortBy === option.value && styles.dropdownOptionTextSelected,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {/* Group Dropdown */}
      <View style={styles.dropdownWrapper}>
        <Pressable
          style={styles.dropdownButton}
          onPress={() => toggleDropdown('group')}
        >
          <Text style={styles.dropdownLabel}>Group by: </Text>
          <Text style={styles.dropdownValue}>{groupLabel}</Text>
          <Text style={styles.dropdownChevron}>{openDropdown === 'group' ? '▴' : '▾'}</Text>
        </Pressable>

        {openDropdown === 'group' && (
          <View style={styles.dropdownMenu}>
            {GROUP_OPTIONS.map((option) => (
              <Pressable
                key={option.value}
                style={[
                  styles.dropdownOption,
                  groupBy === option.value && styles.dropdownOptionSelected,
                ]}
                onPress={() => handleGroupSelect(option.value)}
              >
                <Text
                  style={[
                    styles.dropdownOptionText,
                    groupBy === option.value && styles.dropdownOptionTextSelected,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 4,
  },
  dropdownWrapper: {
    position: 'relative',
    zIndex: 1,
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.surfaceContainerLow,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  dropdownLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: palette.mutedText,
  },
  dropdownValue: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.primaryText,
  },
  dropdownChevron: {
    fontSize: 12,
    color: palette.mutedText,
    marginLeft: 4,
  },
  dropdownMenu: {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: 4,
    backgroundColor: palette.surface,
    borderRadius: 10,
    overflow: 'hidden',
    minWidth: 140,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: palette.border,
  },
  dropdownOption: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  dropdownOptionSelected: {
    backgroundColor: palette.accentSoftMuted,
  },
  dropdownOptionText: {
    fontSize: 13,
    fontWeight: '500',
    color: palette.primaryText,
  },
  dropdownOptionTextSelected: {
    color: palette.accent,
    fontWeight: '600',
  },
});
