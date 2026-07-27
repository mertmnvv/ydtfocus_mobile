import { useMemo, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { buildQuizOptions, LEVEL_INTERVALS, type QuizOption } from '@/constants/srs';
import { useAuth } from '@/context/auth-context';
import {
  addMistake,
  refreshUserStreak,
  removeMistake,
  updateUserStats,
  updateUserWord,
  type UserWord,
} from '@/lib/firestore';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  words: UserWord[];
  // mistakesMode: true ise doğru cevap listeden (removeMistake) çıkarılır,
  // level/nextReview yine de güncellenir (aynı kelime, aynı SRS durumu).
  mistakesMode?: boolean;
  onFinish: (result: { correct: number; wrong: number }) => void;
};

export function WordQuiz({ words, mistakesMode, onFinish }: Props) {
  const theme = useTheme();
  const { user } = useAuth();
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [tally, setTally] = useState({ correct: 0, wrong: 0 });
  const [streak, setStreak] = useState(0);
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(null);
  const [scale] = useState(() => new Animated.Value(1));

  const current = words[index];
  const options = useMemo<QuizOption[]>(() => {
    if (!current) return [];
    const others = words.filter((w) => w.id !== current.id).map((w) => w.translation);
    return buildQuizOptions(current.translation, others);
  }, [current, words]);

  async function handleAnswer(option: QuizOption) {
    if (!user || !current || selected) return;
    setSelected(option.text);

    const isCorrect = option.isCorrect;
    setLastCorrect(isCorrect);
    setStreak((s) => (isCorrect ? s + 1 : 0));

    scale.setValue(isCorrect ? 0.9 : 1);
    Animated.spring(scale, {
      toValue: 1,
      friction: 4,
      tension: 60,
      useNativeDriver: true,
    }).start();

    const newLevel = isCorrect ? Math.min(4, (current.level || 0) + 1) : 0;
    const nextReview = new Date().getTime() + LEVEL_INTERVALS[newLevel] * 86400000;

    updateUserWord(user.uid, current.id, {
      level: newLevel,
      nextReview,
      correctCount: (current.correctCount || 0) + (isCorrect ? 1 : 0),
      wrongCount: (current.wrongCount || 0) + (isCorrect ? 0 : 1),
    }).catch((err) => console.error('Error updating user word:', err));

    if (mistakesMode) {
      if (isCorrect) {
        removeMistake(user.uid, current.id).catch((err) =>
          console.error('Error removing mistake:', err)
        );
      }
    } else if (!isCorrect) {
      addMistake(user.uid, current.id).catch((err) =>
        console.error('Error adding mistake:', err)
      );
    }

    const newCorrect = tally.correct + (isCorrect ? 1 : 0);
    const newWrong = tally.wrong + (isCorrect ? 0 : 1);

    setTally({ correct: newCorrect, wrong: newWrong });

    setTimeout(async () => {
      if (index + 1 < words.length) {
        setIndex((i) => i + 1);
        setSelected(null);
        setLastCorrect(null);
      } else {
        const final = { correct: newCorrect, wrong: newWrong };
        try {
          await updateUserStats(user.uid, final);
          await refreshUserStreak(user.uid).catch(() => {});
        } catch (err) {
          console.error('Error updating final stats/streak:', err);
        }
        onFinish(final);
      }
    }, 700);
  }

  if (!current) return null;

  return (
    <View style={styles.container}>
      <View style={styles.progressContainer}>
        <ThemedText themeColor="textMuted" type="smallBold" style={styles.progressText}>
          Soru {index + 1} / {words.length}
        </ThemedText>
        <View style={[styles.progressTrack, { backgroundColor: theme.bgElevated }]}>
          <View style={[styles.progressFill, { width: `${((index + 1) / words.length) * 100}%`, backgroundColor: theme.accent }]} />
        </View>
      </View>

      <ThemedView type="bgCard" style={[styles.wordCard, { borderColor: theme.border }]}>
        <ThemedText style={styles.word}>
          {current.word}
        </ThemedText>
      </ThemedView>

      <View style={styles.feedbackSlot}>
        {lastCorrect !== null && (
          <ThemedText
            themeColor={lastCorrect ? 'accent' : 'error'}
            type="smallBold"
            style={styles.feedbackText}
          >
            {lastCorrect ? 'Harika, Doğru!' : `Yanlış, doğrusu: ${current.translation}`}
          </ThemedText>
        )}
      </View>

      <View style={styles.options}>
        {options.map((option) => {
          const isSelected = selected === option.text;
          const showCorrectness = selected !== null;
          const bg = !showCorrectness
            ? theme.bgCard
            : option.isCorrect
              ? theme.accent
              : isSelected
                ? theme.error
                : theme.bgCard;
          const animateThis = showCorrectness && (option.isCorrect || isSelected);
          return (
            <Animated.View
              key={option.text}
              style={animateThis ? { transform: [{ scale }] } : undefined}
            >
              <Pressable
                onPress={() => handleAnswer(option)}
                disabled={selected !== null}
                style={({ pressed }) => [
                  styles.optionButton,
                  {
                    backgroundColor: bg,
                    borderColor: theme.border,
                    transform: [{ scale: pressed && !showCorrectness ? 0.98 : 1 }],
                  },
                ]}
              >
                <ThemedText
                  type="smallBold"
                  themeColor={showCorrectness && (option.isCorrect || isSelected) ? 'bg' : 'text'}
                  style={styles.optionText}
                >
                  {option.text}
                </ThemedText>
              </Pressable>
            </Animated.View>
          );
        })}
      </View>

      <ThemedView type="bgCard" style={[styles.tallyBox, { borderColor: theme.border }]}>
        <View style={styles.tallyRow}>
          <View style={styles.tallyItem}>
            <ThemedText themeColor="accent" type="smallBold">
              Doğru: {tally.correct}
            </ThemedText>
          </View>
          <View style={styles.tallyItem}>
            <ThemedText themeColor="error" type="smallBold">
              Yanlış: {tally.wrong}
            </ThemedText>
          </View>
        </View>
        {streak >= 3 && (
          <ThemedText themeColor="accent" type="small" style={styles.streakText}>
            🔥 Seri: {streak}
          </ThemedText>
        )}
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.three, width: '100%' },
  progressContainer: { gap: Spacing.one },
  progressText: { textAlign: 'center', fontSize: 13 },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  wordCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingVertical: Spacing.five,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: Spacing.one,
  },
  word: { fontSize: 24, fontWeight: '900', textAlign: 'center' },
  feedbackSlot: { minHeight: 24, justifyContent: 'center' },
  feedbackText: { textAlign: 'center', fontSize: 13 },
  options: { gap: Spacing.two },
  optionButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
  },
  optionText: { textAlign: 'center', fontSize: 15 },
  tallyBox: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: Spacing.three,
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  tallyRow: { flexDirection: 'row', width: '100%', justifyContent: 'space-around' },
  tallyItem: { alignItems: 'center' },
  streakText: { textAlign: 'center', fontWeight: '800' },
});
