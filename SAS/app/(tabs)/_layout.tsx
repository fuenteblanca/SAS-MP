import authService from '@/services/authService';
import { formatDate, formatTime, getInternetDateTime } from '@/services/timeService';
import * as Location from 'expo-location';
import { Tabs, usePathname, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { useColorScheme } from '@/hooks/use-color-scheme';
import notificationService from '@/services/notificationService';
import shiftReminderService from '@/services/shiftReminderService';
import siteService, { Site } from '@/services/siteService';
import storageService from '@/services/storageService';
import attendanceService from '@/services/attendanceService';
import * as Notifications from 'expo-notifications';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

// Safe wrapper to get a precise location fix while avoiding the SDK 54 cast crash.
// Strategy: prefer a high-accuracy watch and wait up to ~15s for a good fix (<= 50m accuracy),
// then fall back to last-known and finally to getCurrentPositionAsync with safe args.
async function getCurrentLocationSafe(): Promise<Location.LocationObject> {
  // Preferred: high-accuracy watch aiming for <= 50m accuracy within 15 seconds
  try {
    const precise = await new Promise<Location.LocationObject>((resolve, reject) => {
      let subscription: Location.LocationSubscription | null = null;
      let bestPos: Location.LocationObject | null = null;
      const TARGET_ACCURACY_M = 50; // meters
      const timeout = setTimeout(() => {
        subscription?.remove();
        if (bestPos) {
          resolve(bestPos);
        } else {
          reject(new Error('Timed out acquiring precise location'));
        }
      }, 15000);

      Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Highest,
          distanceInterval: 0,
          timeInterval: 1000,
          mayShowUserSettingsDialog: true,
        } as any,
        (pos) => {
          if (!pos?.coords) return;
          // Track best reading seen so far
          bestPos = pos;
          const acc = pos.coords.accuracy ?? Number.MAX_SAFE_INTEGER;
          if (acc <= TARGET_ACCURACY_M) {
            clearTimeout(timeout);
            subscription?.remove();
            resolve(pos);
          }
        }
      )
        .then((sub) => {
          subscription = sub;
        })
        .catch((err) => {
          clearTimeout(timeout);
          reject(err);
        });
    });
    if (precise) return precise;
  } catch {}

  // Next: last known position (fast, may be coarse)
  try {
    const last = await Location.getLastKnownPositionAsync();
    if (last) return last;
  } catch {}

  // Fallbacks to current position; avoid passing arbitrary options to dodge cast crash
  try {
    return await (Location as any).getCurrentPositionAsync(null);
  } catch {}
  try {
    return await Location.getCurrentPositionAsync();
  } catch {}

  throw new Error('Unable to acquire location');
}

const CustomTabBarBackground = () => {
  return (
    <View style={styles.tabBarBackground}>
      <Svg
        width="100%"
        height="90"
        viewBox="0 0 375 90"
        preserveAspectRatio="none"
        style={StyleSheet.absoluteFill}
      >
        <Path
          d="M 0,22 
             Q 0,0 30,0 
             L 110,0 
            Q 140,0 154,28
            Q 164,50 187.5,50
            Q 211,50 221,28
            Q 235,0 265,0
             L 355,0 
             Q 375,0 375,20 
             L 375,90 
             L 0,90 
             Z"
          fill="#555555ff"
        />
      </Svg>
    </View>
  );
};

