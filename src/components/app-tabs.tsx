import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

// 2 sekmeli navigasyon — Okuma/Profil. Rozetler artık ayrı bir sekme
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
          src={require('@/assets/images/tabIcons/home.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>Profil</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/explore.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
