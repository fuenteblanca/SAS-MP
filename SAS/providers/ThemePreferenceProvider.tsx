import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance, ColorSchemeName, useColorScheme as useRNColorScheme } from 'react-native';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedColorScheme = Exclude<ColorSchemeName, null | undefined>;

type ThemePreferenceContextValue = {
  colorScheme: ResolvedColorScheme;
  preference: ThemePreference;
  setPreference: (pref: ThemePreference) => Promise<void>;
  isHydrated: boolean;
};

const ThemePreferenceContext = createContext<ThemePreferenceContextValue | undefined>(undefined);

const STORAGE_KEY = 'display_mode_preference';

export const ThemePreferenceProvider = ({ children }: { children: React.ReactNode }) => {
  const systemColorScheme = useRNColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const hydrate = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
          setPreferenceState(stored);
        } else if (stored) {
          await AsyncStorage.removeItem(STORAGE_KEY);
        }
      } catch (error) {
        console.warn('Failed to load display mode preference', error);
      } finally {
        setIsHydrated(true);
      }
    };

    hydrate();
  }, []);

  const setPreference = async (pref: ThemePreference) => {
    try {
      setPreferenceState(pref);
      if (pref === 'system') {
        await AsyncStorage.removeItem(STORAGE_KEY);
      } else {
        await AsyncStorage.setItem(STORAGE_KEY, pref);
      }
    } catch (error) {
      console.warn('Failed to persist display mode preference', error);
    }
  };

  const colorScheme: ResolvedColorScheme = useMemo(() => {
    if (preference === 'system') {
      return (systemColorScheme ?? Appearance.getColorScheme() ?? 'light') as ResolvedColorScheme;
    }
    return preference;
  }, [preference, systemColorScheme]);

  const value = useMemo(
    () => ({ colorScheme, preference, setPreference, isHydrated }),
    [colorScheme, preference, isHydrated]
  );

  return (
    <ThemePreferenceContext.Provider value={value}>{children}</ThemePreferenceContext.Provider>
  );
};

export const useThemePreference = () => {
  const ctx = useContext(ThemePreferenceContext);
  if (!ctx) {
    throw new Error('useThemePreference must be used within a ThemePreferenceProvider');
  }
  return ctx;
};
