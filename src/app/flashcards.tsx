import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';

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

const FLASHCARD_CATEGORIES = [
  { id: 'literature', label: 'Edebiyat', topic: 'Literature', icon: 'book-open-variant' },
  { id: 'politics', label: 'Siyaset', topic: 'Politics', icon: 'gavel' },
  { id: 'daily', label: 'Günlük Yaşam', topic: 'Daily Life', icon: 'home-outline' },
  { id: 'history', label: 'Tarih', topic: 'History', icon: 'pillar' },
  { id: 'science', label: 'Bilim', topic: 'Science', icon: 'flask-outline' },
  { id: 'psychology', label: 'Psikoloji', topic: 'Psychology', icon: 'brain' },
  { id: 'technology', label: 'Teknoloji', topic: 'Technology', icon: 'laptop' },
  { id: 'health', label: 'Sağlık', topic: 'Health', icon: 'heart-pulse' },
  { id: 'environment', label: 'Çevre', topic: 'Environment', icon: 'leaf' },
  { id: 'sociology', label: 'Sosyoloji', topic: 'Sociology', icon: 'account-group-outline' },
  { id: 'philosophy', label: 'Felsefe', topic: 'Philosophy', icon: 'lightbulb-on-outline' },
  { id: 'economy', label: 'Ekonomi', topic: 'Economy', icon: 'finance' },
  { id: 'art', label: 'Sanat', topic: 'Art', icon: 'palette-outline' },
  { id: 'sports', label: 'Spor', topic: 'Sports', icon: 'soccer' },
  { id: 'space', label: 'Uzay', topic: 'Space', icon: 'rocket-launch-outline' },
  { id: 'travel', label: 'Seyahat', topic: 'Travel and Tourism', icon: 'airplane' },
] as const;

