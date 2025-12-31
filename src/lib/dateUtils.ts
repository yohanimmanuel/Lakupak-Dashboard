/**
 * Date utility functions for consistent date boundary handling across the application
 * Uses Asia/Jakarta timezone (WIB, UTC+7) as default for Indonesian market
 * Can use UTC for international/multi-region scenarios
 */

// Business timezone for the application (Indonesian Western Time)
const BUSINESS_TIMEZONE = 'Asia/Jakarta'; // UTC+7

/**
 * Get the start of day (00:00:00.000) for a given date
 * @param date - The date to get start of day for (defaults to current date)
 * @param useUTC - Whether to use UTC time (default: false, uses Asia/Jakarta)
 * @returns Date object set to start of day
 */
export function getStartOfDay(date: Date = new Date(), useUTC: boolean = false): Date {
  if (useUTC) {
    return new Date(Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      0, 0, 0, 0
    ));
  }
  
  // Use business timezone (Asia/Jakarta) for local time
  const localDateTime = new Date(date.toLocaleString('en-US', { timeZone: BUSINESS_TIMEZONE }));
  return new Date(
    localDateTime.getFullYear(),
    localDateTime.getMonth(),
    localDateTime.getDate(),
    0, 0, 0, 0
  );
}

/**
 * Get the end of day (23:59:59.999) for a given date
 * @param date - The date to get end of day for (defaults to current date)
 * @param useUTC - Whether to use UTC time (default: false, uses Asia/Jakarta)
 * @returns Date object set to end of day
 */
export function getEndOfDay(date: Date = new Date(), useUTC: boolean = false): Date {
  if (useUTC) {
    return new Date(Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      23, 59, 59, 999
    ));
  }
  
  // Use business timezone (Asia/Jakarta) for local time
  const localDateTime = new Date(date.toLocaleString('en-US', { timeZone: BUSINESS_TIMEZONE }));
  return new Date(
    localDateTime.getFullYear(),
    localDateTime.getMonth(),
    localDateTime.getDate(),
    23, 59, 59, 999
  );
}

/**
 * Get date boundaries for today (start and end of day)
 * Useful for date range queries where you want to include the entire current day
 * @param useUTC - Whether to use UTC time (default: false, uses Asia/Jakarta timezone)
 * @returns Object with startOfToday and endOfToday
 */
export function getTodayBoundaries(useUTC: boolean = false): {
  startOfToday: Date;
  endOfToday: Date;
} {
  const now = new Date();
  return {
    startOfToday: getStartOfDay(now, useUTC),
    endOfToday: getEndOfDay(now, useUTC),
  };
}

/**
 * Get date boundaries for a specific date (start and end of day)
 * @param date - The date to get boundaries for
 * @param useUTC - Whether to use UTC time (default: false, uses Asia/Jakarta)
 * @returns Object with startOfDay and endOfDay for the given date
 */
export function getDateBoundaries(date: Date, useUTC: boolean = false): {
  startOfDay: Date;
  endOfDay: Date;
} {
  return {
    startOfDay: getStartOfDay(date, useUTC),
    endOfDay: getEndOfDay(date, useUTC),
  };
}

/**
 * Check if a date range is currently active (includes the entire current day)
 * @param startDate - Start date of the range
 * @param endDate - End date of the range
 * @param useUTC - Whether to use UTC time (default: false, uses Asia/Jakarta)
 * @returns True if the current date falls within the range
 */
export function isDateRangeActive(
  startDate: Date,
  endDate: Date,
  useUTC: boolean = false
): boolean {
  const { startOfToday, endOfToday } = getTodayBoundaries(useUTC);
  
  // Start date should be on or before today's end
  // End date should be on or after today's start
  return startDate <= endOfToday && endDate >= startOfToday;
}

/**
 * Normalize a date to start of day (useful for date-only comparisons)
 * @param date - The date to normalize
 * @param useUTC - Whether to use UTC time (default: false, uses Asia/Jakarta)
 * @returns Date object normalized to start of day
 */
export function normalizeDateToStartOfDay(date: Date | string, useUTC: boolean = false): Date {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return getStartOfDay(dateObj, useUTC);
}

/**
 * Normalize a date to end of day (useful for inclusive date range queries)
 * @param date - The date to normalize
 * @param useUTC - Whether to use UTC time (default: false, uses Asia/Jakarta)
 * @returns Date object normalized to end of day
 */
export function normalizeDateToEndOfDay(date: Date | string, useUTC: boolean = false): Date {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return getEndOfDay(dateObj, useUTC);
}

/**
 * Check if a date is in the past (before today's start)
 * @param date - The date to check
 * @param useUTC - Whether to use UTC time (default: false, uses Asia/Jakarta)
 * @returns True if the date is in the past
 */
export function isDateInPast(date: Date | string, useUTC: boolean = false): boolean {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const { startOfToday } = getTodayBoundaries(useUTC);
  return dateObj < startOfToday;
}

/**
 * Check if a date is in the future (after today's end)
 * @param date - The date to check
 * @param useUTC - Whether to use UTC time (default: false, uses Asia/Jakarta)
 * @returns True if the date is in the future
 */
export function isDateInFuture(date: Date | string, useUTC: boolean = false): boolean {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const { endOfToday } = getTodayBoundaries(useUTC);
  return dateObj > endOfToday;
}

/**
 * Check if a date is today
 * @param date - The date to check
 * @param useUTC - Whether to use UTC time (default: false, uses Asia/Jakarta)
 * @returns True if the date is today
 */
export function isToday(date: Date | string, useUTC: boolean = false): boolean {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const { startOfToday, endOfToday } = getTodayBoundaries(useUTC);
  return dateObj >= startOfToday && dateObj <= endOfToday;
}