export default function TabLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const bottomInset = insets.bottom || 0;
  const [showButtons, setShowButtons] = useState(false);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [currentSite, setCurrentSite] = useState<Site | null>(null);
  const [isTimeInLoading, setIsTimeInLoading] = useState(false);
  const [isTimeOutLoading, setIsTimeOutLoading] = useState(false);

  // Initialize notifications and site context on mount
  useEffect(() => {
    const init = async () => {
      try {
        // Ensure site context is loaded from storage
        await storageService.migrateBranchToSite();
        const siteCtx = await siteService.getCurrentSite();
        if (siteCtx) {
          const site = await siteService.getById(siteCtx.siteId);
          if (site) {
            await siteService.setCurrentSite(site);
            setCurrentSite(site);
          }
        }

        // Initialize notifications
        await notificationService.init();
      } catch (error) {
        console.error('[TabLayout] Initialization error:', error);
      }
    };
    init();
  }, []);

  // Initialize and manage shift reminders based on site context
  useEffect(() => {
    const setupReminders = async () => {
      try {
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        const pref = await AsyncStorage.getItem('notifications_enabled');

        let granted = false;
        const existing = await Notifications.getPermissionsAsync();
        if (existing.status === 'granted') {
          granted = true;
        } else if (pref !== 'false') {
          const requested = await Notifications.requestPermissionsAsync();
          granted = requested.status === 'granted';
        }

        await AsyncStorage.setItem('notifications_enabled', granted ? 'true' : 'false');

        if (!granted) {
          await shiftReminderService.cancelAllReminders(true);
          return;
        }

        // Register push token if available
        const token = await notificationService.registerForPushNotificationsAsync();
        if (token) {
          // Register with backend if needed
        }

        // Refresh reminders based on current site
        await shiftReminderService.refreshScheduledReminders();
      } catch (e) {
        console.warn('[TabLayout] Reminder setup failed:', e);
      }
    };
    setupReminders();
  }, [currentSite]);

  /**
   * Auto-resolve current site from user location
   * Geofence-based: transparent to user, no modals or selection
   * Errors are logged but don't block attendance actions
   */
  const autoResolveSiteFromGeofence = async (): Promise<Site | null> => {
    try {
      console.log('[AutoSiteResolution] Starting geofence-based site resolution');

      // Get location permission
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        throw new Error('Location permission denied');
      }

      // Get location with fallbacks
      let location: Location.LocationObject | null = null;
      const attempts = 2;
      for (let i = 0; i < attempts; i++) {
        try {
          location = await getCurrentLocationSafe();
          break;
        } catch (err) {
          console.warn(`[AutoSiteResolution] Attempt ${i + 1} failed:`, err);
          if (i < attempts - 1) await new Promise((r) => setTimeout(r, 800));
        }
      }

      if (!location) {
        throw new Error('Failed to acquire location');
      }

      const userLat = location.coords.latitude;
      const userLon = location.coords.longitude;
      const gpsAccuracy = location.coords.accuracy ?? 0;

      console.log(`[AutoSiteResolution] User location: ${userLat}, ${userLon}`);

      // Get user company ID and fetch nearby sites
      const user = await authService.getUserData();
      if (!user?.user_company_id) {
        throw new Error('No company ID in user context');
      }

      const sites = await siteService.getNearby(userLat, userLon, Number(user.user_company_id));
      console.log(`[AutoSiteResolution] Found ${sites.length} nearby sites; gpsAccuracy=${gpsAccuracy.toFixed(1)}m`);
      sites.forEach((s) => {
        const d = siteService.calculateDistance(userLat, userLon, s.latitude, s.longitude);
        console.log(`[AutoSiteResolution]  site id=${s.id} name="${s.name}" lat=${s.latitude} lon=${s.longitude} radius=${s.radius}m distance=${d.toFixed(1)}m`);
      });

      // Find nearest valid site (within geofence)
      let nearestSite = await siteService.findNearestValidSite(userLat, userLon, sites, gpsAccuracy);

      // Fallback: GPS drift or inaccurate DB coordinates can push user outside the radius.
      // Use the absolute nearest site with no distance cap as last resort.
      if (!nearestSite && sites.length > 0) {
        const fallback = siteService.findNearestSite(userLat, userLon, sites);
        if (fallback) {
          const dist = siteService.calculateDistance(userLat, userLon, fallback.latitude, fallback.longitude);
          console.warn(`[AutoSiteResolution] Outside strict geofence; using nearest site fallback: id=${fallback.id} name="${fallback.name}" dist=${dist.toFixed(1)}m`);
          nearestSite = fallback;
        }
      }

      if (!nearestSite) {
        throw new Error('No sites within geofence radius');
      }

      // Save to context
      await siteService.setCurrentSite(nearestSite);
      setCurrentSite(nearestSite);

      console.log(`[AutoSiteResolution] Resolved site: ${nearestSite.id} (${nearestSite.name})`);
      return nearestSite;
    } catch (error: any) {
      console.error('[AutoSiteResolution] Error:', error);
      return null;
    }
  };

  const handleFabPress = () => {
    const newState = !showButtons;
    setShowButtons(newState);
    
    if (newState) {
      Animated.spring(fadeAnim, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  };

  // Manual retry to acquire a more precise fix and refresh nearby branches
  /**
   * Handle time-in action with auto-site resolution
   * No longer requires manual branch or guard type selection
   */
  const onTimeIn = async () => {
    if (isTimeInLoading) return;
    setIsTimeInLoading(true);

    try {
      // Always refresh site from geofence to avoid stale startup context
      let site = await autoResolveSiteFromGeofence();
      if (!site && currentSite) {
        console.log('[TimeIn] Geofence resolve failed; using last known current site');
        site = currentSite;
      }

      if (!site) {
        Alert.alert(
          'Error',
          'You are not within any authorized geofence area. Please move closer to your assigned site and try again.'
        );
        return;
      }

      // Call new simplified time-in flow
      await performTimeIn(site);
    } catch (error: any) {
      console.error('[TimeIn] Error:', error);
      Alert.alert('Error', error.message || 'Failed to record Time In. Please try again.');
    } finally {
      setIsTimeInLoading(false);
    }
  };

  /**
   * Perform time-in to the auto-resolved site
   * Simplified: site-based, no guard type requirement
   */
  const performTimeIn = async (site: Site) => {
    try {
      // Refresh full site record to ensure all required API fields are present
      const fullSite = await siteService.getById(site.id);
      const submitSite: Site = {
        ...site,
        ...(fullSite || {}),
      };

      // Get user data
      const userData = await authService.getUserData();
      if (!userData?.access_token || !userData?.employee_id || !userData?.user_company_id) {
        throw new Error('User authentication data not found. Please login again.');
      }

      // Verify location permission
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        throw new Error('Location permission is required for attendance.');
      }

      // Get current location
      const location = await getCurrentLocationSafe();
      const userLat = location.coords.latitude;
      const userLon = location.coords.longitude;
      const gpsAccuracy = location.coords.accuracy ?? 0;

      // Log distance for diagnostics (geofence was already validated in autoResolveSiteFromGeofence)
      const distance = siteService.calculateDistance(userLat, userLon, submitSite.latitude, submitSite.longitude);
      console.log(`[TimeIn] site=${submitSite.id} distance=${distance.toFixed(1)}m radius=${submitSite.radius}m accuracy=${gpsAccuracy.toFixed(1)}m`);

      // Get internet time
      let dateTime: Date;
      try {
        dateTime = await getInternetDateTime();
      } catch (e: any) {
        if (e.message?.includes('TimeoutException') || e.message?.includes('timeout')) {
          throw new Error('Could not sync with internet time. Please check your connection.');
        } else if (e.message?.includes('SocketException')) {
          throw new Error('No internet connection. Please check your network.');
        }
        throw new Error('Internet connection required for time synchronization.');
      }

      const currentTime = formatTime(dateTime);
      const currentDate = formatDate(dateTime);

      // Post attendance using site-first service
      const timestamp = dateTime.toISOString();
      const result = await attendanceService.postAttendanceWithSiteFallback({
        siteId: submitSite.id,
        action: 'time_in',
        timestamp,
        employeeId: Number(userData.employee_id),
        companyId: Number(userData.user_company_id),
        guardName: userData.userName || undefined,
        shiftIn: submitSite.shiftIn,
        shiftOut: submitSite.shiftOut,
        shift: submitSite.shift,
        siteLat: submitSite.latitude,
        siteLong: submitSite.longitude,
        latitude: userLat,
        longitude: userLon,
        provinceId: submitSite.provinceId,
        clientId: submitSite.clientId,
        lguId: submitSite.lguId,
        areaId: submitSite.areaId ?? (userData.user_area_id ? Number(userData.user_area_id) : undefined),
      });

      if (!result.success) {
        const details =
          (typeof result.data === 'string' ? result.data : result.data?.message || result.data?.error) ||
          result.error ||
          'Please try again.';
        throw new Error(`Failed to submit time-in. ${details}`);
      }

      Alert.alert('Success', 'Time In recorded successfully!');

      // Cache the time-in for immediate UI update
      try {
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        await AsyncStorage.setItem('last_time_in', currentTime);
        await AsyncStorage.setItem('last_time_in_date', currentDate);
      } catch (e) {
        console.warn('[TimeIn] Failed to cache time:', e);
      }

      // Notify reminders service
      try {
        await shiftReminderService.onTimeInRecorded();
      } catch (err) {
        console.warn('[TimeIn] Reminder update failed:', err);
      }

      // Refresh home screen
      router.replace('/(tabs)');
    } catch (error: any) {
      throw error;
    }
  };

  /**
   * Handle time-out action with auto-site resolution
   * No longer requires manual branch or guard type selection
   */
  const onTimeOut = async () => {
    if (isTimeOutLoading) return;
    setIsTimeOutLoading(true);

    try {
      // Always refresh site from geofence to avoid stale startup context
      let site = await autoResolveSiteFromGeofence();
      if (!site && currentSite) {
        console.log('[TimeOut] Geofence resolve failed; using last known current site');
        site = currentSite;
      }

      if (!site) {
        Alert.alert(
          'Error',
          'You are not within any authorized geofence area. Please move closer to your assigned site and try again.'
        );
        return;
      }

      // Call new simplified time-out flow
      await performTimeOut(site);
    } catch (error: any) {
      console.error('[TimeOut] Error:', error);
      Alert.alert('Error', error.message || 'Failed to record Time Out. Please try again.');
    } finally {
      setIsTimeOutLoading(false);
    }
  };

  /**
   * Perform time-out to the auto-resolved site
   * Simplified: site-based, no guard type requirement, no shift window validation
   */
  const performTimeOut = async (site: Site) => {
    try {
      // Refresh full site record to ensure all required API fields are present
      const fullSite = await siteService.getById(site.id);
      const submitSite: Site = {
        ...site,
        ...(fullSite || {}),
      };

      // Get user data
      const userData = await authService.getUserData();
      if (!userData?.access_token || !userData?.employee_id || !userData?.user_company_id) {
        throw new Error('User authentication data not found. Please login again.');
      }

      // Verify location permission
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        throw new Error('Location permission is required for attendance.');
      }

      // Get current location
      const location = await getCurrentLocationSafe();
      const userLat = location.coords.latitude;
      const userLon = location.coords.longitude;
      const gpsAccuracy = location.coords.accuracy ?? 0;

      // Log distance for diagnostics (geofence was already validated in autoResolveSiteFromGeofence)
      const distance = siteService.calculateDistance(userLat, userLon, submitSite.latitude, submitSite.longitude);
      console.log(`[TimeOut] site=${submitSite.id} distance=${distance.toFixed(1)}m radius=${submitSite.radius}m accuracy=${gpsAccuracy.toFixed(1)}m`);

      // Get internet time
      let dateTime: Date;
      try {
        dateTime = await getInternetDateTime();
      } catch (e: any) {
        if (e.message?.includes('TimeoutException') || e.message?.includes('timeout')) {
          throw new Error('Could not sync with internet time. Please check your connection.');
        } else if (e.message?.includes('SocketException')) {
          throw new Error('No internet connection. Please check your network.');
        }
        throw new Error('Internet connection required for time synchronization.');
      }

      const currentTime = formatTime(dateTime);
      const currentDate = formatDate(dateTime);

      // Post attendance using site-first service
      const timestamp = dateTime.toISOString();
      const result = await attendanceService.postAttendanceWithSiteFallback({
        siteId: submitSite.id,
        action: 'time_out',
        timestamp,
        employeeId: Number(userData.employee_id),
        companyId: Number(userData.user_company_id),
        guardName: userData.userName || undefined,
        shiftIn: submitSite.shiftIn,
        shiftOut: submitSite.shiftOut,
        shift: submitSite.shift,
        siteLat: submitSite.latitude,
        siteLong: submitSite.longitude,
        latitude: userLat,
        longitude: userLon,
        provinceId: submitSite.provinceId,
        clientId: submitSite.clientId,
        lguId: submitSite.lguId,
        areaId: submitSite.areaId ?? (userData.user_area_id ? Number(userData.user_area_id) : undefined),
      });

      if (!result.success) {
        const details =
          (typeof result.data === 'string' ? result.data : result.data?.message || result.data?.error) ||
          result.error ||
          'Please try again.';
        throw new Error(`Failed to submit time-out. ${details}`);
      }

      Alert.alert('Success', 'Time Out recorded successfully!');

      // Cache the time-out for immediate UI update
      try {
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        await AsyncStorage.setItem('last_time_out', currentTime);
        await AsyncStorage.setItem('last_time_out_date', currentDate);
      } catch (e) {
        console.warn('[TimeOut] Failed to cache time:', e);
      }

      // Notify reminders service
      try {
        await shiftReminderService.onTimeOutRecorded();
      } catch (err) {
        console.warn('[TimeOut] Reminder update failed:', err);
      }

      // Refresh home screen
      router.replace('/(tabs)');
    } catch (error: any) {
      throw error;
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F3F4F6' }}>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: '#F6B91E',
          tabBarInactiveTintColor: '#A0A0A0',
          headerShown: false,
          tabBarButton: HapticTab,
            tabBarBackground: () => <CustomTabBarBackground />,
          tabBarStyle: {
            height: 80 + bottomInset,
            backgroundColor: '#F3F4F6',
            borderTopWidth: 0,
            paddingBottom: 15 + bottomInset,
            paddingTop: 8,
            paddingHorizontal: 15,
            position: 'absolute',
            elevation: 0,
          },
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: '600',
            marginTop: 2,
          },
        }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.tabContainer, focused && styles.tabContainerActive]}>
              <Image
                source={require('@/assets/images/home.png')}
                style={{ 
                  width: 24, 
                  height: 24, 
                  tintColor: focused ? '#F6B91E' : '#FFFFFF'
                }}
                resizeMode="contain"
              />
            </View>
          ),
          tabBarLabel: ({ focused }) => (
            <View style={styles.labelContainer}>
              <Text style={[styles.tabLabel, { color: focused ? '#FFFFFF' : '#A0A0A0' }]}>Home</Text>
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="request"
        options={{
          title: 'Request',
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.tabContainer, focused && styles.tabContainerActive]}>
              <Image
                source={require('@/assets/images/Request.png')}
                style={{ 
                  width: 24, 
                  height: 24, 
                  tintColor: focused ? '#F6B91E' : '#FFFFFF'
                }}
                resizeMode="contain"
              />
            </View>
          ),
          tabBarLabel: ({ focused }) => (
            <Text style={[styles.tabLabel, { color: focused ? '#FFFFFF' : '#A0A0A0' }]}>Request</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="timein"
        options={{
          tabBarButton: () => <View style={{ width: 70 }} />,
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
          },
        }}
      />
      <Tabs.Screen
        name="ddo-ao"
        options={{
          title: 'DDO-AO',
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.tabContainer, focused && styles.tabContainerActive]}>
              <Image
                source={require('@/assets/images/DDO-AO.png')}
                style={{ 
                  width: 24, 
                  height: 24, 
                  tintColor: focused ? '#F6B91E' : '#FFFFFF'
                }}
                resizeMode="contain"
              />
            </View>
          ),
          tabBarLabel: ({ focused }) => (
            <Text style={[styles.tabLabel, { color: focused ? '#FFFFFF' : '#A0A0A0' }]}>DDO-AO</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.tabContainer, focused && styles.tabContainerActive]}>
              <Image
                source={require('@/assets/images/user.png')}
                style={{ 
                  width: 24, 
                  height: 24, 
                  tintColor: focused ? '#F6B91E' : '#FFFFFF'
                }}
                resizeMode="contain"
              />
            </View>
          ),
          tabBarLabel: ({ focused }) => (
            <Text style={[styles.tabLabel, { color: focused ? '#FFFFFF' : '#A0A0A0' }]}>Profile</Text>
          ),
        }}
      />
      {/** Hide leftover starter Explore route if the file still exists */}
      <Tabs.Screen name="explore" options={{ href: null }} />
      <Tabs.Screen 
        name="attendance_change_request" 
        options={{ 
          href: null,
          tabBarStyle: { display: 'none' }
        }} 
      />
      <Tabs.Screen 
        name="ot_request" 
        options={{ 
          href: null,
          tabBarStyle: { display: 'none' }
        }} 
      />
      <Tabs.Screen 
        name="loans" 
        options={{ 
          href: null,
          tabBarStyle: { display: 'none' }
        }} 
      />
      <Tabs.Screen 
        name="payslip"
        options={{ 
          href: null,
          tabBarStyle: { display: 'none' }
        }} 
      />
      <Tabs.Screen 
        name="time_entry_history"
        options={{ 
          href: null,
          tabBarStyle: { display: 'none' }
        }} 
      />
    </Tabs>
    
    {/* Action Buttons Container */}
    {showButtons && !pathname?.includes('attendance_change_request') && !pathname?.includes('ot_request') && !pathname?.includes('payslip') && !pathname?.includes('loans') && !pathname?.includes('time_entry_history') && (
      <Animated.View 
        style={[
          styles.buttonsContainer,
          {
            bottom: 100 + bottomInset,
            opacity: fadeAnim,
            transform: [{ scale: fadeAnim }],
          },
        ]}
      >
        <View style={styles.buttonRow}>
          <TouchableOpacity style={[styles.actionButton, styles.greenButton]} onPress={onTimeIn}>
            <Text style={styles.actionButtonText}>Papasok</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionButton, styles.redButton]} onPress={onTimeOut}>
            <Text style={styles.actionButtonText}>Uuwi</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    )}

    {/* Floating Action Button */}
    {!pathname?.includes('attendance_change_request') && !pathname?.includes('ot_request') && !pathname?.includes('payslip') && !pathname?.includes('loans') && !pathname?.includes('time_entry_history') && (
      <View style={[styles.fabContainer, { bottom: 35 + bottomInset }]}>
      {/* Notch halo under FAB to mimic carved effect */}
        <TouchableOpacity
          style={styles.centerButton}
          onPress={handleFabPress}
        >
          <View style={styles.fab}>
            <Animated.View style={{ 
              transform: [{ 
                rotate: fadeAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0deg', '45deg']
                })
              }]
            }}>
              <Image
                source={require('@/assets/images/plus.png')}
                style={{ width: 30, height: 30, tintColor: '#F6B91E' }}
                resizeMode="contain"
              />
            </Animated.View>
          </View>
        </TouchableOpacity>
      </View>
    )}
    </View>
  );
}

