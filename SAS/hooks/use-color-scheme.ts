import { useThemePreference } from '@/providers/ThemePreferenceProvider';

export const useColorScheme = () => {
	const { colorScheme } = useThemePreference();
	return colorScheme;
};

export const useColorSchemePreference = () => {
	return useThemePreference();
};
