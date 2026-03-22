import AsyncStorage from '@react-native-async-storage/async-storage';
import guestDemoService from './guestDemoService';

const BASE_URL = 'https://api.rds.ismis.com.ph';

export interface LoginResponse {
  success: boolean;
  access_token?: string;
  user?: {
    id: number;
    employee_id: number;
    name: string;
    company_id: number;
    email: string;
  };
  employee_id?: number;
  company_id?: number;
  name?: string;
  message: string;
}

class AuthService {
  /**
   * Login method - matches the Flutter implementation
   */
  async login(email: string, password: string): Promise<LoginResponse> {
    const url = `${BASE_URL}/api/mobile-login`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      // Get response text first for debugging
      const responseText = await response.text();
      console.log('Raw API Response:', responseText);

      if (response.status === 200) {
        // Parse the JSON from text
        const data = JSON.parse(responseText);

        // Save employee_id, name, and company_id to AsyncStorage
        console.log('=== LOGIN API RESPONSE DEBUG ===');
        console.log('Full API response:', JSON.stringify(data, null, 2));
        console.log('User object:', JSON.stringify(data.user, null, 2));
        console.log('================================');
        
        // The API should return employee_id - this is the actual employee.id from employees table
        // NOT the user.id from users table
        await AsyncStorage.setItem('employee_id', String(data.user.employee_id));
        await AsyncStorage.setItem('user_id', String(data.user.id));
        await AsyncStorage.setItem('userName', data.user.name);
        await AsyncStorage.setItem('access_token', data.access_token);
        await AsyncStorage.removeItem('is_guest');

        // Extract and save company_id from user data
        if (data.user.company_id != null) {
          const companyId = data.user.company_id as number;
          await AsyncStorage.setItem('user_company_id', String(companyId));
          console.log('Parsed Company ID:', companyId);
        } else {
          console.log('No company_id found in user data');
        }

        if (data.user.area_id != null) {
          await AsyncStorage.setItem('user_area_id', String(data.user.area_id));
          console.log('Parsed Area ID:', data.user.area_id);
        }

        console.log('Parsed Name:', data.user.name);
        console.log('Employee ID stored:', data.user.employee_id);
        console.log('User ID stored:', data.user.id);

        return {
          success: true,
          access_token: data.access_token,
          user: data.user,
          employee_id: data.user.employee_id,
          company_id: data.user.company_id,
          message: 'Login successful',
          name: data.user.name,
        };
      } else {
        // Handle non-JSON error responses
        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          const error = JSON.parse(responseText);
          return { success: false, message: error.message || 'Login failed' };
        } else {
          return { success: false, message: 'Unexpected response from server' };
        }
      }
    } catch (e) {
      console.error('Login error:', e);
      return {
        success: false,
        message: `Login failed: ${e}`,
      };
    }
  }

  async loginAsGuest(): Promise<LoginResponse> {
    try {
      await this.logout();
      await guestDemoService.enterGuestMode();
      await AsyncStorage.setItem('is_guest', 'true');
      await AsyncStorage.multiSet([
        ['employee_id', '900001'],
        ['user_id', '900001'],
        ['userName', 'Guest User'],
        ['user_company_id', '0'],
        ['user_area_id', '0'],
      ]);

      return {
        success: true,
        message: 'Guest login successful',
        employee_id: 900001,
        company_id: 0,
        name: 'Guest User',
      };
    } catch (e) {
      return {
        success: false,
        message: `Guest login failed: ${e}`,
      };
    }
  }

  /**
   * Logout method - clears all stored data
   */
  async logout(): Promise<void> {
    try {
      await AsyncStorage.multiRemove([
        'employee_id',
        'user_id',
        'userName',
        'user_company_id',
        'user_branch_id',
        'user_area_id',
        'access_token',
        'is_guest',
      ]);
      await guestDemoService.clearGuestData();
      console.log('Logout successful - all data cleared');
    } catch (e) {
      console.error('Logout error:', e);
    }
  }

  /**
   * Check if user is logged in
   */
  async isLoggedIn(): Promise<boolean> {
    try {
      const isGuest = await AsyncStorage.getItem('is_guest');
      if (isGuest === 'true') return true;
      const token = await AsyncStorage.getItem('access_token');
      return token !== null;
    } catch (e) {
      console.error('Error checking login status:', e);
      return false;
    }
  }

  /**
   * Get stored user data
   */
  async getUserData(): Promise<{
    employee_id: string | null;
    user_id: string | null;
    userName: string | null;
    user_company_id: string | null;
    user_branch_id: string | null;
    user_area_id: string | null;
    access_token: string | null;
    is_guest: string | null;
  }> {
    try {
      const [employee_id, user_id, userName, user_company_id, user_branch_id, user_area_id, access_token, is_guest] = await AsyncStorage.multiGet([
        'employee_id',
        'user_id',
        'userName',
        'user_company_id',
        'user_branch_id',
        'user_area_id',
        'access_token',
        'is_guest',
      ]);

      return {
        employee_id: employee_id[1],
        user_id: user_id[1],
        userName: userName[1],
        user_company_id: user_company_id[1],
        user_branch_id: user_branch_id[1],
        user_area_id: user_area_id[1],
        access_token: access_token[1],
        is_guest: is_guest[1],
      };
    } catch (e) {
      console.error('Error getting user data:', e);
      return {
        employee_id: null,
        user_id: null,
        userName: null,
        user_company_id: null,
        user_branch_id: null,
        user_area_id: null,
        access_token: null,
        is_guest: null,
      };
    }
  }

  /**
   * Fetch Time Entry History (Attendance Logs)
   */
  async getTimeEntryHistory(
    employeeId: number,
    accessToken: string,
    startDate?: string,
    endDate?: string
  ): Promise<{
    success: boolean;
    data?: any[];
    message?: string;
  }> {
    const activeUser = await this.getUserData();
    if (activeUser.is_guest === 'true') {
      const guestRows = await guestDemoService.getAttendanceLogs(startDate, endDate);
      return {
        success: true,
        data: guestRows,
      };
    }

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    const parseJsonSafe = (text: string): any => {
      try {
        return text ? JSON.parse(text) : null;
      } catch {
        return null;
      }
    };

    const extractRows = (payload: any, depth: number = 0): any[] => {
      if (depth > 6 || payload == null) return [];
      if (Array.isArray(payload)) return payload;
      if (typeof payload !== 'object') return [];

      const candidates = [
        payload.data,
        payload.records,
        payload.result,
        payload.results,
        payload.list,
        payload.items,
        payload.rows,
      ];

      for (const candidate of candidates) {
        if (Array.isArray(candidate)) return candidate;
      }

      for (const candidate of candidates) {
        if (candidate && typeof candidate === 'object') {
          const nested = extractRows(candidate, depth + 1);
          if (nested.length > 0) return nested;
        }
      }

      if (
        payload.id != null &&
        (payload.date || payload.attendance_date || payload.time || payload.time_in || payload.time_out || payload.out_time)
      ) {
        return [payload];
      }

      return [];
    };

    const normalizeDateOnly = (value: any): string => {
      const raw = String(value || '').trim();
      if (!raw) return '';
      if (raw.includes('T')) return raw.split('T')[0];
      if (raw.includes(' ')) return raw.split(' ')[0];
      const dateMatch = raw.match(/\d{4}-\d{2}-\d{2}/);
      if (dateMatch) return dateMatch[0];
      return raw.length >= 10 ? raw.substring(0, 10) : raw;
    };

    const normalizeAction = (value: any): string =>
      String(value || '').trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');

    const normalizeTime = (value: any): string => {
      const raw = String(value || '').trim();
      if (!raw) return '';
      if (raw.includes('T')) {
        const t = raw.split('T')[1] || '';
        return t.split('.')[0];
      }
      if (raw.includes(' ')) {
        const t = raw.split(' ')[1] || raw;
        return t.split('.')[0];
      }
      return raw.split('.')[0];
    };

    const withinRange = (dateOnly: string): boolean => {
      if (!dateOnly) return false;
      if (startDate && dateOnly < startDate) return false;
      if (endDate && dateOnly > endDate) return false;
      return true;
    };

    const normalizeHistoryRows = (rows: any[]): any[] => {
      return rows
        .flatMap((row: any) => {
          const action = normalizeAction(row.action);
          const inferredAction = action.includes('out') ? 'time_out' : action.includes('in') ? 'time_in' : '';
          const dateOnly =
            normalizeDateOnly(
              row.date ||
                row.attendance_date ||
                row.created_at ||
                row.timestamp ||
                row.time ||
                row.time_in ||
                row.time_out ||
                row.out_time
            ) ||
            startDate ||
            endDate ||
            '';

          const rawTime =
            row.time ||
            row.time_in ||
            row.time_out ||
            row.out_time ||
            row.attendance_time ||
            row.timestamp ||
            row.created_at ||
            '';
          const time = normalizeTime(rawTime);
          const base = {
            id: row.id ?? row.guard_attendance_id ?? undefined,
            date: dateOnly,
            attendance_date: dateOnly,
            site_name:
              row.site_name ||
              row.branch_name ||
              row.site?.site_name ||
              row.branch?.branch_name ||
              undefined,
            site_id: row.site_id || row.branch_id || row.site?.id || row.branch?.id || undefined,
            site: row.site || row.branch || undefined,
            raw: row,
          };

          // If action is missing but both time_in and time_out exist, split into two records.
          if (!inferredAction && row.time_in && row.time_out) {
            return [
              {
                ...base,
                time: normalizeTime(row.time_in),
                action: 'time_in',
              },
              {
                ...base,
                time: normalizeTime(row.time_out),
                action: 'time_out',
              },
            ];
          }

          return [
            {
              ...base,
              time,
              action: inferredAction || (row.time_out ? 'time_out' : 'time_in'),
            },
          ];
        })
        .filter((item: any) => withinRange(item.date));
    };

    // Primary source: mp-guards-attendance (fixed API endpoint)
    const fallbackUrls: string[] = [];
    fallbackUrls.push(`${BASE_URL}/api/mp-guards-attendance?employee_id=${employeeId}`);
    if (startDate && endDate) {
      fallbackUrls.push(
        `${BASE_URL}/api/mp-guards-attendance?employee_id=${employeeId}&start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}`
      );
    }

    for (const url of fallbackUrls) {
      try {
        console.log('[HISTORY] Attempting mp-guard-attendance fetch:', url);
        const response = await fetch(url, { method: 'GET', headers });
        const rawText = await response.text();
        console.log('[HISTORY] mp-guard-attendance raw response:', rawText.substring(0, 500));
        const parsed = parseJsonSafe(rawText);
        console.log('[HISTORY] Parsed JSON:', JSON.stringify(parsed, null, 2).substring(0, 500));
        const rows = extractRows(parsed);
        console.log('[HISTORY] Extracted rows count:', rows.length);
        if (rows.length > 0) {
          console.log('[HISTORY] First extracted row:', JSON.stringify(rows[0], null, 2));
        }
        const normalizedRows = normalizeHistoryRows(rows);
        console.log('[HISTORY] Normalized rows count:', normalizedRows.length);
        if (normalizedRows.length > 0) {
          console.log('[HISTORY] First normalized row:', JSON.stringify(normalizedRows[0], null, 2));
        }
        if (response.ok && normalizedRows.length > 0) {
          console.log('[HISTORY] ✅ Successfully fetched mp-guard-attendance history');
          return { success: true, data: normalizedRows };
        }
        console.log('[HISTORY] mp-guard-attendance returned', response.status, 'with', normalizedRows.length, 'usable rows');
      } catch (e) {
        console.warn('[HISTORY] Primary mp history fetch failed for URL:', url, e);
      }
    }

    // Secondary source: attendance logs endpoint
    try {
      let urlString = `${BASE_URL}/api/attendance-logs/employee?employee_id=${employeeId}&fields=date,attendance_date,time,time_in,time_out,out_time,action,branch_name,branch_id,branch,person_name,company_name,site_name,shift_in,shift_out`;
      if (startDate) urlString += `&start_date=${startDate}`;
      if (endDate) urlString += `&end_date=${endDate}`;

      console.log('[HISTORY] Attempting attendance-logs fetch:', urlString);
      const response = await fetch(urlString, { method: 'GET', headers });
      const rawText = await response.text();
      console.log('[HISTORY] attendance-logs raw response:', rawText.substring(0, 500));
      const parsed = parseJsonSafe(rawText);
      console.log('[HISTORY] Parsed from attendance-logs:', JSON.stringify(parsed, null, 2).substring(0, 500));
      const rows = extractRows(parsed);
      console.log('[HISTORY] Extracted rows from attendance-logs:', rows.length);
      if (rows.length > 0) {
        console.log('[HISTORY] First extracted row:', JSON.stringify(rows[0], null, 2));
      }
      const normalizedRows = normalizeHistoryRows(rows);
      console.log('[HISTORY] Normalized rows from attendance-logs:', normalizedRows.length);
      if (normalizedRows.length > 0) {
        console.log('[HISTORY] First normalized row:', JSON.stringify(normalizedRows[0], null, 2));
      }

      if (response.ok && normalizedRows.length > 0) {
        console.log('[HISTORY] ✅ Successfully fetched attendance-logs history');
        return { success: true, data: normalizedRows };
      }
      console.log('[HISTORY] attendance-logs returned', response.status, 'with', normalizedRows.length, 'usable rows');
    } catch (e) {
      console.warn('[HISTORY] Secondary attendance logs fetch failed.', e);
    }

    console.log('[HISTORY] ❌ Both history endpoints failed or returned empty');
    return {
      success: true,
      data: [],
      message: 'No attendance logs found for the selected period.',
    };
  }

  /**
   * Fetch a user's basic info by user ID to resolve reviewer names.
   * Tries common REST paths; returns name when available.
   */
  async getUserById(userId: number | string, accessToken?: string): Promise<{
    success: boolean;
    name?: string;
    user?: any;
    message?: string;
  }> {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

    const idStr = String(userId).trim();
    const candidates = [
      `${BASE_URL}/api/users/${idStr}`,
      `${BASE_URL}/api/user/${idStr}`,
      `${BASE_URL}/api/users?id=${encodeURIComponent(idStr)}`,
      `${BASE_URL}/api/user?id=${encodeURIComponent(idStr)}`,
      `${BASE_URL}/api/users/find?id=${encodeURIComponent(idStr)}`,
      `${BASE_URL}/api/users/show/${encodeURIComponent(idStr)}`,
    ];

    for (const url of candidates) {
      try {
        console.log('DEBUG: getUserById -> requesting', url);
        const resp = await fetch(url, { method: 'GET', headers });
        const rawText = await resp.text();
        let parsed: any = null;
        try { parsed = rawText ? JSON.parse(rawText) : null; } catch { parsed = null; }

        console.log('DEBUG: getUserById status', resp.status);
        if (resp.status === 200 && parsed) {
          // Attempt to extract name from common response shapes
          const user = parsed.user || parsed.data || parsed;
          const name = (user && (user.name || user.full_name || user.username)) || undefined;
          return { success: true, name, user };
        }
      } catch (e) {
        console.log('DEBUG: getUserById error for candidate', url, e);
        // continue to next candidate
      }
    }

    return { success: false, message: 'User lookup failed' };
  }
}

export default new AuthService();
