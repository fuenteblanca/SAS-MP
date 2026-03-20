import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export type ThemeColors = (typeof Colors.light) & { scheme: 'light' | 'dark' };

export function useThemeColors(): ThemeColors {
  const scheme = useColorScheme() ?? 'light';
  return { ...Colors[scheme], scheme } as ThemeColors;
}

export default useThemeColors;
