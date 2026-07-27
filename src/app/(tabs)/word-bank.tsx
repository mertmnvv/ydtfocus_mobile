import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { fetchSpeechAudio, lookupWord, type WordLookup } from '@/lib/api';
import { playTtsAudio } from '@/lib/audio';
import { deleteUserWord, subscribeToUserWords, type UserWord } from '@/lib/firestore';
import { useTheme } from '@/hooks/use-theme';
import { getWordStatus, getWordStatusLabel, getWordStatusColors, type WordStatus } from '@/lib/word-status';

// Kelime Bankam — SRS'te "sırası gelen" kelimelerle sınırlı olan Akıllı
// Tekrar'ın aksine, users/{uid}/words altındaki TÜM kelimeleri listeler.
// Kart deseni mistakes.tsx/dictionary.tsx ile aynı.
export default function WordBankScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const [words, setWords] = useState<UserWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | WordStatus>('all');

  const [selectedWord, setSelectedWord] = useState<UserWord | null>(null);
  const [lookup, setLookup] = useState<WordLookup | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    const timer = setTimeout(() => {
      setLoading(true);
    }, 0);
    const unsubscribe = subscribeToUserWords(user.uid, (fetched) => {
      setWords(fetched);
      setLoading(false);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [user]);

  const stats = useMemo(() => {
    let newCount = 0;
    let learningCount = 0;
    let masteredCount = 0;
    words.forEach((w) => {
      const status = getWordStatus(w.level ?? 0);
      if (status === 'new') newCount++;
      else if (status === 'learning') learningCount++;
      else if (status === 'mastered') masteredCount++;
    });
    return { newCount, learningCount, masteredCount };
  }, [words]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    let list = words;
    if (statusFilter !== 'all') {
      list = words.filter((w) => getWordStatus(w.level ?? 0) === statusFilter);
    }
    if (!query) return list;
    return list.filter(
      (w) => w.word.toLowerCase().includes(query) || w.translation.toLowerCase().includes(query)
    );
  }, [words, search, statusFilter]);

  async function handleDelete(wordId: string) {
    if (!user) return;
    setDeletingId(wordId);
    try {
      await deleteUserWord(user.uid, wordId);
    } finally {
      setDeletingId(null);
    }
  }

  // Kaydedilen kelimede sadece word/translation/definition tutuluyor
  // (bkz. index.tsx handleSaveWord), synonyms/antonym yerelde yok — bu
  // yüzden modal açılınca reading ekranındaki gibi lookupWord ile daha
  // zengin detay (eş anlamlı, telaffuz vb.) çekilir; API başarısız
  // olursa yerel word/translation/definition alanlarına düşülür (aşağıda
  // lookup null iken bu alanlar doğrudan gösteriliyor).
  async function handleWordPress(item: UserWord) {
    setSelectedWord(item);
    setLookup(null);
    setLookupLoading(true);
    try {
      const result = await lookupWord(item.word);
      setLookup(result);
    } catch {
      setLookup(null);
    } finally {
      setLookupLoading(false);
    }
  }

  async function handleSpeakWord() {
    if (!selectedWord) return;
    try {
      const buffer = await fetchSpeechAudio(selectedWord.word);
      await playTtsAudio(buffer);
    } catch {
      // sessizce yut
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <ThemedText type="subtitle" style={styles.title}>
            Kelime Bankası
          </ThemedText>
        </View>

        <ThemedText themeColor="textMuted" type="small" style={styles.statsText}>
          {`${words.length} kelime  ·  ${stats.newCount} yeni  ·  ${stats.learningCount} öğreniliyor  ·  ${stats.masteredCount} ustalaşıldı`}
        </ThemedText>

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Kelime veya çeviri ara..."
          placeholderTextColor={theme.textMuted}
          style={[styles.input, { backgroundColor: theme.bgElevated, color: theme.text, borderColor: theme.border }]}
        />

        <View style={styles.filterRow}>
          {(['all', 'new', 'learning', 'mastered'] as const).map((filter) => {
            const active = statusFilter === filter;
            const label = filter === 'all' ? 'Tümü' : filter === 'new' ? 'Yeni' : filter === 'learning' ? 'Öğreniliyor' : 'Ustalaşıldı';
            return (
              <Pressable
                key={filter}
                onPress={() => setStatusFilter(filter)}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: active ? theme.accent : theme.bgCard,
                    borderColor: active ? theme.accent : theme.border,
                  },
                ]}
              >
                <ThemedText type="smallBold" themeColor={active ? 'bg' : 'textMuted'}>
                  {label}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>

        {!loading && words.length === 0 && (
          <ThemedText themeColor="textMuted" style={styles.centerBox}>
            Henüz kelime bankana kelime eklemedin. Okuma ekranında bir kelimeye
            dokunup &quot;Kelime Bankasına Ekle&quot;ye basarak başlayabilirsin.
          </ThemedText>
        )}

        {!loading && words.length > 0 && filtered.length === 0 && (
          <ThemedText themeColor="textMuted" style={styles.centerBox}>
            Aramanla eşleşen kelime bulunamadı.
          </ThemedText>
        )}

        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <ThemedView type="bgCard" style={[styles.wordCard, { borderColor: theme.border }]}>
              <Pressable style={styles.wordInfo} onPress={() => handleWordPress(item)}>
                <View style={styles.wordRow}>
                  <ThemedText type="smallBold">{item.word}</ThemedText>
                  {(() => {
                    const colors = getWordStatusColors(item.level ?? 0, theme);
                    const label = getWordStatusLabel(item.level ?? 0);
                    return (
                      <View style={[styles.statusBadge, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                        <ThemedText style={[styles.statusBadgeText, { color: colors.text }]}>
                          {label}
                        </ThemedText>
                      </View>
                    );
                  })()}
                </View>
                <ThemedText themeColor="textMuted" type="small">
                  {item.translation}
                </ThemedText>
                {typeof item.definition === 'string' && item.definition ? (
                  <ThemedText themeColor="textMuted" type="small">
                    {item.definition}
                  </ThemedText>
                ) : null}
              </Pressable>
              <Pressable onPress={() => handleDelete(item.id)} disabled={deletingId === item.id}>
                <ThemedText themeColor="error" type="small">
                  {deletingId === item.id ? '…' : 'Sil'}
                </ThemedText>
              </Pressable>
            </ThemedView>
          )}
        />
      </SafeAreaView>

      <Modal visible={!!selectedWord} transparent animationType="fade" onRequestClose={() => setSelectedWord(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setSelectedWord(null)}>
          <Pressable style={[styles.lookupCard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
            <View style={styles.lookupHeaderRow}>
              <ThemedText type="subtitle" style={styles.lookupWord}>
                {selectedWord?.word}
              </ThemedText>
              <Pressable onPress={handleSpeakWord}>
                <ThemedText type="smallBold" themeColor="accent">
                  Dinle
                </ThemedText>
              </Pressable>
            </View>

            {lookupLoading && <ActivityIndicator color={theme.accent} style={styles.lookupLoading} />}

            {!lookupLoading && (
              <>
                {lookup?.phonetic ? (
                  <ThemedText themeColor="textMuted" type="small">
                    {lookup.phonetic}
                  </ThemedText>
                ) : null}

                <ThemedText type="smallBold" themeColor="accent" style={styles.lookupSectionLabel}>
                  Öğrenme Durumu
                </ThemedText>
                <View style={styles.lookupStatusRow}>
                  {(() => {
                    const colors = getWordStatusColors(selectedWord?.level ?? 0, theme);
                    const label = getWordStatusLabel(selectedWord?.level ?? 0);
                    return (
                      <View style={[styles.statusBadge, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                        <ThemedText style={[styles.statusBadgeText, { color: colors.text }]}>
                          {label}
                        </ThemedText>
                      </View>
                    );
                  })()}
                  <ThemedText themeColor="textMuted" type="small" style={styles.lookupLevelText}>
                    (Tekrar Seviyesi: {selectedWord?.level ?? 0})
                  </ThemedText>
                </View>

                <ThemedText type="smallBold" themeColor="accent" style={styles.lookupSectionLabel}>
                  Türkçe
                </ThemedText>
                <ThemedText style={styles.lookupValue}>
                  {lookup?.tr || selectedWord?.translation}
                </ThemedText>

                {(lookup?.definition || selectedWord?.definition) ? (
                  <>
                    <ThemedText type="smallBold" themeColor="accent" style={styles.lookupSectionLabel}>
                      Tanım
                    </ThemedText>
                    <ThemedText themeColor="textMuted" style={styles.lookupValue}>
                      {lookup?.definition || String(selectedWord?.definition)}
                    </ThemedText>
                  </>
                ) : null}

                {lookup?.synonyms && lookup.synonyms !== '-' ? (
                  <>
                    <ThemedText type="smallBold" themeColor="accent" style={styles.lookupSectionLabel}>
                      Eş anlamlı
                    </ThemedText>
                    <ThemedText themeColor="textMuted" style={styles.lookupValue}>
                      {lookup.synonyms}
                    </ThemedText>
                  </>
                ) : null}

                {lookup?.antonym && lookup.antonym !== '-' ? (
                  <>
                    <ThemedText type="smallBold" themeColor="accent" style={styles.lookupSectionLabel}>
                      Zıt anlamlı
                    </ThemedText>
                    <ThemedText themeColor="textMuted" style={styles.lookupValue}>
                      {lookup.antonym}
                    </ThemedText>
                  </>
                ) : null}

                <Pressable
                  onPress={() => {
                    if (selectedWord) handleDelete(selectedWord.id);
                    setSelectedWord(null);
                  }}
                  style={[styles.deleteButton, { borderColor: theme.border }]}
                >
                  <ThemedText type="smallBold" themeColor="error">
                    Bankadan Sil
                  </ThemedText>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four, paddingTop: Spacing.four, gap: Spacing.two },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginBottom: Spacing.one },
  title: { fontWeight: '800' },
  statsText: { fontSize: 13, marginBottom: Spacing.one },
  filterRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginVertical: Spacing.one,
  },
  filterChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.one + 2,
  },
  statusBadge: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    marginLeft: Spacing.two,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  lookupStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.half,
  },
  lookupLevelText: {
    marginLeft: Spacing.two,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  centerBox: { paddingTop: Spacing.six, textAlign: 'center' },
  list: { gap: Spacing.two, paddingBottom: Spacing.six, paddingTop: Spacing.one },
  wordCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  wordInfo: { flex: 1, gap: Spacing.half },
  wordRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  lookupCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Spacing.four,
    paddingBottom: Spacing.six,
  },
  lookupHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.two,
  },
  lookupWord: { fontWeight: '800' },
  lookupLoading: { marginVertical: Spacing.four },
  lookupSectionLabel: { marginTop: Spacing.three },
  lookupValue: { marginTop: Spacing.half, lineHeight: 22 },
  deleteButton: {
    marginTop: Spacing.four,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.two + 2,
    alignItems: 'center',
  },
});
