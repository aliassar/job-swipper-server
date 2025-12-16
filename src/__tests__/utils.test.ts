import { describe, it, expect } from 'vitest';
import { formatResponse, generateRequestId, parseIntSafe, parseBoolSafe, parseSalaryRange, escapeLikePattern, sanitizeSearchInput, validateSalaryRange } from '../lib/utils';

describe('Utils', () => {
  describe('formatResponse', () => {
    it('should format success response correctly', () => {
      const result = formatResponse(true, { test: 'data' }, null, 'req_123');
      expect(result.success).toBe(true);
      if ('data' in result) {
        expect(result.data).toEqual({ test: 'data' });
      }
      expect(result.meta.requestId).toBe('req_123');
      expect(result.meta.timestamp).toBeDefined();
    });

    it('should format error response correctly', () => {
      const result = formatResponse(false, null, { code: 'ERROR', message: 'Test error' }, 'req_456');
      expect(result.success).toBe(false);
      if ('error' in result) {
        expect(result.error).toEqual({ code: 'ERROR', message: 'Test error' });
      }
      expect(result.meta.requestId).toBe('req_456');
    });
  });

  describe('generateRequestId', () => {
    it('should generate unique request IDs', () => {
      const id1 = generateRequestId();
      const id2 = generateRequestId();
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^req_/);
    });
  });

  describe('parseIntSafe', () => {
    it('should parse valid integers', () => {
      expect(parseIntSafe('123', 0)).toBe(123);
    });

    it('should return default for invalid input', () => {
      expect(parseIntSafe('abc', 10)).toBe(10);
      expect(parseIntSafe(undefined, 5)).toBe(5);
    });
  });

  describe('parseBoolSafe', () => {
    it('should parse valid booleans', () => {
      expect(parseBoolSafe('true', false)).toBe(true);
      expect(parseBoolSafe('false', true)).toBe(false);
    });

    it('should return default for invalid input', () => {
      expect(parseBoolSafe('invalid', true)).toBe(true);
      expect(parseBoolSafe(undefined, false)).toBe(false);
    });
  });

  describe('parseSalaryRange', () => {
    it('should parse salary range with dash', () => {
      const result = parseSalaryRange('$50,000 - $80,000');
      expect(result.min).toBe(50000);
      expect(result.max).toBe(80000);
    });

    it('should parse salary range with k notation', () => {
      const result = parseSalaryRange('$60k-$90k');
      expect(result.min).toBe(60000);
      expect(result.max).toBe(90000);
    });

    it('should parse single salary value', () => {
      const result = parseSalaryRange('$75,000');
      expect(result.min).toBe(75000);
      expect(result.max).toBe(75000);
    });

    it('should return null for non-numeric salary', () => {
      const result = parseSalaryRange('Competitive');
      expect(result.min).toBeNull();
      expect(result.max).toBeNull();
    });

    it('should handle null or undefined input', () => {
      expect(parseSalaryRange(null).min).toBeNull();
      expect(parseSalaryRange(undefined).min).toBeNull();
    });

    it('should parse mixed formats', () => {
      const result = parseSalaryRange('50k - 80000');
      expect(result.min).toBe(50000);
      expect(result.max).toBe(80000);
    });

    it('should correctly distinguish between numbers with and without k', () => {
      const result = parseSalaryRange('50 - 80k');
      expect(result.min).toBe(50);
      expect(result.max).toBe(80000);
    });
  });

  describe('escapeLikePattern', () => {
    it('should escape % character', () => {
      const result = escapeLikePattern('test%value');
      expect(result).toBe('test\\%value');
    });

    it('should escape _ character', () => {
      const result = escapeLikePattern('test_value');
      expect(result).toBe('test\\_value');
    });

    it('should escape \\ character', () => {
      const result = escapeLikePattern('test\\value');
      expect(result).toBe('test\\\\value');
    });

    it('should escape multiple special characters', () => {
      const result = escapeLikePattern('test%_\\value');
      expect(result).toBe('test\\%\\_\\\\value');
    });

    it('should not modify strings without special characters', () => {
      const result = escapeLikePattern('test value');
      expect(result).toBe('test value');
    });

    it('should handle empty string', () => {
      const result = escapeLikePattern('');
      expect(result).toBe('');
    });

    it('should handle string with only special characters', () => {
      const result = escapeLikePattern('%_\\');
      expect(result).toBe('\\%\\_\\\\');
    });
  });

  describe('sanitizeSearchInput', () => {
    it('should trim whitespace', () => {
      const result = sanitizeSearchInput('  software engineer  ');
      expect(result).toBe('software engineer');
    });

    it('should limit length to default 200 characters', () => {
      const longString = 'a'.repeat(300);
      const result = sanitizeSearchInput(longString);
      expect(result?.length).toBe(200);
    });

    it('should limit length to custom maxLength', () => {
      const longString = 'a'.repeat(150);
      const result = sanitizeSearchInput(longString, 100);
      expect(result?.length).toBe(100);
    });

    it('should return undefined for undefined input', () => {
      const result = sanitizeSearchInput(undefined);
      expect(result).toBeUndefined();
    });

    it('should return undefined for empty string', () => {
      const result = sanitizeSearchInput('');
      expect(result).toBeUndefined();
    });

    it('should return undefined for whitespace-only string', () => {
      const result = sanitizeSearchInput('   ');
      expect(result).toBeUndefined();
    });

    it('should preserve special characters', () => {
      const result = sanitizeSearchInput('C++ developer');
      expect(result).toBe('C++ developer');
    });
  });

  describe('validateSalaryRange', () => {
    it('should return valid for min <= max', () => {
      const result = validateSalaryRange(50000, 80000);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should return valid for min === max', () => {
      const result = validateSalaryRange(50000, 50000);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should return invalid for min > max', () => {
      const result = validateSalaryRange(80000, 50000);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('salaryMin must be less than or equal to salaryMax');
    });

    it('should return valid when only min is provided', () => {
      const result = validateSalaryRange(50000, undefined);
      expect(result.valid).toBe(true);
    });

    it('should return valid when only max is provided', () => {
      const result = validateSalaryRange(undefined, 80000);
      expect(result.valid).toBe(true);
    });

    it('should return valid when both are undefined', () => {
      const result = validateSalaryRange(undefined, undefined);
      expect(result.valid).toBe(true);
    });

    it('should return valid when both are zero', () => {
      const result = validateSalaryRange(0, 0);
      expect(result.valid).toBe(true);
    });
  });
});
