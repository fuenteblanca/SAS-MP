import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Notification service helper for local scheduling and push registration.
 *
 * Notes:
 * - Local scheduled notifications created with expo-notifications will fire even when the app
 *   is not running (background or killed) on native builds. They do not fully work in Expo Go.
 * - For server-driven events (payslip, loans, announcements) prefer server push (FCM/APNs) and
 *   register the device's push token with your backend using registerPushToken.
 */

type ScheduledInfo = { id: string; identifier: string };

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function createAndroidChannels() {
  if (Platform.OS !== 'android') return;
  try {
    // Default channel
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
    // Shift reminders channel (high importance to appear prominently)
    await Notifications.setNotificationChannelAsync('shift', {
      name: 'Shift Reminders',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 400, 250, 400],
      lightColor: '#FFA000',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
    // Geofence exit channel
    await Notifications.setNotificationChannelAsync('geofence', {
      name: 'Geofence Alerts',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 400, 250, 600],
      lightColor: '#29B6F6',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  } catch (e) {
    console.warn('Failed to create notification channels', e);
  }
}

const NotificationService = {
  /** Initialize notifications (create channel, optionally register handlers) */
  init: async () => {
    await createAndroidChannels();
    // listeners can be attached by the app if needed
  },

  /** Request permissions and return Expo push token (if available) */
  registerForPushNotificationsAsync: async (): Promise<string | null> => {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') return null;

      const tokenData = await Notifications.getExpoPushTokenAsync();
      const token = tokenData?.data || null;
      return token;
    } catch (e) {
      console.warn('registerForPushNotificationsAsync error', e);
      return null;
    }
  },

  /** Schedule a local notification at a specific Date (or Date string) */
  scheduleLocalNotification: async ({ id, title, body, date, channelId }: { id?: string; title: string; body: string; date: Date | string; channelId?: string }) => {
    try {
      const trigger = typeof date === 'string' ? new Date(date) : date;
      if (!(trigger instanceof Date) || isNaN(trigger.getTime())) return null;
      const seconds = Math.max(1, Math.floor((trigger.getTime() - Date.now()) / 1000));
      // cast trigger to any to satisfy differing expo-notifications versions/types
      const identifier = await Notifications.scheduleNotificationAsync({
        content: ({ title, body, data: { id }, channelId } as any),
        trigger: ({ seconds, repeats: false } as any),
      });
      return { id, identifier } as ScheduledInfo;
    } catch (e) {
      console.warn('scheduleLocalNotification error', e);
      return null;
    }
  },

  /** Cancel a scheduled notification by identifier */
  cancelScheduledNotification: async (identifier: string) => {
    try {
      await Notifications.cancelScheduledNotificationAsync(identifier);
    } catch (e) {
      console.warn('cancelScheduledNotification error', e);
    }
  },

  /** Convenience: schedule a reminder relative to a shift time (leadMinutes before) */
  scheduleShiftReminder: async (opts: { shiftIso: string | Date; leadMinutes?: number; title?: string; body?: string; id?: string }) => {
    try {
      const { shiftIso, leadMinutes = 10, title = 'Shift reminder', body = 'Reminder to time in/out', id } = opts;
      const shiftDate = typeof shiftIso === 'string' ? new Date(shiftIso) : shiftIso;
      if (isNaN(shiftDate.getTime())) return null;
      const trigger = new Date(shiftDate.getTime() - (leadMinutes || 0) * 60 * 1000);
      if (trigger.getTime() <= Date.now()) return null; // don't schedule past reminders
  return await NotificationService.scheduleLocalNotification({ id, title, body, date: trigger, channelId: 'shift' });
    } catch (e) {
      console.warn('scheduleShiftReminder error', e);
      return null;
    }
  },

  /** Register Expo push token with your backend (appServerUrl should accept { token, userId }) */
  registerPushToken: async (appServerUrl: string, token: string, userId?: string | number) => {
    try {
      if (!appServerUrl || !token) return false;
      await fetch(appServerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, userId }),
      });
      return true;
    } catch (e) {
      console.warn('registerPushToken error', e);
      return false;
    }
  },

  /** Poll server for announcements/payslip/loan events and schedule notifications when new items appear.
   *  This is a helper that should be called periodically from the app (e.g., on app start or via background task).
   *  For reliable delivery while app is killed, prefer server push notifications.
   */
  pollAndScheduleServerEvents: async (fetcher: () => Promise<any[]>, mapToNotification: (item: any) => { title: string; body: string; when?: Date | string; id?: string }) => {
    try {
      const items = await fetcher();
      if (!Array.isArray(items)) return 0;
      let scheduled = 0;
      for (const it of items) {
        const n = mapToNotification(it);
        if (!n) continue;
        // if when is in future schedule, otherwise show immediately
        if (n.when && new Date(n.when).getTime() > Date.now()) {
          const res = await NotificationService.scheduleLocalNotification({ id: n.id, title: n.title, body: n.body, date: n.when, channelId: 'default' });
          if (res) scheduled++;
        } else {
          await Notifications.scheduleNotificationAsync({ content: ({ title: n.title, body: n.body, data: { id: n.id }, channelId: 'default' } as any), trigger: null });
          scheduled++;
        }
      }
      return scheduled;
    } catch (e) {
      console.warn('pollAndScheduleServerEvents error', e);
      return 0;
    }
  },

  // Expose listeners for app to attach
  addNotificationReceivedListener: (cb: (n: Notifications.Notification) => void) => Notifications.addNotificationReceivedListener(cb),
  addNotificationResponseListener: (cb: (r: Notifications.NotificationResponse) => void) => Notifications.addNotificationResponseReceivedListener(cb),
};

export default NotificationService;
