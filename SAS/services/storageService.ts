/**
 * Storage Service - Centralized AsyncStorage key management
 *
 * Provides:
 * - Unified key definitions (old branch-based, new site-based)
 * - Migration helpers to read/write/delete keys safely
 * - Backward compatibility for legacy lookups
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Storage keys for site-based context (new)
 */
export const SITE_STORAGE_KEYS = {
  CURRENT_SITE_ID: 'current_site_id',
  CURRENT_SITE_NAME: 'current_site_name',
  CURRENT_SITE_LATITUDE: 'current_site_latitude',
  CURRENT_SITE_LONGITUDE: 'current_site_longitude',
  CURRENT_SITE_RADIUS: 'current_site_radius',
  CURRENT_SITE_CLUSTER: 'current_site_cluster',
  CURRENT_SITE_AREA: 'current_site_area',
  CURRENT_SITE_CODE: 'current_site_code',
};

/**
 * Storage keys for branch-based context (legacy, kept for backward compat)
 */
export const BRANCH_STORAGE_KEYS = {
  USER_BRANCH_ID: 'user_branch_id',
  USER_BRANCH_NAME: 'user_branch_name',
  USER_BRANCH_CODE: 'user_branch_code',
  BRANCH_CLUSTER_NAME: 'branch_cluster_name',
  BRANCH_AREA_NAME: 'branch_area_name',
  BRANCH_LATITUDE: 'branch_latitude',
  BRANCH_LONGITUDE: 'branch_longitude',
  BRANCH_RADIUS: 'branch_radius',
  BRANCH_WEEKDAY_IN: 'branch_weekday_in',
  BRANCH_WEEKDAY_OUT: 'branch_weekday_out',
  BRANCH_WEEKEND_IN: 'branch_weekend_in',
  BRANCH_WEEKEND_OUT: 'branch_weekend_out',
  BRANCH_SHIFT: 'branch_shift',
};

/**
 * Shift/guard context keys (legacy, to be deprecated)
 */
export const LEGACY_CONTEXT_KEYS = {
  GUARD_TYPE: 'guard_type',
  LAST_TIME_IN_BRANCH: 'last_time_in_branch',
  LAST_TIME_OUT_BRANCH: 'last_time_out_branch',
};

class StorageService {
  /**
   * Map legacy branch_id storage to site_id
   * During transition, branch_id can be reused as site_id since they refer to same location entity
   */
  async migrateBranchToSite(): Promise<void> {
    try {
      const branchId = await AsyncStorage.getItem(BRANCH_STORAGE_KEYS.USER_BRANCH_ID);
      if (branchId && !(await AsyncStorage.getItem(SITE_STORAGE_KEYS.CURRENT_SITE_ID))) {
        // Copy branch data to site keys
        const branchName = await AsyncStorage.getItem(BRANCH_STORAGE_KEYS.USER_BRANCH_NAME);
        const branchLat = await AsyncStorage.getItem(BRANCH_STORAGE_KEYS.BRANCH_LATITUDE);
        const branchLon = await AsyncStorage.getItem(BRANCH_STORAGE_KEYS.BRANCH_LONGITUDE);
        const branchRadius = await AsyncStorage.getItem(BRANCH_STORAGE_KEYS.BRANCH_RADIUS);

        if (branchName && branchLat && branchLon && branchRadius) {
          await AsyncStorage.multiSet([
            [SITE_STORAGE_KEYS.CURRENT_SITE_ID, branchId],
            [SITE_STORAGE_KEYS.CURRENT_SITE_NAME, branchName],
            [SITE_STORAGE_KEYS.CURRENT_SITE_LATITUDE, branchLat],
            [SITE_STORAGE_KEYS.CURRENT_SITE_LONGITUDE, branchLon],
            [SITE_STORAGE_KEYS.CURRENT_SITE_RADIUS, branchRadius],
          ]);
          console.log('[StorageService] Migrated branch to site context:', branchId);
        }
      }
    } catch (error) {
      console.error('[StorageService] Migration error:', error);
    }
  }

  /**
   * Get site ID from current context (checks site keys first, then legacy branch keys)
   */
  async getSiteId(): Promise<number | null> {
    try {
      let siteId = await AsyncStorage.getItem(SITE_STORAGE_KEYS.CURRENT_SITE_ID);
      if (siteId) return Number(siteId);

      // Fallback to legacy branch_id for backward compat
      const branchId = await AsyncStorage.getItem(BRANCH_STORAGE_KEYS.USER_BRANCH_ID);
      if (branchId) return Number(branchId);

      return null;
    } catch (error) {
      console.error('[StorageService] Error getting site ID:', error);
      return null;
    }
  }

  /**
   * Get site name from current context
   */
  async getSiteName(): Promise<string | null> {
    try {
      let siteName = await AsyncStorage.getItem(SITE_STORAGE_KEYS.CURRENT_SITE_NAME);
      if (siteName) return siteName;

      // Fallback to legacy branch_name
      return await AsyncStorage.getItem(BRANCH_STORAGE_KEYS.USER_BRANCH_NAME);
    } catch (error) {
      console.error('[StorageService] Error getting site name:', error);
      return null;
    }
  }

  /**
   * Get shift time (weekday_in or weekend_in based on context)
   * Kept for compatibility with reminders during transition
   */
  async getShiftInTime(isWeekend: boolean = false): Promise<string | null> {
    try {
      const key = isWeekend ? BRANCH_STORAGE_KEYS.BRANCH_WEEKEND_IN : BRANCH_STORAGE_KEYS.BRANCH_WEEKDAY_IN;
      return await AsyncStorage.getItem(key);
    } catch (error) {
      console.error('[StorageService] Error getting shift in time:', error);
      return null;
    }
  }

  /**
   * Get shift time (weekday_out or weekend_out based on context)
   * Kept for compatibility with reminders during transition
   */
  async getShiftOutTime(isWeekend: boolean = false): Promise<string | null> {
    try {
      const key = isWeekend ? BRANCH_STORAGE_KEYS.BRANCH_WEEKEND_OUT : BRANCH_STORAGE_KEYS.BRANCH_WEEKDAY_OUT;
      return await AsyncStorage.getItem(key);
    } catch (error) {
      console.error('[StorageService] Error getting shift out time:', error);
      return null;
    }
  }

  /**
   * Clear all site/branch context (used on logout)
   */
  async clearContext(): Promise<void> {
    try {
      const allKeys = [
        ...Object.values(SITE_STORAGE_KEYS),
        ...Object.values(BRANCH_STORAGE_KEYS),
        ...Object.values(LEGACY_CONTEXT_KEYS),
      ];
      await AsyncStorage.multiRemove(allKeys);
      console.log('[StorageService] Context cleared');
    } catch (error) {
      console.error('[StorageService] Error clearing context:', error);
    }
  }

  /**
   * Get guard type (legacy, kept for request compatibility only)
   */
  async getGuardType(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(LEGACY_CONTEXT_KEYS.GUARD_TYPE);
    } catch (error) {
      return null;
    }
  }

  /**
   * Save guard type (legacy, to be deprecated)
   */
  async setGuardType(guardType: string): Promise<void> {
    try {
      await AsyncStorage.setItem(LEGACY_CONTEXT_KEYS.GUARD_TYPE, guardType);
    } catch (error) {
      console.error('[StorageService] Error saving guard type:', error);
    }
  }
}

export default new StorageService();
