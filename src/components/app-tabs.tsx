import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

// 3 sekmeli navigasyon — Okuma/Kelime Bankası/Profil. Rozetler artık ayrı bir sekme
// değil, Profil'in içinde açılır/kapanır bir panel; Ayarlar da sekme
// değil, Profil'den push edilen bir stack ekranı (bkz. src/app/settings.tsx
// ve src/app/(tabs)/profile.tsx) — web'de zaten Reading-merkezli IA
// kararıyla (docs/DESIGN.md) hub sayfaları paneline dönüştürülmüştü,
// mobilde de aynı sadeleştirme uygulandı.
//
// Not: NativeTabs, expo-router'ın platformun kendi native tab bar'ını
// (iOS UITabBar / Android BottomNavigation) sarmalayan API'si — ikon
// render'ı platform tarafında yapıldığından buradaki Trigger.Icon'lara
// reanimated ile basma/aktiflik animasyonu eklenemiyor (bu yalnızca
// tamamen JS ile çizilen web sekme çubuğunda mümkün, bkz.
// app-tabs.web.tsx).
export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'light' ? 'light' : 'dark'];

  return (
    <NativeTabs
      backgroundColor={colors.bg}
      indicatorColor={colors.bgElevated}
      labelStyle={{ selected: { color: colors.accent } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Okuma</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'book', selected: 'book.fill' }}
          src={<NativeTabs.Trigger.VectorIcon family={MaterialCommunityIcons} name="book-open-variant" />}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="word-bank">
        <NativeTabs.Trigger.Label>Kelime Bankası</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'text.book.closed', selected: 'text.book.closed.fill' }}
          src={<NativeTabs.Trigger.VectorIcon family={MaterialCommunityIcons} name="book-alphabet" />}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>Profil</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }}
          src={<NativeTabs.Trigger.VectorIcon family={MaterialCommunityIcons} name="account-circle" />}
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
