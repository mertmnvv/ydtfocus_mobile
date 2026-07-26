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

  const [selectedWord, setSelectedWord] = useState<UserWord | null>(null);
  const [lookup, setLookup] = useState<WordLookup | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const unsubscribe = subscribeToUserWords(user.uid, (fetched) => {
      setWords(fetched);
      setLoading(false);
    });
    return unsubscribe;
  }, [user]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return words;
    return words.filter(
      (w) => w.word.toLowerCase().includes(query) || w.translation.toLowerCase().includes(query)
    );
  }, [words, search]);

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

        <ThemedText themeColor="textMuted" type="small">
          {words.length} kelime
        </ThemedText>

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Kelime veya çeviri ara..."
          placeholderTextColor={theme.textMuted}
          style={[styles.input, { backgroundColor: theme.bgElevated, color: theme.text, borderColor: theme.border }]}
        />

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
