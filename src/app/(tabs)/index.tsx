import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PassageQuizModal } from '@/components/passage-quiz-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import {
  fetchAiPassage,
  fetchReadingPassage,
  fetchSpeechAudio,
  lookupWord,
  type ReadingLevel,
  type ReadingPassage,
  type WordLookup,
} from '@/lib/api';
import { playTtsAudio } from '@/lib/audio';
import { addUserWord, subscribeToUserWords } from '@/lib/firestore';
import { getWordHighlightColor } from '@/lib/word-color';
import { useTheme } from '@/hooks/use-theme';

type SourceMode = 'wikipedia' | 'ai';

// Web'deki (app)/reading/page.js'teki WIKI_TOPICS ile aynı — Wikipedia
// kaynaklı okuma modu (sourceMode: "wikipedia").
const WIKI_TOPICS = [
  { id: 'random', label: 'Rastgele' },
  { id: 'animals', label: 'Hayvanlar Alemi' },
  { id: 'biography', label: 'Biyografi' },
  { id: 'geography', label: 'Coğrafya & Ülkeler' },
  { id: 'history', label: 'Tarih' },
  { id: 'science', label: 'Bilim' },
  { id: 'mythology', label: 'Mitoloji' },
  { id: 'space', label: 'Uzay' },
  { id: 'technology', label: 'Teknoloji' },
  { id: 'art', label: 'Sanat' },
  { id: 'music', label: 'Müzik' },
  { id: 'cinema', label: 'Sinema' },
  { id: 'sports', label: 'Spor' },
  { id: 'landmarks', label: 'Önemli Yapılar' },
  { id: 'food', label: 'Dünya Mutfağı' },
  { id: 'inventions', label: 'İcatlar' },
] as const;

// Web'deki AI-üretimli mod (sourceMode: "ai") TOPICS'iyle aynı — Wikipedia
// modundan farklı bir konu seti kullanır.
const AI_TOPICS = [
  { id: 'random', label: 'Karışık' },
  { id: 'literature', label: 'Edebiyat' },
  { id: 'politics', label: 'Siyaset' },
  { id: 'daily', label: 'Günlük Yaşam' },
  { id: 'history', label: 'Tarih' },
  { id: 'science', label: 'Bilim' },
  { id: 'psychology', label: 'Psikoloji' },
  { id: 'technology', label: 'Teknoloji' },
  { id: 'health', label: 'Sağlık' },
  { id: 'environment', label: 'Çevre' },
  { id: 'sociology', label: 'Sosyoloji' },
  { id: 'philosophy', label: 'Felsefe' },
  { id: 'economy', label: 'Ekonomi' },
  { id: 'art', label: 'Sanat' },
  { id: 'sports', label: 'Spor' },
  { id: 'space', label: 'Uzay' },
] as const;

