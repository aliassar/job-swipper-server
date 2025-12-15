import { describe, it, expect } from 'vitest';
import { formatResponse, generateRequestId, parseIntSafe, parseBoolSafe, parseSalaryRange } from '../lib/utils';

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
  });
});
