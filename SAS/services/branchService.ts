import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL = 'https://api.rds.ismis.com.ph';

export interface Branch {
  id: number;
  branch_name: string;
  branch_code?: string;
  latitude: string | number;
  longitude: string | number;
  radius: string | number;
  address?: string;
  distance?: number;
  weekday_in?: string;
  weekday_out?: string;
  weekend_in?: string;
  weekend_out?: string;
  shift?: string;
  cluster_name?: string;
  area_name?: string;
  area_id?: number;
}

export interface BranchesResponse {
  success: boolean;
  branches: Branch[];
  message?: string;
}

class BranchService {
  /**
   * Calculate distance between two coordinates in meters using Great Circle Distance formula
   */
  private calculateDistance(
    userLat: number,
    userLon: number,
    branchLat: number,
    branchLon: number
  ): number {
    const R = 6371 * 1000; // Earth's radius in meters

    const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

    const userLatRad = toRadians(userLat);
    const userLonRad = toRadians(userLon);
    const branchLatRad = toRadians(branchLat);
    const branchLonRad = toRadians(branchLon);

    const cosValue =
      Math.cos(userLatRad) *
        Math.cos(branchLatRad) *
        Math.cos(branchLonRad - userLonRad) +
      Math.sin(userLatRad) * Math.sin(branchLatRad);

    const clampedCosValue = Math.max(-1, Math.min(1, cosValue));
    const distance = R * Math.acos(clampedCosValue);

    return distance;
  }

  /**
   * Fetch branch details by ID. Tries common REST patterns and falls back gracefully.
   */
  async getBranchById(id: number): Promise<Branch | null> {
    try {
      const accessToken = await AsyncStorage.getItem('access_token');
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      };
      
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }
      
      const endpoints = [
        `${BASE_URL}/api/sites/${id}`,
        `${BASE_URL}/api/sites/show?id=${id}`,
        `${BASE_URL}/api/branches/${id}`,
        `${BASE_URL}/api/branches/show?id=${id}`,
      ];

      for (const url of endpoints) {
        try {
          console.log('DEBUG: Fetching branch from:', url);
          const res = await fetch(url, { headers });
          console.log('DEBUG: Branch API response status:', res.status);
          if (!res.ok) continue;
          const data: any = await res.json();
          console.log('DEBUG: Branch API response data:', JSON.stringify(data));
          // Normalize response -- may be object or { data: object }
          const branch = Array.isArray(data) ? data[0] : data.data || data;
          if (branch && branch.id) {
            console.log('DEBUG: Found branch:', branch.branch_name || branch.name);
            return branch as Branch;
          }
        } catch (e) {
          console.log('DEBUG: Error with endpoint:', url, e);
          // try next
        }
      }

