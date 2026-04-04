import { Pressable, StyleSheet, Text, View } from 'react-native';

import { palette } from '../theme/palette';

type AppHeaderProps<T extends string> = {
  sections: readonly T[];
  labels: Record<T, string>;
  activeSection: T;
  isMenuOpen: boolean;
  onToggleMenu: () => void;
  onSelectSection: (section: T) => void;
};

export function AppHeader<T extends string>({
  sections,
  labels,
  activeSection,
  isMenuOpen,
  onToggleMenu,
  onSelectSection,
}: AppHeaderProps<T>) {
  return (
    <>
      <View style={styles.topBar}>
        <View style={styles.topBarRow}>
          <View style={styles.topBarBrand}>
            <Pressable onPress={onToggleMenu} style={styles.menuButton}>
              <View style={styles.menuLine} />
              <View style={styles.menuLine} />
              <View style={styles.menuLine} />
            </Pressable>
            <Text style={styles.topBarTitle}>MyFinance</Text>
          </View>
          <Pressable style={styles.accountButton}>
            <Text style={styles.accountButtonIcon}>◌</Text>
          </Pressable>
        </View>
      </View>

      {isMenuOpen ? (
        <View style={styles.menuPanel}>
          {sections.map((section) => {
            const isActive = activeSection === section;

            return (
              <Pressable
                key={section}
                onPress={() => onSelectSection(section)}
                style={[
                  styles.menuPanelItem,
                  isActive && styles.menuPanelItemActive,
                ]}
              >
                <Text
                  style={[
                    styles.menuPanelText,
                    isActive && styles.menuPanelTextActive,
                  ]}
                >
                  {labels[section]}
                </Text>
              </Pressable>
            );
          })}
          <Text style={styles.menuFooterText}>
            All data stored locally on your device
          </Text>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  topBar: {
    backgroundColor: palette.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  topBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topBarBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: palette.card,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  menuLine: {
    width: 18,
    height: 2,
    borderRadius: 999,
    backgroundColor: palette.primaryText,
  },
  topBarTitle: {
    color: palette.primaryText,
    fontSize: 18,
    fontWeight: '600',
  },
  accountButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountButtonIcon: {
    color: palette.accent,
    fontSize: 18,
    fontWeight: '600',
  },
  menuPanel: {
    backgroundColor: palette.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 10,
    gap: 4,
  },
  menuPanelItem: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  menuPanelItemActive: {
    backgroundColor: palette.accent,
  },
  menuPanelText: {
    color: palette.primaryText,
    fontSize: 15,
    fontWeight: '500',
  },
  menuPanelTextActive: {
    color: palette.surface,
  },
  menuFooterText: {
    color: palette.mutedText,
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: 14,
    paddingTop: 8,
  },
});
