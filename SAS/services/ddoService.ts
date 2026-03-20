const BASE_URL = 'https://api.rds.ismis.com.ph';

export interface DDOItem {
  id: number;
  [key: string]: any;
}

export interface DDOResponse {
  success: boolean;
  data?: any;
  message?: string;
}

class DDOService {
  /**
   * Fetch DDO List for an employee
   */
  async getDDOList(employeeId: number, accessToken: string): Promise<DDOResponse> {
    const url = `${BASE_URL}/api/ddo?employee_id=${employeeId}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      });

      if (response.status === 200) {
        const data = await response.json() as any;
        return {
          success: true,
          data: data.data || [],
        };
      } else {
        const error = await response.json() as any;
        return {
          success: false,
          message: error.message || 'Failed to fetch DDO list',
        };
      }
    } catch (e) {
      console.error('Error fetching DDO list:', e);
      return {
        success: false,
        message: `An error occurred while fetching DDO list: ${e}`,
      };
    }
  }

  /**
   * Fetch DDO Details by ID
   */
  async getDDODetails(ddoId: number, accessToken: string): Promise<DDOResponse> {
    const url = `${BASE_URL}/api/ddo/${ddoId}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      });

      if (response.status === 200) {
        const data = await response.json() as any;
        return {
          success: true,
          data: data.data,
        };
      } else {
        const error = await response.json() as any;
        return {
          success: false,
          message: error.message || 'Failed to fetch DDO details',
        };
      }
    } catch (e) {
      console.error('Error fetching DDO details:', e);
      return {
        success: false,
        message: `An error occurred while fetching DDO details: ${e}`,
      };
    }
  }

  /**
   * Download DDO PDF
   */
  async downloadDDOPDF(
    companyId: number, 
    branchId: number, 
    employeeId: number, 
    accessToken: string
  ): Promise<DDOResponse> {
    const url = `${BASE_URL}/api/ddo/pdf?company_id=${companyId}&branch_id=${branchId}&employee_id=${employeeId}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/pdf',
        },
      });

      if (response.status === 200) {
        const blob = await response.blob();
        return {
          success: true,
          data: blob,
        };
      } else {
        return {
          success: false,
          message: 'Failed to download DDO PDF',
        };
      }
    } catch (e) {
      console.error('Error downloading DDO PDF:', e);
      return {
        success: false,
        message: `An error occurred while downloading DDO PDF: ${e}`,
      };
    }
  }

  /**
   * Fetch Assignment Order List for an employee
   */
  async getAOList(employeeId: number, accessToken: string): Promise<DDOResponse> {
    const url = `${BASE_URL}/api/assignment-order?employee_id=${employeeId}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      });

      if (response.status === 200) {
        const data = await response.json() as any;
        return {
          success: true,
          data: data.data || [],
        };
      } else {
        const error = await response.json() as any;
        return {
          success: false,
          message: error.message || 'Failed to fetch Assignment Order list',
        };
      }
    } catch (e) {
      console.error('Error fetching Assignment Order list:', e);
      return {
        success: false,
        message: `An error occurred while fetching Assignment Order list: ${e}`,
      };
    }
  }

  /**
   * Download Assignment Order PDF
   */
  async downloadAOPDF(
    companyId: number, 
    branchId: number, 
    employeeId: number, 
    accessToken: string
  ): Promise<DDOResponse> {
    const url = `${BASE_URL}/api/generate-pdf/ao?company_id=${companyId}&branch_id=${branchId}&employee_id=${employeeId}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/pdf',
        },
      });

      if (response.status === 200) {
        const blob = await response.blob();
        return {
          success: true,
          data: blob,
        };
      } else {
        return {
          success: false,
          message: 'Failed to download Assignment Order PDF',
        };
      }
    } catch (e) {
      console.error('Error downloading Assignment Order PDF:', e);
      return {
        success: false,
        message: `An error occurred while downloading Assignment Order PDF: ${e}`,
      };
    }
  }
}

export default new DDOService();
