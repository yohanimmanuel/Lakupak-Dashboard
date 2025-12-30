/**
 * Client-safe Offer Utility Functions
 * Pure utility functions that can be used in both client and server components
 */

/**
 * Computes the overall start and end dates from an array of date ranges
 * @param dateRanges Array of date ranges with startDate, endDate, and isActive
 * @returns Object with startDate and endDate as ISO strings or null
 */
export function computeOfferDates(dateRanges: Array<{
  startDate: string;
  endDate: string;
  isActive: boolean;
}>): { startDate: string | null; endDate: string | null } {
  let calculatedStartDate: string | null = null;
  let calculatedEndDate: string | null = null;
  
  if (dateRanges.length > 0) {
    const activeDateRanges = dateRanges.filter(dr => dr.isActive);
    if (activeDateRanges.length > 0) {
      const startDates = activeDateRanges.map(dr => new Date(dr.startDate).getTime());
      const endDates = activeDateRanges.map(dr => new Date(dr.endDate).getTime());
      calculatedStartDate = new Date(Math.min(...startDates)).toISOString();
      calculatedEndDate = new Date(Math.max(...endDates)).toISOString();
    } else {
      // If no active date ranges, use all date ranges
      const startDates = dateRanges.map(dr => new Date(dr.startDate).getTime());
      const endDates = dateRanges.map(dr => new Date(dr.endDate).getTime());
      calculatedStartDate = new Date(Math.min(...startDates)).toISOString();
      calculatedEndDate = new Date(Math.max(...endDates)).toISOString();
    }
  }
  
  return { startDate: calculatedStartDate, endDate: calculatedEndDate };
}

