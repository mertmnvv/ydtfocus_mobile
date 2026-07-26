import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { LoginScreen } from '@/components/login-screen';
import { AuthProvider, useAuth } from '@/context/auth-context';

SplashScreen.preventAutoHideAsync();

// (tabs)/ grubu Okuma/Rozetler/Profil'i (NativeTabs) barındırıyor; buradaki
// Stack, review/mistakes/flashcards/grammar/dictionary/gift/premium gibi
// sekme-dışı ekranların (tabs) üzerine push edilebilmesini sağlıyor —
// NativeTabs kendi başına sadece Trigger'la tanımlı rotaları render eder,
// tek başına kök layout olarak kullanılırsa router.push başka rotalara
// gidemez (sessizce hiçbir şey olmaz).
function RootNavigator() {
  const { user, userProfile, loading } = useAuth();

  if (loading) return null;

  if (!user) return <LoginScreen />;

  // Kullanıcı henüz zorunlu CEFR seviye tespit sınavına girmemişse (yeni
  // kayıt VEYA eski kullanıcıda level alanı hiç yoksa, kasıtlı — bkz.
  // AGENTS.md/PROJECT_STATUS.md ve firestore.ts UserProfile.level notu)
  // (tabs) hiç mount edilmez, kullanıcı fiziksel olarak oraya gidemez.
  // userProfile null iken (ilk snapshot henüz gelmediyse) de aynı ekranda
  // bekletiyoruz — kısa süreli, onSnapshot canlı olduğu için sınav
  // bitince (setUserLevel) otomatik olarak (tabs)'a geçilir.
  if (!userProfile?.level) {
    return (
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="level-test" />
      </Stack>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </ThemeProvider>
  );
}
