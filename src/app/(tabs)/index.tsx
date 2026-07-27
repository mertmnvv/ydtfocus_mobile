import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';

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
  translatePassage,
  type ReadingLevel,
  type ReadingPassage,
  type WordLookup,
} from '@/lib/api';
import {
  discardPreparedTtsFile,
  playPreparedTtsAudio,
  playTtsAudio,
  prepareTtsFile,
  stopTtsAudio,
  type TtsPlaybackHandle,
} from '@/lib/audio';
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

type PassageToken = { text: string; isWord: boolean };
type PassageSentence = { original: string; tokens: PassageToken[] };

// Web'in (app)/reading/page.js'teki cümle bölme mantığıyla birebir aynı —
// TTS'i cümle cümle çaldırıp ontimeupdate/playbackStatusUpdate progress'ine
// göre okunan kelimeyi tahmin edebilmek için pasajı cümlelere ve kelime
// token'larına ayırıyoruz.
function splitIntoSentences(text: string): PassageSentence[] {
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
  const result: PassageSentence[] = [];
  sentences.forEach((s) => {
    // TTS servisinin karakter limiti için uzun cümleler bölünüyor.
    const chunks = s.length > 180 ? s.match(/.{1,180}(?:\s|$)|.{1,180}/g) || [s] : [s];
    chunks.forEach((chunk) => {
      result.push({
        original: chunk,
        tokens: chunk.split(/(\s+)/).map((t) => ({
          text: t,
          isWord: Boolean(t.trim()) && !/^[^a-zA-Z0-9]+$/.test(t.trim()),
        })),
      });
    });
  });
  return result;
}

