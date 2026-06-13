import { Pressable, StyleSheet, Text, View } from 'react-native';

import { palette } from '../../theme/palette';

export type InvestmentEmptyStateProps = {
  onImportPress: () => void;
};

export function InvestmentEmptyState({ onImportPress }: InvestmentEmptyStateProps) {
  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Text style={styles.icon}>◈</Text>
      </View>
      <Text style={styles.title}>No holdings imported yet</Text>
      <Text style={styles.description}>
        Import your holdings statement to track your mutual fund portfolio
      </Text>
      <Pressable onPress={onImportPress} style={styles.button}>
        <Text style={styles.buttonText}>Import Holdings</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: palette.accentSoftMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  icon: {
    fontSize: 28,
    color: '#006d77',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1b1c19',
    marginBottom: 8,
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    color: '#6f797a',
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 20,
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#006d77',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
});
