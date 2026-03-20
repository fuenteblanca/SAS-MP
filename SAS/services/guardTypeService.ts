import AsyncStorage from '@react-native-async-storage/async-storage';

// Guard type constants
export const ALLOWED_GUARD_TYPES = ['Regular', 'RSI', 'Special Duty'] as const;
export type GuardType = typeof ALLOWED_GUARD_TYPES[number];

const GUARD_TYPE_KEY = 'guard_type';

/**
 * Service for managing guard type selection and persistence
 */
export class GuardTypeService {
  private static selectedGuardType: string = '';

  /**
   * Initialize guard type - clears any existing selection
   */
  static async initialize(): Promise<void> {
    this.selectedGuardType = '';
    await this.clearGuardTypeIfNeeded();
    await this.ensureGuardTypeLoaded(true);
  }

  /**
   * Ensure guard type is loaded from AsyncStorage
   * @param forceReload - Force reload from storage even if already loaded
   * @returns Current guard type (empty string if not set)
   */
  static async ensureGuardTypeLoaded(forceReload: boolean = false): Promise<string> {
    try {
      if (forceReload || this.selectedGuardType === '') {
        const stored = await AsyncStorage.getItem(GUARD_TYPE_KEY);
        if (stored && stored.length > 0) {
          this.selectedGuardType = stored;
        } else {
          // No default guard type - leave empty until user selects
          this.selectedGuardType = '';
        }
      }

      // Sanitize value - only accept valid guard types
      if (this.selectedGuardType && !ALLOWED_GUARD_TYPES.includes(this.selectedGuardType as GuardType)) {
        this.selectedGuardType = '';
        await AsyncStorage.removeItem(GUARD_TYPE_KEY);
      }

      return this.selectedGuardType;
    } catch (error) {
      console.error('Error loading guard type:', error);
      return '';
    }
  }

  /**
   * Clear guard type selection if needed (for debugging/testing)
   */
  static async clearGuardTypeIfNeeded(): Promise<void> {
    try {
      // Uncomment the line below if you want to always start fresh (for testing)
      // await AsyncStorage.removeItem(GUARD_TYPE_KEY);
      const current = await AsyncStorage.getItem(GUARD_TYPE_KEY);
      console.log('DEBUG: Current saved guard type:', current || 'None');
    } catch (error) {
      console.error('Error checking guard type:', error);
    }
  }

  /**
   * Save guard type to AsyncStorage
   * @param guardType - The guard type to save
   */
  static async saveGuardType(guardType: string): Promise<void> {
    try {
      await AsyncStorage.setItem(GUARD_TYPE_KEY, guardType);
      this.selectedGuardType = guardType;
      console.log('DEBUG: Saved guard type to AsyncStorage:', guardType);
    } catch (error) {
      console.error('Error saving guard type:', error);
      throw error;
    }
  }

  /**
   * Load guard type from AsyncStorage
   * @returns Guard type or empty string if not set
   */
  static async loadGuardType(): Promise<string> {
    try {
      const guardType = await AsyncStorage.getItem(GUARD_TYPE_KEY);
      return guardType || '';
    } catch (error) {
      console.error('Error loading guard type from AsyncStorage:', error);
      return '';
    }
  }

  /**
   * Get the current selected guard type
   * @returns Current guard type
   */
  static getSelectedGuardType(): string {
    return this.selectedGuardType;
  }

  /**
   * Set the current selected guard type in memory
   * @param guardType - The guard type to set
   */
  static setSelectedGuardType(guardType: string): void {
    this.selectedGuardType = guardType;
  }

  /**
   * Validate if guard type is selected
   * @returns True if guard type is selected, false otherwise
   */
  static isGuardTypeSelected(): boolean {
    return this.selectedGuardType.length > 0;
  }

  /**
   * Validate if guard type requires confirmation
   * @param guardType - The guard type to check
   * @returns True if guard type requires confirmation
   */
  static requiresConfirmation(guardType: string): boolean {
    return ALLOWED_GUARD_TYPES.includes(guardType as GuardType);
  }

  /**
   * Clear guard type from storage and memory
   */
  static async clearGuardType(): Promise<void> {
    try {
      await AsyncStorage.removeItem(GUARD_TYPE_KEY);
      this.selectedGuardType = '';
      console.log('DEBUG: Cleared guard type');
    } catch (error) {
      console.error('Error clearing guard type:', error);
      throw error;
    }
  }
}
