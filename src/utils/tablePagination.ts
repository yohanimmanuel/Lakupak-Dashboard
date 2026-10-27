/** Default rows per page for dashboard table components. */
export const TABLE_PAGE_SIZE = 10;

/** Max numbered page buttons shown at once; use Next/Previous to move the window. */
export const MAX_VISIBLE_PAGE_BUTTONS = 10;

/**
 * Returns up to `maxVisible` consecutive page numbers for the block that contains `currentPage`.
 * Example with max 10: pages 1–10, then 11–20 after Next advances past 10.
 */
export function getVisiblePageNumbers(
  currentPage: number,
  totalPages: number,
  maxVisible: number = MAX_VISIBLE_PAGE_BUTTONS,
): number[] {
  const total = Math.max(1, Math.floor(totalPages) || 1);
  const current = Math.min(Math.max(1, Math.floor(currentPage) || 1), total);
  const windowSize = Math.max(1, Math.floor(maxVisible) || MAX_VISIBLE_PAGE_BUTTONS);

  if (total <= windowSize) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  const block = Math.floor((current - 1) / windowSize);
  const start = block * windowSize + 1;
  const end = Math.min(total, start + windowSize - 1);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}