      return null;
    } catch (e) {
      console.error('Error fetching branch by id:', e);
      return null;
    }
  }

  /**
   * Fetch branches by user's company ID and current location
   */
  async getBranchesByCompanyAndLocation(
    latitude: number,
    longitude: number
  ): Promise<BranchesResponse> {
    try {
      // Get user's company_id from AsyncStorage
      const userCompanyId = await AsyncStorage.getItem('user_company_id');
      
      if (!userCompanyId) {
        return {
          success: false,
          branches: [],
          message: 'User company ID not found. Please login again.',
        };
      }

      // Build API URL with query parameters
      const url = `${BASE_URL}/api/sites/by-company?company_id=${userCompanyId}&latitude=${latitude}&longitude=${longitude}`;
      console.log('Fetching branches from:', url);

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`API returned status ${response.status}`);
      }

      const data = await response.json() as any;

      // Handle different response formats
      const branchesArray: Branch[] = Array.isArray(data)
        ? data
        : data.data || data.branches || [];

      if (branchesArray.length === 0) {
        return {
          success: false,
          branches: [],
          message: 'No branches found for your company',
        };
      }

      // Process branches and calculate distances
      const processedBranches = branchesArray
        .map((branch) => {
          // Validate required fields
          if (!branch.latitude || !branch.longitude || !branch.radius) {
            console.log(`Branch "${branch.branch_name}" missing required fields`);
            return null;
          }

          // Convert to numbers
          const branchLat = parseFloat(branch.latitude.toString());
          const branchLon = parseFloat(branch.longitude.toString());
          const branchRadius = parseFloat(branch.radius.toString());

          // Validate numeric values
          if (isNaN(branchLat) || isNaN(branchLon) || isNaN(branchRadius)) {
            console.log(`Branch "${branch.branch_name}" has invalid numeric values`);
            return null;
          }

          // Calculate distance
          const distance = this.calculateDistance(
            latitude,
            longitude,
            branchLat,
            branchLon
          );

          // Use API-provided radius directly for geofence checks
          return {
            ...branch,
            distance,
            isWithinGeofence: distance <= branchRadius,
          };
        })
        .filter((branch): branch is Branch & { distance: number; isWithinGeofence: boolean } => 
          branch !== null
        )
        .sort((a, b) => a.distance - b.distance); // Sort by distance

      console.log(`Processed ${processedBranches.length} branches`);

      return {
        success: true,
        branches: processedBranches,
      };
    } catch (error) {
      console.error('Error fetching branches:', error);
      return {
        success: false,
        branches: [],
        message: `Failed to fetch branches: ${error}`,
      };
    }
  }

  /**
   * Get branches within geofence only
   */
  async getNearbyBranches(
    latitude: number,
    longitude: number
  ): Promise<BranchesResponse> {
    const result = await this.getBranchesByCompanyAndLocation(latitude, longitude);
    
    if (result.success) {
      // Filter only branches within their geofence
      const nearbyBranches = result.branches.filter(
        (branch: any) => branch.isWithinGeofence
      );

      return {
        success: nearbyBranches.length > 0,
        branches: nearbyBranches,
        message: nearbyBranches.length === 0 
          ? 'No branches found within their geofence radius'
          : undefined,
      };
    }

    return result;
  }

  /**
   * Fallback: Fetch branches by company without requiring device location.
   * Useful when GPS is unavailable or denied; returns unsorted list without distance.
   */
  async getBranchesByCompanyOnly(): Promise<BranchesResponse> {
    try {
      const userCompanyId = await AsyncStorage.getItem('user_company_id');
      if (!userCompanyId) {
        return {
          success: false,
          branches: [],
          message: 'User company ID not found. Please login again.',
        };
      }

      const url = `${BASE_URL}/api/sites/by-company?company_id=${userCompanyId}&latitude=&longitude=`;
      console.log('Fetching branches (no location) from:', url);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`API returned status ${response.status}`);
      }

      const data = await response.json() as any;
      const branchesArray: Branch[] = Array.isArray(data)
        ? data
        : data.data || data.branches || [];

      if (!branchesArray || branchesArray.length === 0) {
        return {
          success: false,
          branches: [],
          message: 'No branches found for your company',
        };
      }

      // Basic normalization; do not compute distance/geofence here
      const normalized = branchesArray.map((b) => ({
        ...b,
      }));

      return {
        success: true,
        branches: normalized,
      };
    } catch (error) {
      console.error('Error fetching branches (no location):', error);
      return {
        success: false,
        branches: [],
        message: `Failed to fetch branches: ${error}`,
      };
    }
  }

  /**
   * Get branches within a given display radius (in meters), regardless of geofence.
   * Mirrors legacy behavior to populate a nearby list even when geofence is strict.
   */
  async getBranchesWithinDisplayRadius(
    latitude: number,
    longitude: number,
    radiusMeters: number
  ): Promise<BranchesResponse> {
    const result = await this.getBranchesByCompanyAndLocation(latitude, longitude);
    if (!result.success) return result;

    const withinRadius = result.branches.filter(
      (b: any) => typeof b.distance === 'number' && b.distance <= radiusMeters
    );

    return {
      success: withinRadius.length > 0,
      branches: withinRadius,
      message: withinRadius.length === 0
        ? `No branches found within ${radiusMeters} meters`
        : undefined,
    };
  }
}

export default new BranchService();
