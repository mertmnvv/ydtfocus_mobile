import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Share, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProgressChart } from '@/components/progress-chart';
import { SpinWheelModal } from '@/components/spin-wheel-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { LEVEL_INTERVALS } from '@/constants/srs';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import {
  getRecentDailyStats,
  getWheelState,
  setExamDate,
  subscribeToLeaderboard,
  subscribeToUserStats,
  subscribeToUserWords,
  type DailyStatEntry,
  type LeaderboardCategory,
  type LeaderboardEntry,
  type UserStats,
  type UserWord,
  type WheelState,
} from '@/lib/firestore';
import { useTheme } from '@/hooks/use-theme';

// Sınav geri sayımı — bugünün tarihini saat/timezone'dan arındırıp
// (yalnızca yıl/ay/gün) sınav tarihiyle gün cinsinden farkını hesaplar,
// böylece gün içindeki saat değişimi sonucu etkilemez (off-by-one yok).
function daysUntil(examDate: string): number {
  const target = new Date(examDate);
  const today = new Date();
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const targetUtc = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate());
  return Math.round((targetUtc - todayUtc) / 86400000);
}

function examTip(days: number): string {
  if (days < 0) return 'Sınav tarihini güncellemeyi unutma.';
  if (days < 30) return 'Son düzlük, her gün önemli.';
  if (days <= 180) return 'Tempoyu artırma zamanı.';
  return 'Bol vaktin var, düzenli çalış.';
}

const emptyWheelState: WheelState = { lastFreeSpinWeek: 0, lastAdSpinWeek: 0, adSpinsUsedThisWeek: 0 };

const roleLabel: Record<string, string> = {
  free: 'Ücretsiz Plan',
  premium: 'Premium Üye',
  admin: 'Yönetici',
};

// Rozetler — web'deki ydtfocusv2/src/constants/badges.js + /achievements
// sayfasının küçültülmüş mobil karşılığı. Web'de rozetler
// checkAndGrantBadges ile Firestore'daki users/{uid}.badges dizisine
// yazılıyor; burada aynı yazma mantığını tekrar etmek yerine (tek
// doğruluk kaynağı web'de kalsın) kilit durumu doğrudan mevcut
// stats/kelime verisinden İSTEMCİ TARAFINDA hesaplanıyor — sunucudaki
// `badges` alanına dokunulmuyor. Kapsam dışı: arkadaşlık/sıralama
// rozetleri (SOCIAL_*, RANK_*, LEGENDARY) — bunlar web'de de ayrı
// sistemlere (arkadaşlar, canlı sıralama konumu) bağlı.
type Badge = {
  id: string;
  title: string;
  description: string;
  category: string;
  isUnlocked: (ctx: { streak: number; wordCount: number; totalMinutes: number; dailyMinutes: number }) => boolean;
};

