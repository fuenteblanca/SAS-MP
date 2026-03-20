import { useThemeColors } from '@/hooks/use-theme';
import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

type ThemeShape = ReturnType<typeof useThemeColors>;

export default function RequestScreen() {
  const theme = useThemeColors();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons name="construct-outline" size={64} color={theme.primary} />
        </View>
        <Text style={styles.title}>Feature Coming Soon</Text>
        <Text style={styles.description}>
          Request features are temporarily disabled during the site-based update.
        </Text>
        <Text style={styles.message}>
          Please check back later for this functionality.
        </Text>
      </View>
    </View>
  );
}

const createStyles = (theme: ThemeShape) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 28,
    },
    content: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: 24,
    },
    iconContainer: {
      width: 100,
      height: 100,
      borderRadius: 50,
      backgroundColor: `${theme.primary}22`,
      justifyContent: 'center',
      alignItems: 'center',
    },
    title: {
      fontSize: 24,
      fontWeight: '700',
      fontFamily: 'Poppins',
      color: theme.text,
      letterSpacing: -0.5,
    },
    description: {
      fontSize: 16,
      color: theme.secondaryText,
      textAlign: 'center',
      fontFamily: 'Poppins',
      lineHeight: 24,
    },
    message: {
      fontSize: 14,
      color: theme.muted,
      textAlign: 'center',
      fontFamily: 'Poppins',
      fontStyle: 'italic',
    },
  });
