/**
 * Generates a URL-safe slug from a given string
 * 
 * Features:
 * - Normalizes unicode characters (é -> e, ñ -> n)
 * - Converts to lowercase
 * - Removes or encodes special characters
 * - Replaces spaces and underscores with hyphens
 * - Collapses multiple consecutive hyphens into one
 * - Trims leading and trailing hyphens
 * - Returns empty string if input is empty or only special chars
 * 
 * @param text - The input string to convert to a slug
 * @returns A URL-safe slug string
 * 
 * @example
 * generateSlug("My Store Name!")  // "my-store-name"
 * generateSlug("Café & Bakery")   // "cafe-and-bakery"
 * generateSlug("Test___Store")    // "test-store"
 * generateSlug("   Trim   ")      // "trim"
 * generateSlug("São Paulo")       // "sao-paulo"
 */
export function generateSlug(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  return text
    // Normalize unicode characters (NFD = decompose accents)
    .normalize('NFD')
    // Remove diacritics (accents)
    .replace(/[\u0300-\u036f]/g, '')
    // Convert to lowercase
    .toLowerCase()
    // Remove apostrophes and quotes
    .replace(/['''"""]/g, '')
    // Replace ampersands with 'and'
    .replace(/&/g, '-and-')
    // Replace spaces, underscores, and forward slashes with hyphens
    .replace(/[\s_/\\]+/g, '-')
    // Remove all non-alphanumeric characters except hyphens
    .replace(/[^a-z0-9-]/g, '')
    // Collapse multiple consecutive hyphens into one
    .replace(/-+/g, '-')
    // Trim leading and trailing hyphens
    .replace(/^-+|-+$/g, '')
    // Truncate to reasonable length (optional, but good practice)
    .substring(0, 100);
}

/**
 * Validates if a string is a valid slug
 * 
 * @param slug - The slug to validate
 * @returns true if the slug is valid, false otherwise
 */
export function isValidSlug(slug: string): boolean {
  if (!slug || typeof slug !== 'string') {
    return false;
  }

  // Valid slug: lowercase letters, numbers, hyphens only
  // Cannot start or end with hyphen
  // Must have at least one character
  const slugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  return slugPattern.test(slug);
}

/**
 * Ensures a slug is unique by appending a number if needed
 * 
 * @param baseSlug - The base slug to make unique
 * @param existingSlugs - Array of existing slugs to check against
 * @returns A unique slug
 */
export function makeUniqueSlug(baseSlug: string, existingSlugs: string[]): string {
  if (!baseSlug) {
    return '';
  }
  
  if (!existingSlugs || !Array.isArray(existingSlugs)) {
    return baseSlug;
  }

  if (!existingSlugs.includes(baseSlug)) {
    return baseSlug;
  }

  let counter = 1;
  let uniqueSlug = `${baseSlug}-${counter}`;

  while (existingSlugs.includes(uniqueSlug)) {
    counter++;
    uniqueSlug = `${baseSlug}-${counter}`;
  }

  return uniqueSlug;
}
