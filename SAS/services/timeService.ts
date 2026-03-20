/**
 * Time Service - Provides internet time synchronization
 */

interface TimeApiResponse {
  status: string;
  message?: string;
  formatted?: string;
}

/**
 * Get accurate internet time from TimezoneDB API
 * @returns Promise<Date> - Current date/time in Asia/Manila timezone
 */
export const getInternetDateTime = async (): Promise<Date> => {
  const url = 'https://api.timezonedb.com/v2.1/get-time-zone?key=W7N0OL4F5JBU&format=json&by=zone&zone=Asia/Manila';

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 200) {
  const data = await response.json() as TimeApiResponse;

      if (data.status === 'OK' && data.formatted) {
        return new Date(data.formatted);
      } else {
        throw new Error(`Failed to fetch internet time: ${data.message || 'Unknown error'}`);
      }
    } else {
      throw new Error(`Failed to fetch internet time. Status code: ${response.status}`);
    }
  } catch (error: any) {
    if (error.message?.includes('timeout')) {
      throw new Error('TimeoutException: Could not sync with internet time');
    } else if (error.message?.includes('Network')) {
      throw new Error('SocketException: No internet connection');
    }
    throw error;
  }
};

/**
 * Check if a date is weekend (Saturday or Sunday)
 * @param date - Date to check
 * @returns boolean
 */
export const isWeekend = (date: Date): boolean => {
  const day = date.getDay();
  return day === 0 || day === 6; // 0 = Sunday, 6 = Saturday
};

/**
 * Format time string to HH:mm:ss
 * @param time - Time string to format
 * @returns Formatted time string
 */
export const formatShiftTime = (time?: string | null): string => {
  if (!time || time.length === 0) {
    return '00:00:00';
  }
  
  try {
    // Remove milliseconds if present
    const cleanTime = time.includes('.') ? time.split('.')[0].trim() : time.trim();
    
    // Check if already in correct format
    if (/^\d{2}:\d{2}:\d{2}$/.test(cleanTime)) {
      return cleanTime.substring(0, 8);
    }
    
    // Parse and format
    const parts = cleanTime.split(':');
    const hours = parts[0].padStart(2, '0');
    const minutes = parts.length > 1 ? parts[1].padStart(2, '0') : '00';
    const seconds = parts.length > 2 ? parts[2].padStart(2, '0') : '00';
    
    return `${hours}:${minutes}:${seconds}`.substring(0, 8);
  } catch (e) {
    return '00:00:00';
  }
};

/**
 * Format date to YYYY-MM-DD
 * @param date - Date to format
 * @returns Formatted date string
 */
export const formatDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Format time to HH:mm:ss
 * @param date - Date to format
 * @returns Formatted time string
 */
export const formatTime = (date: Date): string => {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
};

/**
 * Retry wrapper for async operations
 * @param operation - Async operation to retry
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @returns Promise result of the operation
 */
export const withRetry = async <T>(
  operation: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> => {
  let attempts = 0;
  
  while (attempts < maxRetries) {
    try {
      return await operation();
    } catch (error) {
      attempts++;
      if (attempts === maxRetries) {
        throw error;
      }
      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
    }
  }
  
  throw new Error(`Failed after ${maxRetries} attempts`);
};
