/**
 * Site Service - Unified domain model for location-based assignments
 *
 * This service provides a site-first abstraction over the legacy branch-based system.
 * It uses an adapter pattern to map branch payloads into site-shaped objects until
 * the backend provides native site APIs.
 *
 * Feature flag: site_mode_enabled (false = use branch fallback adapter)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import branchService, { Branch } from './branchService';

/**
 * Site domain object - represents a unified location/assignment context
 */
export interface Site {
  id: number;
  name: string;
  code?: string;
  latitude: number;
  longitude: number;
  radius: number; // meters
  clusterName?: string;
  areaName?: string;
  // Optional: shift times if applicable (may be removed in future)
  weekdayIn?: string;
  weekdayOut?: string;
  weekendIn?: string;
  weekendOut?: string;
}

/**
 * User's current site context for the session
 */
export interface SiteContext {
  siteId: number;  
  siteName: string;
  latitude: number;
  longitude: number;
  radius: number;
  clusterName?: string;
  areaName?: string;
}

class SiteServiceImpl {
  /**
   * Adapter: Convert legacy Branch object to Site domain object
   */
  private adaptBranchToSite(branch: Branch): Site {
    return {
      id: branch.id,
      name: branch.branch_name,
      code: branch.branch_code,
      latitude: typeof branch.latitude === 'string' ? parseFloat(branch.latitude) : branch.latitude,
      longitude: typeof branch.longitude === 'string' ? parseFloat(branch.longitude) : branch.longitude,
      radius: typeof branch.radius === 'string' ? parseFloat(branch.radius) : branch.radius,
      clusterName: branch.cluster_name,
      areaName: branch.area_name,
      weekdayIn: branch.weekday_in,
      weekdayOut: branch.weekday_out,
      weekendIn: branch.weekend_in,
      weekendOut: branch.weekend_out,
    };
  }

  /**
   * Get nearby sites for current location
   * Currently uses branch fallback; will switch to site API when available
   */
  async getNearby(latitude: number, longitude: number, companyId: number): Promise<Site[]> {
    try {
      // TODO: When site API is ready, replace with:
      // const response = await fetch(`${BASE_URL}/api/sites?company_id=${companyId}&latitude=${latitude}&longitude=${longitude}`)
      // return response.json().data.map(s => this.normalizeSiteResponse(s))

      // FALLBACK: Use existing branch endpoint
      const response = await fetch(
        `https://api.rds.ismis.com.ph/api/branches/by-company?company_id=${companyId}&latitude=${latitude}&longitude=${longitude}`
      );
      if (!response.ok) return [];
      const data = await response.json();
      const branches = Array.isArray(data.data) ? data.data : [];
      return branches.map((b: Branch) => this.adaptBranchToSite(b));
    } catch (error) {
      console.error('Error fetching nearby sites:', error);
      return [];
    }
  }

  /**
   * Get site details by ID
   * Currently uses branch fallback; will switch to site API when available
   */
  async getById(siteId: number): Promise<Site | null> {
    try {
      // TODO: When site API is ready, replace with:
      // const response = await fetch(`${BASE_URL}/api/sites/${siteId}`)
      // return this.normalizeSiteResponse(response.json())

      // FALLBACK: Use existing branch service
      const branch = await branchService.getBranchById(siteId);
      if (!branch) return null;
      return this.adaptBranchToSite(branch);
    } catch (error) {
      console.error('Error fetching site by ID:', error);
      return null;
    }
  }

  /**
   * Calculate distance between two coordinates (in meters)
   * Reuses existing branch service logic
   */
  calculateDistance(
    userLat: number,
    userLon: number,
    siteLat: number,
    siteLon: number
  ): number {
    const R = 6371 * 1000; // Earth's radius in meters
    const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

    const userLatRad = toRadians(userLat);
    const userLonRad = toRadians(userLon);
    const siteLatRad = toRadians(siteLat);
    const siteLonRad = toRadians(siteLon);

    const cosValue =
      Math.cos(userLatRad) *
        Math.cos(siteLatRad) *
        Math.cos(siteLonRad - userLonRad) +
      Math.sin(userLatRad) * Math.sin(siteLatRad);

    const clampedCosValue = Math.max(-1, Math.min(1, cosValue));
    const distance = R * Math.acos(clampedCosValue);
    return distance;
  }

  /**
   * Find the nearest valid site (within geofence radius)
   * Returns null if no site is within range
   */
  async findNearestValidSite(
    latitude: number,
    longitude: number,
    sites: Site[]
  ): Promise<Site | null> {
    if (sites.length === 0) return null;

    let nearest: Site | null = null;
    let nearestDistance = Infinity;

    for (const site of sites) {
      const distance = this.calculateDistance(latitude, longitude, site.latitude, site.longitude);
      const radiusMeters = site.radius;

      // Check if within geofence
      if (distance <= radiusMeters && distance < nearestDistance) {
        nearest = site;
        nearestDistance = distance;
      }
    }

    return nearest;
  }

  /**
   * Save current site context to AsyncStorage for session
   */
  async setCurrentSite(site: Site): Promise<void> {
    try {
      await AsyncStorage.setItem('current_site_id', String(site.id));
      await AsyncStorage.setItem('current_site_name', site.name);
      await AsyncStorage.setItem('current_site_latitude', String(site.latitude));
      await AsyncStorage.setItem('current_site_longitude', String(site.longitude));
      await AsyncStorage.setItem('current_site_radius', String(site.radius));
      if (site.clusterName) await AsyncStorage.setItem('current_site_cluster', site.clusterName);
      if (site.areaName) await AsyncStorage.setItem('current_site_area', site.areaName);
      if (site.code) await AsyncStorage.setItem('current_site_code', site.code);
      // Also set shift times if available (for backward compat with reminders)
      if (site.weekdayIn) await AsyncStorage.setItem('branch_weekday_in', site.weekdayIn);
      if (site.weekdayOut) await AsyncStorage.setItem('branch_weekday_out', site.weekdayOut);
      if (site.weekendIn) await AsyncStorage.setItem('branch_weekend_in', site.weekendIn);
      if (site.weekendOut) await AsyncStorage.setItem('branch_weekend_out', site.weekendOut);
      console.log('[SiteService] Current site set:', site.id, site.name);
    } catch (error) {
      console.error('Error saving current site:', error);
    }
  }

  /**
   * Get current site context from AsyncStorage
   */
  async getCurrentSite(): Promise<SiteContext | null> {
    try {
      const [siteId, siteName, latitude, longitude, radius] = await AsyncStorage.multiGet([
        'current_site_id',
        'current_site_name',
        'current_site_latitude',
        'current_site_longitude',
        'current_site_radius',
      ]);

      if (!siteId[1] || !siteName[1]) return null;

      return {
        siteId: Number(siteId[1]),
        siteName: siteName[1],
        latitude: parseFloat(latitude[1] || '0'),
        longitude: parseFloat(longitude[1] || '0'),
        radius: parseFloat(radius[1] || '0'),
      };
    } catch (error) {
      console.error('Error loading current site:', error);
      return null;
    }
  }

  /**
   * Clear current site context (e.g., on logout)
   */
  async clearCurrentSite(): Promise<void> {
    try {
      await AsyncStorage.multiRemove([
        'current_site_id',
        'current_site_name',
        'current_site_latitude',
        'current_site_longitude',
        'current_site_radius',
        'current_site_cluster',
        'current_site_area',
        'current_site_code',
      ]);
    } catch (error) {
      console.error('Error clearing current site:', error);
    }
  }
}

export default new SiteServiceImpl();
