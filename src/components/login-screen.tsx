import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/context/auth-context';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Mode = 'login' | 'register';

function firebaseErrorToTurkish(code: string | undefined) {
  switch (code) {
    case 'auth/invalid-email':
      return 'Geçersiz e-posta adresi.';
    case 'auth/user-not-found':
      return 'Bu e-posta ile kayıtlı bir kullanıcı bulunamadı.';
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'E-posta veya şifre hatalı.';
    case 'auth/email-already-in-use':
      return 'Bu e-posta zaten kayıtlı.';
    case 'auth/weak-password':
      return 'Şifre çok zayıf, en az 6 karakter olmalı.';
    case 'auth/missing-password':
      return 'Lütfen şifrenizi girin.';
    case 'auth/too-many-requests':
      return 'Çok fazla deneme yapıldı, lütfen daha sonra tekrar deneyin.';
    case 'auth/network-request-failed':
      return 'Ağ bağlantısı hatası, internetinizi kontrol edin.';
    default:
      return 'Bir hata oluştu, lütfen tekrar deneyin.';
  }
}

export function LoginScreen() {
  const theme = useTheme();
  const { login, register, loginWithGoogle } = useAuth();

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRegister = mode === 'register';

  async function handleSubmit() {
    setError(null);
    setLoading(true);
    try {
      if (isRegister) {
        await register(email.trim(), password, displayName.trim());
      } else {
        await login(email.trim(), password);
      }
    } catch (err) {
      const code = (err as { code?: string })?.code;
      setError(firebaseErrorToTurkish(code));
    } finally {
      setLoading(false);
    }
  }

  function toggleMode() {
    setError(null);
    setMode((prev) => (prev === 'login' ? 'register' : 'login'));
  }

  async function handleGoogleLogin() {
    setError(null);
    setGoogleLoading(true);
    try {
      await loginWithGoogle();
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code !== 'SIGN_IN_CANCELLED' && code !== '12501') {
        setError(firebaseErrorToTurkish(code));
      }
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.keyboardAvoiding}
          behavior={Platform.select({ ios: 'padding', android: undefined })}
        >
          <ThemedText type="title" themeColor="accent" style={styles.brand}>
            ydtfocus
          </ThemedText>
          <ThemedText type="subtitle" style={styles.title}>
            {isRegister ? 'Kayıt Ol' : 'Giriş Yap'}
          </ThemedText>

          <ThemedView type="bgCard" style={[styles.card, { borderColor: theme.border }]}>
            {isRegister && (
              <TextInput
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Ad Soyad"
                placeholderTextColor={theme.textMuted}
                autoCapitalize="words"
                style={[
                  styles.input,
                  { backgroundColor: theme.bgElevated, color: theme.text, borderColor: theme.border },
                ]}
              />
            )}
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="E-posta"
              placeholderTextColor={theme.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              style={[
                styles.input,
                { backgroundColor: theme.bgElevated, color: theme.text, borderColor: theme.border },
              ]}
            />
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Şifre"
              placeholderTextColor={theme.textMuted}
              secureTextEntry
              style={[
                styles.input,
                { backgroundColor: theme.bgElevated, color: theme.text, borderColor: theme.border },
              ]}
            />

            {error && (
              <ThemedText themeColor="error" type="small" style={styles.error}>
                {error}
              </ThemedText>
            )}

            <Pressable
              onPress={handleSubmit}
              disabled={loading}
              style={[styles.submitButton, { backgroundColor: theme.accent, opacity: loading ? 0.7 : 1 }]}
            >
              {loading ? (
                <ActivityIndicator color={theme.bg} />
              ) : (
                <ThemedText type="smallBold" themeColor="bg">
                  {isRegister ? 'Kayıt Ol' : 'Giriş Yap'}
                </ThemedText>
              )}
            </Pressable>
          </ThemedView>

          <ThemedView style={styles.dividerRow}>
            <ThemedView style={[styles.dividerLine, { backgroundColor: theme.border }]} />
            <ThemedText themeColor="textMuted" type="small">
              veya
            </ThemedText>
            <ThemedView style={[styles.dividerLine, { backgroundColor: theme.border }]} />
          </ThemedView>

          <Pressable
            onPress={handleGoogleLogin}
            disabled={googleLoading}
            style={[
              styles.googleButton,
              { borderColor: theme.border, backgroundColor: theme.bgCard, opacity: googleLoading ? 0.7 : 1 },
            ]}
          >
            {googleLoading ? (
              <ActivityIndicator color={theme.text} />
            ) : (
              <ThemedText type="smallBold">Google ile devam et</ThemedText>
            )}
          </Pressable>

          <Pressable onPress={toggleMode} style={styles.toggle}>
            <ThemedText themeColor="textMuted" type="small">
              {isRegister ? 'Zaten hesabın var mı? ' : 'Hesabın yok mu? '}
              <ThemedText themeColor="accent" type="smallBold">
                {isRegister ? 'Giriş yap' : 'Kayıt ol'}
              </ThemedText>
            </ThemedText>
          </Pressable>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  keyboardAvoiding: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  brand: {
    fontSize: 22,
    fontWeight: '900',
    marginBottom: Spacing.two,
  },
  title: {
    fontWeight: '800',
    marginBottom: Spacing.two,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  error: {
    marginTop: Spacing.one,
  },
  submitButton: {
    marginTop: Spacing.one,
    borderRadius: 10,
    paddingVertical: Spacing.two + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggle: {
    alignItems: 'center',
    marginTop: Spacing.three,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  googleButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingVertical: Spacing.two + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
