import { router } from 'expo-router';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { registerForPushNotifications } from '@/lib/notifications';
import { setDailyGoalMinutes } from '@/lib/firestore';
import { useTheme } from '@/hooks/use-theme';
import { LegalModal } from '@/components/legal-modal';

const appearanceLabel: Record<string, string> = {
  light: 'Açık',
  dark: 'Koyu',
  unspecified: 'Sistem',
};

// "Kendi Hedef Belirleme" — streak'ten bağımsız, kullanıcının kendi
// seçtiği günlük çalışma dakikası hedefi (bkz. firestore.ts
// UserProfile.dailyGoalMinutes). Sabit bir preset seti — serbest metin
// girişi yerine tek dokunuşla seçim, web'deki sade UX'e uygun.
const DAILY_GOAL_PRESETS = [15, 30, 45, 60];

// Ayarlar artık ayrı bir sekme değil, Profil'den (bkz. (tabs)/profile.tsx)
// açılan bir stack ekranı — gift.tsx/premium.tsx ile aynı model. Bildirim
// izni durumu (expo-notifications), görünüm bilgisi (sistem temasını takip
// eder), hesap özeti ve çıkış burada.
export default function SettingsScreen() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const { user, userProfile, isPremium, isAdmin, logout } = useAuth();
  const [notifStatus, setNotifStatus] = useState<Notifications.PermissionStatus | null>(null);
  const [notifBusy, setNotifBusy] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [goalBusy, setGoalBusy] = useState<number | null>(null);
  const dailyGoalMinutes = userProfile?.dailyGoalMinutes;
  const [legalVisible, setLegalVisible] = useState(false);
  const [legalTab, setLegalTab] = useState<'privacy' | 'terms' | 'kvkk'>('privacy');

  async function handleSelectGoal(minutes: number) {
    if (!user) return;
    setGoalBusy(minutes);
    try {
      await setDailyGoalMinutes(user.uid, minutes);
    } catch {
      setError('Hedef kaydedilemedi, tekrar deneyin.');
    } finally {
      setGoalBusy(null);
    }
  }

  const refreshNotifStatus = useCallback(() => {
    Notifications.getPermissionsAsync()
      .then((res) => setNotifStatus(res.status))
      .catch(() => setNotifStatus(null));
  }, []);

  useEffect(() => {
    refreshNotifStatus();
  }, [refreshNotifStatus]);

  async function handleEnableNotifications() {
    if (!user) return;
    setNotifBusy(true);
    try {
      await registerForPushNotifications(user.uid);
    } finally {
      refreshNotifStatus();
      setNotifBusy(false);
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

  const displayName = userProfile?.displayName || user?.displayName || user?.email?.split('@')[0] || 'Kullanıcı';
  const notifGranted = notifStatus === 'granted';
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <ThemedText type="smallBold" themeColor="accent">
              ‹ Geri
            </ThemedText>
          </Pressable>

          <ThemedText type="title" themeColor="accent" style={styles.brand}>
            ydtfocus
          </ThemedText>
          <ThemedText type="subtitle" style={styles.title}>
            Ayarlar
          </ThemedText>

          <ThemedText type="smallBold" themeColor="textMuted" style={styles.sectionTitle}>
            HESAP
          </ThemedText>
          <ThemedView type="bgCard" style={[styles.card, { borderColor: theme.border }]}>
            <ThemedText type="smallBold">{displayName}</ThemedText>
            <ThemedText themeColor="textMuted" type="small">
              {user?.email ?? '—'}
            </ThemedText>
            <ThemedText themeColor="accent" type="small" style={styles.roleLine}>
              {isPremium ? 'Premium Üye' : 'Ücretsiz Plan'}
              {isAdmin ? ' · Admin' : ''}
            </ThemedText>
          </ThemedView>

          <ThemedText type="smallBold" themeColor="textMuted" style={styles.sectionTitle}>
            BİLDİRİMLER
          </ThemedText>
          <ThemedView type="bgCard" style={[styles.card, { borderColor: theme.border }]}>
            <View style={styles.rowBetween}>
              <View style={styles.rowText}>
                <ThemedText type="smallBold">Hatırlatma Bildirimleri</ThemedText>
                <ThemedText themeColor="textMuted" type="small">
                  {notifGranted
                    ? 'Bildirimler açık — çalışma hatırlatmaları alacaksın.'
                    : 'Günlük çalışma hatırlatmaları için bildirimlere izin ver.'}
                </ThemedText>
              </View>
              {!notifGranted ? (
                <Pressable
                  onPress={handleEnableNotifications}
                  disabled={notifBusy}
                  style={({ pressed }) => [
                    styles.smallButton,
                    { borderColor: theme.accent, opacity: pressed || notifBusy ? 0.7 : 1 },
                  ]}
                >
                  <ThemedText type="smallBold" themeColor="accent">
                    {notifBusy ? 'Açılıyor…' : 'İzin Ver'}
                  </ThemedText>
                </Pressable>
              ) : (
                <View style={[styles.statusPill, { borderColor: theme.accent, backgroundColor: theme.bgElevated }]}>
                  <ThemedText type="small" themeColor="accent">
                    Açık
                  </ThemedText>
                </View>
              )}
            </View>
          </ThemedView>

          <ThemedText type="smallBold" themeColor="textMuted" style={styles.sectionTitle}>
            GÖRÜNÜM
          </ThemedText>
          <ThemedView type="bgCard" style={[styles.card, { borderColor: theme.border }]}>
            <View style={styles.rowBetween}>
              <View style={styles.rowText}>
                <ThemedText type="smallBold">Tema</ThemedText>
                <ThemedText themeColor="textMuted" type="small">
                  Cihaz ayarlarındaki temayı otomatik takip eder.
                </ThemedText>
              </View>
              <View style={[styles.statusPill, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
                <ThemedText type="small" themeColor="textMuted">
                  {appearanceLabel[scheme ?? 'unspecified'] ?? appearanceLabel.unspecified}
                </ThemedText>
              </View>
            </View>
          </ThemedView>

          <ThemedText type="smallBold" themeColor="textMuted" style={styles.sectionTitle}>
            GÜNLÜK HEDEF
          </ThemedText>
          <ThemedView type="bgCard" style={[styles.card, { borderColor: theme.border }]}>
            <ThemedText themeColor="textMuted" type="small">
              {dailyGoalMinutes
                ? `Her gün ${dailyGoalMinutes} dakika çalışmayı hedefliyorsun.`
                : 'Her gün ne kadar çalışmak istediğini seç, Profil\'de ilerlemeni takip et.'}
            </ThemedText>
            <View style={styles.chipRow}>
              {DAILY_GOAL_PRESETS.map((minutes) => {
                const selected = dailyGoalMinutes === minutes;
                return (
                  <Pressable
                    key={minutes}
                    onPress={() => handleSelectGoal(minutes)}
                    disabled={goalBusy !== null}
                    style={({ pressed }) => [
                      styles.goalChip,
                      {
                        borderColor: selected ? theme.accent : theme.border,
                        backgroundColor: selected ? theme.accent : theme.bgElevated,
                        opacity: pressed || (goalBusy !== null && goalBusy !== minutes) ? 0.7 : 1,
                      },
                    ]}
                  >
                    <ThemedText type="smallBold" themeColor={selected ? 'bg' : 'text'}>
                      {goalBusy === minutes ? '…' : `${minutes} dk`}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </ThemedView>

          <ThemedText type="smallBold" themeColor="textMuted" style={styles.sectionTitle}>
            HUKUKİ BELGELER
          </ThemedText>
          <ThemedView type="bgCard" style={[styles.card, { borderColor: theme.border }]}>
            <Pressable
              onPress={() => { setLegalTab('privacy'); setLegalVisible(true); }}
              style={styles.legalItem}
            >
              <ThemedText type="smallBold">Gizlilik Politikası</ThemedText>
              <MaterialCommunityIcons name="chevron-right" size={20} color={theme.textMuted} />
            </Pressable>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <Pressable
              onPress={() => { setLegalTab('terms'); setLegalVisible(true); }}
              style={styles.legalItem}
            >
              <ThemedText type="smallBold">Kullanım Koşulları</ThemedText>
              <MaterialCommunityIcons name="chevron-right" size={20} color={theme.textMuted} />
            </Pressable>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <Pressable
              onPress={() => { setLegalTab('kvkk'); setLegalVisible(true); }}
              style={styles.legalItem}
            >
              <ThemedText type="smallBold">KVKK Aydınlatma Metni</ThemedText>
              <MaterialCommunityIcons name="chevron-right" size={20} color={theme.textMuted} />
            </Pressable>
          </ThemedView>

          <ThemedText type="smallBold" themeColor="textMuted" style={styles.sectionTitle}>
            UYGULAMA
          </ThemedText>
          <ThemedView type="bgCard" style={[styles.card, { borderColor: theme.border }]}>
            <View style={styles.rowBetween}>
              <ThemedText type="smallBold">Sürüm</ThemedText>
              <ThemedText themeColor="textMuted" type="small">
                {appVersion}
              </ThemedText>
            </View>
          </ThemedView>

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

          <LegalModal
            key={legalVisible ? legalTab : 'closed'}
            visible={legalVisible}
            onClose={() => setLegalVisible(false)}
            initialTab={legalTab}
          />
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
  backButton: { alignSelf: 'flex-start', marginBottom: Spacing.three },
  brand: { fontSize: 22, fontWeight: '900' },
  title: { fontWeight: '800', marginBottom: Spacing.three },
  sectionTitle: { marginBottom: Spacing.two, marginTop: Spacing.two },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.half,
    marginBottom: Spacing.two,
  },
  roleLine: { fontWeight: '800', marginTop: Spacing.half },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  rowText: { flex: 1, gap: Spacing.half },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  goalChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
  },
  smallButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
  },
  statusPill: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
  },
  error: { marginTop: Spacing.one },
  logoutButton: {
    marginTop: Spacing.three,
    alignSelf: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  legalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two,
    width: '100%',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
    marginVertical: Spacing.one,
  },
});
