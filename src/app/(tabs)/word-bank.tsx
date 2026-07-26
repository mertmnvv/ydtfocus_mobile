import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
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

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <ThemedText type="subtitle" style={styles.title}>
            Kelime Bankam
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
              <View style={styles.wordInfo}>
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
              </View>
              <Pressable onPress={() => handleDelete(item.id)} disabled={deletingId === item.id}>
                <ThemedText themeColor="error" type="small">
                  {deletingId === item.id ? '…' : 'Sil'}
                </ThemedText>
              </Pressable>
            </ThemedView>
          )}
        />
      </SafeAreaView>
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
});
