import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProgressChart } from '@/components/progress-chart';
import { SpinWheelModal } from '@/components/spin-wheel-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import {
  getRecentDailyStats,
  getUserWords,
  getWheelState,
  subscribeToLeaderboard,
  subscribeToUserStats,
  type DailyStatEntry,
  type LeaderboardCategory,
  type LeaderboardEntry,
  type UserStats,
  type WheelState,
} from '@/lib/firestore';
import { useTheme } from '@/hooks/use-theme';

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
  const [wordCount, setWordCount] = useState(0);
  const [dailyStats, setDailyStats] = useState<DailyStatEntry[]>([]);
  const [leaderboardCategory, setLeaderboardCategory] = useState<LeaderboardCategory>('streak');
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);
  const [achievementsOpen, setAchievementsOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    return subscribeToUserStats(user.uid, setStats);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    getUserWords(user.uid)
      .then((words) => setWordCount(words.length))
      .catch(() => setWordCount(0));
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
  statsGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  statItem: { alignItems: 'center', gap: Spacing.half, flex: 1 },
  statValue: { fontWeight: '900' },
  error: { marginTop: Spacing.one },
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
