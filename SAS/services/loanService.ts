import authService from './authService';

const BASE = 'https://api.rds.ismis.com.ph/api';

async function safeParse(text: string) {
  try { return JSON.parse(text); } catch { return text; }
}

export default {
  /**
   * Fetch loans for an employee and company
   * GET /api/employee-loans/getloan?employee_id=...&company_id=...
   */
  getLoans: async (employeeId: number, companyId: number) => {
    try {
      const user = await authService.getUserData();
      const token = user?.access_token;
      const url = `${BASE}/employee-loans/getloan?employee_id=${encodeURIComponent(String(employeeId))}&company_id=${encodeURIComponent(String(companyId))}`;
      const res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json', Authorization: token ? `Bearer ${token}` : '' } });
      const text = await res.text();
      const data = await safeParse(text);
      return { success: res.ok, status: res.status, data };
    } catch (e: any) {
      return { success: false, error: e.message || e };
    }
  }
};
