/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

// YDT Focus tasarım tokenleri — web'deki src/styles/globals.css :root ve
// [data-theme='light'] blokları ile birebir eşleşir. Yeni renk icat
// etme; web'de değişirse burayı da güncelle.
export const Colors = {
  dark: {
    bg: '#0b0b0c',
    bgCard: '#161618',
    bgElevated: '#1e1e20',
    border: 'rgba(255, 255, 255, 0.08)',
    text: '#d1d0c5',
    textMuted: '#86868b',
    primary: '#0a84ff',
    accent: '#e2b714',
    archive: '#5e5ce6',
    error: '#ff453a',
    warning: '#ff9f0a',
    glass: 'rgba(255, 255, 255, 0.05)',
    // Geriye dönük uyumluluk (Expo şablonunun beklediği alan adları)
    background: '#0b0b0c',
    backgroundElement: '#161618',
    backgroundSelected: '#1e1e20',
    textSecondary: '#86868b',
  },
  light: {
    bg: '#f5f7fa',
    bgCard: '#ffffff',
    bgElevated: '#f0f2f5',
    border: 'rgba(0, 0, 0, 0.08)',
    text: '#1d1d1f',
    textMuted: '#6e6e73',
    primary: '#0071e3',
    accent: '#e2b714',
    archive: '#5e5ce6',
    error: '#d70015',
    warning: '#ff9500',
    glass: 'rgba(0, 0, 0, 0.04)',
    background: '#f5f7fa',
    backgroundElement: '#ffffff',
    backgroundSelected: '#f0f2f5',
    textSecondary: '#6e6e73',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
