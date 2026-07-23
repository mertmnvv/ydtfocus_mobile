import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SpinWheelModal } from '@/components/spin-wheel-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { getWheelState, subscribeToUserStats, type UserStats, type WheelState } from '@/lib/firestore';
import { useTheme } from '@/hooks/use-theme';

const emptyWheelState: WheelState = { lastFreeSpinWeek: 0, lastAdSpinWeek: 0, adSpinsUsedThisWeek: 0 };

const roleLabel: Record<string, string> = {
  free: 'Ücretsiz Plan',
  premium: 'Premium Üye',
  admin: 'Yönetici',
};

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

  useEffect(() => {
    if (!user) return;
    return subscribeToUserStats(user.uid, setStats);
  }, [user]);

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
        <ThemedText type="title" themeColor="accent" style={styles.brand}>
          ydtfocus
        </ThemedText>
        <ThemedText type="subtitle" style={styles.title}>
          Profil
        </ThemedText>

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

        <View style={styles.actionRow}>
          <Pressable
            onPress={() => setWheelOpen(true)}
            style={[styles.actionCard, { borderColor: theme.border, backgroundColor: theme.bgCard }]}
          >
            <ThemedText type="smallBold" themeColor="accent">
              🎡 Çark Çevir
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
              🎁 Arkadaşına Hediye Et
            </ThemedText>
            <ThemedText themeColor="textMuted" type="small">
              Premium hediye et veya kod kullan
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => router.push('/review')}
            style={[styles.actionCard, { borderColor: theme.border, backgroundColor: theme.bgCard }]}
          >
            <ThemedText type="smallBold" themeColor="accent">
              🔁 Akıllı Tekrar
            </ThemedText>
            <ThemedText themeColor="textMuted" type="small">
              Zamanı gelen kelimeleri tekrar et
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => router.push('/mistakes')}
            style={[styles.actionCard, { borderColor: theme.border, backgroundColor: theme.bgCard }]}
          >
            <ThemedText type="smallBold" themeColor="accent">
              ❌ Hatalarım
            </ThemedText>
            <ThemedText themeColor="textMuted" type="small">
              Yanlış kelimeleri gözden geçir
            </ThemedText>
          </Pressable>
        </View>

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
  brand: { fontSize: 22, fontWeight: '900' },
  title: { fontWeight: '800', marginBottom: Spacing.two },
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
});
