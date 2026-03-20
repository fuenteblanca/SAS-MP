/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

const tintColorLight = '#F6B91E';
const tintColorDark = '#F6B91E';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#F3F5F9',
    card: '#FFFFFF',
    surface: '#FFFFFF',
    border: '#E5E7EB',
    muted: '#6B7280',
    secondaryText: '#374151',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
    primary: tintColorLight,
    onPrimary: '#1F2933',
    success: '#34C759',
    warning: '#F59E0B',
    danger: '#EF4444',
    overlay: 'rgba(15, 23, 42, 0.4)',
    accent: '#134074',
    inputBackground: '#FFFFFF',
    inputBorder: '#D1D5DB',
    placeholder: '#9CA3AF',
    cardShadow: 'rgba(15, 23, 42, 0.08)',
    ripple: 'rgba(246, 185, 30, 0.15)',
  },
  dark: {
    text: '#E7EDF9',
    background: '#050E20',
    card: '#0E1A33',
    surface: '#142139',
    border: '#1F2E4A',
    muted: '#93A7C6',
    secondaryText: '#C5D6F7',
    tint: tintColorDark,
    icon: '#B0C4DD',
    tabIconDefault: '#6F85A4',
    tabIconSelected: tintColorDark,
    primary: tintColorDark,
    onPrimary: '#0F172A',
    success: '#4ADE80',
    warning: '#FACC15',
    danger: '#F87171',
    overlay: 'rgba(0, 0, 0, 0.55)',
    accent: '#4F9BFF',
    inputBackground: '#0B172B',
    inputBorder: '#1F2E4A',
    placeholder: '#647A9C',
    cardShadow: 'rgba(2, 6, 23, 0.7)',
    ripple: 'rgba(246, 185, 30, 0.3)',
  },
};

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
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
