import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { fetchLevelTestQuestions, type LevelTestQuestion } from '@/lib/api';
import { setUserLevel } from '@/lib/firestore';
import { calculateLevel, type CefrLevel } from '@/lib/level-test';
import { useTheme } from '@/hooks/use-theme';

// Kayıt sonrası zorunlu CEFR seviye tespit sınavı (mode: 'onboarding',
// geri tuşu/route.back engellenir — sınav atlanamaz) ya da profilden
// "Seviyeni Yükselt" ile isteğe bağlı yeniden giriş (mode: 'retake',
// normal geri davranışı). Kök _layout.tsx'teki RootNavigator, uid'in
// userProfile.level'ı olmadığını gördüğünde kullanıcıyı buraya
// hapsediyor (bkz. _layout.tsx) — sınav bitip setUserLevel çağrılınca
// canlı onSnapshot sayesinde otomatik olarak (tabs)'a geçilir.
export default function LevelTestScreen() {
  const theme = useTheme();
  const { user, logout } = useAuth();
  const params = useLocalSearchParams<{ mode?: string }>();
  const mode = params.mode === 'retake' ? 'retake' : 'onboarding';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [questions, setQuestions] = useState<LevelTestQuestion[]>([]);
  const [current, setCurrent] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [result, setResult] = useState<CefrLevel | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchLevelTestQuestions()
      .then((qs) => setQuestions(qs))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  // Onboarding modunda sınav zorunlu — Android donanım geri tuşu dahil
  // hiçbir şekilde ekrandan çıkılamaz (çıkış için sadece "Çıkış Yap").
  useEffect(() => {
    if (mode !== 'onboarding') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [mode]);

  async function finish(finalCorrectCount: number) {
    if (!user) return;
    const level = calculateLevel(finalCorrectCount);
    setSaving(true);
    try {
      await setUserLevel(user.uid, level);
      setResult(level);
    } finally {
      setSaving(false);
    }
  }

  async function handleFallbackContinue() {
    if (!user) return;
    setSaving(true);
    try {
      await setUserLevel(user.uid, 'B1');
      setResult('B1');
    } finally {
      setSaving(false);
    }
  }

  function handleSelect(optionIdx: number) {
    if (selected !== null) return;
    setSelected(optionIdx);
    const isCorrect = optionIdx === questions[current]?.correctIndex;
    const nextCorrectCount = correctCount + (isCorrect ? 1 : 0);
    setCorrectCount(nextCorrectCount);

    setTimeout(() => {
      const isLast = current === questions.length - 1;
      if (isLast) {
        finish(nextCorrectCount);
      } else {
        setCurrent((c) => c + 1);
        setSelected(null);
      }
    }, 500);
  }

  function handleDone() {
    if (mode === 'onboarding') {
      router.replace('/(tabs)' as never);
    } else {
      router.back();
    }
  }

  const question = questions[current];

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <ThemedText type="title" themeColor="accent" style={styles.brand}>
            ydtfocus
          </ThemedText>
          <ThemedText type="subtitle" style={styles.title}>
            Seviye Tespit Sınavı
          </ThemedText>
        </View>

        <View style={styles.content}>
          {loading && (
            <View style={styles.centerBox}>
              <ActivityIndicator color={theme.accent} />
            </View>
          )}

          {!loading && error && (
            <View style={styles.centerBox}>
              <ThemedText themeColor="error" style={styles.centerText}>
                Sorular yüklenemedi, internet bağlantını kontrol et.
              </ThemedText>
              <Pressable
                onPress={handleFallbackContinue}
                disabled={saving}
                style={[styles.primaryButton, { backgroundColor: theme.accent, opacity: saving ? 0.6 : 1 }]}
              >
                <ThemedText type="smallBold" themeColor="bg">
                  {saving ? 'Kaydediliyor…' : 'B1 ile Devam Et'}
                </ThemedText>
              </Pressable>
            </View>
          )}

          {!loading && !error && result && (
            <View style={styles.centerBox}>
              <ThemedText type="title" themeColor="accent" style={styles.centerText}>
                Seviyeniz: {result}
              </ThemedText>
              <ThemedText themeColor="textMuted" style={styles.centerText}>
                Metin ve alıştırma önerileri artık bu seviyeye göre kişiselleştirilecek.
              </ThemedText>
              <Pressable
                onPress={handleDone}
                style={[styles.primaryButton, { backgroundColor: theme.accent }]}
              >
                <ThemedText type="smallBold" themeColor="bg">
                  Devam Et
                </ThemedText>
              </Pressable>
            </View>
          )}

          {!loading && !error && !result && question && (
            <View style={styles.quizBox}>
              <ThemedText themeColor="textMuted" type="small" style={styles.progressText}>
                {current + 1}/{questions.length}
              </ThemedText>
              <ThemedText type="subtitle" style={styles.questionText}>
                {question.question}
              </ThemedText>
              <View style={styles.optionsBox}>
                {question.options.map((option, idx) => {
                  const isSelected = selected === idx;
                  const isCorrectOption = idx === question.correctIndex;
                  const bg =
                    selected === null
                      ? theme.bgElevated
                      : isCorrectOption
                        ? theme.accent
                        : isSelected
                          ? theme.error
                          : theme.bgElevated;
                  return (
                    <Pressable
                      key={idx}
                      onPress={() => handleSelect(idx)}
                      disabled={selected !== null}
                      style={[styles.optionButton, { backgroundColor: bg, borderColor: theme.border }]}
                    >
                      <ThemedText
                        type="small"
                        themeColor={selected !== null && (isCorrectOption || isSelected) ? 'bg' : 'text'}
                        style={styles.optionText}
                      >
                        {option}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}
        </View>

        <Pressable onPress={() => logout()} style={styles.logoutLink}>
          <ThemedText type="small" themeColor="textMuted" style={styles.logoutText}>
            Çıkış Yap
          </ThemedText>
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four },
  header: { alignItems: 'center', paddingTop: Spacing.four, gap: Spacing.one },
  brand: { fontSize: 22, fontWeight: '900' },
  title: { fontWeight: '800', textAlign: 'center' },
  content: { flex: 1, justifyContent: 'center' },
  centerBox: { alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.four },
  centerText: { textAlign: 'center' },
  primaryButton: {
    marginTop: Spacing.two,
    borderRadius: 10,
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.six,
    alignItems: 'center',
  },
  quizBox: { gap: Spacing.four },
  progressText: { textAlign: 'center' },
  questionText: { textAlign: 'center', fontWeight: '800', lineHeight: 26 },
  optionsBox: { gap: Spacing.two },
  optionButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  optionText: { textAlign: 'center' },
  logoutLink: { alignItems: 'center', paddingVertical: Spacing.three },
  logoutText: { textAlign: 'center' },
});
