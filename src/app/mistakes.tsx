import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WordQuiz } from '@/components/word-quiz';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { clearMistakes, getUserMistakes, getUserWords, removeMistake, type UserWord } from '@/lib/firestore';
import { useTheme } from '@/hooks/use-theme';

const MIN_WORDS_FOR_TEST = 4;

export default function MistakesScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [mistakeWords, setMistakeWords] = useState<UserWord[]>([]);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ correct: number; wrong: number } | null>(null);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(!!state.isConnected);
    });
    return () => unsubscribe();
  }, []);

  const load = useCallback(async (showLoading = false) => {
    if (!user) return;
    if (showLoading) setLoading(true);
    try {
      const [wrongIds, words] = await Promise.all([getUserMistakes(user.uid), getUserWords(user.uid)]);
      setMistakeWords(words.filter((w) => wrongIds.includes(w.id)));
    } catch (err) {
      console.error('Error loading mistakes:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    const timer = setTimeout(() => {
      load(false);
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function handleRemove(wordId: string) {
    if (!user) return;
    try {
      await removeMistake(user.uid, wordId);
      setMistakeWords((prev) => prev.filter((w) => w.id !== wordId));
    } catch (err) {
      console.error('Error removing mistake:', err);
    }
  }

  async function handleClearAll() {
    if (!user) return;
    try {
      await clearMistakes(user.uid);
      setMistakeWords([]);
    } catch (err) {
      console.error('Error clearing mistakes:', err);
    }
  }

  function handleFinishTest(finalResult: { correct: number; wrong: number }) {
    setResult(finalResult);
    setTesting(false);
    load(true);
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <Pressable
            onPress={() => {
              if (testing) {
                setTesting(false);
              } else {
                router.back();
              }
            }}
            style={({ pressed }) => [
              styles.backButton,
              {
                borderColor: theme.border,
                backgroundColor: theme.bgCard,
                transform: [{ scale: pressed ? 0.95 : 1 }],
              },
            ]}
          >
            <MaterialCommunityIcons name="chevron-left" size={24} color={theme.accent} />
          </Pressable>
          <View style={styles.headerTitleContainer}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
              <ThemedText type="subtitle" style={styles.title}>
                Hatalarım
              </ThemedText>
              {!isOnline && (
                <View style={[styles.offlineChip, { backgroundColor: '#ff9f0a' }]}>
                  <MaterialCommunityIcons name="wifi-off" size={12} color="#000" />
                  <ThemedText type="code" style={styles.offlineText}>
                    ÇEVRİMDIŞI
                  </ThemedText>
                </View>
              )}
            </View>
            <ThemedText type="small" themeColor="textMuted">
              Yanlış Yapılan Kelimeler
            </ThemedText>
          </View>
        </View>

        {loading && (
          <View style={styles.centerBox}>
            <ActivityIndicator color={theme.accent} size="large" />
          </View>
        )}

        {!loading && testing && (
          <WordQuiz words={mistakeWords} mistakesMode onFinish={handleFinishTest} />
        )}

        {!loading && !testing && mistakeWords.length === 0 && (
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="check-circle-outline" size={48} color={theme.accent} />
            <ThemedText themeColor="textMuted" style={styles.emptyText}>
              {"Henüz kayıtlı bir hatan yok. Akıllı Tekrar'da yanlış cevapladığın kelimeler otomatik olarak burada birikir."}
            </ThemedText>
          </View>
        )}

        {!loading && !testing && mistakeWords.length > 0 && (
          <>
            {result && (
              <ThemedView type="bgCard" style={[styles.resultBanner, { borderColor: theme.border }]}>
                <MaterialCommunityIcons name="trophy-outline" size={20} color={theme.accent} />
                <ThemedText themeColor="accent" type="smallBold">
                  Test tamamlandı! Skorun — Doğru: {result.correct} · Yanlış: {result.wrong}
                </ThemedText>
              </ThemedView>
            )}

            {mistakeWords.length >= MIN_WORDS_FOR_TEST && (
              <Pressable
                onPress={() => setTesting(true)}
                style={({ pressed }) => [
                  styles.testButton,
                  {
                    backgroundColor: theme.accent,
                    transform: [{ scale: pressed ? 0.97 : 1 }],
                  },
                ]}
              >
                <MaterialCommunityIcons name="play-circle-outline" size={20} color={theme.bg} />
                <ThemedText type="smallBold" themeColor="bg">
                  Hata Testi Başlat ({mistakeWords.length} Kelime)
                </ThemedText>
              </Pressable>
            )}

            <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
              {mistakeWords.map((word) => (
                <ThemedView key={word.id} type="bgCard" style={[styles.wordCard, { borderColor: theme.border }]}>
                  <View style={styles.wordInfo}>
                    <ThemedText type="smallBold" style={styles.wordText}>{word.word}</ThemedText>
                    <ThemedText themeColor="textMuted" type="small">
                      {word.translation}
                    </ThemedText>
                  </View>
                  <Pressable
                    onPress={() => handleRemove(word.id)}
                    style={({ pressed }) => [
                      styles.removeButton,
                      {
                        transform: [{ scale: pressed ? 0.9 : 1 }],
                      },
                    ]}
                  >
                    <MaterialCommunityIcons name="delete-outline" size={20} color={theme.error} />
                  </Pressable>
                </ThemedView>
              ))}
            </ScrollView>

            <Pressable
              onPress={handleClearAll}
              style={({ pressed }) => [
                styles.clearAllButton,
                {
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                },
              ]}
            >
              <ThemedText themeColor="textMuted" type="smallBold">
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginBottom: Spacing.two,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleContainer: {
    gap: 2,
    flex: 1,
  },
  title: { fontWeight: '800', fontSize: 18 },
  centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.six,
    gap: Spacing.three,
  },
  emptyText: { textAlign: 'center', lineHeight: 22, fontSize: 14 },
  resultBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.four,
    marginBottom: Spacing.one,
  },
  testButton: {
    borderRadius: 12,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  list: { gap: Spacing.two, paddingBottom: Spacing.four },
  wordCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  wordInfo: { flex: 1, gap: 2 },
  wordText: { fontSize: 16, fontWeight: '800' },
  removeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearAllButton: {
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  offlineChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'center',
    shadowColor: '#ff9f0a',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 3,
  },
  offlineText: {
    color: '#000',
    fontSize: 9,
    fontWeight: '900',
  },
});
