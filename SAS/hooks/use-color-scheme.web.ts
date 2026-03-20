import { useEffect, useState } from 'react';
import { Appearance } from 'react-native';

import { useThemePreference } from '@/providers/ThemePreferenceProvider';

/**
 * To support static rendering, ensure hydration before using the resolved preference on web.
 */
export const useColorScheme = () => {
  const [hydrated, setHydrated] = useState(false);
  const { colorScheme, isHydrated } = useThemePreference();

  useEffect(() => {
    setHydrated(true);
  }, []);

  if (hydrated && isHydrated) {
    return colorScheme;
  }

  return Appearance.getColorScheme() ?? 'light';
};

export const useColorSchemePreference = () => {
  return useThemePreference();
};
