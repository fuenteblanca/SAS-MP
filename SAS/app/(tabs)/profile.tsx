import { useUser } from '@/hooks/use-auth';
import authService from '@/services/authService';
import notificationService from '@/services/notificationService';
import versionService from '@/services/versionService';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useRouter, type Href } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';

export default function ProfileScreen() {
  const { userName, employee_id, user_company_id } = useUser();
  const router = useRouter();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [displayMode, setDisplayMode] = useState(false);
  const [appVersion, setAppVersion] = useState<string>('');

  useEffect(() => {
    // load stored preference
    (async () => {
      try {
        const v = await AsyncStorage.getItem('notifications_enabled');
        setNotificationsEnabled(v === 'true');
      } catch (e) {
        // ignore
      }
    })();

    // Load app version
    (async () => {
      try {
        const version = await versionService.getCurrentVersion();
        setAppVersion(version);
      } catch (e) {
        console.error('Error fetching version:', e);
      }
    })();
  }, []);

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              // Clear all user data
              await authService.logout();
              // Ensure navigation to login
              router.replace('/login');
            } catch (error) {
              console.error('Logout error:', error);
              router.replace('/login');
            }
          },
        },
      ]
    );
  };

  const menuItems = [
    { id: 'history', icon: 'time-outline', label: 'Time Entry History', color: '#F6B91E' },
    { id: 'payslip', icon: 'payslip.png', label: 'Payslip', color: '#F6B91E', isPng: true },
    { id: 'loans', icon: 'loans.png', label: 'Loans', color: '#F6B91E', isPng: true },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>

      {/* Profile Card */}
      <View style={styles.profileCard}>
        <View style={styles.avatarContainer}> 
          <View style={styles.avatar}>
            <Ionicons name="person" size={50} color="#F6B91E" />
          </View>
          <View style={styles.avatarBorder} />
        </View>
        <Text style={styles.userName}>{userName || 'Loading...'}</Text>
        <Text style={styles.userRole}>Employee ID: {employee_id || 'N/A'}</Text>
      </View>

      {/* My Account Section */}
      <Text style={styles.sectionTitle}>MY ACCOUNT</Text>
      <View style={styles.menuGrid}>
        {menuItems.map((item) => (
          <TouchableOpacity 
            key={item.id} 
            style={styles.menuItem}
            onPress={() => {
              // Navigate to Payslip screen when Payslip menu item is pressed
              if (item.id === 'payslip') {
                router.push('/payslip' as Href);
                return;
              }

              // Navigate to Loans screen when Loans menu item is pressed
              if (item.id === 'loans') {
                router.push('/loans' as Href);
                return;
              }

              // Navigate to Time Entry History
              if (item.id === 'history') {
                router.push('/time_entry_history' as Href);
                return;
              }

              // Navigate to Time Entry History
              if (item.id === 'history') {
                router.push('/time_entry_history');
                return;
              }

              // Default: show coming soon alert
              Alert.alert(item.label, `${item.label} feature coming soon`);
            }}
          >
            <View style={[styles.menuIconContainer, { backgroundColor: '#FFF8E1' }]}>
              {item.isPng ? (
                <Image 
                  source={
                    item.icon === 'payslip.png' 
                      ? require('@/assets/images/payslip.png')
                      : require('@/assets/images/loans.png')
                  } 
                  style={{ width: 32, height: 32, resizeMode: 'contain' }} 
                />
              ) : (
                <Ionicons name={item.icon as any} size={28} color={item.color} />
              )}
            </View>
            <Text style={styles.menuLabel}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Settings Section */}
      <Text style={styles.sectionTitle}>SETTINGS</Text>
      
      <View style={styles.settingItem}>
        <View style={styles.settingLeft}>
          <Ionicons name="notifications-outline" size={20} color="#F6B91E" />
          <Text style={styles.settingLabel}>Notifications</Text>
        </View>
        <Switch
          value={notificationsEnabled}
          onValueChange={async (val) => {
            // If enabling, request permission
            if (val) {
              try {
                const token = await notificationService.registerForPushNotificationsAsync();
                if (!token) {
                  Alert.alert(
                    'Permission required',
                    'Notifications permission was not granted. Please enable notifications in your device settings.',
                    [{ text: 'OK' }]
                  );
                  setNotificationsEnabled(false);
                  await AsyncStorage.setItem('notifications_enabled', 'false');
                  return;
                }

                // persist preference
                await AsyncStorage.setItem('notifications_enabled', 'true');
                setNotificationsEnabled(true);
                Alert.alert('Notifications enabled', 'You will receive reminders and alerts.');
                // Optionally register token with backend here
              } catch (e) {
                console.warn('Failed to enable notifications', e);
                Alert.alert('Error', 'Failed to enable notifications.');
                setNotificationsEnabled(false);
                await AsyncStorage.setItem('notifications_enabled', 'false');
              }
            } else {
              // disabling: cancel scheduled local notifications and persist
              try {
                await Notifications.cancelAllScheduledNotificationsAsync();
              } catch (e) {
                console.warn('Failed to cancel scheduled notifications', e);
              }
              await AsyncStorage.setItem('notifications_enabled', 'false');
              setNotificationsEnabled(false);
              Alert.alert('Notifications disabled', 'You will no longer receive reminders.');
            }
          }}
          trackColor={{ false: '#D1D5DB', true: '#F6B91E' }}
          thumbColor="#FFFFFF"
        />
      </View>

      <View style={styles.settingItem}>
        <View style={styles.settingLeft}>
          <Ionicons name="moon-outline" size={20} color="#F6B91E" />
          <Text style={styles.settingLabel}>Display Mode</Text>
        </View>
        <Switch
          value={displayMode}
          onValueChange={setDisplayMode}
          trackColor={{ false: '#D1D5DB', true: '#F6B91E' }}
          thumbColor="#FFFFFF"
        />
      </View>

      {/* Logout Button */}
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={20} color="#F6B91E" />
        <Text style={styles.logoutText}>Logout</Text>
        <Ionicons name="chevron-forward" size={20} color="#F6B91E" />
      </TouchableOpacity>

      {/* App Version */}
      {appVersion ? (
        <View style={styles.versionContainer}>
          <Text style={styles.versionText}>SAS Version {appVersion}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  contentContainer: {
    paddingBottom: 40,
  },
  profileCard: {
    backgroundColor: '#FAFAFA',
    marginHorizontal: 20,
    borderRadius: 16,
    paddingVertical: 30,
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 40,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#FFF8E1',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  avatarBorder: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 3,
    borderColor: '#F6B91E',
    top: -5,
    left: -5,
    zIndex: 1,
  },
  userName: {
    fontSize: 20,
    fontWeight: '700',
    fontFamily: 'Poppins',
    color: '#000000',
    marginBottom: 4,
    letterSpacing: 1,
  },
  userRole: {
    fontSize: 13,
    fontFamily: 'Poppins',
    color: '#6B7280',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '500',
    fontFamily: 'Poppins',
    color: '#292929ff',
    paddingHorizontal: 20,
    marginTop: 8,
    letterSpacing: 0.5,
  },
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  menuItem: {
    width: '33.33%',
    alignItems: 'center',
    paddingVertical: 10,
  },
  menuIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  menuLabel: {
    fontSize: 12,
    fontWeight: '500',
    fontFamily: 'Poppins',
    color: '#374151',
    textAlign: 'center',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: '500',
    fontFamily: 'Poppins',
    color: '#374151',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginTop: 8,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  logoutText: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'Poppins',
    color: '#F6B91E',
    flex: 1,
    marginLeft: 12,
  },
  versionContainer: {
    alignItems: 'center',
    paddingVertical: 20,
    marginTop: 10,
  },
  versionText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontFamily: 'Poppins',
    fontWeight: '400',
  },
});