const BADGES: Badge[] = [
  {
    id: 'WELCOME',
    title: 'Akademik Başlangıç',
    description: 'YDT Focus platformuna katılarak ilk adımını attın.',
    category: 'Süreklilik',
    isUnlocked: () => true,
  },
  {
    id: 'STREAK_7',
    title: 'Haftalık Disiplin',
    description: '7 gün boyunca kesintisiz çalışarak düzenli bir alışkanlık kurdun.',
    category: 'Süreklilik',
    isUnlocked: ({ streak }) => streak >= 7,
  },
  {
    id: 'STREAK_15',
    title: 'Yarım Ay İstikrarı',
    description: '15 gün boyunca hedeflerinden kopmadan ilerlemeyi başardın.',
    category: 'Süreklilik',
    isUnlocked: ({ streak }) => streak >= 15,
  },
  {
    id: 'STREAK_30',
    title: 'Aylık Azim',
    description: '30 günlük muazzam bir çalışma serisiyle iradeni kanıtladın.',
    category: 'Süreklilik',
    isUnlocked: ({ streak }) => streak >= 30,
  },
  {
    id: 'WORDS_100',
    title: 'Kelime Temeli',
    description: '100 temel akademik kelime ile dil bilgine sağlam bir altyapı kurdun.',
    category: 'Kelime Bilgisi',
    isUnlocked: ({ wordCount }) => wordCount >= 100,
  },
  {
    id: 'WORDS_250',
    title: 'Kelime Gelişimi',
    description: '250 kelime ile akademik okumalar için ilk büyük adımı attın.',
    category: 'Kelime Bilgisi',
    isUnlocked: ({ wordCount }) => wordCount >= 250,
  },
  {
    id: 'WORDS_500',
    title: 'Kelime Uzmanı',
    description: '500 kelime ile akademik metinleri anlama kapasiteni üst seviyeye taşıdın.',
    category: 'Kelime Bilgisi',
    isUnlocked: ({ wordCount }) => wordCount >= 500,
  },
  {
    id: 'WORDS_1000',
    title: 'Kelime Üstadı',
    description: '1000 kelime ile lügatında profesyonel bir hakimiyet kurdun.',
    category: 'Kelime Bilgisi',
    isUnlocked: ({ wordCount }) => wordCount >= 1000,
  },
  {
    id: 'DAILY_CHAMPION',
    title: 'Günlük Hedef',
    description: 'Bir gün içerisinde 60 dakika aktif çalışma süresine ulaştın.',
    category: 'Akademik Disiplin',
    isUnlocked: ({ dailyMinutes }) => dailyMinutes >= 60,
  },
  {
    id: 'MINUTES_500',
    title: 'Yoğun Çalışma',
    description: 'Toplam aktif çalışma sürenin 500 dakikaya ulaştı.',
    category: 'Akademik Disiplin',
    isUnlocked: ({ totalMinutes }) => totalMinutes >= 500,
  },
  {
    id: 'MINUTES_1000',
    title: 'Zaman Yönetimi',
    description: 'Toplam aktif çalışma sürenin 1000 dakikaya ulaştı.',
    category: 'Akademik Disiplin',
    isUnlocked: ({ totalMinutes }) => totalMinutes >= 1000,
  },
  {
    id: 'MINUTES_2000',
    title: "Zamanın Efendisi",
    description: 'Toplam aktif çalışma sürenin 2000 dakikaya ulaştı.',
    category: 'Akademik Disiplin',
    isUnlocked: ({ totalMinutes }) => totalMinutes >= 2000,
  },
];

const LEADERBOARD_CATEGORIES: { id: LeaderboardCategory; label: string }[] = [
  { id: 'streak', label: 'Seri' },
  { id: 'weeklyMinutes', label: 'Haftalık' },
  { id: 'dailyMinutes', label: 'Günlük' },
  { id: 'weeklyReadings', label: 'Metin' },
];

function scoreLabel(category: LeaderboardCategory, entry: LeaderboardEntry): string {
  const val = Number(entry.publicStats?.[category] ?? 0);
  if (category === 'streak') return `${val} Gün`;
  if (category === 'weeklyReadings') return `${val} Metin`;
  return `${val} dk`;
}