export default function FlashcardsScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const [decks, setDecks] = useState<FlashcardDeck[]>([]);
  const [activeDeck, setActiveDeck] = useState<FlashcardDeck | null>(null);
  const [cardIndex, setCardIndex] = useState(0);
  const [showBack, setShowBack] = useState(false);

  const [creating, setCreating] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<(typeof FLASHCARD_CATEGORIES)[number] | null>(null);
  const [level, setLevel] = useState<(typeof LEVELS)[number]>('B1');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatingSentence, setGeneratingSentence] = useState(false);

  useEffect(() => {
    if (!user) return;
    return subscribeToUserDecks(user.uid, setDecks);
  }, [user]);

  async function handleGenerateDeck() {
    if (!user || !selectedCategory || generating) return;
    setGenerating(true);
    setError(null);
    try {
      const cards = await generateFlashcardDeck(selectedCategory.topic, level, 10);
      await createDeck(
        user.uid,
        selectedCategory.label,
        level,
        cards.map((c) => ({ ...c, status: 'new' as const }))
      );
      setSelectedCategory(null);
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
      // sessizce yut
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
        <SafeAreaView style={styles.safeArea} edges={['top']}>
          <View style={styles.header}>
            <Pressable
              onPress={() => setActiveDeck(null)}
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
              <ThemedText type="subtitle" style={styles.title} numberOfLines={1}>
                {activeDeck.name}
              </ThemedText>
              <ThemedText themeColor="textMuted" type="small">
                Kart {cardIndex + 1} / {activeDeck.cards.length}
              </ThemedText>
            </View>
          </View>

          <Pressable
            onPress={() => setShowBack((v) => !v)}
            style={({ pressed }) => [
              styles.flashcard,
              {
                backgroundColor: theme.bgCard,
                borderColor: theme.border,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              },
            ]}
          >
            <ThemedText style={styles.cardWord}>
              {card.word}
            </ThemedText>
            {showBack && (
              <>
                <View style={[styles.cardDivider, { backgroundColor: theme.border }]} />
                <ThemedText themeColor="accent" style={styles.cardMeaning}>
                  {card.meaning}
                </ThemedText>
                {card.sentence ? (
                  <ThemedText themeColor="textMuted" style={styles.cardSentence}>
                    {"\""}{card.sentence}{"\""}
                  </ThemedText>
                ) : (
                  <Pressable
                    onPress={handleGenerateSentence}
                    disabled={generatingSentence}
                    style={({ pressed }) => [
                      styles.wandButton,
                      {
                        backgroundColor: theme.bgElevated,
                        borderColor: theme.border,
                        transform: [{ scale: pressed ? 0.95 : 1 }],
                      },
                    ]}
                  >
                    {generatingSentence ? (
                      <ActivityIndicator color={theme.accent} size="small" />
                    ) : (
                      <>
                        <MaterialCommunityIcons name="auto-fix" size={16} color={theme.accent} />
                        <ThemedText type="smallBold" themeColor="accent">
                          Örnek Cümle Üret
                        </ThemedText>
                      </>
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
              style={({ pressed }) => [
                styles.answerButton,
                {
                  borderColor: theme.error,
                  backgroundColor: theme.bgCard,
                  transform: [{ scale: pressed ? 0.96 : 1 }],
                },
              ]}
            >
              <ThemedText type="smallBold" themeColor="error">
                Bilemedim
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={() => handleAnswer('known')}
              style={({ pressed }) => [
                styles.answerButton,
                {
                  backgroundColor: theme.accent,
                  borderColor: theme.accent,
                  transform: [{ scale: pressed ? 0.96 : 1 }],
                },
              ]}
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
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <Pressable
            onPress={() => {
              if (creating) {
                setCreating(false);
                setSelectedCategory(null);
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
            <ThemedText type="subtitle" style={styles.title}>
              Kartlar
            </ThemedText>
            <ThemedText type="small" themeColor="textMuted">
              Hafıza Kartı Desteleri
            </ThemedText>
          </View>
        </View>

        {!creating && (
          <Pressable
            onPress={() => setCreating(true)}
            style={({ pressed }) => [
              styles.newDeckButton,
              {
                backgroundColor: theme.accent,
                transform: [{ scale: pressed ? 0.97 : 1 }],
              },
            ]}
          >
            <MaterialCommunityIcons name="plus" size={20} color={theme.bg} />
            <ThemedText type="smallBold" themeColor="bg">
              AI ile Yeni Deste Oluştur
            </ThemedText>
          </Pressable>
        )}

        {creating && (
          <ThemedView type="bgCard" style={[styles.createCard, { borderColor: theme.border }]}>
            <ThemedText type="smallBold" themeColor="textMuted" style={styles.controlSectionLabel}>
              KATEGORİ SEÇİN
            </ThemedText>
            <ScrollView style={styles.categoryScroll} contentContainerStyle={styles.categoryGrid}>
              {FLASHCARD_CATEGORIES.map((cat) => {
                const active = selectedCategory?.id === cat.id;
                return (
                  <Pressable
                    key={cat.id}
                    onPress={() => setSelectedCategory(cat)}
                    style={({ pressed }) => [
                      styles.categoryCard,
                      {
                        backgroundColor: active ? theme.accent : theme.bgElevated,
                        borderColor: active ? theme.accent : theme.border,
                        transform: [{ scale: pressed ? 0.96 : 1 }],
                      },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={cat.icon}
                      size={20}
                      color={active ? theme.bg : theme.textMuted}
                    />
                    <ThemedText type="smallBold" themeColor={active ? 'bg' : 'text'}>
                      {cat.label}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </ScrollView>

            <ThemedText type="smallBold" themeColor="textMuted" style={styles.controlSectionLabel}>
              ZORLUK SEVİYESİ
            </ThemedText>
            <View style={styles.levelRow}>
              {LEVELS.map((lvl) => {
                const active = lvl === level;
                return (
                  <Pressable
                    key={lvl}
                    onPress={() => setLevel(lvl)}
                    style={({ pressed }) => [
                      styles.levelChip,
                      {
                        backgroundColor: active ? theme.accent : theme.bgElevated,
                        borderColor: active ? theme.accent : theme.border,
                        transform: [{ scale: pressed ? 0.95 : 1 }],
                      },
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
              <ThemedText themeColor="error" type="small" style={styles.errorText}>
                {error}
              </ThemedText>
            )}

            <Pressable
              onPress={handleGenerateDeck}
              disabled={generating || !selectedCategory}
              style={({ pressed }) => [
                styles.newDeckButton,
                {
                  backgroundColor: theme.accent,
                  opacity: generating || !selectedCategory ? 0.6 : 1,
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                },
              ]}
            >
              {generating ? (
                <ActivityIndicator color={theme.bg} />
              ) : (
                <>
                  <MaterialCommunityIcons name="flash-outline" size={20} color={theme.bg} />
                  <ThemedText type="smallBold" themeColor="bg">
                    Deste Oluştur
                  </ThemedText>
                </>
              )}
            </Pressable>
          </ThemedView>
        )}

        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {!creating && decks.length === 0 && (
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons name="card-multiple-outline" size={48} color={theme.textMuted} />
              <ThemedText themeColor="textMuted" style={styles.centerBox}>
                Henüz desteniz yok. Yukarıdan bir konu seçip ilk destenizi oluşturabilirsiniz.
              </ThemedText>
            </View>
          )}
          {!creating &&
            decks.map((deck) => {
              const known = deck.cards.filter((c) => c.status === 'known').length;
              return (
                <ThemedView key={deck.id} type="bgCard" style={[styles.deckCard, { borderColor: theme.border }]}>
                  <Pressable onPress={() => openDeck(deck)} style={styles.deckInfo}>
                    <ThemedText type="smallBold" style={styles.deckName}>
                      {deck.name}
                    </ThemedText>
                    <ThemedText themeColor="textMuted" type="small">
                      {deck.cards.length} kart · {known} biliniyor
                    </ThemedText>
                  </Pressable>
                  <Pressable
                    onPress={() => user && deleteDeck(user.uid, deck.id)}
                    style={({ pressed }) => [
                      styles.deleteButton,
                      {
                        transform: [{ scale: pressed ? 0.9 : 1 }],
                      },
                    ]}
                  >
                    <MaterialCommunityIcons name="trash-can-outline" size={20} color={theme.error} />
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
  newDeckButton: {
    borderRadius: 12,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  createCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  controlSectionLabel: {
    fontSize: 11,
    letterSpacing: 1,
  },
  categoryScroll: {
    maxHeight: 220,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  categoryCard: {
    flexBasis: '47%',
    flexGrow: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: Spacing.two + 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  levelRow: { flexDirection: 'row', gap: Spacing.two },
  levelChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
  },
  errorText: { textAlign: 'center' },
  list: { gap: Spacing.two, paddingBottom: Spacing.six },
  emptyContainer: {
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.six,
    paddingHorizontal: Spacing.four,
  },
  centerBox: { textAlign: 'center', lineHeight: 22 },
  deckCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: Spacing.three + 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  deckInfo: { flex: 1, gap: Spacing.half },
  deckName: { fontSize: 15, fontWeight: '800' },
  deleteButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flashcard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    padding: Spacing.six,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 260,
    gap: Spacing.three,
    marginVertical: Spacing.two,
  },
  cardWord: { fontSize: 28, fontWeight: '900', textAlign: 'center' },
  cardDivider: { height: StyleSheet.hairlineWidth, width: 80, marginVertical: Spacing.one },
  cardMeaning: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  cardSentence: { textAlign: 'center', fontStyle: 'italic', lineHeight: 22, marginTop: Spacing.one },
  tapHint: { marginTop: Spacing.two, fontSize: 13 },
  wandButton: {
    marginTop: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  answerRow: { flexDirection: 'row', gap: Spacing.three, marginTop: Spacing.two },
  answerButton: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
});
