import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { fetchReadingQuiz, type QuizQuestion } from '@/lib/api';
import { completeReadingPassage } from '@/lib/firestore';
import { useTheme } from '@/hooks/use-theme';

type Props = { visible: boolean; passageText: string; onClose: () => void };

const OPTION_KEYS = ['a', 'b', 'c', 'd'] as const;

// Web'de olduğu gibi tüm sorular doğru cevaplanana kadar tamamlanmış
// sayılmıyor — yanlış cevaplar sadece görsel işaretleniyor, tekrar
// deneme sınırı yok (bkz. ydtfocusv2 reading/page.js checkAnswer).
export function PassageQuizModal({ visible, passageText, onClose }: Props) {
  const theme = useTheme();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setError(null);
    setQuestions([]);
    setAnswers({});
    setCompleted(false);
    fetchReadingQuiz(passageText)
      .then(setQuestions)
      .catch(() => setError('Quiz oluşturulamadı, tekrar dene.'))
      .finally(() => setLoading(false));
  }, [visible, passageText]);

  useEffect(() => {
    if (questions.length === 0 || completed) return;
    const allAnswered = questions.every((_, idx) => answers[idx]);
    if (!allAnswered) return;
    const allCorrect = questions.every((q, idx) => answers[idx] === q.correct);
    if (allCorrect && user) {
      setCompleted(true);
      completeReadingPassage(user.uid).catch(() => {});
    }
  }, [answers, questions, completed, user]);

  function handleSelect(qIdx: number, key: string) {
    if (answers[qIdx]) return;
    setAnswers((prev) => ({ ...prev, [qIdx]: key }));
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ThemedView type="bgCard" style={[styles.sheet, { borderColor: theme.border }]}>
          <View style={styles.header}>
            <ThemedText type="subtitle" themeColor="accent" style={styles.title}>
              Quiz
            </ThemedText>
            <Pressable onPress={onClose}>
              <ThemedText type="smallBold" themeColor="textMuted">
                Kapat
              </ThemedText>
            </Pressable>
          </View>

          {loading && (
            <View style={styles.centerBox}>
              <ActivityIndicator color={theme.accent} />
            </View>
          )}

          {!loading && error && (
            <ThemedText themeColor="error" style={styles.centerBox}>
              {error}
            </ThemedText>
          )}

          <ScrollView contentContainerStyle={styles.scrollContent}>
          {!loading &&
            questions.map((question, qIdx) => (
              <View key={qIdx} style={styles.questionBox}>
                <ThemedText type="smallBold" style={styles.questionText}>
                  {qIdx + 1}. {question.q}
                </ThemedText>
                {OPTION_KEYS.map((key) => {
                  const answered = answers[qIdx];
                  const isSelected = answered === key;
                  const isCorrectKey = key === question.correct;
                  const bg = !answered
                    ? theme.bgElevated
                    : isCorrectKey
                      ? theme.accent
                      : isSelected
                        ? theme.error
                        : theme.bgElevated;
                  return (
                    <Pressable
                      key={key}
                      onPress={() => handleSelect(qIdx, key)}
                      disabled={!!answered}
                      style={[styles.optionButton, { backgroundColor: bg, borderColor: theme.border }]}
                    >
                      <ThemedText
                        type="small"
                        themeColor={answered && (isCorrectKey || isSelected) ? 'bg' : 'text'}
                      >
                        {question[key]}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            ))}

          {completed && (
            <ThemedText themeColor="accent" type="smallBold" style={styles.centerBox}>
              Tebrikler, tüm soruları doğru cevapladın! 🎉
            </ThemedText>
          )}
          </ScrollView>
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.four,
    maxHeight: '85%',
    gap: Spacing.three,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '900' },
  centerBox: { paddingVertical: Spacing.four, textAlign: 'center' },
  scrollContent: { gap: Spacing.three },
  questionBox: { gap: Spacing.two },
  questionText: { marginBottom: Spacing.one },
  optionButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
});