// Profil — web'deki /profile ile aynı 3. sekme. Firebase Auth kullanıcı
// bilgisi + Firestore profil (role/premium) + istatistikler (streak,
// çalışma süresi, doğru/yanlış) burada gösteriliyor.
export default function ProfileScreen() {
  const theme = useTheme();
  const { user, userProfile, isPremium, isAdmin, logout } = useAuth();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wheelState, setWheelState] = useState<WheelState>(emptyWheelState);
  const [wheelOpen, setWheelOpen] = useState(false);
  const [words, setWords] = useState<UserWord[]>([]);
  const wordCount = words.length;
  const [dailyStats, setDailyStats] = useState<DailyStatEntry[]>([]);
  const [leaderboardCategory, setLeaderboardCategory] = useState<LeaderboardCategory>('streak');
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);
  const [achievementsOpen, setAchievementsOpen] = useState(false);
  const [editingExamDate, setEditingExamDate] = useState(false);
  const [examDay, setExamDay] = useState('');
  const [examMonth, setExamMonth] = useState('');
  const [examYear, setExamYear] = useState('');
  const [examDateError, setExamDateError] = useState<string | null>(null);
  const [savingExamDate, setSavingExamDate] = useState(false);

  useEffect(() => {
    if (!user) return;
    return subscribeToUserStats(user.uid, setStats);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return subscribeToUserWords(user.uid, setWords);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    getRecentDailyStats(user.uid, 7)
      .then(setDailyStats)
      .catch(() => setDailyStats([]));
  }, [user, stats?.dailyMinutes]);

  useEffect(() => {
    if (!achievementsOpen) return;
    setLeaderboardLoading(true);
    const unsubscribe = subscribeToLeaderboard(leaderboardCategory, 10, (entries) => {
      setLeaderboard(entries);
      setLeaderboardLoading(false);
    });
    return unsubscribe;
  }, [leaderboardCategory, achievementsOpen]);

  const refreshWheelState = useCallback(() => {
    if (!user) return;
    getWheelState(user.uid).then(setWheelState);
  }, [user]);

  useEffect(() => {
    refreshWheelState();
  }, [refreshWheelState]);

  const displayName = userProfile?.displayName || user?.displayName || user?.email?.split('@')[0] || 'Kullanıcı';
  const photoURL = userProfile?.photoURL || user?.photoURL;
  const role = userProfile?.role ?? 'free';
  const accuracy =
    stats && stats.correct + stats.wrong > 0
      ? Math.round((stats.correct / (stats.correct + stats.wrong)) * 100)
      : null;

  const totalMinutes = Number((userProfile?.publicStats as Record<string, unknown> | undefined)?.totalMinutes ?? 0);
  const badgeCtx = {
    streak: stats?.streak ?? 0,
    wordCount,
    totalMinutes,
    dailyMinutes: stats?.dailyMinutes ?? 0,
  };
  const unlockedBadgeCount = BADGES.filter((b) => b.isUnlocked(badgeCtx)).length;
  const badgeCategories = Array.from(new Set(BADGES.map((b) => b.category)));

  // SRS dağılımı — src/app/review.tsx'teki level mantığıyla aynı eksen:
  // level 0..LEVEL_INTERVALS.length-1. Sınırlar:
  //  - Yeni: level === 0 (hiç doğru tekrar yapılmamış)
  //  - Öğreniliyor: 0 < level < LEVEL_INTERVALS.length - 1 (ara seviyeler)
  //  - Ustalaşıldı: level === LEVEL_INTERVALS.length - 1 (son aralığa ulaşmış)
  const maxLevel = LEVEL_INTERVALS.length - 1;
  const srsNew = words.filter((w) => (w.level ?? 0) === 0).length;
  const srsMastered = words.filter((w) => (w.level ?? 0) === maxLevel).length;
  const srsLearning = wordCount - srsNew - srsMastered;

  function openExamDateEditor() {
    setExamDateError(null);
    if (userProfile?.examDate) {
      const [y, m, d] = userProfile.examDate.split('-');
      setExamYear(y ?? '');
      setExamMonth(m ?? '');
      setExamDay(d ?? '');
    } else {
      setExamDay('');
      setExamMonth('');
      setExamYear('');
    }
    setEditingExamDate(true);
  }

  async function handleSaveExamDate() {
    if (!user) return;
    const day = Number(examDay);
    const month = Number(examMonth);
    const year = Number(examYear);

    if (!day || !month || !year || year < 2024 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
      setExamDateError('Lütfen geçerli bir tarih gir.');
      return;
    }

    const iso = `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    const check = new Date(iso);
    if (Number.isNaN(check.getTime()) || check.getUTCDate() !== day || check.getUTCMonth() + 1 !== month) {
      setExamDateError('Lütfen geçerli bir tarih gir.');
      return;
    }

    setExamDateError(null);
    setSavingExamDate(true);
    try {
      await setExamDate(user.uid, iso);
      setEditingExamDate(false);
    } catch {
      setExamDateError('Kaydedilemedi, tekrar dene.');
    } finally {
      setSavingExamDate(false);
    }
  }

  // Haftalık Özet Paylaşımı — mevcut subscribeToUserStats akışındaki
  // stats state'i yeniden kullanılıyor, ayrı bir sorgu/abonelik yok.
  // Basit metin paylaşımı: react-native'in yerleşik Share API'si (gift.tsx'teki
  // hediye kodu paylaşımıyla aynı desen), ekran görüntüsü/kart oluşturma yok.
  async function handleShareWeeklySummary() {
    const weeklyMinutes = stats?.weeklyMinutes ?? 0;
    const weeklyReadings = stats?.weeklyReadings ?? 0;
    let message = `Bu hafta YDT Focus'ta ${weeklyMinutes} dakika çalıştım, ${weeklyReadings} metin okudum.`;
    if (accuracy !== null) {
      message += ` Doğruluk oranım %${accuracy}.`;
    }
    try {
      await Share.share({ message });
    } catch {
      // Kullanıcı paylaşım ekranını kapattıysa sessizce yut.
    }
  }

  async function handleLogout() {
    setError(null);
    setLoggingOut(true);
    try {
      await logout();
    } catch {
      setError('Çıkış yapılamadı, tekrar deneyin.');
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.titleRow}>
          <View>
            <ThemedText type="title" themeColor="accent" style={styles.brand}>
              ydtfocus
            </ThemedText>
            <ThemedText type="subtitle" style={styles.title}>
              Profil
            </ThemedText>
          </View>
          <Pressable
            onPress={() => router.push('/settings')}
            hitSlop={12}
            style={[styles.settingsButton, { borderColor: theme.border, backgroundColor: theme.bgCard }]}
          >
            <ThemedText type="title" themeColor="textMuted" style={styles.settingsIcon}>
              ⚙
            </ThemedText>
          </Pressable>
        </View>

        <ThemedView type="bgCard" style={[styles.headerCard, { borderColor: theme.border }]}>
          <View style={styles.headerRow}>
            {photoURL ? (
              <Image source={{ uri: photoURL }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatarFallback, { backgroundColor: theme.bgElevated }]}>
                <ThemedText type="subtitle" themeColor="accent">
                  {displayName.charAt(0).toUpperCase()}
                </ThemedText>
              </View>
            )}
            <View style={styles.headerText}>
              <ThemedText type="subtitle" style={styles.name}>
                {displayName}
              </ThemedText>
              <ThemedText themeColor="textMuted" type="small">
                {user?.email ?? '—'}
              </ThemedText>
            </View>
          </View>

          <View
            style={[
              styles.roleBadge,
              {
                backgroundColor: isPremium ? theme.accent : theme.bgElevated,
                borderColor: isPremium ? theme.accent : theme.border,
              },
            ]}
          >
            <ThemedText type="smallBold" themeColor={isPremium ? 'bg' : 'textMuted'}>
              {roleLabel[role] ?? roleLabel.free}
              {isAdmin ? ' · Admin' : ''}
            </ThemedText>
          </View>

          {userProfile?.level ? (
            <View style={[styles.levelBadge, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
              <ThemedText type="smallBold" themeColor="accent">
                Seviye: {userProfile.level}
              </ThemedText>
            </View>
          ) : null}
        </ThemedView>

        <ThemedView type="bgCard" style={[styles.statsCard, { borderColor: theme.border }]}>
          <ThemedText type="smallBold" themeColor="textMuted" style={styles.statsTitle}>
            İstatistikler
          </ThemedText>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <ThemedText type="title" themeColor="accent" style={styles.statValue}>
                {stats?.streak ?? 0}
              </ThemedText>
              <ThemedText themeColor="textMuted" type="small">
                Gün Serisi
              </ThemedText>
            </View>
            <View style={styles.statItem}>
              <ThemedText type="title" themeColor="accent" style={styles.statValue}>
                {stats?.dailyMinutes ?? 0}
              </ThemedText>
              <ThemedText themeColor="textMuted" type="small">
                Bugün (dk)
              </ThemedText>
            </View>
            <View style={styles.statItem}>
              <ThemedText type="title" themeColor="accent" style={styles.statValue}>
                {accuracy !== null ? `%${accuracy}` : '—'}
              </ThemedText>
              <ThemedText themeColor="textMuted" type="small">
                Doğruluk
              </ThemedText>
            </View>
          </View>
        </ThemedView>

        <Pressable
          onPress={() => router.push('/word-bank')}
          style={({ pressed }) => [
            styles.statsCard,
            { borderColor: theme.border, backgroundColor: theme.bgCard, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <ThemedText type="smallBold" themeColor="textMuted" style={styles.statsTitle}>
            Kelime Bankası Dağılımı
          </ThemedText>
          {wordCount === 0 ? (
            <ThemedText themeColor="textMuted" type="small">
              Henüz kelime bankana kelime eklemedin.
            </ThemedText>
          ) : (
            <>
              <View style={[styles.srsBar, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}>
                {srsNew > 0 ? (
                  <View style={[styles.srsBarSegment, { flexGrow: srsNew, backgroundColor: theme.border }]} />
                ) : null}
                {srsLearning > 0 ? (
                  <View
                    style={[styles.srsBarSegment, { flexGrow: srsLearning, backgroundColor: theme.academicWord }]}
                  />
                ) : null}
                {srsMastered > 0 ? (
                  <View style={[styles.srsBarSegment, { flexGrow: srsMastered, backgroundColor: theme.savedWord }]} />
                ) : null}
              </View>
              <View style={styles.srsLegendRow}>
                <View style={styles.srsLegendItem}>
                  <View style={[styles.srsLegendDot, { backgroundColor: theme.border }]} />
                  <ThemedText themeColor="textMuted" type="small">
                    Yeni: {srsNew}
                  </ThemedText>
                </View>
                <View style={styles.srsLegendItem}>
                  <View style={[styles.srsLegendDot, { backgroundColor: theme.academicWord }]} />
                  <ThemedText themeColor="textMuted" type="small">
                    Öğreniliyor: {srsLearning}
                  </ThemedText>
                </View>
                <View style={styles.srsLegendItem}>
                  <View style={[styles.srsLegendDot, { backgroundColor: theme.savedWord }]} />
                  <ThemedText themeColor="textMuted" type="small">
                    Ustalaşıldı: {srsMastered}
                  </ThemedText>
                </View>
              </View>
            </>
          )}
        </Pressable>

        <ThemedView type="bgCard" style={[styles.examCard, { borderColor: theme.border }]}>
          {!editingExamDate && userProfile?.examDate ? (
            (() => {
              const days = daysUntil(userProfile.examDate);
              return (
                <>
                  <View style={styles.examHeaderRow}>
                    <ThemedText type="smallBold" themeColor="textMuted">
                      Sınav Geri Sayımı
                    </ThemedText>
                    <Pressable onPress={openExamDateEditor} hitSlop={8}>
                      <ThemedText type="small" themeColor="accent">
                        Değiştir
                      </ThemedText>
                    </Pressable>
                  </View>
                  <ThemedText type="title" themeColor="accent" style={styles.examDays}>
                    {days >= 0 ? `Sınava ${days} gün kaldı` : 'Sınav tarihi geçti'}
                  </ThemedText>
                  <ThemedText themeColor="textMuted" type="small">
                    {examTip(days)}
                  </ThemedText>
                </>
              );
            })()
          ) : !editingExamDate ? (
            <Pressable onPress={openExamDateEditor} style={styles.examPrompt}>
              <ThemedText type="smallBold">Sınav tarihini belirle</ThemedText>
              <ThemedText themeColor="textMuted" type="small">
                Geri sayım ve çalışma temposu önerisi için sınav tarihini gir
              </ThemedText>
            </Pressable>
          ) : (
            <View style={styles.examEditor}>
              <ThemedText type="smallBold" themeColor="textMuted">
                Sınav Tarihi
              </ThemedText>
              <View style={styles.examInputRow}>
                <TextInput
                  value={examDay}
                  onChangeText={setExamDay}
                  placeholder="Gün"
                  placeholderTextColor={theme.textMuted}
                  keyboardType="number-pad"
                  maxLength={2}
                  style={[styles.examInput, { borderColor: theme.border, color: theme.text }]}
                />
                <TextInput
                  value={examMonth}
                  onChangeText={setExamMonth}
                  placeholder="Ay"
                  placeholderTextColor={theme.textMuted}
                  keyboardType="number-pad"
                  maxLength={2}
                  style={[styles.examInput, { borderColor: theme.border, color: theme.text }]}
                />
                <TextInput
                  value={examYear}
                  onChangeText={setExamYear}
                  placeholder="Yıl"
                  placeholderTextColor={theme.textMuted}
                  keyboardType="number-pad"
                  maxLength={4}
                  style={[styles.examInput, styles.examYearInput, { borderColor: theme.border, color: theme.text }]}
                />
              </View>
              {examDateError ? (
                <ThemedText themeColor="error" type="small">
                  {examDateError}
                </ThemedText>
              ) : null}
              <View style={styles.examEditorActions}>
                <Pressable
                  onPress={handleSaveExamDate}
                  disabled={savingExamDate}
                  style={[styles.examSaveButton, { backgroundColor: theme.accent, opacity: savingExamDate ? 0.7 : 1 }]}
                >
                  <ThemedText type="smallBold" themeColor="bg">
                    {savingExamDate ? 'Kaydediliyor…' : 'Kaydet'}
                  </ThemedText>
                </Pressable>
                {userProfile?.examDate ? (
                  <Pressable onPress={() => setEditingExamDate(false)} hitSlop={8}>
                    <ThemedText type="small" themeColor="textMuted">
                      Vazgeç
                    </ThemedText>
                  </Pressable>
                ) : null}
              </View>
            </View>
          )}
        </ThemedView>

        {userProfile?.dailyGoalMinutes ? (
          <ThemedView type="bgCard" style={[styles.goalCard, { borderColor: theme.border }]}>
            <View style={styles.rowBetween}>
              <ThemedText type="smallBold" themeColor="textMuted">
                Günlük Hedef
              </ThemedText>
              <ThemedText type="smallBold" themeColor="accent">
                {Math.min(stats?.dailyMinutes ?? 0, userProfile.dailyGoalMinutes)}/{userProfile.dailyGoalMinutes} dk
              </ThemedText>
            </View>
            <View style={[styles.goalBarTrack, { backgroundColor: theme.bgElevated }]}>
              <View
                style={[
                  styles.goalBarFill,
                  {
                    backgroundColor: theme.accent,
                    width: `${Math.min(100, Math.round(((stats?.dailyMinutes ?? 0) / userProfile.dailyGoalMinutes) * 100))}%`,
                  },
                ]}
              />
            </View>
          </ThemedView>
        ) : (
          <Pressable
            onPress={() => router.push('/settings')}
            style={[styles.goalHint, { borderColor: theme.border, backgroundColor: theme.bgCard }]}
          >
            <ThemedText themeColor="textMuted" type="small">
              Ayarlar&apos;dan günlük çalışma hedefi belirle
            </ThemedText>
          </Pressable>
        )}

        <ThemedView type="bgCard" style={[styles.statsCard, { borderColor: theme.border }]}>
          <ThemedText type="smallBold" themeColor="textMuted" style={styles.statsTitle}>
            Zaman İçinde İlerleme (Son 7 Gün)
          </ThemedText>
          <ProgressChart entries={dailyStats} />
        </ThemedView>

        <View style={styles.actionRow}>
          <Pressable
            onPress={() => setWheelOpen(true)}
            style={[styles.actionCard, { borderColor: theme.border, backgroundColor: theme.bgCard }]}
          >
            <ThemedText type="smallBold" themeColor="accent">
              Çark Çevir
            </ThemedText>
            <ThemedText themeColor="textMuted" type="small">
              Haftalık 1/3/7 gün premium şansı
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => router.push('/gift')}
            style={[styles.actionCard, { borderColor: theme.border, backgroundColor: theme.bgCard }]}
          >
            <ThemedText type="smallBold" themeColor="accent">
              Arkadaşına Hediye Et
            </ThemedText>
            <ThemedText themeColor="textMuted" type="small">
              Premium hediye et veya kod kullan
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => router.push('/dictionary')}
            style={[styles.actionCard, { borderColor: theme.border, backgroundColor: theme.bgCard }]}
          >
            <ThemedText type="smallBold" themeColor="accent">
              Sözlük
            </ThemedText>
            <ThemedText themeColor="textMuted" type="small">
              Akademik sözlükte ara
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => router.push('/word-bank')}
            style={[styles.actionCard, { borderColor: theme.border, backgroundColor: theme.bgCard }]}
          >
            <ThemedText type="smallBold" themeColor="accent">
              Kelime Bankam
            </ThemedText>
            <ThemedText themeColor="textMuted" type="small">
              Eklediğin tüm kelimeler
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => router.push({ pathname: '/level-test', params: { mode: 'retake' } })}
            style={[styles.actionCard, { borderColor: theme.border, backgroundColor: theme.bgCard }]}
          >
            <ThemedText type="smallBold" themeColor="accent">
              Seviyeni Yükselt
            </ThemedText>
            <ThemedText themeColor="textMuted" type="small">
              CEFR seviye sınavını tekrar çöz
            </ThemedText>
          </Pressable>
          {!isPremium && (
            <Pressable
              onPress={() => router.push('/premium')}
              style={[styles.actionCard, { borderColor: theme.accent, backgroundColor: theme.bgCard }]}
            >
              <ThemedText type="smallBold" themeColor="accent">
                Premium&apos;a Yükselt
              </ThemedText>
              <ThemedText themeColor="textMuted" type="small">
                Play Store üzerinden abone ol
              </ThemedText>
            </Pressable>
          )}
          <Pressable
            onPress={handleShareWeeklySummary}
            style={[styles.actionCard, { borderColor: theme.border, backgroundColor: theme.bgCard }]}
          >
            <ThemedText type="smallBold" themeColor="accent">
              Haftalık Özeti Paylaş
            </ThemedText>
            <ThemedText themeColor="textMuted" type="small">
              Bu haftaki ilerlemeni paylaş
            </ThemedText>
          </Pressable>
        </View>

        <Pressable
          onPress={() => setAchievementsOpen((value) => !value)}
          style={[styles.achievementsToggle, { borderColor: theme.border, backgroundColor: theme.bgCard }]}
        >
          <View style={styles.achievementsToggleText}>
            <ThemedText type="smallBold">Rozetler ve Liderlik Tablosu</ThemedText>
            <ThemedText themeColor="textMuted" type="small">
              {unlockedBadgeCount}/{BADGES.length} rozet kazanıldı
            </ThemedText>
          </View>
          <ThemedText type="subtitle" themeColor="accent">
            {achievementsOpen ? '−' : '+'}
          </ThemedText>
        </Pressable>

        {achievementsOpen ? (
          <View style={styles.achievementsSection}>
            {badgeCategories.map((category) => (
              <View key={category} style={styles.categorySection}>
                <ThemedText type="smallBold" themeColor="textMuted" style={styles.categoryTitle}>
                  {category.toUpperCase()}
                </ThemedText>
                {BADGES.filter((b) => b.category === category).map((badge) => {
                  const unlocked = badge.isUnlocked(badgeCtx);
                  return (
                    <ThemedView
                      key={badge.id}
                      type="bgCard"
                      style={[
                        styles.badgeCard,
                        { borderColor: unlocked ? theme.accent : theme.border, opacity: unlocked ? 1 : 0.55 },
                      ]}
                    >
                      <View
                        style={[
                          styles.badgeIcon,
                          { backgroundColor: theme.bgElevated, borderColor: unlocked ? theme.accent : theme.border },
                        ]}
                      >
                        <ThemedText type="subtitle" themeColor={unlocked ? 'accent' : 'textMuted'}>
                          {unlocked ? '★' : '?'}
                        </ThemedText>
                      </View>
                      <View style={styles.badgeInfo}>
                        <ThemedText type="smallBold">{badge.title}</ThemedText>
                        <ThemedText themeColor="textMuted" type="small" style={styles.badgeDesc}>
                          {badge.description}
                        </ThemedText>
                        {unlocked ? (
                          <ThemedText type="small" themeColor="accent" style={styles.badgeUnlockedTag}>
                            Kazanıldı
                          </ThemedText>
                        ) : null}
                      </View>
                    </ThemedView>
                  );
                })}
              </View>
            ))}

            <View style={styles.leaderboardSection}>
              <ThemedText type="subtitle" style={styles.title}>
                Liderlik Tablosu
              </ThemedText>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.categoryChipsRow}
                style={styles.categoryChipsScroll}
              >
                {LEADERBOARD_CATEGORIES.map((cat) => {
                  const active = cat.id === leaderboardCategory;
                  return (
                    <ThemedText
                      key={cat.id}
                      type="smallBold"
                      themeColor={active ? 'bg' : 'textMuted'}
                      onPress={() => setLeaderboardCategory(cat.id)}
                      style={[
                        styles.categoryChip,
                        {
                          backgroundColor: active ? theme.accent : theme.bgCard,
                          borderColor: active ? theme.accent : theme.border,
                        },
                      ]}
                    >
                      {cat.label}
                    </ThemedText>
                  );
                })}
              </ScrollView>

              {leaderboardLoading ? (
                <ActivityIndicator color={theme.accent} style={styles.leaderboardLoading} />
              ) : leaderboard.length === 0 ? (
                <ThemedText themeColor="textMuted" style={styles.leaderboardEmpty}>
                  Bu kategoride henüz veri yok.
                </ThemedText>
              ) : (
                leaderboard.map((entry, idx) => (
                  <ThemedView
                    key={entry.id}
                    type="bgCard"
                    style={[
                      styles.leaderRow,
                      { borderColor: entry.id === user?.uid ? theme.accent : theme.border },
                    ]}
                  >
                    <ThemedText type="smallBold" themeColor="textMuted" style={styles.leaderRank}>
                      {idx + 1}
                    </ThemedText>
                    {entry.photoURL ? (
                      <Image source={{ uri: entry.photoURL }} style={styles.leaderAvatar} />
                    ) : (
                      <View style={[styles.leaderAvatarFallback, { backgroundColor: theme.bgElevated }]}>
                        <ThemedText type="smallBold" themeColor="accent">
                          {(entry.displayName || '?').charAt(0).toUpperCase()}
                        </ThemedText>
                      </View>
                    )}
                    <ThemedText type="smallBold" style={styles.leaderName} numberOfLines={1}>
                      {entry.displayName || 'Gizli Kullanıcı'}
                    </ThemedText>
                    <ThemedText type="smallBold" themeColor="accent">
                      {scoreLabel(leaderboardCategory, entry)}
                    </ThemedText>
                  </ThemedView>
                ))
              )}
            </View>
          </View>
        ) : null}

        {error ? (
          <ThemedText themeColor="error" style={styles.error}>
            {error}
          </ThemedText>
        ) : null}

        <Pressable
          onPress={handleLogout}
          disabled={loggingOut}
          style={({ pressed }) => [
            styles.logoutButton,
            { borderColor: theme.error, opacity: pressed || loggingOut ? 0.7 : 1 },
          ]}
        >
          <ThemedText type="smallBold" themeColor="error">
            {loggingOut ? 'Çıkış yapılıyor…' : 'Çıkış Yap'}
          </ThemedText>
        </Pressable>
        </ScrollView>
      </SafeAreaView>

      <SpinWheelModal
        visible={wheelOpen}
        onClose={() => setWheelOpen(false)}
        wheelState={wheelState}
        onWheelStateChange={refreshWheelState}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
  },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  brand: { fontSize: 22, fontWeight: '900' },
  title: { fontWeight: '800', marginBottom: Spacing.two },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsIcon: { fontSize: 18, lineHeight: 20 },
  headerCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  avatarFallback: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1, gap: Spacing.half },
  name: { fontWeight: '800' },
  roleBadge: {
    alignSelf: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  levelBadge: {
    alignSelf: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  statsCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: Spacing.three,
  },
  statsTitle: { marginBottom: Spacing.two },
  srsBar: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  srsBarSegment: { height: '100%' },
  srsLegendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
    marginTop: Spacing.two,
  },
  srsLegendItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  srsLegendDot: { width: 8, height: 8, borderRadius: 4 },
  statsGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  statItem: { alignItems: 'center', gap: Spacing.half, flex: 1 },
  statValue: { fontWeight: '900' },
  examCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  examHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  examDays: { fontWeight: '900' },
  examPrompt: { gap: Spacing.half },
  examEditor: { gap: Spacing.two },
  examInputRow: { flexDirection: 'row', gap: Spacing.two },
  examInput: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    textAlign: 'center',
  },
  examYearInput: { flex: 1.4 },
  examEditorActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  examSaveButton: {
    borderRadius: 8,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    alignSelf: 'flex-start',
  },
  error: { marginTop: Spacing.one },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  goalCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  goalBarTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  goalBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  goalHint: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: Spacing.three,
  },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  actionCard: {
    flexBasis: '47%',
    flexGrow: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  logoutButton: {
    marginTop: Spacing.two,
    alignSelf: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  achievementsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: Spacing.three,
  },
  achievementsToggleText: { gap: Spacing.half },
  achievementsSection: { gap: Spacing.two },
  categorySection: { marginBottom: Spacing.four },
  categoryTitle: { marginBottom: Spacing.two },
  badgeCard: {
    flexDirection: 'row',
    gap: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: Spacing.three,
    marginBottom: Spacing.two,
  },
  badgeIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeInfo: { flex: 1, gap: Spacing.half },
  badgeDesc: { lineHeight: 18 },
  badgeUnlockedTag: { fontWeight: '800', marginTop: Spacing.half },
  leaderboardSection: { marginTop: Spacing.two },
  categoryChipsScroll: { flexGrow: 0, marginBottom: Spacing.three },
  categoryChipsRow: { gap: Spacing.two },
  categoryChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
    overflow: 'hidden',
  },
  leaderboardLoading: { marginTop: Spacing.four },
  leaderboardEmpty: { textAlign: 'center', marginTop: Spacing.four },
  leaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: Spacing.two + 2,
    marginBottom: Spacing.two,
  },
  leaderRank: { width: 20, textAlign: 'center' },
  leaderAvatar: { width: 36, height: 36, borderRadius: 10 },
  leaderAvatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leaderName: { flex: 1 },
});
