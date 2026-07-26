import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { DocumentSnapshot } from 'firebase/firestore';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { addUserWord, getArchiveWords, getUserWords, type ArchiveWord } from '@/lib/firestore';
import { useTheme } from '@/hooks/use-theme';

const LEVELS = ['Tümü', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

// Sözlük (Akademik Sözlük) — web'deki ArchivePanel.js ile ayni: global
// `archive` koleksiyonu, seviye sekmeleri + arama (yuklenen sayfa
// uzerinde istemci tarafi filtre, web'de de sunucu sorgusu degil).
export default function DictionaryScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const [level, setLevel] = useState('Tümü');
  const [search, setSearch] = useState('');
  const [words, setWords] = useState<ArchiveWord[]>([]);
  const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [savingWord, setSavingWord] = useState<string | null>(null);

  const load = useCallback(
    async (selectedLevel: string, cursor: DocumentSnapshot | null) => {
      setLoading(true);
      const result = await getArchiveWords(selectedLevel, cursor);
      setWords((prev) => (cursor ? [...prev, ...result.words] : result.words));
      setLastDoc(result.lastDoc);
      setHasMore(result.words.length > 0);
      setLoading(false);
    },
    []
  );

  useEffect(() => {
    load(level, null);
  }, [level, load]);

  useEffect(() => {
    if (!user) return;
    getUserWords(user.uid).then((existing) => {
      setSavedIds(new Set(existing.map((w) => w.word.toLowerCase())));
    });
  }, [user]);

  async function handleSave(item: ArchiveWord) {
    if (!user) return;
    setSavingWord(item.id);
    try {
      await addUserWord(user.uid, { word: item.word, translation: item.meaning, definition: item.syn ?? '' });
      setSavedIds((prev) => new Set(prev).add(item.word.toLowerCase()));
    } finally {
      setSavingWord(null);
    }
  }

  const filtered = search.trim()
    ? words.filter(
        (w) =>
          w.word.toLowerCase().includes(search.toLowerCase()) ||
          w.meaning.toLowerCase().includes(search.toLowerCase())
      )
    : words;

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
            Sözlük
          </ThemedText>
        </View>

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Kelime veya anlam ara..."
          placeholderTextColor={theme.textMuted}
          style={[styles.input, { backgroundColor: theme.bgElevated, color: theme.text, borderColor: theme.border }]}
        />

        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={LEVELS}
          keyExtractor={(l) => l}
          style={styles.levelRow}
          contentContainerStyle={styles.levelRowContent}
          renderItem={({ item: lvl }) => {
            const active = lvl === level;
            return (
              <Pressable
                onPress={() => setLevel(lvl)}
                style={[
                  styles.levelChip,
                  { backgroundColor: active ? theme.accent : theme.bgCard, borderColor: active ? theme.accent : theme.border },
                ]}
              >
                <ThemedText type="smallBold" themeColor={active ? 'bg' : 'textMuted'}>
                  {lvl}
                </ThemedText>
              </Pressable>
            );
          }}
        />

        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          onEndReached={() => hasMore && !loading && load(level, lastDoc)}
          onEndReachedThreshold={0.4}
          ListFooterComponent={loading ? <ActivityIndicator color={theme.accent} style={styles.footerLoader} /> : null}
          renderItem={({ item }) => {
            const saved = savedIds.has(item.word.toLowerCase());
            return (
              <ThemedView type="bgCard" style={[styles.wordCard, { borderColor: theme.border }]}>
                <View style={styles.wordInfo}>
                  <ThemedText type="smallBold">{item.word}</ThemedText>
                  <ThemedText themeColor="textMuted" type="small">
                    {item.meaning}
                  </ThemedText>
                  {item.syn ? (
                    <ThemedText themeColor="textMuted" type="small">
                      Eş anlamlı: {item.syn}
                    </ThemedText>
                  ) : null}
                </View>
                <Pressable onPress={() => handleSave(item)} disabled={saved || savingWord === item.id}>
                  <ThemedText type="smallBold" themeColor={saved ? 'accent' : 'textMuted'}>
                    {saved ? '✓' : savingWord === item.id ? '…' : '+ Ekle'}
                  </ThemedText>
                </Pressable>
              </ThemedView>
            );
          }}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four, paddingTop: Spacing.four, gap: Spacing.two },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginBottom: Spacing.one },
  backButton: { paddingVertical: Spacing.one },
  title: { fontWeight: '800' },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  levelRow: { flexGrow: 0 },
  levelRowContent: { gap: Spacing.two, paddingVertical: Spacing.one },
  levelChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
  },
  list: { gap: Spacing.two, paddingBottom: Spacing.six },
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
  footerLoader: { paddingVertical: Spacing.three },
});
