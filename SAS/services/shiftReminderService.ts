import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import attendanceService from './attendanceService';
import notificationService from './notificationService';
import { formatDate } from './timeService';

const SHIFT_START_IDENTIFIER_KEY = 'notifications_shift_start_identifier';
const SHIFT_OUT_IDENTIFIER_KEY = 'notifications_shift_out_identifier';
const SHIFT_START_TARGET_KEY = 'notifications_shift_start_target_iso';
const SHIFT_OUT_TARGET_KEY = 'notifications_shift_out_target_iso';
const MISSED_START_NOTIFIED_DATE_KEY = 'notification_missed_start_notified_date';
const MISSED_START_NUDGES_IDENTIFIERS_PREFIX = 'missed_start_nudges_identifiers:';
const NOTIFICATIONS_ENABLED_KEY = 'notifications_enabled';
const LAST_TIME_IN_DATE_KEY = 'last_time_in_date';
const LAST_TIME_OUT_DATE_KEY = 'last_time_out_date';
const EXIT_REMINDER_DATE_KEY = 'geofence_last_exit_notice_date';
const GEOFENCE_BRANCH_ID_KEY = 'geofence_branch_identifier';
const BRANCH_ID_KEY = 'user_branch_id';
const BRANCH_NAME_KEY = 'user_branch_name';
const BRANCH_LAT_KEY = 'branch_latitude';
const BRANCH_LON_KEY = 'branch_longitude';
const BRANCH_RADIUS_KEY = 'branch_radius';
const WEEKDAY_IN_KEY = 'branch_weekday_in';
const WEEKDAY_OUT_KEY = 'branch_weekday_out';
const WEEKEND_IN_KEY = 'branch_weekend_in';
const WEEKEND_OUT_KEY = 'branch_weekend_out';
const LEAD_MINUTES_KEY = 'notification_lead_minutes';
const TIMEOUT_DELAY_KEY = 'notification_timeout_delay_minutes';
const GEOFENCE_TASK_NAME = 'shift-reminder-geofence';

const DEFAULT_SHIFT_LEAD_MINUTES = 10;
const DEFAULT_TIMEOUT_DELAY_MINUTES = 0;
const MIN_GEOFENCE_RADIUS_METERS = 75;
const MAX_GEOFENCE_RADIUS_METERS = 1000;

let geofenceTaskDefined = false;

interface ShiftConfig {
  weekdayIn?: string | null;
  weekdayOut?: string | null;
  weekendIn?: string | null;
  weekendOut?: string | null;
  leadMinutes: number;
  timeoutDelayMinutes: number;
}

type ReminderType = 'start' | 'out';

type MultiMap = Record<string, string | null>;

