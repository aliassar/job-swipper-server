export function formatResponse<T>(
  success: boolean,
  data: T | null,
  error: { code: string; message: string; details?: object } | null,
  requestId: string
) {
  return {
    success,
    ...(success ? { data } : { error }),
    meta: {
      requestId,
      timestamp: new Date().toISOString(),
    },
  };
}

export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

export function parseIntSafe(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

export function parseBoolSafe(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) return defaultValue;
  const lower = value.toLowerCase();
  if (lower === 'true') return true;
  if (lower === 'false') return false;
  return defaultValue;
}

/**
 * Escape special characters in SQL LIKE patterns to prevent unexpected behavior.
 * Escapes %, _, and \ characters which have special meaning in LIKE queries.
 * This is compatible with PostgreSQL's default backslash escaping.
 * 
 * @param pattern - The search pattern to escape
 * @returns Escaped pattern safe for use in LIKE queries
 * 
 * @example
 * escapeLikePattern('test%value') // Returns 'test\\%value'
 * escapeLikePattern('file_name') // Returns 'file\\_name'
 */
export function escapeLikePattern(pattern: string): string {
  return pattern.replace(/[%_\\]/g, '\\$&');
}

/**
 * Prepare a search term for case-insensitive LIKE matching.
 * Escapes special characters and converts to lowercase.
 * Use with LOWER() SQL function on the column for case-insensitive search.
 * 
 * @param pattern - The search pattern
 * @returns Lowercase escaped pattern for use with LOWER(column) LIKE pattern
 * 
 * @example
 * const search = prepareCaseInsensitiveSearch('Test');
 * // Use: sql`LOWER(${column}) LIKE ${`%${search}%`}`
 */
export function prepareCaseInsensitiveSearch(pattern: string): string {
  return escapeLikePattern(pattern).toLowerCase();
}

/**
 * Extract S3 key from file URL
 * Handles various URL formats safely
 */
export function extractS3KeyFromUrl(fileUrl: string): string {
  try {
    const url = new URL(fileUrl);
    // Remove leading slash
    return url.pathname.substring(1);
  } catch (error) {
    // If URL parsing fails, try simple split as fallback
    const parts = fileUrl.split('/');
    // Remove protocol and domain parts, join the rest
    const keyParts = parts.slice(3); // Skip https:, '', domain
    return keyParts.join('/');
  }
}

/**
 * Escape HTML special characters to prevent HTML injection
 */
export function escapeHtml(text: string): string {
  const htmlEscapeMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
  };
  return text.replace(/[&<>"']/g, (char) => htmlEscapeMap[char] || char);
}

/**
 * Parse salary string and extract min/max numeric values
 * Examples:
 *   "$50,000 - $80,000" => { min: 50000, max: 80000 }
 *   "$60k-$90k" => { min: 60000, max: 90000 }
 *   "$75,000" => { min: 75000, max: 75000 }
 *   "Competitive" => { min: null, max: null }
 * 
 * This function should be used when inserting jobs into the database
 * to populate the salaryMin and salaryMax fields for efficient querying.
 */
export function parseSalaryRange(salaryString: string | null | undefined): {
  min: number | null;
  max: number | null
} {
  if (!salaryString) {
    return { min: null, max: null };
  }

  // Remove common non-numeric characters but keep digits and hyphens/dashes
  const cleaned = salaryString
    .toLowerCase()
    .replace(/[\$,]/g, '') // Remove $ and commas
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();

  // Try to find numbers in the string
  const numbers: number[] = [];

  // Match patterns like "50k", "50000", "50.5k" with explicit 'k' capture
  const numberPattern = /(\d+(?:\.\d+)?)\s*(k)?/gi;
  let match;

  while ((match = numberPattern.exec(cleaned)) !== null) {
    // Skip if this is an empty match
    if (!match[1]) continue;

    let value = parseFloat(match[1]);

    // If group 2 captured 'k', multiply by 1000
    if (match[2]) {
      value *= 1000;
    }

    numbers.push(Math.round(value));
  }

  if (numbers.length === 0) {
    return { min: null, max: null };
  }

  if (numbers.length === 1) {
    return { min: numbers[0], max: numbers[0] };
  }

  // If multiple numbers found, use min and max
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);

  return { min, max };
}

/**
 * Sanitize search input to prevent injection attacks
 * Trims whitespace and limits length to prevent abuse
 * 
 * @param input - The search input to sanitize
 * @param maxLength - Maximum allowed length (default: 200)
 * @returns Sanitized string or undefined if input is empty/undefined
 * 
 * @example
 * sanitizeSearchInput('  software engineer  ') // Returns 'software engineer'
 * sanitizeSearchInput('a'.repeat(300)) // Returns 'a'.repeat(200)
 * sanitizeSearchInput(undefined) // Returns undefined
 */
export function sanitizeSearchInput(input: string | undefined, maxLength = 200): string | undefined {
  if (!input) return undefined;
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLength);
}

/**
 * Validate salary range to ensure min is less than or equal to max
 * 
 * @param min - Minimum salary value
 * @param max - Maximum salary value
 * @returns Object with valid flag and optional error message
 * 
 * @example
 * validateSalaryRange(50000, 80000) // Returns { valid: true }
 * validateSalaryRange(80000, 50000) // Returns { valid: false, error: '...' }
 * validateSalaryRange(undefined, 80000) // Returns { valid: true }
 */
export function validateSalaryRange(min?: number, max?: number): { valid: boolean; error?: string } {
  if (min !== undefined && max !== undefined && min > max) {
    return { valid: false, error: 'salaryMin must be less than or equal to salaryMax' };
  }
  return { valid: true };
}
