import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { WordQuiz } from '@/components/word-quiz';
import { getUserWords, type UserWord } from '@/lib/firestore';
import { useTheme } from '@/hooks/use-theme';

export default function ReviewScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [dueWords, setDueWords] = useState<UserWord[]>([]);
  const [result, setResult] = useState<{ correct: number; wrong: number } | null>(null);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(!!state.isConnected);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    getUserWords(user.uid).then((words) => {
      setDueWords(words.filter((w) => (w.nextReview || 0) <= Date.now()));
      setLoading(false);
    });
  }, [user]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
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
                Akıllı Tekrar
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
              Kelime Hafıza Sınavı
            </ThemedText>
          </View>
        </View>

        {loading && (
          <View style={styles.centerBox}>
            <ActivityIndicator color={theme.accent} size="large" />
          </View>
        )}

        {!loading && dueWords.length === 0 && !result && (
          <ThemedView type="bgCard" style={[styles.emptyCard, { borderColor: theme.border }]}>
            <MaterialCommunityIcons name="check-decagram" size={48} color={theme.accent} style={styles.emptyIcon} />
            <ThemedText type="smallBold" style={styles.emptyTitle}>
              Her Şey Güncel!
            </ThemedText>
            <ThemedText themeColor="textMuted" style={styles.emptyDesc}>
              Bugün tekrar edilecek kelime bulunmuyor. Kelime bankana yeni kelimeler ekledikçe burada listelenecektir.
            </ThemedText>
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [
                styles.doneButton,
                {
                  backgroundColor: theme.accent,
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                },
              ]}
            >
              <ThemedText type="smallBold" themeColor="bg">
                Panele Dön
              </ThemedText>
            </Pressable>
          </ThemedView>
        )}

        {!loading && dueWords.length > 0 && !result && (
          <WordQuiz words={dueWords} onFinish={setResult} />
        )}

        {result && (
          <ThemedView type="bgCard" style={[styles.resultCard, { borderColor: theme.border }]}>
            <MaterialCommunityIcons name="trophy-outline" size={54} color={theme.accent} style={styles.trophyIcon} />
            <ThemedText type="subtitle" style={styles.resultTitle}>
              Tekrar Tamamlandı
            </ThemedText>
            <ThemedText themeColor="textMuted" style={styles.resultDesc}>
              Hafızanı başarıyla tazeledin!
            </ThemedText>

            <View style={[styles.statsRow, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}>
              <View style={styles.statItem}>
                <ThemedText type="subtitle" themeColor="accent" style={styles.statValue}>
                  {result.correct}
                </ThemedText>
                <ThemedText themeColor="textMuted" type="small">
                  Doğru
                </ThemedText>
              </View>
              <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
              <View style={styles.statItem}>
                <ThemedText type="subtitle" themeColor="error" style={styles.statValue}>
                  {result.wrong}
                </ThemedText>
                <ThemedText themeColor="textMuted" type="small">
                  Yanlış
                </ThemedText>
              </View>
            </View>

            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [
                styles.doneButton,
                {
                  backgroundColor: theme.accent,
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                },
              ]}
            >
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginBottom: Spacing.four,
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
  },
  title: { fontWeight: '800' },
  centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: Spacing.five,
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.six,
  },
  emptyIcon: { marginBottom: Spacing.one },
  emptyTitle: { fontSize: 18, fontWeight: '800' },
  emptyDesc: { textAlign: 'center', lineHeight: 22, marginBottom: Spacing.two },
  resultCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: Spacing.five,
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.four,
  },
  trophyIcon: { marginBottom: Spacing.two },
  resultTitle: { fontWeight: '800' },
  resultDesc: { fontSize: 14, marginBottom: Spacing.two },
  statsRow: {
    flexDirection: 'row',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingVertical: Spacing.three,
    width: '100%',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: { fontWeight: '900' },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    height: 30,
  },
  doneButton: {
    borderRadius: 12,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.six,
    alignSelf: 'stretch',
    alignItems: 'center',
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
