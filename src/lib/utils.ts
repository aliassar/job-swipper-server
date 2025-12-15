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
  
  // Match patterns like "50k", "50000", "50.5k"
  const numberPattern = /(\d+(?:\.\d+)?)\s*k?/gi;
  let match;
  
  while ((match = numberPattern.exec(cleaned)) !== null) {
    let value = parseFloat(match[1]);
    
    // If followed by 'k', multiply by 1000
    if (match[0].toLowerCase().includes('k')) {
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
