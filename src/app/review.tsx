import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WordQuiz } from '@/components/word-quiz';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { getUserWords, type UserWord } from '@/lib/firestore';
import { useTheme } from '@/hooks/use-theme';

// Akıllı Tekrar (SRS) — web'in SrsPanel.js'i ile aynı mantık: nextReview
// zamanı gelmiş kelimeler (bkz. src/components/word-quiz.tsx).
export default function ReviewScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [dueWords, setDueWords] = useState<UserWord[]>([]);
  const [result, setResult] = useState<{ correct: number; wrong: number } | null>(null);

  useEffect(() => {
    if (!user) return;
    getUserWords(user.uid).then((words) => {
      setDueWords(words.filter((w) => (w.nextReview || 0) <= Date.now()));
      setLoading(false);
    });
  }, [user]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <ThemedText type="smallBold" themeColor="accent">
              ‹ Geri
            </ThemedText>
          </Pressable>
          <ThemedText type="subtitle" style={styles.title}>
            Akıllı Tekrar
          </ThemedText>
        </View>

        {loading && (
          <View style={styles.centerBox}>
            <ActivityIndicator color={theme.accent} />
          </View>
        )}

        {!loading && dueWords.length === 0 && !result && (
          <ThemedText themeColor="textMuted" style={styles.centerBox}>
            Bugün tekrar edilecek kelime yok. Kelime bankana yeni kelimeler
            ekledikçe burada birikecek.
          </ThemedText>
        )}

        {!loading && dueWords.length > 0 && !result && (
          <WordQuiz words={dueWords} onFinish={setResult} />
        )}

        {result && (
          <ThemedView type="bgCard" style={[styles.resultCard, { borderColor: theme.border }]}>
            <ThemedText type="subtitle" themeColor="accent">
              Tekrar Tamamlandı
            </ThemedText>
            <ThemedText themeColor="textMuted">
              Doğru: {result.correct} · Yanlış: {result.wrong}
            </ThemedText>
            <Pressable onPress={() => router.back()} style={[styles.doneButton, { backgroundColor: theme.accent }]}>
              <ThemedText type="smallBold" themeColor="bg">
                Tamam
              </ThemedText>
            </Pressable>
          </ThemedView>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four, paddingTop: Spacing.four, gap: Spacing.three },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginBottom: Spacing.two },
  backButton: { paddingVertical: Spacing.one },
  title: { fontWeight: '800' },
  centerBox: { paddingTop: Spacing.six, textAlign: 'center' },
  resultCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: Spacing.four,
    gap: Spacing.two,
    alignItems: 'center',
  },
  doneButton: {
    marginTop: Spacing.two,
    borderRadius: 10,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
});
