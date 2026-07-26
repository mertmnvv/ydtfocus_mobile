import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  TabTriggerSlotProps,
  TabListProps,
} from 'expo-router/ui';
import { Pressable, useColorScheme, View, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { ThemedText } from './themed-text';

import { Colors, MaxContentWidth, Spacing } from '@/constants/theme';

// Web build'i için tab bar — web'deki src/app/(app)/layout.js'teki
// app-topbar ile aynı görsel dil: tek, ince, yüzen pill; logo + 2 metin
// linki, ikon yok (bkz. web docs/DESIGN.md — "dekoratif ikon glyph yok").
// Rozetler ve Ayarlar artık ayrı sekme değil, Profil'in içindeki bir
// panel / oradan push edilen bir ekran (bkz. src/app/(tabs)/profile.tsx,
// src/app/settings.tsx).
export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="index" href="/index" asChild>
            <TabButton>Okuma</TabButton>
          </TabTrigger>
          <TabTrigger name="word-bank" href="/word-bank" asChild>
            <TabButton>Kelime Bankası</TabButton>
          </TabTrigger>
          <TabTrigger name="profile" href="/profile" asChild>
            <TabButton>Profil</TabButton>
          </TabTrigger>
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

// Basma/aktiflik durumunda hafif bir ölçek geçişi — projede zaten
// bağımlılık olarak bulunan react-native-reanimated ile (bkz.
// animated-icon.tsx'teki Keyframe kullanımı), yeni bir animasyon
// kütüphanesi eklenmeden. Abartılı olmasın diye küçük bir scale
// aralığı ve kısa süre tercih edildi.
export function TabButton({ children, isFocused, ...props }: TabTriggerSlotProps) {
  // Basma anındaki hafif küçülme, ayrı bir shared value ile — yalnızca
  // event handler'larda mutasyona uğrar, aktiflik geçişiyle karışmaz.
  const pressScale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: pressScale.value * withTiming(isFocused ? 1.04 : 1, { duration: 150 }) },
    ],
  }));

  return (
    <Pressable
      {...props}
      onPressIn={(e) => {
        pressScale.value = withTiming(0.94, { duration: 100 });
        props.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        pressScale.value = withTiming(1, { duration: 150 });
        props.onPressOut?.(e);
      }}
      style={({ pressed }) => pressed && styles.pressed}>
      <Animated.View style={animatedStyle}>
        <ThemedText
          type="smallBold"
          themeColor={isFocused ? 'accent' : 'textMuted'}
          style={styles.tabLabel}>
          {children}
        </ThemedText>
      </Animated.View>
    </Pressable>
  );
}

export function CustomTabList(props: TabListProps) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'light' ? 'light' : 'dark'];

  return (
    <View {...props} style={styles.tabListContainer}>
      <View style={[styles.innerContainer, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        <ThemedText type="smallBold" style={styles.brandText}>
          ydt<ThemedText type="smallBold" themeColor="accent">focus</ThemedText>
        </ThemedText>

        {props.children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabListContainer: {
    position: 'absolute',
    top: 14,
    width: '100%',
    padding: Spacing.three,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  innerContainer: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.four,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
    maxWidth: MaxContentWidth,
  },
  brandText: {
    marginRight: 'auto',
  },
  pressed: {
    opacity: 0.7,
  },
  tabLabel: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
  },
});