export default function ReadingScreen() {
  const theme = useTheme();
  const { user, userProfile } = useAuth();
  const [sourceMode, setSourceMode] = useState<SourceMode>('wikipedia');
  const [levelState, setLevelState] = useState<ReadingLevel>('B1');
  const [topic, setTopic] = useState<string>('random');
  const [passage, setPassage] = useState<ReadingPassage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTranslation, setShowTranslation] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [quizOpen, setQuizOpen] = useState(false);
  const [controlPanelOpen, setControlPanelOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(!!state.isConnected);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (userProfile?.level) {
      const timer = setTimeout(() => {
        setLevelState(userProfile.level as ReadingLevel);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [userProfile?.level]);

  // Cümle-cümle TTS + kelime-senkron highlight (web'deki spokenWordIndex /
  // isReading / isPaused / processedPassage mantığının mobil karşılığı).
  const [isReading, setIsReading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentSentenceIdx, setCurrentSentenceIdx] = useState(0);
  const [spokenWordIndex, setSpokenWordIndex] = useState(-1);
  const playbackRef = useRef<TtsPlaybackHandle | null>(null);

  const topicOptions = sourceMode === 'wikipedia' ? WIKI_TOPICS : AI_TOPICS;

  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [lookup, setLookup] = useState<WordLookup | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'already'>('idle');
  // Kelime bankasındaki kelimelerin canlı listesi (küçük harf) — hem
  // "Zaten Ekli" durumunu hem pasajdaki kalıcı renklendirmeyi besler.
  const [savedWords, setSavedWords] = useState<Set<string>>(new Set());
  const [savedWordsMap, setSavedWordsMap] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    if (!user) {
      const timer = setTimeout(() => {
        setSavedWords(new Set());
        setSavedWordsMap(new Map());
      }, 0);
      return () => clearTimeout(timer);
    }
    const unsubscribe = subscribeToUserWords(user.uid, (words) => {
      setSavedWords(new Set(words.map((w) => w.word.toLowerCase())));
      const map = new Map<string, number>();
      words.forEach((w) => {
        map.set(w.word.toLowerCase(), w.level ?? 0);
      });
      setSavedWordsMap(map);
    });
    return unsubscribe;
  }, [user]);

  function getWordUnderlineStyle(cleanWordText: string) {
    if (!cleanWordText) return null;
    const isSaved = savedWords.has(cleanWordText);
    if (!isSaved) return null;
    const lvl = savedWordsMap.get(cleanWordText) ?? 0;
    if (lvl >= 4) {
      return { borderBottomWidth: 1.5, borderBottomColor: theme.savedWord }; // Yeşil (Ustalaşıldı)
    } else if (lvl > 0) {
      return { borderBottomWidth: 1.5, borderBottomColor: theme.academicWord }; // Turuncu/Sarı (Öğreniliyor)
    }
    return { borderBottomWidth: 1.5, borderBottomColor: theme.accent }; // Altın sarısı (Yeni)
  }

  const loadPassage = useCallback(async (selectedTopic: string, mode: SourceMode, selectedLevel: ReadingLevel) => {
    if (!isOnline) {
      setError('İnternet bağlantısı yok. Çevrimdışı modda yeni metin üretilemez.');
      setLoading(false);
      return;
    }
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
  }, [isOnline]);

  function handleModeChange(mode: SourceMode) {
    if (mode === sourceMode) return;
    setSourceMode(mode);
    setTopic('random');
    // AI modu Groq'a gerçek bir üretim isteği atıyor (token maliyeti var) —
    // Wikipedia'nın aksine konu/seviye seçimiyle otomatik tetiklenmez,
    // kullanıcı "Metni Oluştur" butonuna basmadan çağrı yapılmaz.
    if (mode === 'wikipedia') {
      loadPassage('random', mode, levelState);
    } else {
      setPassage(null);
      setError(null);
    }
  }

  async function handleToggleTranslation() {
    if (showTranslation) {
      setShowTranslation(false);
      return;
    }

    if (passage && !passage.tr) {
      if (!isOnline) {
        Alert.alert('Çevrimdışı Mod', 'Çevrimdışı modda yeni çeviri yüklenemez.');
        return;
      }
      setTranslating(true);
      try {
        const result = await translatePassage(passage.text);
        setPassage((prev) => (prev ? { ...prev, tr: result.tr } : prev));
      } catch (err) {
        console.error('Translation error:', err);
        Alert.alert('Hata', 'Çeviri yüklenemedi. Lütfen internet bağlantınızı kontrol edip tekrar deneyin.');
        return;
      } finally {
        setTranslating(false);
      }
    }

    setShowTranslation(true);
  }

  // Şu anki cümle çalınırken bir sonraki cümlenin sesi arka planda
  // hazırlanıp burada tutuluyor — cümle bitince fetch+dosya yazma
  // gecikmesi yaşanmadan anında oynatılabiliyor.
  const prefetchRef = useRef<{ idx: number; promise: Promise<string> } | null>(null);

  const discardPrefetch = useCallback(() => {
    const pending = prefetchRef.current;
    prefetchRef.current = null;
    if (pending) {
      pending.promise.then(discardPreparedTtsFile).catch(() => {});
    }
  }, []);

  // startReading async akışının ortasında (await'lerden sonra) pasaj
  // değişmiş/okuma durdurulmuş olabilir — her stopReading/startReading
  // çağrısında bu sayaç artıyor, in-flight bir startReading await'ten
  // döndüğünde kendi token'ı güncel değilse sonucu sessizce atıyor
  // (aksi halde eski pasajın sesi yeni pasaj üstünde çalmaya devam ederdi).
  const readingTokenRef = useRef(0);

  const stopReading = useCallback(() => {
    readingTokenRef.current += 1;
    playbackRef.current?.stop();
    playbackRef.current = null;
    stopTtsAudio();
    discardPrefetch();
    setIsReading(false);
    setIsPaused(false);
    setIsBuffering(false);
    setSpokenWordIndex(-1);
    setCurrentSentenceIdx(0);
  }, [discardPrefetch]);

  // Pasaj metninden cümlelere/kelime token'larına ayrılmış yapı — web'deki
  // processedPassage state'inin aksine türetilmiş veri olduğundan useMemo
  // ile hesaplanıyor (ayrı bir setState gerektirmiyor).
  const processedPassage = useMemo(
    () => (passage ? splitIntoSentences(passage.text) : []),
    [passage],
  );

  // Pasaj değişince o ana kadarki okumayı durdur.
  useEffect(() => {
    const timer = setTimeout(() => {
      stopReading();
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passage]);

  useEffect(() => stopReading, [stopReading]);

  // Cümle bitince otomatik sıradakine geçmek için kendini çağırıyor —
  // useCallback const'ı kendi gövdesinden referans alamadığından (TDZ)
  // her zaman en güncel sürümü tutan bir ref üzerinden çağrılıyor.
  const startReadingRef = useRef<(startIdx?: number) => Promise<void>>(async () => {});

  const startReading = useCallback(
    async (startIdx = -1) => {
      const idx = startIdx >= 0 ? startIdx : currentSentenceIdx;
      if (idx >= processedPassage.length) {
        stopReading();
        return;
      }

      if (isPaused && startIdx === -1 && playbackRef.current) {
        playbackRef.current.resume();
        setIsPaused(false);
        setIsReading(true);
        return;
      }

      readingTokenRef.current += 1;
      const token = readingTokenRef.current;

      playbackRef.current?.stop();
      playbackRef.current = null;
      setIsBuffering(true);
      setCurrentSentenceIdx(idx);

      try {
        const sentence = processedPassage[idx];
        const wordCount = sentence.tokens.filter((t) => t.isWord).length;

        // Bir önceki cümle çalınırken bu cümlenin sesi zaten hazırlanmış
        // olabilir — o zaman yeniden fetch etmeye gerek yok.
        const pending = prefetchRef.current;
        const fileUri =
          pending && pending.idx === idx
            ? await pending.promise
            : await prepareTtsFile(await fetchSpeechAudio(sentence.original));

        // Bu await'ler sürerken pasaj değişmiş/okuma durdurulmuş olabilir —
        // token eskimişse artık alakasız bu sesi çalmaya başlamadan çık.
        if (readingTokenRef.current !== token) {
          discardPreparedTtsFile(fileUri);
          return;
        }
        prefetchRef.current = null;

        const handle = await playPreparedTtsAudio(fileUri, {
          onProgress: (currentTime, duration) => {
            if (readingTokenRef.current !== token || !duration) return;
            const progress = currentTime / duration;
            setSpokenWordIndex(Math.floor(progress * wordCount));
          },
          onEnd: () => {
            if (readingTokenRef.current !== token) return;
            if (idx < processedPassage.length - 1) {
              startReadingRef.current(idx + 1);
            } else {
              stopReading();
            }
          },
        });

        if (readingTokenRef.current !== token) {
          handle.stop();
          return;
        }
        playbackRef.current = handle;
        setIsReading(true);
        setIsPaused(false);
        setIsBuffering(false);

        // Sıradaki cümlenin sesini arka planda hazırlamaya başla — şu anki
        // cümle bitene kadar genelde tamamlanmış olur, geçiş kesintisiz olur.
        const nextIdx = idx + 1;
        if (nextIdx < processedPassage.length) {
          const nextSentence = processedPassage[nextIdx];
          const promise = fetchSpeechAudio(nextSentence.original).then(prepareTtsFile);
          prefetchRef.current = { idx: nextIdx, promise };
          promise.catch(() => {
            if (prefetchRef.current?.idx === nextIdx) prefetchRef.current = null;
          });
        }
      } catch {
        if (readingTokenRef.current === token) {
          setIsBuffering(false);
          stopReading();
        }
      }
    },
    [currentSentenceIdx, isPaused, processedPassage, stopReading],
  );

  useEffect(() => {
    startReadingRef.current = startReading;
  }, [startReading]);

  function handlePauseReading() {
    playbackRef.current?.pause();
    setIsReading(false);
    setIsPaused(true);
  }

  function handlePrevSentence() {
    startReadingRef.current(Math.max(0, currentSentenceIdx - 1));
  }

  function handleNextSentence() {
    startReadingRef.current(currentSentenceIdx + 1);
  }

  async function handleWordPress(rawWord: string) {
    const word = cleanWord(rawWord);
    if (!word) return;
    // Kelime lookup modalındaki "Dinle" ayrı bir ses slotunda çalıyor
    // (bkz. audio.ts) ama cihaz aynı anda iki sesi birden çalarsa yine de
    // kulakla üst üste biner — pasaj o an okunuyorsa duraklat, kullanıcı
    // modalı kapatınca "Devam Et" ile kaldığı yerden sürdürebilir.
    if (isReading) handlePauseReading();
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
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
              <ThemedText type="title" themeColor="accent" style={styles.brand}>
                ydtfocus
              </ThemedText>
              {!isOnline && (
                <View style={[styles.offlineChip, { backgroundColor: '#ff9f0a' }]}>
                  <MaterialCommunityIcons name="wifi-off" size={12} color="#000" />
                  <ThemedText type="code" style={styles.offlineText}>
                    ÇEVRİMDIŞI
                  </ThemedText>
                </View>
              )}
            </View>
            <ThemedText type="subtitle" style={styles.title}>
              Okuma
            </ThemedText>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => setControlPanelOpen(true)}
              hitSlop={12}
              style={({ pressed }) => [
                styles.settingsButton,
                {
                  borderColor: theme.border,
                  backgroundColor: theme.bgCard,
                  transform: [{ scale: pressed ? 0.95 : 1 }],
                },
              ]}
            >
              <MaterialCommunityIcons name="tune" size={20} color={theme.textMuted} />
            </Pressable>
          </View>
        </View>

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
                {"Sağ üstteki filtre menüsünden konu ve zorluk seviyesi seçip metin üretebilirsin."}
              </ThemedText>
            </View>
          )}

          {!loading && !error && sourceMode === 'wikipedia' && !passage && (
            <View style={styles.centerBox}>
              <ThemedText themeColor="textMuted" style={styles.emptyAiText}>
                {"Sağ üstteki filtre menüsünden Wikipedia konusunu seçip okumaya başlayabilirsin."}
              </ThemedText>
            </View>
          )}

          {!loading && passage && (
            <>
              <View style={styles.passageHeaderRow}>
                <ThemedText type="subtitle" style={styles.passageTitle}>
                  {passage.title}
                </ThemedText>
                <View style={styles.passageHeaderActions}>
                  <Pressable
                    onPress={() => {
                      if (!isOnline) {
                        Alert.alert('Çevrimdışı Mod', 'Çevrimdışı modda ses dinlenemez.');
                        return;
                      }
                      if (isReading) {
                        handlePauseReading();
                      } else {
                        startReading(currentSentenceIdx);
                      }
                    }}
                    disabled={isBuffering || !isOnline}
                    style={({ pressed }) => [
                      styles.actionIconButton,
                      {
                        backgroundColor: theme.bgCard,
                        borderColor: theme.border,
                        opacity: isBuffering || !isOnline ? 0.4 : 1,
                        transform: [{ scale: pressed ? 0.95 : 1 }],
                      },
                    ]}
                  >
                    <MaterialCommunityIcons name="headphones" size={18} color={isOnline ? theme.accent : theme.textMuted} />
                  </Pressable>
                  <Pressable
                    onPress={() => setQuizOpen(true)}
                    style={({ pressed }) => [
                      styles.actionIconButton,
                      {
                        backgroundColor: theme.bgCard,
                        borderColor: theme.border,
                        transform: [{ scale: pressed ? 0.95 : 1 }],
                      },
                    ]}
                  >
                    <MaterialCommunityIcons name="help-circle-outline" size={18} color={theme.accent} />
                  </Pressable>
                </View>
              </View>

              <Pressable onPress={handleToggleTranslation} disabled={translating}>
                <ThemedText type="small" themeColor="accent" style={styles.translationToggle}>
                  {translating
                    ? 'Çeviriliyor…'
                    : showTranslation
                      ? 'İngilizceyi göster'
                      : 'Türkçe çeviriyi göster'}
                </ThemedText>
              </Pressable>

              {showTranslation ? (
                <ThemedText style={styles.passageText}>{passage.tr}</ThemedText>
              ) : (
                <View style={styles.wordsWrap}>
                  {processedPassage.map((sentence, si) => {
                    const isCurrentSentence = (isReading || isPaused) && si === currentSentenceIdx;
                    let wordCounter = 0;
                    return sentence.tokens.map((token, ti) => {
                      const key = `${si}-${ti}`;
                      if (!token.isWord) {
                        return <ThemedText key={key} style={styles.passageText}>{token.text}</ThemedText>;
                      }
                      const clean = cleanWord(token.text);
                      const underlineStyle = getWordUnderlineStyle(clean);
                      const isSaved = savedWords.has(clean);
                      const highlight = getWordHighlightColor(clean, isSaved, theme);
                      const currentWordIdx = wordCounter;
                      wordCounter += 1;
                      const isAudioActive = isCurrentSentence && currentWordIdx === spokenWordIndex;
                      return (
                        <Pressable key={key} onPress={() => handleWordPress(token.text)}>
                          <ThemedText
                            style={[
                              styles.passageText,
                              underlineStyle,
                              highlight ? { color: highlight } : undefined,
                              isAudioActive
                                ? [styles.audioActiveWord, { backgroundColor: 'rgba(226, 183, 20, 0.16)', color: theme.accent }]
                                : undefined,
                            ]}
                          >
                            {token.text}
                          </ThemedText>
                        </Pressable>
                      );
                    });
                  })}
                </View>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>

      {/* Kontrol Paneli Modal (Bottom Sheet) */}
      <Modal visible={controlPanelOpen} transparent animationType="slide" onRequestClose={() => setControlPanelOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setControlPanelOpen(false)}>
          <Pressable style={[styles.controlPanelCard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
            <View style={[styles.dragIndicator, { backgroundColor: theme.border }]} />
            <View style={styles.controlPanelHeader}>
              <ThemedText type="subtitle" style={styles.controlPanelTitle}>
                Çalışma Ayarları
              </ThemedText>
              <Pressable onPress={() => setControlPanelOpen(false)}>
                <ThemedText type="smallBold" themeColor="accent">
                  Bitti
                </ThemedText>
              </Pressable>
            </View>

            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            <ScrollView contentContainerStyle={styles.controlPanelScrollContent} showsVerticalScrollIndicator={false}>
              {loading && (
                <ActivityIndicator color={theme.accent} style={{ marginVertical: Spacing.two }} />
              )}
              {error && (
                <ThemedText themeColor="error" style={{ textAlign: 'center', marginVertical: Spacing.two }}>
                  {error}
                </ThemedText>
              )}
              {/* Kaynak Modu */}
              <ThemedText type="smallBold" themeColor="textMuted" style={styles.controlSectionLabel}>
                KAYNAK MODU
              </ThemedText>
              <View style={[styles.segmentedControl, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}>
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
                      style={({ pressed }) => [
                        styles.segmentedButton,
                        {
                          backgroundColor: active ? theme.accent : 'transparent',
                          transform: [{ scale: pressed ? 0.98 : 1 }],
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

              {/* Zorluk Seviyesi (A1-C2) */}
              <ThemedText type="smallBold" themeColor="textMuted" style={styles.controlSectionLabel}>
                ZORLUK SEVİYESİ
              </ThemedText>
              <View style={styles.levelRow}>
                {(['A2', 'B1', 'B2', 'C1'] as const).map((l: ReadingLevel) => {
                  const active = l === levelState;
                  return (
                    <Pressable
                      key={l}
                      onPress={() => {
                        setLevelState(l);
                        if (sourceMode === 'wikipedia') {
                          loadPassage(topic, sourceMode, l);
                        }
                      }}
                      style={({ pressed }) => [
                        styles.levelChip,
                        {
                          backgroundColor: active ? theme.accent : theme.bgCard,
                          borderColor: active ? theme.accent : theme.border,
                          transform: [{ scale: pressed ? 0.95 : 1 }],
                        },
                      ]}
                    >
                      <ThemedText type="smallBold" themeColor={active ? 'bg' : 'textMuted'}>
                        {l}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>

              {/* Konu Seçimi */}
              <ThemedText type="smallBold" themeColor="textMuted" style={styles.controlSectionLabel}>
                KONU SEÇİMİ
              </ThemedText>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.topicRowContent}
                style={styles.topicRow}
              >
                {topicOptions.map((t) => {
                  const active = t.id === topic;
                  return (
                    <Pressable
                      key={t.id}
                      onPress={() => {
                        setTopic(t.id);
                        if (sourceMode === 'wikipedia') {
                          loadPassage(t.id, sourceMode, levelState);
                        }
                      }}
                      style={({ pressed }) => [
                        styles.topicChip,
                        {
                          backgroundColor: active ? theme.accent : theme.bgCard,
                          borderColor: active ? theme.accent : theme.border,
                          transform: [{ scale: pressed ? 0.96 : 1 }],
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
                  onPress={async () => {
                    if (!isOnline) {
                      Alert.alert('Bağlantı Hatası', 'Çevrimdışı modda yeni AI metni oluşturulamaz.');
                      return;
                    }
                    await loadPassage(topic, 'ai', levelState);
                    setControlPanelOpen(false);
                  }}
                  disabled={loading || !isOnline}
                  style={({ pressed }) => [
                    styles.generateButton,
                    {
                      backgroundColor: theme.accent,
                      opacity: loading || !isOnline ? 0.6 : 1,
                      transform: [{ scale: pressed ? 0.97 : 1 }],
                    },
                  ]}
                >
                  <ThemedText type="smallBold" themeColor="bg">
                    {!isOnline ? 'Çevrimdışı Modda Üretilemez' : loading ? 'Oluşturuluyor…' : passage ? 'Yeni Metin Oluştur' : 'Metni Oluştur'}
                  </ThemedText>
                </Pressable>
              )}

              <View style={[styles.divider, { backgroundColor: theme.border }]} />

              {/* Yardımcı Araçlar (Akıllı Tekrar, Hatalarım, Kartlar, Gramer) */}
              <ThemedText type="smallBold" themeColor="textMuted" style={styles.controlSectionLabel}>
                YARDIMCI ARAÇLAR
              </ThemedText>
              <View style={styles.quickToolsGrid}>
                {[
                  { label: 'Akıllı Tekrar', icon: 'sync', path: '/review' },
                  { label: 'Hatalarım', icon: 'alert-circle', path: '/mistakes' },
                  { label: 'Kartlar', icon: 'cards-outline', path: '/flashcards' },
                  { label: 'Gramer', icon: 'book-open-page-variant', path: '/grammar' },
                ].map((item) => (
                  <Pressable
                    key={item.label}
                    onPress={() => {
                      setControlPanelOpen(false);
                      router.push(item.path as any);
                    }}
                    style={({ pressed }) => [
                      styles.quickToolCard,
                      {
                        borderColor: theme.border,
                        backgroundColor: theme.bgElevated,
                        transform: [{ scale: pressed ? 0.96 : 1 }],
                      },
                    ]}
                  >
                    <MaterialCommunityIcons name={item.icon as any} size={24} color={theme.accent} />
                    <ThemedText type="smallBold" style={{ textAlign: 'center' }}>
                      {item.label}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Yüzen Ses Çalar Çubuğu */}
      {(isReading || isPaused) && (
        <View style={[styles.floatingPlayer, { backgroundColor: 'rgba(20, 20, 20, 0.88)', borderColor: theme.border }]}>
          <Pressable
            onPress={handlePrevSentence}
            disabled={currentSentenceIdx === 0}
            style={[styles.floatingPlayerButton, { opacity: currentSentenceIdx === 0 ? 0.3 : 1 }]}
          >
            <MaterialCommunityIcons name="skip-previous" size={24} color={theme.accent} />
          </Pressable>
          
          <Pressable
            onPress={() => (isReading ? handlePauseReading() : startReading(currentSentenceIdx))}
            disabled={isBuffering}
            style={styles.floatingPlayerMainButton}
          >
            {isBuffering ? (
              <ActivityIndicator color={theme.accent} size="small" />
            ) : (
              <MaterialCommunityIcons
                name={isReading ? "pause" : "play"}
                size={28}
                color={theme.bg}
              />
            )}
          </Pressable>

          <Pressable
            onPress={handleNextSentence}
            disabled={currentSentenceIdx >= processedPassage.length - 1}
            style={[styles.floatingPlayerButton, { opacity: currentSentenceIdx >= processedPassage.length - 1 ? 0.3 : 1 }]}
          >
            <MaterialCommunityIcons name="skip-next" size={24} color={theme.accent} />
          </Pressable>

          <View style={styles.floatingPlayerInfo}>
            <ThemedText type="smallBold" numberOfLines={1}>
              Cümle {currentSentenceIdx + 1}/{processedPassage.length}
            </ThemedText>
          </View>

          <Pressable onPress={stopReading} style={styles.floatingPlayerCloseButton}>
            <MaterialCommunityIcons name="close" size={20} color={theme.textMuted} />
          </Pressable>
        </View>
      )}

      {/* Hızlı Sözlük Modalı */}
      <Modal visible={!!selectedWord} transparent animationType="slide" onRequestClose={() => setSelectedWord(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setSelectedWord(null)}>
          <Pressable style={[styles.lookupCard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
            <View style={[styles.dragIndicator, { backgroundColor: theme.border }]} />
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

            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            {lookupLoading && <ActivityIndicator color={theme.accent} style={styles.lookupLoading} />}

            {!lookupLoading && lookup && (
              <>
                {lookup.phonetic ? (
                  <ThemedText themeColor="textMuted" type="small" style={styles.lookupPhonetic}>
                    {lookup.phonetic}
                  </ThemedText>
                ) : null}
                <ThemedText type="smallBold" themeColor="accent" style={styles.lookupSectionLabel}>
                  Türkçe
                </ThemedText>
                <ThemedText style={styles.lookupValue}>{lookup.tr}</ThemedText>

                <View style={[styles.divider, { backgroundColor: theme.border }]} />

                <ThemedText type="smallBold" themeColor="accent" style={styles.lookupSectionLabel}>
                  Tanım
                </ThemedText>
                <ThemedText themeColor="textMuted" style={styles.lookupValue}>
                  {lookup.definition}
                </ThemedText>

                {lookup.synonyms && lookup.synonyms !== '-' ? (
                  <>
                    <View style={[styles.divider, { backgroundColor: theme.border }]} />
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brand: { fontSize: 22, fontWeight: '900' },
  title: { fontSize: 16, fontWeight: '800' },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlPanelCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: Spacing.four,
    paddingBottom: Spacing.six,
    maxHeight: '85%',
  },
  controlPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  controlPanelTitle: { fontWeight: '800' },
  controlPanelScrollContent: {
    gap: Spacing.three,
    paddingBottom: Spacing.four,
  },
  controlSectionLabel: {
    fontSize: 11,
    letterSpacing: 1,
    marginTop: Spacing.two,
  },
  segmentedControl: {
    flexDirection: 'row',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 3,
  },
  segmentedButton: {
    flex: 1,
    borderRadius: 11,
    paddingVertical: Spacing.two - 2,
    alignItems: 'center',
  },
  levelRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  levelChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
  },
  topicRow: { flexGrow: 0 },
  topicRowContent: { gap: Spacing.two },
  topicChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
  },
  topicChipTextActive: { fontWeight: '700' },
  generateButton: {
    borderRadius: 12,
    paddingVertical: Spacing.two + 4,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  quickToolsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  quickToolCard: {
    flexBasis: '47%',
    flexGrow: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: Spacing.three,
    alignItems: 'center',
    gap: Spacing.one,
  },
  emptyAiText: { textAlign: 'center', paddingHorizontal: Spacing.four, lineHeight: 22, marginTop: Spacing.six },
  passageScroll: { flex: 1, marginTop: Spacing.three },
  passageContent: { paddingHorizontal: Spacing.four, paddingBottom: 100 },
  centerBox: { paddingTop: Spacing.six, alignItems: 'center' },
  error: { marginTop: Spacing.four, textAlign: 'center' },
  passageHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.two,
  },
  passageTitle: { flex: 1, fontWeight: '800', fontSize: 20 },
  passageHeaderActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  actionIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  translationToggle: { marginBottom: Spacing.three },
  wordsWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  passageText: { fontSize: 19, lineHeight: 32, letterSpacing: 0.3 },
  audioActiveWord: { borderRadius: 4, fontWeight: '800', textDecorationLine: 'underline' },
  floatingPlayer: {
    position: 'absolute',
    bottom: Spacing.four,
    left: Spacing.four,
    right: Spacing.four,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.two,
    gap: Spacing.two,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 6,
  },
  floatingPlayerButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingPlayerMainButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#e2b714',
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingPlayerInfo: {
    flex: 1,
    paddingLeft: Spacing.one,
  },
  floatingPlayerCloseButton: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  dragIndicator: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: Spacing.two,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
    marginVertical: Spacing.two,
  },
  lookupCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: Spacing.four,
    paddingBottom: Spacing.six,
  },
  lookupHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lookupWord: { fontWeight: '800', fontSize: 20 },
  lookupLoading: { marginVertical: Spacing.four },
  lookupPhonetic: { marginTop: Spacing.one },
  lookupSectionLabel: { marginTop: Spacing.one, fontSize: 13 },
  lookupValue: { marginTop: Spacing.half, lineHeight: 22 },
  saveButton: {
    marginTop: Spacing.four,
    borderRadius: 12,
    paddingVertical: Spacing.two + 2,
    alignItems: 'center',
  },
  offlineChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'center',
    shadowColor: '#ff9f0a',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 3,
  },
  offlineText: {
    color: '#000',
    fontSize: 9,
    fontWeight: '900',
  },
});
