import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

const API_BASE_URL = 'https://api.rds.ismis.com.ph/api';

export interface VersionInfo {
  version: string;
  force_update: boolean;
  download_url: string;
  release_notes: string;
}

/**
 * Fetches the latest app version information from the API
 */
export async function fetchAppVersion(): Promise<VersionInfo | null> {
  try {
    const platform = Platform.OS === 'ios' ? 'ios' : 'android';
    const response = await fetch(
      `${API_BASE_URL}/app-version?platform=${platform}`
    );

    console.log('Version API status:', response.status);
    
    if (response.status === 200) {
      const data = await response.json();
      console.log('Version API response:', data);
      return data;
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching app version:', error);
    return null;
  }
}

/**
 * Gets the current app version from the native app
 */
export async function getCurrentVersion(): Promise<string> {
  try {
    // Use expo-constants to get version from app.json
    // This works in both Expo Go and standalone builds
    const version = Constants.expoConfig?.version || Constants.manifest2?.extra?.expoClient?.version;
    return version || '1.0.0';
  } catch (error) {
    console.error('Error getting current version:', error);
    return '1.0.0';
  }
}

/**
 * Compares two version strings (e.g., "1.2.3" vs "1.2.4")
 * Returns: -1 if v1 < v2, 0 if v1 === v2, 1 if v1 > v2
 */
export function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const num1 = parts1[i] || 0;
    const num2 = parts2[i] || 0;
    
    if (num1 < num2) return -1;
    if (num1 > num2) return 1;
  }
  
  return 0;
}

/**
 * Opens the download URL in the default browser
 */
export async function openDownloadUrl(url: string): Promise<void> {
  try {
    const supported = await Linking.canOpenURL(url);
    
    if (supported) {
      await Linking.openURL(url);
    } else {
      console.error('Cannot open URL:', url);
    }
  } catch (error) {
    console.error('Error opening download URL:', error);
  }
}

/**
 * Clears all user data (for force updates)
 */
export async function clearUserData(): Promise<void> {
  try {
    await AsyncStorage.clear();
    console.log('User data cleared for force update');
  } catch (error) {
    console.error('Error clearing user data:', error);
  }
}

/**
 * Checks if an update is needed
 * Returns null if no update needed, or the VersionInfo if update is available
 */
export async function checkForUpdate(): Promise<VersionInfo | null> {
  try {
    const [currentVersion, versionInfo] = await Promise.all([
      getCurrentVersion(),
      fetchAppVersion()
    ]);

    if (!versionInfo) {
      return null;
    }

    const latestVersion = versionInfo.version;
    
    // Compare versions: if current < latest, update is needed
    if (compareVersions(currentVersion, latestVersion) < 0) {
      return versionInfo;
    }

    return null;
  } catch (error) {
    console.error('Error checking for update:', error);
    return null;
  }
}

export default {
  fetchAppVersion,
  getCurrentVersion,
  compareVersions,
  openDownloadUrl,
  clearUserData,
  checkForUpdate
};
