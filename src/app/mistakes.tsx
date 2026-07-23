import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WordQuiz } from '@/components/word-quiz';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { clearMistakes, getUserMistakes, getUserWords, removeMistake, type UserWord } from '@/lib/firestore';
import { useTheme } from '@/hooks/use-theme';

const MIN_WORDS_FOR_TEST = 4;

// Hatalarım — web'in MistakesPanel.js'i ile aynı: users/{uid}/data/mistakes
// dökümanındaki wrongIds, kelime bankasıyla çaprazlanıp gösteriliyor.
export default function MistakesScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [mistakeWords, setMistakeWords] = useState<UserWord[]>([]);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ correct: number; wrong: number } | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [wrongIds, words] = await Promise.all([getUserMistakes(user.uid), getUserWords(user.uid)]);
    setMistakeWords(words.filter((w) => wrongIds.includes(w.id)));
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRemove(wordId: string) {
    if (!user) return;
    await removeMistake(user.uid, wordId);
    setMistakeWords((prev) => prev.filter((w) => w.id !== wordId));
  }

  async function handleClearAll() {
    if (!user) return;
    await clearMistakes(user.uid);
    setMistakeWords([]);
  }

  function handleFinishTest(finalResult: { correct: number; wrong: number }) {
    setResult(finalResult);
    setTesting(false);
    load();
  }

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
            Hatalarım
          </ThemedText>
        </View>

        {loading && (
          <View style={styles.centerBox}>
            <ActivityIndicator color={theme.accent} />
          </View>
        )}

        {!loading && testing && (
          <WordQuiz words={mistakeWords} mistakesMode onFinish={handleFinishTest} />
        )}

        {!loading && !testing && mistakeWords.length === 0 && (
          <ThemedText themeColor="textMuted" style={styles.centerBox}>
            Henüz kayıtlı bir hatan yok. Akıllı Tekrar'da yanlış cevapladığın
            kelimeler burada birikir.
          </ThemedText>
        )}

        {!loading && !testing && mistakeWords.length > 0 && (
          <>
            {result && (
              <ThemedText themeColor="accent" type="smallBold" style={styles.resultLine}>
                Test tamamlandı — Doğru: {result.correct} · Yanlış: {result.wrong}
              </ThemedText>
            )}

            {mistakeWords.length >= MIN_WORDS_FOR_TEST && (
              <Pressable onPress={() => setTesting(true)} style={[styles.testButton, { backgroundColor: theme.accent }]}>
                <ThemedText type="smallBold" themeColor="bg">
                  Hata Testi Başlat ({mistakeWords.length})
                </ThemedText>
              </Pressable>
            )}

            <ScrollView contentContainerStyle={styles.list}>
              {mistakeWords.map((word) => (
                <ThemedView key={word.id} type="bgCard" style={[styles.wordCard, { borderColor: theme.border }]}>
                  <View style={styles.wordInfo}>
                    <ThemedText type="smallBold">{word.word}</ThemedText>
                    <ThemedText themeColor="textMuted" type="small">
                      {word.translation}
                    </ThemedText>
                  </View>
                  <Pressable onPress={() => handleRemove(word.id)}>
                    <ThemedText themeColor="error" type="small">
                      Kaldır
                    </ThemedText>
                  </Pressable>
                </ThemedView>
              ))}
            </ScrollView>

            <Pressable onPress={handleClearAll} style={styles.clearAllButton}>
              <ThemedText themeColor="textMuted" type="small">
                Tümünü Temizle
              </ThemedText>
            </Pressable>
          </>
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
  resultLine: { textAlign: 'center' },
  testButton: { borderRadius: 10, paddingVertical: Spacing.two + 2, alignItems: 'center' },
  list: { gap: Spacing.two, paddingBottom: Spacing.four },
  wordCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  wordInfo: { gap: Spacing.half },
  clearAllButton: { alignItems: 'center', paddingVertical: Spacing.two },
});
