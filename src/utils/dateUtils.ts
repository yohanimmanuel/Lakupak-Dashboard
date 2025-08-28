/**
 * Utility functions for consistent date formatting across the application
 * This prevents hydration errors caused by locale-dependent date formatting
 */

/**
 * Formats a date string or Date object to a consistent DD/MM/YYYY format
 * @param dateString - Date string, Date object, or null/undefined
 * @returns Formatted date string or empty string if invalid
 */
export const formatDate = (dateString: string | Date | null | undefined): string => {
  if (!dateString) return '';
  
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    
    // Use consistent format: DD/MM/YYYY
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    
    return `${day}/${month}/${year}`;
  } catch (error) {
    return '';
  }
};

/**
 * Formats a date string or Date object to a consistent DD MMM, YYYY format
 * @param dateString - Date string, Date object, or null/undefined
 * @returns Formatted date string or empty string if invalid
 */
export const formatDateLong = (dateString: string | Date | null | undefined): string => {
  if (!dateString) return '';
  
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    
    // Use consistent month abbreviations
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    
    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    
    return `${day} ${month}, ${year}`;
  } catch (error) {
    return '';
  }
};

/**
 * Formats a number to a consistent string with comma separators
 * @param num - Number to format
 * @returns Formatted number string
 */
export const formatNumber = (num: number): string => {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

/**
 * Safely parses a date string and returns a Date object or null
 * @param dateString - Date string to parse
 * @returns Date object or null if invalid
 */
export const safeParseDate = (dateString: string | null | undefined): Date | null => {
  if (!dateString) return null;
  
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return null;
    return date;
  } catch (error) {
    return null;
  }
};
