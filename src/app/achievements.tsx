import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import {
  getUserWords,
  subscribeToLeaderboard,
  subscribeToUserStats,
  type LeaderboardCategory,
  type LeaderboardEntry,
  type UserStats,
} from '@/lib/firestore';
import { useTheme } from '@/hooks/use-theme';

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

export default function AchievementsScreen() {
  const theme = useTheme();
  const { user, userProfile } = useAuth();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [wordCount, setWordCount] = useState(0);
  const [leaderboardCategory, setLeaderboardCategory] = useState<LeaderboardCategory>('streak');
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);

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
    setLeaderboardLoading(true);
    const unsubscribe = subscribeToLeaderboard(leaderboardCategory, 10, (entries) => {
      setLeaderboard(entries);
      setLeaderboardLoading(false);
    });
    return unsubscribe;
  }, [leaderboardCategory]);

  const totalMinutes = Number((userProfile?.publicStats as Record<string, unknown> | undefined)?.totalMinutes ?? 0);
  const ctx = {
    streak: stats?.streak ?? 0,
    wordCount,
    totalMinutes,
    dailyMinutes: stats?.dailyMinutes ?? 0,
  };
  const unlockedCount = BADGES.filter((b) => b.isUnlocked(ctx)).length;

  const categories = Array.from(new Set(BADGES.map((b) => b.category)));

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ThemedText type="title" themeColor="accent" style={styles.brand}>
            ydtfocus
          </ThemedText>
          <View style={styles.headerRow}>
            <ThemedText type="subtitle" style={styles.title}>
              Rozetler
            </ThemedText>
            <ThemedText type="smallBold" themeColor="accent">
              {unlockedCount}/{BADGES.length}
            </ThemedText>
          </View>

          {categories.map((category) => (
            <View key={category} style={styles.categorySection}>
              <ThemedText type="smallBold" themeColor="textMuted" style={styles.categoryTitle}>
                {category.toUpperCase()}
              </ThemedText>
              {BADGES.filter((b) => b.category === category).map((badge) => {
                const unlocked = badge.isUnlocked(ctx);
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
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.six,
  },
  brand: { fontSize: 22, fontWeight: '900' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.two,
    marginBottom: Spacing.three,
  },
  title: { fontWeight: '800' },
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
