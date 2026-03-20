import AsyncStorage from '@react-native-async-storage/async-storage';

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

        // Extract and save company_id from user data
        if (data.user.company_id != null) {
          const companyId = data.user.company_id as number;
          await AsyncStorage.setItem('user_company_id', String(companyId));
          console.log('Parsed Company ID:', companyId);
        } else {
          console.log('No company_id found in user data');
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
        'access_token',
      ]);
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
    access_token: string | null;
  }> {
    try {
      const [employee_id, user_id, userName, user_company_id, user_branch_id, access_token] = await AsyncStorage.multiGet([
        'employee_id',
        'user_id',
        'userName',
        'user_company_id',
        'user_branch_id',
        'access_token',
      ]);

      return {
        employee_id: employee_id[1],
        user_id: user_id[1],
        userName: userName[1],
        user_company_id: user_company_id[1],
        user_branch_id: user_branch_id[1],
        access_token: access_token[1],
      };
    } catch (e) {
      console.error('Error getting user data:', e);
      return {
        employee_id: null,
        user_id: null,
        userName: null,
        user_company_id: null,
        user_branch_id: null,
        access_token: null,
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
    // Use the correct attendance-logs endpoint with specific fields
    let urlString = `${BASE_URL}/api/attendance-logs/employee?employee_id=${employeeId}&fields=date,time,action,branch_name,branch_id,branch,guard_type`;

    if (startDate) urlString += `&start_date=${startDate}`;
    if (endDate) urlString += `&end_date=${endDate}`;

    console.log('DEBUG: Attendance Logs API URL:', urlString);

    try {
      const response = await fetch(urlString, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      });

      console.log('DEBUG: Attendance Logs API Status:', response.status);

      // Read raw text first to avoid JSON parse errors when server returns HTML or plain text
      const rawText = await response.text();
      let parsed: any = null;
      try {
        parsed = rawText ? JSON.parse(rawText) : null;
      } catch (parseErr) {
        parsed = null;
      }

      if (response.status === 200) {
        const data = parsed || [];
        console.log('DEBUG: Attendance Logs API Response (parsed):', JSON.stringify(data));
        return {
          success: true,
          data: (parsed && (parsed.data || parsed)) || [],
        };
      } else {
        const message = (parsed && (parsed.message || parsed.error)) || rawText || `Status ${response.status}`;
        console.error('DEBUG: Attendance Logs API non-OK response:', { status: response.status, body: rawText });
        return {
          success: false,
          message: message,
        };
      }
    } catch (e: any) {
      return {
        success: false,
        message: `An error occurred while fetching time entry history: ${e.message || e}`,
      };
    }
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
