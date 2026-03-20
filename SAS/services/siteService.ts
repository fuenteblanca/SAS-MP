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
 * Site domain object - mirrors the sites table exactly
 */
export interface Site {
  id: number;
  companyId?: number;
  lguId?: number;
  code?: string;       // site_code
  siteType?: string;   // site_type
  withOt?: boolean;    // with_ot
  siteStatus?: string; // site_status
  name: string;        // site_name
  latitude: number;
  longitude: number;
  radius: number;
  shiftIn?: string;    // shift_in
  shiftOut?: string;   // shift_out
  shift?: string;
  provinceId?: number; // province_id
  clientId?: number;   // client_id
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
}

class SiteServiceImpl {
  /**
   * Adapter: Convert site/branch payload to Site domain object
   */
  private adaptToSite(row: any): Site {
    const rawLatitude = row.latitude ?? row.lat;
    const rawLongitude = row.longitude ?? row.lng ?? row.lon;
    const rawRadius = row.radius ?? row.site_radius ?? row.geofence_radius;

    const latitude =
      typeof rawLatitude === 'string' ? parseFloat(rawLatitude) : Number(rawLatitude);
    const longitude =
      typeof rawLongitude === 'string' ? parseFloat(rawLongitude) : Number(rawLongitude);

    let radius = typeof rawRadius === 'string' ? parseFloat(rawRadius) : Number(rawRadius);
    if (!Number.isFinite(radius) || radius <= 0) {
      radius = 75;
    }

    return {
      id: Number(row.id ?? 0),
      companyId: Number(row.company_id ?? 0) || undefined,
      lguId: Number(row.lgu_id ?? 0) || undefined,
      code: row.site_code ?? undefined,
      siteType: row.site_type ?? undefined,
      withOt: row.with_ot != null ? Boolean(row.with_ot) : undefined,
      siteStatus: row.site_status ?? undefined,
      name: String(row.site_name ?? row.name ?? ''),
      latitude,
      longitude,
      radius,
      shiftIn: row.shift_in ?? undefined,
      shiftOut: row.shift_out ?? undefined,
      shift: row.shift ?? undefined,
      provinceId: Number(row.province_id ?? 0) || undefined,
      clientId: Number(row.client_id ?? 0) || undefined,
    };
  }

  /**
   * Get nearby sites for current location
   * Currently uses branch fallback; will switch to site API when available
   */
  async getNearby(latitude: number, longitude: number, companyId: number): Promise<Site[]> {
    try {
      const endpoints = [
        `https://api.rds.ismis.com.ph/api/sites/by-company?company_id=${companyId}&latitude=${latitude}&longitude=${longitude}`,
        `https://api.rds.ismis.com.ph/api/sites/by-company?company_id=${companyId}&latitude=&longitude=`,
        `https://api.rds.ismis.com.ph/api/branches/by-company?company_id=${companyId}&latitude=${latitude}&longitude=${longitude}`,
      ];

      for (const url of endpoints) {
        try {
          const response = await fetch(url);
          if (!response.ok) continue;

          const data = await response.json();
          const rows = Array.isArray(data)
            ? data
            : data.data || data.sites || data.branches || [];

          if (!Array.isArray(rows) || rows.length === 0) {
            continue;
          }

          const normalized = rows
            .map((row: any) => this.adaptToSite(row))
            .filter(
              (site) =>
                Number.isFinite(site.id) &&
                site.id > 0 &&
                site.name.length > 0 &&
                Number.isFinite(site.latitude) &&
                Number.isFinite(site.longitude)
            );

          if (normalized.length > 0) {
            return normalized;
          }
        } catch (err) {
          console.warn('[SiteService] getNearby endpoint failed:', url, err);
        }
      }

      return [];
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
      return this.adaptToSite(branch);
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
    sites: Site[],
    gpsAccuracyMeters: number = 0
  ): Promise<Site | null> {
    if (sites.length === 0) return null;

    let nearest: Site | null = null;
    let nearestDistance = Infinity;

    for (const site of sites) {
      const distance = this.calculateDistance(latitude, longitude, site.latitude, site.longitude);
      const radiusMeters = Number.isFinite(site.radius) && site.radius > 0 ? site.radius : 75;
      const accuracyBuffer = Math.min(Math.max(gpsAccuracyMeters || 0, 0), 120);
      const effectiveRadius = radiusMeters + accuracyBuffer;

      // Check if within geofence
      if (distance <= effectiveRadius && distance < nearestDistance) {
        nearest = site;
        nearestDistance = distance;
      }
    }

    return nearest;
  }

  /**
   * Find the nearest site regardless of geofence radius, up to maxDistance (metres).
   * Used as a fallback when GPS drift causes strict geofence to miss.
   */
  findNearestSite(
    latitude: number,
    longitude: number,
    sites: Site[],
    maxDistance: number = Infinity
  ): Site | null {
    if (sites.length === 0) return null;

    let nearest: Site | null = null;
    let nearestDistance = Infinity;

    for (const site of sites) {
      const distance = this.calculateDistance(latitude, longitude, site.latitude, site.longitude);
      if (distance < nearestDistance && distance <= maxDistance) {
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
      if (site.shiftIn) await AsyncStorage.setItem('current_site_shift_in', site.shiftIn);
      if (site.shiftOut) await AsyncStorage.setItem('current_site_shift_out', site.shiftOut);
      if (site.shift) await AsyncStorage.setItem('current_site_shift', site.shift);
      if (site.code) await AsyncStorage.setItem('current_site_code', site.code);
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
        'current_site_shift_in',
        'current_site_shift_out',
        'current_site_shift',
        'current_site_lgu',
        'current_site_cluster',
        'current_site_province',
        'current_site_area',
        'current_site_code',
      ]);
    } catch (error) {
      console.error('Error clearing current site:', error);
    }
  }
}

export default new SiteServiceImpl();
