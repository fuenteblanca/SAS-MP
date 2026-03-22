import AsyncStorage from '@react-native-async-storage/async-storage';

export type GuestAttendanceAction = 'time_in' | 'time_out';

export interface GuestAttendanceLog {
  id: string;
  date: string;
  attendance_date: string;
  time: string;
  action: GuestAttendanceAction;
  site_name: string;
  site_id: number;
  site?: {
    id: number;
    site_name: string;
  };
  raw?: any;
}

const GUEST_PROFILE_KEY = 'guest_profile';
const GUEST_LOGS_KEY = 'guest_attendance_logs';

const DEFAULT_SITE = {
  id: 9001,
  name: 'Demo Site - Main Gate',
  code: 'DEMO-001',
  shiftIn: '08:00:00',
  shiftOut: '17:00:00',
  provinceName: 'Metro Manila',
  lguName: 'Quezon City',
};

function formatDate(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatTime(date: Date): string {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function normalizeDateOnly(value: any): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.includes('T')) return raw.split('T')[0];
  if (raw.includes(' ')) return raw.split(' ')[0];
  return raw;
}

async function readLogs(): Promise<GuestAttendanceLog[]> {
  try {
    const raw = await AsyncStorage.getItem(GUEST_LOGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeLogs(logs: GuestAttendanceLog[]): Promise<void> {
  await AsyncStorage.setItem(GUEST_LOGS_KEY, JSON.stringify(logs));
}

async function ensureSeedData(): Promise<void> {
  const logs = await readLogs();
  if (logs.length > 0) return;

  const now = new Date();
  const today = formatDate(now);
  const yesterdayDateObj = new Date(now);
  yesterdayDateObj.setDate(now.getDate() - 1);
  const yesterday = formatDate(yesterdayDateObj);
  const seeded: GuestAttendanceLog[] = [
    {
      id: `guest-${yesterday}-in`,
      date: yesterday,
      attendance_date: yesterday,
      time: '08:02:15',
      action: 'time_in',
      site_name: DEFAULT_SITE.name,
      site_id: DEFAULT_SITE.id,
      site: { id: DEFAULT_SITE.id, site_name: DEFAULT_SITE.name },
    },
    {
      id: `guest-${yesterday}-out`,
      date: yesterday,
      attendance_date: yesterday,
      time: '17:04:41',
      action: 'time_out',
      site_name: DEFAULT_SITE.name,
      site_id: DEFAULT_SITE.id,
      site: { id: DEFAULT_SITE.id, site_name: DEFAULT_SITE.name },
    },
    {
      id: `guest-${today}-in`,
      date: today,
      attendance_date: today,
      time: '08:02:15',
      action: 'time_in',
      site_name: DEFAULT_SITE.name,
      site_id: DEFAULT_SITE.id,
      site: { id: DEFAULT_SITE.id, site_name: DEFAULT_SITE.name },
    },
  ];
  await writeLogs(seeded);
}

async function cacheSiteContext() {
  await AsyncStorage.multiSet([
    ['current_site_name', DEFAULT_SITE.name],
    ['current_site_code', DEFAULT_SITE.code],
    ['current_site_shift_in', DEFAULT_SITE.shiftIn],
    ['current_site_shift_out', DEFAULT_SITE.shiftOut],
    ['current_site_province_name', DEFAULT_SITE.provinceName],
    ['current_site_lgu_name', DEFAULT_SITE.lguName],
  ]);
}

export default {
  async enterGuestMode() {
    await cacheSiteContext();
    await AsyncStorage.setItem(
      GUEST_PROFILE_KEY,
      JSON.stringify({
        employee_id: '900001',
        user_id: '900001',
        userName: 'Guest User',
        user_company_id: '0',
      })
    );
    await ensureSeedData();
  },

  async clearGuestData() {
    await AsyncStorage.multiRemove([
      GUEST_PROFILE_KEY,
      GUEST_LOGS_KEY,
      'is_guest',
      'last_time_in',
      'last_time_in_date',
      'last_time_out',
      'last_time_out_date',
      'current_site_name',
      'current_site_code',
      'current_site_shift_in',
      'current_site_shift_out',
      'current_site_province_name',
      'current_site_lgu_name',
    ]);
  },

  async getAttendanceLogs(startDate?: string, endDate?: string): Promise<GuestAttendanceLog[]> {
    await ensureSeedData();
    const logs = await readLogs();
    return logs.filter((log) => {
      const dateOnly = normalizeDateOnly(log.date || log.attendance_date);
      if (!dateOnly) return false;
      if (startDate && dateOnly < startDate) return false;
      if (endDate && dateOnly > endDate) return false;
      return true;
    });
  },

  async recordAttendance(action: GuestAttendanceAction): Promise<GuestAttendanceLog> {
    const now = new Date();
    const date = formatDate(now);
    const time = formatTime(now);

    const logs = await readLogs();
    // Keep one latest entry per day/action so Home always reflects the most recent tap.
    const withoutSameActionToday = logs.filter((log) => {
      const logDate = normalizeDateOnly(log.date || log.attendance_date);
      return !(logDate === date && log.action === action);
    });
    const newLog: GuestAttendanceLog = {
      id: `guest-${now.getTime()}-${action}`,
      date,
      attendance_date: date,
      time,
      action,
      site_name: DEFAULT_SITE.name,
      site_id: DEFAULT_SITE.id,
      site: { id: DEFAULT_SITE.id, site_name: DEFAULT_SITE.name },
    };

    withoutSameActionToday.push(newLog);
    await writeLogs(withoutSameActionToday);
    await cacheSiteContext();
    return newLog;
  },
};
