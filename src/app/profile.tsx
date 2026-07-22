import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';

// Profil — web'deki /profile ile aynı 3. sekme. Firebase Auth'tan gelen
// kullanıcı bilgisi (displayName/email) ve çıkış aksiyonu burada.
// Firestore profil verisi (role, premium vb.) kapsam dışı — bkz. TODO.md.
export default function ProfileScreen() {
  const theme = useTheme();
  const { user, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayName = user?.displayName || user?.email?.split('@')[0] || 'Kullanıcı';

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
        <ThemedText type="title" themeColor="accent" style={styles.brand}>
          ydtfocus
        </ThemedText>
        <ThemedText type="subtitle" style={styles.title}>
          Profil
        </ThemedText>

        <ThemedView type="bgCard" style={[styles.card, { borderColor: theme.border }]}>
          <ThemedText type="smallBold" themeColor="textMuted">
            Ad
          </ThemedText>
          <ThemedText style={styles.value}>{displayName}</ThemedText>

          <ThemedText type="smallBold" themeColor="textMuted" style={styles.emailLabel}>
            E-posta
          </ThemedText>
          <ThemedText style={styles.value}>{user?.email ?? '—'}</ThemedText>
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
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
  },
  brand: {
    fontSize: 22,
    fontWeight: '900',
    marginBottom: Spacing.four,
  },
  title: { fontWeight: '800', marginBottom: Spacing.three },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  emailLabel: { marginTop: Spacing.two },
  value: { fontWeight: '600' },
  error: { marginTop: Spacing.two },
  logoutButton: {
    marginTop: Spacing.four,
    alignSelf: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
});