function toNumber(value: string | null | undefined): number | null {
  if (value === undefined || value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseMinutes(value: string | null | undefined, fallback: number): number {
  if (value === undefined || value === null) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatTimeLabel(date: Date): string {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;
  const paddedMinutes = minutes.toString().padStart(2, '0');
  return `${displayHour}:${paddedMinutes} ${period}`;
}

function normalizeShiftTime(time?: string | null): string | null {
  if (!time) return null;
  const trimmed = time.trim();
  if (!trimmed || trimmed === '00:00:00') return null;
  return trimmed;
}

function parseShiftTimeOnDate(base: Date, time?: string | null): Date | null {
  const normalized = normalizeShiftTime(time);
  if (!normalized) return null;
  const parts = normalized.split(':');
  if (parts.length < 2) return null;
  const hour = Number.parseInt(parts[0] || '0', 10);
  const minute = Number.parseInt(parts[1] || '0', 10);
  const second = Number.parseInt(parts[2] || '0', 10) || 0;
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || !Number.isFinite(second)) {
    return null;
  }
  const result = new Date(base.getFullYear(), base.getMonth(), base.getDate(), hour, minute, second, 0);
  return Number.isNaN(result.getTime()) ? null : result;
}

async function scheduleMissedStartNudges(startDate: Date, limitMinutes: number = 60): Promise<void> {
  try {
    const now = new Date();
    const nudges: number[] = [];
    for (let m = 5; m <= limitMinutes; m += 5) {
      const when = new Date(startDate.getTime() + m * 60 * 1000);
      if (when.getTime() > now.getTime()) nudges.push(m);
    }
    const identifiers: string[] = [];
    for (const m of nudges) {
      const when = new Date(startDate.getTime() + m * 60 * 1000);
      const seconds = Math.max(1, Math.floor((when.getTime() - Date.now()) / 1000));
      const id = await Notifications.scheduleNotificationAsync({
        content: ({
          title: 'Still not timed in',
          body: `Shift started at ${formatTimeLabel(startDate)}. Please time in.`,
          data: { reason: 'missed-start-nudge', minutesAfter: m },
          channelId: 'shift',
        } as any),
        trigger: { seconds, repeats: false } as any,
      });
      if (id) identifiers.push(id);
    }
    if (identifiers.length) {
      const today = formatDate(new Date());
      await AsyncStorage.setItem(`${MISSED_START_NUDGES_IDENTIFIERS_PREFIX}${today}`, JSON.stringify(identifiers));
    }
  } catch (e) {
    console.warn('Failed to schedule missed-start nudges', e);
  }
}

async function cancelMissedStartNudgesForToday(): Promise<void> {
  try {
    const today = formatDate(new Date());
    const raw = await AsyncStorage.getItem(`${MISSED_START_NUDGES_IDENTIFIERS_PREFIX}${today}`);
    if (!raw) return;
    const identifiers: string[] = JSON.parse(raw);
    for (const id of identifiers) {
      try {
        await Notifications.cancelScheduledNotificationAsync(id);
      } catch (e) {
        // continue
      }
    }
    await AsyncStorage.removeItem(`${MISSED_START_NUDGES_IDENTIFIERS_PREFIX}${today}`);
  } catch (e) {
    console.warn('Failed to cancel missed-start nudges', e);
  }
}

async function loadMulti(keys: string[]): Promise<MultiMap> {
  const entries = await AsyncStorage.multiGet(keys);
  return entries.reduce<MultiMap>((acc, [key, value]) => {
    acc[key] = value;
    return acc;
  }, {});
}

async function loadShiftConfig(): Promise<ShiftConfig> {
  const map = await loadMulti([
    WEEKDAY_IN_KEY,
    WEEKDAY_OUT_KEY,
    WEEKEND_IN_KEY,
    WEEKEND_OUT_KEY,
    LEAD_MINUTES_KEY,
    TIMEOUT_DELAY_KEY,
  ]);
  return {
    weekdayIn: map[WEEKDAY_IN_KEY],
    weekdayOut: map[WEEKDAY_OUT_KEY],
    weekendIn: map[WEEKEND_IN_KEY],
    weekendOut: map[WEEKEND_OUT_KEY],
    leadMinutes: Math.max(0, parseMinutes(map[LEAD_MINUTES_KEY], DEFAULT_SHIFT_LEAD_MINUTES)),
    timeoutDelayMinutes: parseMinutes(map[TIMEOUT_DELAY_KEY], DEFAULT_TIMEOUT_DELAY_MINUTES),
  };
}

function isWeekendDate(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

async function computeNextShiftDate(config: ShiftConfig, type: ReminderType): Promise<Date | null> {
  const now = new Date();
  for (let offset = 0; offset < 7; offset += 1) {
    const candidate = new Date(now);
    candidate.setHours(0, 0, 0, 0);
    candidate.setDate(candidate.getDate() + offset);
    const weekend = isWeekendDate(candidate);
    const shiftTime = weekend
      ? type === 'start'
        ? config.weekendIn
        : config.weekendOut
      : type === 'start'
        ? config.weekdayIn
        : config.weekdayOut;
    const shiftDate = parseShiftTimeOnDate(candidate, shiftTime);
    if (!shiftDate) continue;
    if (shiftDate.getTime() <= now.getTime()) continue;
    return shiftDate;
  }
  return null;
}

async function cancelStoredNotification(key: string, targetKey?: string) {
  const identifier = await AsyncStorage.getItem(key);
  if (!identifier) return;
  try {
    await notificationService.cancelScheduledNotification(identifier);
  } catch (error) {
    console.warn('Failed to cancel scheduled notification', error);
  } finally {
    await AsyncStorage.removeItem(key);
    if (targetKey) {
      await AsyncStorage.removeItem(targetKey);
    }
  }
}

async function scheduleShiftStartReminder(): Promise<void> {
  await cancelStoredNotification(SHIFT_START_IDENTIFIER_KEY, SHIFT_START_TARGET_KEY);
  const config = await loadShiftConfig();
  const nextShift = await computeNextShiftDate(config, 'start');
  if (!nextShift) return;

  const now = new Date();
  const leadMs = config.leadMinutes * 60 * 1000;
  let trigger = new Date(nextShift.getTime() - leadMs);
  if (trigger.getTime() <= now.getTime()) {
    trigger = new Date(now.getTime() + 5 * 1000);
  }

  try {
    const result = await notificationService.scheduleLocalNotification({
      id: `shift-start-${nextShift.toISOString()}`,
      title: 'Upcoming shift',
      body: `Your shift starts at ${formatTimeLabel(nextShift)}.`,
      date: trigger,
      channelId: 'shift',
    });
    if (result?.identifier) {
      await AsyncStorage.multiSet([
        [SHIFT_START_IDENTIFIER_KEY, result.identifier],
        [SHIFT_START_TARGET_KEY, nextShift.toISOString()],
      ]);
    }

    // Also schedule a reminder exactly at shift start to catch users who missed the lead reminder
    if (nextShift.getTime() > now.getTime()) {
      // Use seconds trigger to align with expo-notifications type expectations
      const secondsUntilStart = Math.max(1, Math.floor((nextShift.getTime() - Date.now()) / 1000));
      await Notifications.scheduleNotificationAsync({
        content: ({
          title: 'Shift started',
          body: 'Please time in now.',
          data: { reason: 'shift-start' },
          channelId: 'shift',
        } as any),
        trigger: { seconds: secondsUntilStart, repeats: false } as any,
      });

      // Queue repeating nudges every 5 minutes after start, up to 60 minutes
      await scheduleMissedStartNudges(nextShift, 60);
    }

    // Additional 5-minute before shift nudge: "You're going to be late" if not timed in yet
    const fiveMinutesMs = 5 * 60 * 1000;
    const fiveMinTrigger = new Date(nextShift.getTime() - fiveMinutesMs);
    if (fiveMinTrigger.getTime() > now.getTime()) {
      const secondsUntilFiveMin = Math.max(1, Math.floor((fiveMinTrigger.getTime() - Date.now()) / 1000));
      await Notifications.scheduleNotificationAsync({
        content: ({
          title: "You're going to be late",
          body: `Shift starts at ${formatTimeLabel(nextShift)}. Time in now.`,
          data: { reason: 'shift-late-5min' },
          channelId: 'shift',
        } as any),
        trigger: { seconds: secondsUntilFiveMin, repeats: false } as any,
      });
    }
  } catch (error) {
    console.warn('Failed to schedule shift start reminder', error);
  }
}

async function scheduleShiftOutReminder(): Promise<void> {
  await cancelStoredNotification(SHIFT_OUT_IDENTIFIER_KEY, SHIFT_OUT_TARGET_KEY);
  const config = await loadShiftConfig();
  const nextShiftOut = await computeNextShiftDate(config, 'out');
  if (!nextShiftOut) return;

  const now = new Date();
  const delayMs = config.timeoutDelayMinutes * 60 * 1000;
  let trigger = new Date(nextShiftOut.getTime() + delayMs);
  if (trigger.getTime() <= now.getTime()) {
    trigger = new Date(now.getTime() + 5 * 1000);
  }

  try {
    // Schedule a nudge 10 minutes before shift end (if still in the future)
    const tenMinBefore = new Date(nextShiftOut.getTime() - 10 * 60 * 1000);
    if (tenMinBefore.getTime() > now.getTime()) {
      const secondsUntilLead = Math.max(1, Math.floor((tenMinBefore.getTime() - Date.now()) / 1000));
      await Notifications.scheduleNotificationAsync({
        content: ({
          title: 'Shift ending soon',
          body: `Shift ends at ${formatTimeLabel(nextShiftOut)}. Don\'t forget to time out.`,
          data: { reason: 'shift-out-10min' },
          channelId: 'shift',
        } as any),
        trigger: { seconds: secondsUntilLead, repeats: false } as any,
      });
    }

    const result = await notificationService.scheduleLocalNotification({
      id: `shift-out-${nextShiftOut.toISOString()}`,
      title: 'Time-out reminder',
      body: 'Please remember to record your time-out.',
      date: trigger,
      channelId: 'shift',
    });
    if (result?.identifier) {
      await AsyncStorage.multiSet([
        [SHIFT_OUT_IDENTIFIER_KEY, result.identifier],
        [SHIFT_OUT_TARGET_KEY, nextShiftOut.toISOString()],
      ]);
    }
  } catch (error) {
    console.warn('Failed to schedule shift out reminder', error);
  }
}

async function stopGeofenceTask() {
  if (Platform.OS === 'web') return;
  try {
    const registered = await TaskManager.isTaskRegisteredAsync(GEOFENCE_TASK_NAME);
    if (registered) {
      await Location.stopGeofencingAsync(GEOFENCE_TASK_NAME);
    }
  } catch (error) {
    console.warn('Failed to stop geofencing task', error);
  }
}

async function registerGeofenceIfPossible(): Promise<void> {
  if (Platform.OS === 'web') return;
  ensureGeofenceTaskDefined();

  try {
    const map = await loadMulti([
      BRANCH_ID_KEY,
      BRANCH_LAT_KEY,
      BRANCH_LON_KEY,
      BRANCH_RADIUS_KEY,
    ]);

    const branchId = map[BRANCH_ID_KEY];
    const latitude = toNumber(map[BRANCH_LAT_KEY]);
    const longitude = toNumber(map[BRANCH_LON_KEY]);
    const radiusRaw = toNumber(map[BRANCH_RADIUS_KEY]);

    if (!branchId || latitude === null || longitude === null || radiusRaw === null) {
      await stopGeofenceTask();
      await AsyncStorage.removeItem(GEOFENCE_BRANCH_ID_KEY);
      return;
    }

    const radius = Math.min(
      Math.max(radiusRaw, MIN_GEOFENCE_RADIUS_METERS),
      MAX_GEOFENCE_RADIUS_METERS,
    );

    const servicesEnabled = await Location.hasServicesEnabledAsync();
    if (!servicesEnabled) {
      console.warn('Location services disabled; skipping geofence registration');
      return;
    }

    const fgPermission = await Location.getForegroundPermissionsAsync();
    if (fgPermission.status !== Location.PermissionStatus.GRANTED) {
      const requested = await Location.requestForegroundPermissionsAsync();
      if (requested.status !== Location.PermissionStatus.GRANTED) {
        console.warn('Foreground location permission denied; cannot register geofence');
        return;
      }
    }

    const bgPermission = await Location.getBackgroundPermissionsAsync();
    if (bgPermission.status !== Location.PermissionStatus.GRANTED) {
      const requested = await Location.requestBackgroundPermissionsAsync();
      if (requested.status !== Location.PermissionStatus.GRANTED) {
        console.warn('Background location permission denied; cannot register geofence');
        return;
      }
    }

    const alreadyRegistered = await TaskManager.isTaskRegisteredAsync(GEOFENCE_TASK_NAME);
    if (alreadyRegistered) {
      const existingBranch = await AsyncStorage.getItem(GEOFENCE_BRANCH_ID_KEY);
      if (existingBranch === branchId) {
        return;
      }
      await Location.stopGeofencingAsync(GEOFENCE_TASK_NAME);
    }

    await Location.startGeofencingAsync(GEOFENCE_TASK_NAME, [
      {
        identifier: `branch-${branchId}`,
        latitude,
        longitude,
        radius,
        notifyOnEnter: false,
        notifyOnExit: true,
      },
    ]);

    await AsyncStorage.setItem(GEOFENCE_BRANCH_ID_KEY, branchId);
  } catch (error) {
    console.warn('Failed to register geofence', error);
  }
}

async function handleGeofenceExit() {
  try {
    const map = await loadMulti([
      NOTIFICATIONS_ENABLED_KEY,
      LAST_TIME_IN_DATE_KEY,
      LAST_TIME_OUT_DATE_KEY,
      EXIT_REMINDER_DATE_KEY,
      BRANCH_NAME_KEY,
    ]);
    if (map[NOTIFICATIONS_ENABLED_KEY] === 'false') return;

    const today = formatDate(new Date());
    const lastTimeInDate = map[LAST_TIME_IN_DATE_KEY];
    const lastTimeOutDate = map[LAST_TIME_OUT_DATE_KEY];
    const lastExitReminder = map[EXIT_REMINDER_DATE_KEY];

    if (lastTimeInDate !== today) return;
    if (lastTimeOutDate === today) return;
    if (lastExitReminder === today) return;

    const branchName = map[BRANCH_NAME_KEY] || 'your shift area';
    await Notifications.scheduleNotificationAsync({
      content: ({
        title: 'Reminder to time out',
        body: `You are leaving ${branchName}. Don\'t forget to record your time-out.`,
        data: { reason: 'geofence-exit' },
        channelId: 'geofence',
      } as any),
      trigger: null,
    });
    await AsyncStorage.setItem(EXIT_REMINDER_DATE_KEY, today);
  } catch (error) {
    console.warn('Failed to handle geofence exit event', error);
  }
}

function ensureGeofenceTaskDefined() {
  if (geofenceTaskDefined || Platform.OS === 'web') return;
  try {
  TaskManager.defineTask(GEOFENCE_TASK_NAME, async ({ data, error }: { data?: any; error?: any }) => {
      if (error) {
        console.warn('Geofence task error', error);
        return;
      }
      const eventType = (data as any)?.eventType;
      if (eventType === Location.GeofencingEventType.Exit) {
        await handleGeofenceExit();
      }
    });
    geofenceTaskDefined = true;
  } catch (error: any) {
    const message = error?.message || '';
    if (typeof message === 'string' && message.includes('already')) {
      geofenceTaskDefined = true;
    } else {
      console.warn('Failed to define geofence task', error);
    }
  }
}

async function refreshScheduledReminders(): Promise<void> {
  ensureGeofenceTaskDefined();
  // First, sync today's attendance flags from server so we don't notify users who already timed in/out elsewhere
  try {
    const today = formatDate(new Date());
    const summary = await attendanceService.getAttendanceForDate(today, false as any);
    if (summary && (summary as any).latestTimeIn) {
      await AsyncStorage.setItem(LAST_TIME_IN_DATE_KEY, today);
    }
    if (summary && (summary as any).latestTimeOut) {
      await AsyncStorage.setItem(LAST_TIME_OUT_DATE_KEY, today);
    }
  } catch (e) {
    // Non-blocking: continue scheduling even if server unavailable
  }
  const notificationsEnabled = await AsyncStorage.getItem(NOTIFICATIONS_ENABLED_KEY);
  if (notificationsEnabled === 'false') {
    await cancelStoredNotification(SHIFT_START_IDENTIFIER_KEY);
    await cancelStoredNotification(SHIFT_OUT_IDENTIFIER_KEY);
    await stopGeofenceTask();
    return;
  }

  await scheduleShiftStartReminder();
  await scheduleShiftOutReminder();
  await registerGeofenceIfPossible();

  // Catch-up: if we're already past today's shift start and user hasn't timed in, notify once
  try {
    const map = await loadMulti([
      SHIFT_START_TARGET_KEY,
      LAST_TIME_IN_DATE_KEY,
      MISSED_START_NOTIFIED_DATE_KEY,
    ]);
    const startIso = map[SHIFT_START_TARGET_KEY];
    if (startIso) {
      const startDate = new Date(startIso);
      if (!isNaN(startDate.getTime())) {
        const now = new Date();
        const today = formatDate(now);
        const lastTimeInDate = map[LAST_TIME_IN_DATE_KEY];
        const alreadyNotifiedDate = map[MISSED_START_NOTIFIED_DATE_KEY];
        if (now.getTime() >= startDate.getTime() && lastTimeInDate !== today && alreadyNotifiedDate !== today) {
          await Notifications.scheduleNotificationAsync({
            content: ({
              title: 'Missed time-in',
              body: 'Your shift started already. Please time in.',
              data: { reason: 'missed-start' },
              channelId: 'shift',
            } as any),
            trigger: null,
          });
          await AsyncStorage.setItem(MISSED_START_NOTIFIED_DATE_KEY, today);

          // Start repeating nudges (every 5 minutes up to 60 minutes)
          await scheduleMissedStartNudges(startDate, 60);
        }
      }
    }
  } catch (err) {
    console.warn('Failed to run missed time-in catch-up', err);
  }
}

async function cancelAllReminders(stopGeofence: boolean = false): Promise<void> {
  await cancelStoredNotification(SHIFT_START_IDENTIFIER_KEY);
  await cancelStoredNotification(SHIFT_OUT_IDENTIFIER_KEY);
  if (stopGeofence) {
    await stopGeofenceTask();
    await AsyncStorage.removeItem(GEOFENCE_BRANCH_ID_KEY);
  }
}

const shiftReminderService = {
  refreshScheduledReminders,
  cancelAllReminders,
  onBranchSelected: async () => {
    // Sync server attendance first to avoid false-positive missed alerts
    try {
      const today = formatDate(new Date());
      const summary = await attendanceService.getAttendanceForDate(today, false as any);
      if (summary && (summary as any).latestTimeIn) {
        await AsyncStorage.setItem(LAST_TIME_IN_DATE_KEY, today);
      }
      if (summary && (summary as any).latestTimeOut) {
        await AsyncStorage.setItem(LAST_TIME_OUT_DATE_KEY, today);
      }
    } catch {}
    // Refresh all schedules/geofence
    await refreshScheduledReminders();

    // Immediate alert logic: if already late or within 5 minutes before start
    try {
      const cfg = await loadShiftConfig();
      const now = new Date();
      const todayIso = formatDate(now);
      const isWkend = isWeekendDate(now);
      const startStr = isWkend ? cfg.weekendIn : cfg.weekdayIn;
      const startDate = parseShiftTimeOnDate(now, startStr);
      if (startDate) {
        const lastTimeInDate = await AsyncStorage.getItem(LAST_TIME_IN_DATE_KEY);
        const alreadyMissedNotified = await AsyncStorage.getItem(MISSED_START_NOTIFIED_DATE_KEY);

        // If past start and not timed in today, notify immediately (once per day)
        if (now.getTime() >= startDate.getTime() && lastTimeInDate !== todayIso && alreadyMissedNotified !== todayIso) {
          await Notifications.scheduleNotificationAsync({
            content: ({
              title: 'Missed time-in',
              body: 'Your shift has started. Please time in now.',
              data: { reason: 'missed-start-branch-select' },
              channelId: 'shift',
            } as any),
            trigger: null,
          });
          await AsyncStorage.setItem(MISSED_START_NOTIFIED_DATE_KEY, todayIso);
        } else {
          // If within 5 minutes before start window, nudge immediately
          const fiveMinMs = 5 * 60 * 1000;
          const windowStart = new Date(startDate.getTime() - fiveMinMs);
          if (now.getTime() >= windowStart.getTime() && now.getTime() < startDate.getTime() && lastTimeInDate !== todayIso) {
            await Notifications.scheduleNotificationAsync({
              content: ({
                title: "You're going to be late",
                body: `Shift starts at ${formatTimeLabel(startDate)}. Time in now.`,
                data: { reason: 'shift-late-5min-branch-select' },
                channelId: 'shift',
              } as any),
              trigger: null,
            });
          }
        }
      }
    } catch (e) {
      console.warn('Immediate branch-select alert failed', e);
    }
  },
  onTimeInRecorded: async () => {
    // Cancel any pending repeated nudges for today
    await cancelMissedStartNudgesForToday();
    // Persist today's time-in flag
    try { await AsyncStorage.setItem(LAST_TIME_IN_DATE_KEY, formatDate(new Date())); } catch {}
    await refreshScheduledReminders();
  },
  onTimeOutRecorded: async () => {
    // Persist today's time-out flag
    try { await AsyncStorage.setItem(LAST_TIME_OUT_DATE_KEY, formatDate(new Date())); } catch {}
    await refreshScheduledReminders();
  },
};

export default shiftReminderService;