const styles = StyleSheet.create({
  tabBarBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  buttonsContainer: {
    position: 'absolute',
    bottom: 100,
    left: 20,
    right: 20,
    zIndex: 999,
    padding: 5,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 6,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 19,
    paddingHorizontal: 15,
    borderRadius: 12,
    marginHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  blueButton: {
    backgroundColor: '#F6B91E',
  },
  purpleButton: {
    backgroundColor: '#F6B91E',
  },
  greenButton: {
    backgroundColor: '#4CAF50',
  },
  redButton: {
    backgroundColor: '#E53935',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    width: '85%',
    maxHeight: '70%',
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 15,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    paddingBottom: 15,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    fontSize: 28,
    color: '#666',
    fontWeight: '300',
  },
  branchItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  branchText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  distanceText: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    fontSize: 16,
    marginTop: 30,
  },
  guardTypeItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    backgroundColor: '#FFFFFF',
  },
  selectedGuardTypeItem: {
    backgroundColor: '#F6B91E15',
  },
  guardTypeText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  selectedGuardTypeText: {
    color: '#F6B91E',
    fontWeight: '600',
  },
  checkmark: {
    fontSize: 20,
    color: '#F6B91E',
    fontWeight: 'bold',
  },
  fabContainer: {
    position: 'absolute',
    bottom: 35,
    left: 0,
    right: 0,
    alignItems: 'center',
    pointerEvents: 'box-none',
  },
  centerButton: {
    zIndex: 1000,
  },
  centerPlaceholder: {
    width: 20,
    height: 1,
    padding: 10,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#4A4A4A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabContainer: {
    width: 45,
    height: 35,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  tabContainerActive: {
    backgroundColor: '#B0B0B0',
  },
  labelContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
  },
  iconContainer: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  iconContainerActive: {
    backgroundColor: 'rgba(246, 185, 30, 0.15)',
    transform: [{ scale: 1.05 }],
  },
});
