import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

// 3 sekmeli navigasyon — web'deki src/app/(app)/layout.js'teki
// DESTINATIONS (Okuma/Rozetler/Profil) ile birebir aynı 3 hedef.
// Web'de Kütüphane hub'ı kalktı, Quiz/Kartlar/Gramer/Hatalarım/Tekrar/
// Sözlük artık Reading'den açılan panellerdir (bkz. web docs/DESIGN.md,
// "Reading-merkezli IA") — mobilde de aynı model TODO.md'de planlanıyor.
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

      <NativeTabs.Trigger name="achievements">
        <NativeTabs.Trigger.Label>Rozetler</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/explore.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>Profil</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/home.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