function cleanWord(raw: string) {
  return raw.replace(/[^a-zA-Z'-]/g, '').toLowerCase();
}

export default function ReadingScreen() {
  const theme = useTheme();
  const { user, userProfile } = useAuth();
  const [sourceMode, setSourceMode] = useState<SourceMode>('wikipedia');
  // Elle seviye seçici yok — pasaj her zaman kullanıcının profil
  // seviyesine göre çekilir/sadeleştirilir (bkz. AGENTS.md görev notu),
  // sınav girmemiş olamaz (zorunlu, bkz. _layout.tsx) ama yine de
  // güvenlik payı olarak B1 varsayılan bırakılıyor.
  const level: ReadingLevel = (userProfile?.level as ReadingLevel) || 'B1';
  const [topic, setTopic] = useState<string>('random');
  const [passage, setPassage] = useState<ReadingPassage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTranslation, setShowTranslation] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [quizOpen, setQuizOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);

  const topicOptions = sourceMode === 'wikipedia' ? WIKI_TOPICS : AI_TOPICS;

  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [lookup, setLookup] = useState<WordLookup | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'already'>('idle');
  // Kelime bankasındaki kelimelerin canlı listesi (küçük harf) — hem
  // "Zaten Ekli" durumunu hem pasajdaki kalıcı renklendirmeyi besler.
  const [savedWords, setSavedWords] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) {
      setSavedWords(new Set());
      return;
    }
    const unsubscribe = subscribeToUserWords(user.uid, (words) => {
      setSavedWords(new Set(words.map((w) => w.word.toLowerCase())));
    });
    return unsubscribe;
  }, [user]);

  const loadPassage = useCallback(async (selectedTopic: string, mode: SourceMode, selectedLevel: ReadingLevel) => {
    setLoading(true);
    setError(null);
    setShowTranslation(false);
    try {
      const result =
        mode === 'wikipedia'
          ? await fetchReadingPassage(selectedTopic, selectedLevel)
          : await fetchAiPassage(selectedTopic, selectedLevel);
      setPassage(result);
    } catch {
      setError('Metin yüklenemedi, tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  }, []);

  function handleModeChange(mode: SourceMode) {
    if (mode === sourceMode) return;
    setSourceMode(mode);
    setTopic('random');
    // AI modu Groq'a gerçek bir üretim isteği atıyor (token maliyeti var) —
    // Wikipedia'nın aksine konu/seviye seçimiyle otomatik tetiklenmez,
    // kullanıcı "Metni Oluştur" butonuna basmadan çağrı yapılmaz.
    if (mode === 'wikipedia') {
      loadPassage('random', mode, level);
    } else {
      setPassage(null);
      setError(null);
    }
  }

  async function handlePlayPassage() {
    if (!passage || speaking) return;
    setSpeaking(true);
    try {
      const buffer = await fetchSpeechAudio(passage.text);
      await playTtsAudio(buffer);
    } catch {
      // sessizce yut — okuma akışını bloklamaya değmez
    } finally {
      setSpeaking(false);
    }
  }

  async function handleWordPress(rawWord: string) {
    const word = cleanWord(rawWord);
    if (!word) return;
    setSelectedWord(word);
    setLookup(null);
    setSaveState(savedWords.has(word.toLowerCase()) ? 'already' : 'idle');
    setLookupLoading(true);
    try {
      const result = await lookupWord(word);
      setLookup(result);
    } catch {
      setLookup(null);
    } finally {
      setLookupLoading(false);
    }
  }

  async function handleSaveWord() {
    if (!user || !selectedWord || !lookup) return;
    setSaveState('saving');
    try {
      await addUserWord(user.uid, {
        word: selectedWord,
        translation: lookup.tr,
        definition: lookup.definition,
      });
      setSaveState('saved');
    } catch {
      setSaveState('idle');
    }
  }

  async function handleSpeakWord() {
    if (!selectedWord) return;
    try {
      const buffer = await fetchSpeechAudio(selectedWord);
      await playTtsAudio(buffer);
    } catch {
      // sessizce yut
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <ThemedText type="title" themeColor="accent" style={styles.brand}>
            ydtfocus
          </ThemedText>
          <Pressable
            onPress={() => loadPassage(topic, sourceMode, level)}
            disabled={loading}
            style={[styles.refreshButton, { borderColor: theme.border, opacity: loading ? 0.6 : 1 }]}
          >
            <ThemedText type="smallBold" themeColor="accent">
              Yeni Metin
            </ThemedText>
          </Pressable>
        </View>

        <Pressable
          onPress={() => setToolsOpen((value) => !value)}
          style={[styles.toolsToggle, { borderColor: theme.border, backgroundColor: theme.bgCard }]}
        >
          <ThemedText type="smallBold" themeColor="textMuted">
            Araçlar
          </ThemedText>
          <ThemedText type="subtitle" themeColor="accent" style={styles.toolsToggleIcon}>
            {toolsOpen ? '−' : '+'}
          </ThemedText>
        </Pressable>

        {toolsOpen ? (
          <View style={styles.quickLinksRow}>
            <Pressable
              onPress={() => router.push('/review')}
              style={[styles.quickLinkChip, { borderColor: theme.border, backgroundColor: theme.bgCard }]}
            >
              <ThemedText type="smallBold" themeColor="accent" style={styles.quickLinkChipText}>
                Akıllı Tekrar
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={() => router.push('/mistakes')}
              style={[styles.quickLinkChip, { borderColor: theme.border, backgroundColor: theme.bgCard }]}
            >
              <ThemedText type="smallBold" themeColor="accent" style={styles.quickLinkChipText}>
                Hatalarım
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={() => router.push('/flashcards')}
              style={[styles.quickLinkChip, { borderColor: theme.border, backgroundColor: theme.bgCard }]}
            >
              <ThemedText type="smallBold" themeColor="accent" style={styles.quickLinkChipText}>
                Kartlar
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={() => router.push('/grammar')}
              style={[styles.quickLinkChip, { borderColor: theme.border, backgroundColor: theme.bgCard }]}
            >
              <ThemedText type="smallBold" themeColor="accent" style={styles.quickLinkChipText}>
                Gramer
              </ThemedText>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.modeRow}>
          {(
            [
              { id: 'wikipedia', label: 'Wikipedia' },
              { id: 'ai', label: 'AI Üret' },
            ] as const
          ).map((m) => {
            const active = m.id === sourceMode;
            return (
              <Pressable
                key={m.id}
                onPress={() => handleModeChange(m.id)}
                style={[
                  styles.modeButton,
                  {
                    backgroundColor: active ? theme.accent : theme.bgCard,
                    borderColor: active ? theme.accent : theme.border,
                  },
                ]}
              >
                <ThemedText type="smallBold" themeColor={active ? 'bg' : 'textMuted'}>
                  {m.label}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.topicRow}
          contentContainerStyle={styles.topicRowContent}
        >
          {topicOptions.map((t) => {
            const active = t.id === topic;
            return (
              <Pressable
                key={t.id}
                onPress={() => {
                  setTopic(t.id);
                  if (sourceMode === 'wikipedia') {
                    loadPassage(t.id, sourceMode, level);
                  }
                }}
                style={[
                  styles.topicChip,
                  {
                    backgroundColor: active ? theme.accent : theme.bgCard,
                    borderColor: active ? theme.accent : theme.border,
                  },
                ]}
              >
                <ThemedText
                  type="small"
                  themeColor={active ? 'bg' : 'textMuted'}
                  style={active ? styles.topicChipTextActive : undefined}
                >
                  {t.label}
                </ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>

        {sourceMode === 'ai' && (
          <Pressable
            onPress={() => loadPassage(topic, 'ai', level)}
            disabled={loading}
            style={[styles.generateButton, { backgroundColor: theme.accent, opacity: loading ? 0.6 : 1 }]}
          >
            <ThemedText type="smallBold" themeColor="bg">
              {loading ? 'Oluşturuluyor…' : passage ? 'Yeni Metin Oluştur' : 'Metni Oluştur'}
            </ThemedText>
          </Pressable>
        )}

        <ScrollView style={styles.passageScroll} contentContainerStyle={styles.passageContent}>
          {loading && (
            <View style={styles.centerBox}>
              <ActivityIndicator color={theme.accent} />
            </View>
          )}

          {!loading && error && (
            <ThemedText themeColor="error" style={styles.error}>
              {error}
            </ThemedText>
          )}

          {!loading && !error && sourceMode === 'ai' && !passage && (
            <View style={styles.centerBox}>
              <ThemedText themeColor="textMuted" style={styles.emptyAiText}>
                Konu ve seviye seçip "Metni Oluştur"a basınca AI ile senin için özel bir metin üretilir.
              </ThemedText>
            </View>
          )}

          {!loading && !error && sourceMode === 'wikipedia' && !passage && (
            <View style={styles.centerBox}>
              <ThemedText themeColor="textMuted" style={styles.emptyAiText}>
                Yukarıdan bir konu seç, senin için Wikipedia'dan bir metin getirelim.
              </ThemedText>
            </View>
          )}

          {!loading && passage && (
            <>
              <View style={styles.passageHeaderRow}>
                <ThemedText type="subtitle" style={styles.passageTitle}>
                  {passage.title}
                </ThemedText>
                <Pressable onPress={handlePlayPassage} disabled={speaking} style={styles.speakButton}>
                  {speaking ? (
                    <ActivityIndicator color={theme.accent} />
                  ) : (
                    <ThemedText type="smallBold" themeColor="accent">
                      Dinle
                    </ThemedText>
                  )}
                </Pressable>
                <Pressable onPress={() => setQuizOpen(true)} style={styles.speakButton}>
                  <ThemedText type="smallBold" themeColor="accent">
                    Quiz
                  </ThemedText>
                </Pressable>
              </View>

              <Pressable onPress={() => setShowTranslation((v) => !v)}>
                <ThemedText type="small" themeColor="accent" style={styles.translationToggle}>
                  {showTranslation ? 'İngilizceyi göster' : 'Türkçe çeviriyi göster'}
                </ThemedText>
              </Pressable>

              {showTranslation ? (
                <ThemedText style={styles.passageText}>{passage.tr}</ThemedText>
              ) : (
                <View style={styles.wordsWrap}>
                  {passage.text.split(/(\s+)/).map((token, idx) => {
                    if (/^\s+$/.test(token)) {
                      return <ThemedText key={idx}>{token}</ThemedText>;
                    }
                    const clean = cleanWord(token);
                    const isSaved = savedWords.has(clean);
                    const highlight = getWordHighlightColor(clean, isSaved, theme);
                    return (
                      <Pressable key={idx} onPress={() => handleWordPress(token)}>
                        <ThemedText style={[styles.passageText, highlight ? { color: highlight } : undefined]}>
                          {token}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>

      <Modal visible={!!selectedWord} transparent animationType="fade" onRequestClose={() => setSelectedWord(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setSelectedWord(null)}>
          <Pressable style={[styles.lookupCard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
            <View style={styles.lookupHeaderRow}>
              <ThemedText type="subtitle" style={styles.lookupWord}>
                {selectedWord}
              </ThemedText>
              <Pressable onPress={handleSpeakWord}>
                <ThemedText type="smallBold" themeColor="accent">
                  Dinle
                </ThemedText>
              </Pressable>
            </View>

            {lookupLoading && <ActivityIndicator color={theme.accent} style={styles.lookupLoading} />}

            {!lookupLoading && lookup && (
              <>
                {lookup.phonetic ? (
                  <ThemedText themeColor="textMuted" type="small">
                    {lookup.phonetic}
                  </ThemedText>
                ) : null}
                <ThemedText type="smallBold" themeColor="accent" style={styles.lookupSectionLabel}>
                  Türkçe
                </ThemedText>
                <ThemedText style={styles.lookupValue}>{lookup.tr}</ThemedText>

                <ThemedText type="smallBold" themeColor="accent" style={styles.lookupSectionLabel}>
                  Tanım
                </ThemedText>
                <ThemedText themeColor="textMuted" style={styles.lookupValue}>
                  {lookup.definition}
                </ThemedText>

                {lookup.synonyms && lookup.synonyms !== '-' ? (
                  <>
                    <ThemedText type="smallBold" themeColor="accent" style={styles.lookupSectionLabel}>
                      Eş anlamlı
                    </ThemedText>
                    <ThemedText themeColor="textMuted" style={styles.lookupValue}>
                      {lookup.synonyms}
                    </ThemedText>
                  </>
                ) : null}

                <Pressable
                  onPress={handleSaveWord}
                  disabled={saveState !== 'idle'}
                  style={[styles.saveButton, { backgroundColor: theme.accent, opacity: saveState === 'idle' ? 1 : 0.7 }]}
                >
                  <ThemedText type="smallBold" themeColor="bg">
                    {saveState === 'saved'
                      ? 'Eklendi'
                      : saveState === 'already'
                        ? 'Zaten Ekli'
                        : saveState === 'saving'
                          ? 'Ekleniyor…'
                          : 'Kelime Bankasına Ekle'}
                  </ThemedText>
                </Pressable>
              </>
            )}

            {!lookupLoading && !lookup && (
              <ThemedText themeColor="error" style={styles.lookupValue}>
                Kelime bulunamadı.
              </ThemedText>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {passage && (
        <PassageQuizModal visible={quizOpen} passageText={passage.text} onClose={() => setQuizOpen(false)} />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
  },
  brand: { fontSize: 22, fontWeight: '900' },
  refreshButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
  },
  toolsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: Spacing.four,
    marginTop: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  toolsToggleIcon: { lineHeight: 20 },
  quickLinksRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    marginTop: Spacing.two,
  },
  quickLinkChip: {
    flexBasis: '47%',
    flexGrow: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    alignItems: 'center',
  },
  quickLinkChipText: { textAlign: 'center' },
  modeRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    marginTop: Spacing.three,
  },
  modeButton: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
  levelRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    marginTop: Spacing.two,
  },
  levelChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
  },
  generateButton: {
    marginHorizontal: Spacing.four,
    marginTop: Spacing.three,
    borderRadius: 10,
    paddingVertical: Spacing.two + 2,
    alignItems: 'center',
  },
  emptyAiText: { textAlign: 'center', paddingHorizontal: Spacing.four, lineHeight: 22 },
  topicRow: { flexGrow: 0, marginTop: Spacing.three },
  topicRowContent: { paddingHorizontal: Spacing.four, gap: Spacing.two },
  topicChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
  },
  topicChipTextActive: { fontWeight: '700' },
  passageScroll: { flex: 1, marginTop: Spacing.three },
  passageContent: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.six },
  centerBox: { paddingTop: Spacing.six, alignItems: 'center' },
  error: { marginTop: Spacing.four, textAlign: 'center' },
  passageHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.two,
  },
  passageTitle: { flex: 1, fontWeight: '800' },
  speakButton: { paddingHorizontal: Spacing.two, paddingVertical: Spacing.one },
  translationToggle: { marginBottom: Spacing.three },
  wordsWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  passageText: { fontSize: 17, lineHeight: 28 },
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
  saveButton: {
    marginTop: Spacing.four,
    borderRadius: 10,
    paddingVertical: Spacing.two + 2,
    alignItems: 'center',
  },
});
