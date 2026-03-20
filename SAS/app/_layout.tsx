import UpdateModal from '@/components/UpdateModal';
import versionService, { VersionInfo } from '@/services/versionService';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import 'react-native-gesture-handler';
import 'react-native-reanimated';

import { ThemePreferenceProvider, useThemePreference } from '@/providers/ThemePreferenceProvider';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { colorScheme, isHydrated } = useThemePreference();
  const router = useRouter();
  const segments = useSegments();
  const [updateInfo, setUpdateInfo] = useState<VersionInfo | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);

  useEffect(() => {
    if (isHydrated) {
      const timer = setTimeout(() => {
        SplashScreen.hideAsync().catch(() => undefined);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [isHydrated]);

  // Check for app updates after hydration
  useEffect(() => {
    if (isHydrated) {
      checkAppVersion();
    }
  }, [isHydrated]);

  const checkAppVersion = async () => {
    try {
      const versionInfo = await versionService.checkForUpdate();
      
      if (versionInfo) {
        console.log('Update available:', versionInfo);
        setUpdateInfo(versionInfo);
        setShowUpdateModal(true);
        
        // If force update, clear user data immediately
        if (versionInfo.force_update) {
          await versionService.clearUserData();
        }
      }
    } catch (error) {
      console.error('Error checking app version:', error);
    }
  };

  const handleUpdate = async () => {
    if (updateInfo?.download_url) {
      await versionService.openDownloadUrl(updateInfo.download_url);
      
      // If force update, navigate to login after opening download
      if (updateInfo.force_update) {
        setShowUpdateModal(false);
        router.replace('/login');
      }
    }
  };

  const handleLater = () => {
    setShowUpdateModal(false);
  };

  if (!isHydrated) {
    return <View style={{ flex: 1 }} />;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      
      {updateInfo && (
        <UpdateModal
          visible={showUpdateModal}
          versionInfo={updateInfo}
          onUpdate={handleUpdate}
          onLater={updateInfo.force_update ? undefined : handleLater}
        />
      )}
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <ThemePreferenceProvider>
      <RootNavigator />
    </ThemePreferenceProvider>
  );
}
