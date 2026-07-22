import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

// Okuma — mobil uygulamanın da girişi ve birincil sekmesi olacak
// (web'deki Reading-hub mimarisiyle birebir aynı karar, bkz.
// web repo docs/DESIGN.md "Reading-merkezli IA"). Gerçek okuma/AI
// üretim akışı ve panel launcher'ı (Quiz/Kartlar/Gramer/Hatalarım/
// Tekrar/Sözlük) bu iskelet turunun kapsamı dışında — bkz. TODO.md.
export default function ReadingScreen() {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" themeColor="accent" style={styles.brand}>
          ydtfocus
        </ThemedText>
        <ThemedText type="subtitle" style={styles.title}>
          Okuma
        </ThemedText>
        <ThemedText themeColor="textMuted" style={styles.subtitle}>
          Bu ekran henüz iskelet — gerçek okuma/AI üretim akışı ve araç
          paneli (Quiz/Kartlar/Gramer/Hatalarım/Tekrar/Sözlük) sonraki
          oturumlarda eklenecek.
        </ThemedText>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
  },
  brand: {
    fontSize: 22,
    fontWeight: '900',
    marginBottom: Spacing.four,
  },
  title: {
    fontWeight: '800',
  },
  subtitle: {
    lineHeight: 22,
  },
});
