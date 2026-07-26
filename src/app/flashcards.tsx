import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { generateExampleSentence, generateFlashcardDeck } from '@/lib/api';
import {
  createDeck,
  deleteDeck,
  subscribeToUserDecks,
  updateCardSentence,
  updateCardStatus,
  type FlashcardDeck,
} from '@/lib/firestore';
import { useTheme } from '@/hooks/use-theme';

const LEVELS = ['A2', 'B1', 'B2', 'C1'] as const;

// Kartlar (Flashcards) — web'deki FlashcardsHubPanel.js ile ayni veri
// modeli (users/{uid}/flashcardDecks). AI ile deste uretimi web'in
// dedike /api/generate-deck route'u uzerinden. Web'deki swipe/drag
// etkilesimi yerine basit "Bildim"/"Bilemedim" butonlari kullanildi —
// ayni sonuc (status guncelleme), daha az karmasik uygulama.
export default function FlashcardsScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const [decks, setDecks] = useState<FlashcardDeck[]>([]);
  const [activeDeck, setActiveDeck] = useState<FlashcardDeck | null>(null);
  const [cardIndex, setCardIndex] = useState(0);
  const [showBack, setShowBack] = useState(false);

  const [creating, setCreating] = useState(false);
  const [topic, setTopic] = useState('');
  const [level, setLevel] = useState<(typeof LEVELS)[number]>('B1');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatingSentence, setGeneratingSentence] = useState(false);

  useEffect(() => {
    if (!user) return;
    return subscribeToUserDecks(user.uid, setDecks);
  }, [user]);

  async function handleGenerateDeck() {
    if (!user || !topic.trim() || generating) return;
    setGenerating(true);
    setError(null);
    try {
      const cards = await generateFlashcardDeck(topic.trim(), level, 10);
      await createDeck(
        user.uid,
        topic.trim(),
        level,
        cards.map((c) => ({ ...c, status: 'new' as const }))
      );
      setTopic('');
      setCreating(false);
    } catch {
      setError('Deste oluşturulamadı, tekrar dene.');
    } finally {
      setGenerating(false);
    }
  }

  function openDeck(deck: FlashcardDeck) {
    setActiveDeck(deck);
    setCardIndex(0);
    setShowBack(false);
  }

  // "Sihirli değnek" — web'in FlashcardsHubPanel.js'indeki tek-kart
  // örnek cümle üretimi. generateExampleSentence generic /api/groq
  // passthrough'una web'in buildExampleSentencePrompt'unu birebir
  // yansıtarak gidiyor (bkz. src/lib/api.ts).
  async function handleGenerateSentence() {
    if (!user || !activeDeck || generatingSentence) return;
    const card = activeDeck.cards[cardIndex];
    setGeneratingSentence(true);
    try {
      const cardLevel = (LEVELS as readonly string[]).includes(activeDeck.level ?? '')
        ? (activeDeck.level as (typeof LEVELS)[number])
        : 'B1';
      const sentence = await generateExampleSentence(card.word, card.meaning, cardLevel);
      await updateCardSentence(user.uid, activeDeck, cardIndex, sentence);
      setActiveDeck((prev) =>
        prev
          ? { ...prev, cards: prev.cards.map((c, i) => (i === cardIndex ? { ...c, sentence } : c)) }
          : prev
      );
    } catch {
      // sessizce yut — örnek cümle isteğe bağlı bir zenginleştirme, akışı bloklamaya değmez
    } finally {
      setGeneratingSentence(false);
    }
  }

  async function handleAnswer(status: 'known' | 'unknown') {
    if (!user || !activeDeck) return;
    await updateCardStatus(user.uid, activeDeck, cardIndex, status);
    if (cardIndex + 1 < activeDeck.cards.length) {
      setCardIndex((i) => i + 1);
      setShowBack(false);
    } else {
      setActiveDeck(null);
    }
  }

  if (activeDeck) {
    const card = activeDeck.cards[cardIndex];
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.header}>
            <Pressable onPress={() => setActiveDeck(null)} style={styles.backButton}>
              <ThemedText type="smallBold" themeColor="accent">
                ‹ Desteler
              </ThemedText>
            </Pressable>
            <ThemedText themeColor="textMuted" type="small">
              {cardIndex + 1} / {activeDeck.cards.length}
            </ThemedText>
          </View>

          <Pressable
            onPress={() => setShowBack((v) => !v)}
            style={[styles.flashcard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}
          >
            <ThemedText type="subtitle" style={styles.cardWord}>
              {card.word}
            </ThemedText>
            {showBack && (
              <>
                <ThemedText themeColor="accent" style={styles.cardMeaning}>
                  {card.meaning}
                </ThemedText>
                {card.sentence ? (
                  <ThemedText themeColor="textMuted" style={styles.cardSentence}>
                    {card.sentence}
                  </ThemedText>
                ) : (
                  <Pressable onPress={handleGenerateSentence} disabled={generatingSentence} style={styles.wandButton}>
                    {generatingSentence ? (
                      <ActivityIndicator color={theme.accent} />
                    ) : (
                      <ThemedText type="smallBold" themeColor="accent">
                        Örnek Cümle Üret
                      </ThemedText>
                    )}
                  </Pressable>
                )}
              </>
            )}
            {!showBack && (
              <ThemedText themeColor="textMuted" type="small" style={styles.tapHint}>
                Anlamı görmek için dokun
              </ThemedText>
            )}
          </Pressable>

          <View style={styles.answerRow}>
            <Pressable
              onPress={() => handleAnswer('unknown')}
              style={[styles.answerButton, { borderColor: theme.error }]}
            >
              <ThemedText type="smallBold" themeColor="error">
                Bilemedim
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={() => handleAnswer('known')}
              style={[styles.answerButton, { backgroundColor: theme.accent, borderColor: theme.accent }]}
            >
              <ThemedText type="smallBold" themeColor="bg">
                Bildim
              </ThemedText>
            </Pressable>
          </View>
        </SafeAreaView>
      </ThemedView>
    );
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
            Kartlar
          </ThemedText>
        </View>

        {!creating && (
          <Pressable onPress={() => setCreating(true)} style={[styles.newDeckButton, { backgroundColor: theme.accent }]}>
            <ThemedText type="smallBold" themeColor="bg">
              + AI ile Yeni Deste Oluştur
            </ThemedText>
          </Pressable>
        )}

        {creating && (
          <ThemedView type="bgCard" style={[styles.createCard, { borderColor: theme.border }]}>
            <TextInput
              value={topic}
              onChangeText={setTopic}
              placeholder="Konu (ör. Seyahat, İş Dünyası...)"
              placeholderTextColor={theme.textMuted}
              style={[styles.input, { backgroundColor: theme.bgElevated, color: theme.text, borderColor: theme.border }]}
            />
            <View style={styles.levelRow}>
              {LEVELS.map((lvl) => {
                const active = lvl === level;
                return (
                  <Pressable
                    key={lvl}
                    onPress={() => setLevel(lvl)}
                    style={[
                      styles.levelChip,
                      { backgroundColor: active ? theme.accent : theme.bgElevated, borderColor: active ? theme.accent : theme.border },
                    ]}
                  >
                    <ThemedText type="smallBold" themeColor={active ? 'bg' : 'textMuted'}>
                      {lvl}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
            {error && (
              <ThemedText themeColor="error" type="small">
                {error}
              </ThemedText>
            )}
            <Pressable
              onPress={handleGenerateDeck}
              disabled={generating || !topic.trim()}
              style={[styles.newDeckButton, { backgroundColor: theme.accent, opacity: generating || !topic.trim() ? 0.6 : 1 }]}
            >
              {generating ? (
                <ActivityIndicator color={theme.bg} />
              ) : (
                <ThemedText type="smallBold" themeColor="bg">
                  Oluştur
                </ThemedText>
              )}
            </Pressable>
          </ThemedView>
        )}

        <ScrollView contentContainerStyle={styles.list}>
          {decks.length === 0 && (
            <ThemedText themeColor="textMuted" style={styles.centerBox}>
              Henüz destenin yok. Yukarıdan bir konu girip AI ile ilk
              desteni oluştur.
            </ThemedText>
          )}
          {decks.map((deck) => {
            const known = deck.cards.filter((c) => c.status === 'known').length;
            return (
              <ThemedView key={deck.id} type="bgCard" style={[styles.deckCard, { borderColor: theme.border }]}>
                <Pressable onPress={() => openDeck(deck)} style={styles.deckInfo}>
                  <ThemedText type="smallBold">{deck.name}</ThemedText>
                  <ThemedText themeColor="textMuted" type="small">
                    {deck.cards.length} kart · {known} biliniyor
                  </ThemedText>
                </Pressable>
                <Pressable onPress={() => user && deleteDeck(user.uid, deck.id)}>
                  <ThemedText themeColor="error" type="small">
                    Sil
                  </ThemedText>
                </Pressable>
              </ThemedView>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four, paddingTop: Spacing.four, gap: Spacing.three },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  backButton: { paddingVertical: Spacing.one },
  title: { fontWeight: '800' },
  newDeckButton: { borderRadius: 10, paddingVertical: Spacing.two + 2, alignItems: 'center' },
  createCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: Spacing.three, gap: Spacing.two },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  levelRow: { flexDirection: 'row', gap: Spacing.two },
  levelChip: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one + 2 },
  list: { gap: Spacing.two, paddingBottom: Spacing.six },
  centerBox: { paddingTop: Spacing.six, textAlign: 'center' },
  deckCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  deckInfo: { flex: 1, gap: Spacing.half },
  flashcard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: Spacing.six,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 220,
    gap: Spacing.two,
  },
  cardWord: { fontWeight: '800', textAlign: 'center' },
  cardMeaning: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  cardSentence: { textAlign: 'center', fontStyle: 'italic' },
  tapHint: { marginTop: Spacing.two },
  wandButton: { marginTop: Spacing.two },
  answerRow: { flexDirection: 'row', gap: Spacing.two },
  answerButton: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingVertical: Spacing.two + 2,
    alignItems: 'center',
  },
});
