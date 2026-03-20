import authService from './authService';

const BASE_URL = 'https://api.rds.ismis.com.ph/api/paydata';

export interface PayslipData {
  employee_id: number;
  employee_name?: string;
  company_id: number;
  pay_start: string;
  pay_end: string;
  basic_pay?: number;
  overtime_pay?: number;
  deductions?: number;
  net_pay?: number;
  [key: string]: any; // Allow for additional fields from API
}

async function safeParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export default {
  /**
   * Fetch payslip data for a given employee and pay period.
   * Calls: GET /api/paydata/view?company_id=...&pay_start=...&pay_end=...&employee_id=...
   */
  fetchPayslip: async (
    companyId: number,
    payStart: string,
    payEnd: string,
    employeeId: number
  ) => {
    try {
      const user = await authService.getUserData();
      const token = user?.access_token;

      const url = `${BASE_URL}/view?company_id=${encodeURIComponent(
        String(companyId)
      )}&pay_start=${encodeURIComponent(payStart)}&pay_end=${encodeURIComponent(
        payEnd
      )}&employee_id=${encodeURIComponent(String(employeeId))}`;

      console.log('DEBUG: Fetching payslip from:', url);

      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
      });

      const text = await res.text();
      const data = await safeParse(text);

      console.log('DEBUG: Payslip API response:', data);

      return { success: res.ok, status: res.status, data };
    } catch (e: any) {
      console.error('Error fetching payslip:', e);
      return { success: false, error: e.message || e };
    }
  },

  /**
   * Get available pay periods (if API provides this endpoint)
   * This is a placeholder - adjust based on your actual API
   */
  getPayPeriods: async (companyId: number, employeeId: number) => {
    try {
      const user = await authService.getUserData();
      const token = user?.access_token;

      const url = `${BASE_URL}/periods?company_id=${encodeURIComponent(
        String(companyId)
      )}&employee_id=${encodeURIComponent(String(employeeId))}`;

      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
      });

      const text = await res.text();
      const data = await safeParse(text);

      return { success: res.ok, status: res.status, data };
    } catch (e: any) {
      console.error('Error fetching pay periods:', e);
      return { success: false, error: e.message || e };
    }
  },

  /**
   * Download Payslip PDF
   */
  downloadPayslipPDF: async (
    companyId: number,
    payStart: string,
    payEnd: string,
    employeeId: number
  ) => {
    try {
      const user = await authService.getUserData();
      const token = user?.access_token;

      // Try different possible endpoints
      const endpoints = [
        `https://api.rds.ismis.com.ph/api/paydata/pdf?company_id=${encodeURIComponent(
          String(companyId)
        )}&pay_start=${encodeURIComponent(payStart)}&pay_end=${encodeURIComponent(
          payEnd
        )}&employee_id=${encodeURIComponent(String(employeeId))}`,
        `https://api.rds.ismis.com.ph/api/generate-pdf/payslip?company_id=${encodeURIComponent(
          String(companyId)
        )}&pay_start=${encodeURIComponent(payStart)}&pay_end=${encodeURIComponent(
          payEnd
        )}&employee_id=${encodeURIComponent(String(employeeId))}`,
      ];

      for (const url of endpoints) {
        console.log('DEBUG: Trying payslip PDF endpoint:', url);

        const res = await fetch(url, {
          method: 'GET',
          headers: {
            Accept: 'application/pdf',
            Authorization: token ? `Bearer ${token}` : '',
          },
        });

        console.log('DEBUG: Response status:', res.status);

        if (res.status === 200) {
          const blob = await res.blob();
          console.log('DEBUG: PDF blob size:', blob.size);
          return { success: true, data: blob };
        } else if (res.status !== 404) {
          // If not 404, log the error and don't try other endpoints
          const text = await res.text();
          console.log('DEBUG: Error response:', text);
          return { success: false, error: `Failed to download payslip PDF (Status: ${res.status})` };
        }
      }

      return { success: false, error: 'Payslip PDF endpoint not found. Please contact support.' };
    } catch (e: any) {
      console.error('Error downloading payslip PDF:', e);
      return { success: false, error: e.message || String(e) };
    }
  },
};
