import { useMemo, useRef, useState } from 'react';
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
  const scale = useRef(new Animated.Value(1)).current;

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
    const nextReview = Date.now() + LEVEL_INTERVALS[newLevel] * 86400000;

    await updateUserWord(user.uid, current.id, {
      level: newLevel,
      nextReview,
      correctCount: (current.correctCount || 0) + (isCorrect ? 1 : 0),
      wrongCount: (current.wrongCount || 0) + (isCorrect ? 0 : 1),
    });

    if (mistakesMode) {
      if (isCorrect) await removeMistake(user.uid, current.id);
    } else if (!isCorrect) {
      await addMistake(user.uid, current.id);
    }

    setTally((prev) => ({
      correct: prev.correct + (isCorrect ? 1 : 0),
      wrong: prev.wrong + (isCorrect ? 0 : 1),
    }));

    setTimeout(async () => {
      if (index + 1 < words.length) {
        setIndex((i) => i + 1);
        setSelected(null);
        setLastCorrect(null);
      } else {
        const final = {
          correct: tally.correct + (isCorrect ? 1 : 0),
          wrong: tally.wrong + (isCorrect ? 0 : 1),
        };
        await updateUserStats(user.uid, final);
        await refreshUserStreak(user.uid).catch(() => {});
        onFinish(final);
      }
    }, 700);
  }

  if (!current) return null;

  return (
    <View style={styles.container}>
      <ThemedText themeColor="textMuted" type="small" style={styles.progress}>
        {index + 1} / {words.length}
      </ThemedText>
      <ThemedText type="subtitle" style={styles.word}>
        {current.word}
      </ThemedText>

      <View style={styles.feedbackSlot}>
        {lastCorrect !== null && (
          <ThemedText
            themeColor={lastCorrect ? 'accent' : 'error'}
            type="smallBold"
            style={styles.feedbackText}
          >
            {lastCorrect ? 'Doğru!' : `Yanlış, doğrusu: ${current.translation}`}
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
                style={[styles.optionButton, { backgroundColor: bg, borderColor: theme.border }]}
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
          <ThemedText themeColor="accent" type="smallBold">
            Doğru: {tally.correct}
          </ThemedText>
          <ThemedText themeColor="error" type="smallBold">
            Yanlış: {tally.wrong}
          </ThemedText>
        </View>
        {streak >= 3 && (
          <ThemedText themeColor="accent" type="small" style={styles.streakText}>
            Seri: {streak}
          </ThemedText>
        )}
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.three, width: '100%' },
  progress: { textAlign: 'center' },
  word: { textAlign: 'center', fontWeight: '800' },
  feedbackSlot: { minHeight: 20, justifyContent: 'center' },
  feedbackText: { textAlign: 'center' },
  options: { gap: Spacing.two },
  optionButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
  },
  optionText: { textAlign: 'center' },
  tallyBox: {
    gap: Spacing.one,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: Spacing.two,
  },
  tallyRow: { flexDirection: 'row', justifyContent: 'space-between' },
  streakText: { textAlign: 'center' },
});
