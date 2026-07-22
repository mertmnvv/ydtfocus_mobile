import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

// Rozetler — web'deki /achievements ile aynı 2. sekme (rozetler +
// leaderboard). İskelet aşaması, gerçek Firestore verisi yok.
export default function AchievementsScreen() {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="subtitle" style={styles.title}>
          Rozetler
        </ThemedText>
        <ThemedText themeColor="textMuted">
          Bu ekran henüz iskelet — rozetler ve leaderboard verisi
          sonraki oturumlarda Firestore&apos;dan bağlanacak.
        </ThemedText>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
  },
  title: { fontWeight: '800' },
});
