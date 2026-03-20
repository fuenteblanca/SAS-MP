/**
 * Time Validation Service - Validates time in/out based on shift schedules
 */

export interface ValidationResult {
  allowed: boolean;
  message?: string;
}

/**
 * Time In Validator
 * Validates if user can time in based on shift schedule
 * Cannot time in more than 3 hours before shift start
 */
export class TimeInValidator {
  /**
   * Validate time in
   * @param now - Current date/time
   * @param shiftIn - Shift start time (HH:mm:ss format)
   * @returns ValidationResult
   */
  static validate(params: { now: Date; shiftIn?: string | null }): ValidationResult {
    const { now, shiftIn } = params;

    if (!shiftIn || shiftIn === '00:00:00') {
      return { allowed: true };
    }

    try {
      // Parse shift in time
      const shiftParts = shiftIn.split(':');
      const shiftHour = parseInt(shiftParts[0], 10);
      const shiftMinute = parseInt(shiftParts[1], 10);
      const shiftSecond = shiftParts.length > 2 ? parseInt(shiftParts[2], 10) : 0;

      // Create shift start time for today
      const shiftStart = new Date(now);
      shiftStart.setHours(shiftHour, shiftMinute, shiftSecond, 0);

      // Calculate earliest allowed time in (3 hours before shift)
      const earliestAllowed = new Date(shiftStart.getTime() - 3 * 60 * 60 * 1000);

      // Check if current time is too early
      if (now < earliestAllowed) {
        const hoursUntilAllowed = Math.ceil((earliestAllowed.getTime() - now.getTime()) / (1000 * 60 * 60));
        return {
          allowed: false,
          message: `Too early to time in. You can time in ${hoursUntilAllowed} hour(s) before your shift starts at ${shiftIn}.`,
        };
      }

      return { allowed: true };
    } catch (error) {
      console.error('TimeInValidator error:', error);
      // Allow time in if validation fails
      return { allowed: true };
    }
  }
}

/**
 * Time Out Validator
 * Validates if user can time out based on shift schedule
 * Cannot time out more than 2 hours before shift end
 */
export class TimeOutValidator {
  /**
   * Validate time out
   * @param now - Current date/time
   * @param shiftOut - Shift end time (HH:mm:ss format)
   * @returns ValidationResult
   */
  static validate(params: { now: Date; shiftOut?: string | null }): ValidationResult {
    const { now, shiftOut } = params;

    if (!shiftOut || shiftOut === '00:00:00') {
      return { allowed: true };
    }

    try {
      // Parse shift out time
      const shiftParts = shiftOut.split(':');
      const shiftHour = parseInt(shiftParts[0], 10);
      const shiftMinute = parseInt(shiftParts[1], 10);
      const shiftSecond = shiftParts.length > 2 ? parseInt(shiftParts[2], 10) : 0;

      // Create shift end time for today
      const shiftEnd = new Date(now);
      shiftEnd.setHours(shiftHour, shiftMinute, shiftSecond, 0);

      // Handle overnight shifts (shift end is next day)
      if (shiftEnd < now && shiftHour < 12) {
        shiftEnd.setDate(shiftEnd.getDate() + 1);
      }

      // Calculate earliest allowed time out (2 hours before shift end)
      const earliestAllowed = new Date(shiftEnd.getTime() - 2 * 60 * 60 * 1000);

      // Check if current time is too early
      if (now < earliestAllowed) {
        const hoursUntilAllowed = Math.ceil((earliestAllowed.getTime() - now.getTime()) / (1000 * 60 * 60));
        return {
          allowed: false,
          message: `Too early to time out. You can time out ${hoursUntilAllowed} hour(s) before your shift ends at ${shiftOut}.`,
        };
      }

      return { allowed: true };
    } catch (error) {
      console.error('TimeOutValidator error:', error);
      // Allow time out if validation fails
      return { allowed: true };
    }
  }
}
