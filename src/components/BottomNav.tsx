import { Pressable, StyleSheet, Text, View } from 'react-native';

import { palette } from '../theme/palette';

type BottomNavProps<T extends string> = {
  sections: readonly T[];
  labels: Record<T, string>;
  activeSection: T;
  onSelectSection: (section: T) => void;
};

function getGlyph(section: string) {
  if (section === 'finances') {
    return '◫';
  }

  if (section === 'rules') {
    return '≣';
  }

  return '⇪';
}

export function BottomNav<T extends string>({
  sections,
  labels,
  activeSection,
  onSelectSection,
}: BottomNavProps<T>) {
  return (
    <View style={styles.bottomNav}>
      {sections.map((section) => {
        const isActive = activeSection === section;

        return (
          <Pressable
            key={`bottom-${section}`}
            onPress={() => onSelectSection(section)}
            style={styles.bottomNavItem}
          >
            <Text
              style={[
                styles.bottomNavIcon,
                isActive && styles.bottomNavIconActive,
              ]}
            >
              {getGlyph(section)}
            </Text>
            <Text
              style={[
                styles.bottomNavLabel,
                isActive && styles.bottomNavLabelActive,
              ]}
            >
              {labels[section]}
            </Text>
            {isActive ? <View style={styles.bottomNavDot} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bottomNav: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: 'rgba(251,249,244,0.92)',
    borderTopWidth: 1,
    borderTopColor: palette.border,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 22,
    marginTop: 12,
  },
  bottomNavItem: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minWidth: 72,
  },
  bottomNavIcon: {
    color: palette.mutedText,
    fontSize: 18,
  },
  bottomNavIconActive: {
    color: palette.accent,
  },
  bottomNavLabel: {
    color: palette.mutedText,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  bottomNavLabelActive: {
    color: palette.accent,
  },
  bottomNavDot: {
    width: 4,
    height: 4,
    borderRadius: 999,
    backgroundColor: palette.accent,
    marginTop: 2,
  },
});
