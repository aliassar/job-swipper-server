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
