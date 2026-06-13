import React from 'react';
import { Pressable, Text, StyleSheet, View } from 'react-native';
import { palette } from '../../theme/palette';

export type AccountFilterProps = {
  accounts: string[];
  selected: string | null;
  onSelect: (account: string | null) => void;
  isOpen: boolean;
  onToggle: () => void;
};

export const AccountFilter: React.FC<AccountFilterProps> = ({
  accounts,
  selected,
  onSelect,
  isOpen,
  onToggle,
}) => {
  const displayValue = selected ?? 'All Accounts';

  const handleSelect = (account: string | null) => {
    onSelect(account);
    onToggle();
  };

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>Account:</Text>
        <Pressable style={styles.dropdown} onPress={onToggle}>
          <Text style={styles.dropdownText}>{displayValue}</Text>
          <Text style={styles.dropdownChevron}>▾</Text>
        </Pressable>
      </View>

      {isOpen && (
        <View style={styles.dropdownMenu}>
          <Pressable
            style={[
              styles.dropdownOption,
              selected === null && styles.dropdownOptionSelected,
            ]}
            onPress={() => handleSelect(null)}
          >
            <Text
              style={[
                styles.dropdownOptionText,
                selected === null && styles.dropdownOptionTextSelected,
              ]}
            >
              All Accounts
            </Text>
            {selected === null && <Text style={styles.checkmark}>✓</Text>}
          </Pressable>

          {accounts.map((account) => (
            <Pressable
              key={account}
              style={[
                styles.dropdownOption,
                selected === account && styles.dropdownOptionSelected,
              ]}
              onPress={() => handleSelect(account)}
            >
              <Text
                style={[
                  styles.dropdownOptionText,
                  selected === account && styles.dropdownOptionTextSelected,
                ]}
              >
                {account}
              </Text>
              {selected === account && <Text style={styles.checkmark}>✓</Text>}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    fontSize: 14,
    color: palette.mutedText,
  },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: palette.surface,
  },
  dropdownText: {
    fontSize: 14,
    fontWeight: '500',
    color: palette.primaryText,
  },
  dropdownChevron: {
    fontSize: 12,
    color: palette.mutedText,
  },
  dropdownMenu: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    backgroundColor: palette.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.border,
    overflow: 'hidden',
    zIndex: 10,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  dropdownOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  dropdownOptionSelected: {
    backgroundColor: palette.accentSoftMuted,
  },
  dropdownOptionText: {
    fontSize: 14,
    fontWeight: '500',
    color: palette.primaryText,
  },
  dropdownOptionTextSelected: {
    color: palette.accent,
    fontWeight: '600',
  },
  checkmark: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.accent,
  },
});

export default AccountFilter;
