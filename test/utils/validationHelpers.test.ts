import { describe, it, expect } from 'vitest';
import { isValidPathSegment, safePathSegmentSchema, REALMS } from '../../src/utils/validationHelpers.js';

describe('validationHelpers', () => {
  // ===== REALMS CONSTANT =====
  describe('REALMS', () => {
    it('should contain alpha and bravo', () => {
      expect(REALMS).toEqual(['alpha', 'bravo']);
    });
  });

  // ===== isValidPathSegment FUNCTION =====
  describe('isValidPathSegment', () => {
    it.each([
      { value: 'simple-id', expected: true },
      { value: 'user_123', expected: true },
      { value: 'id.with.single.dots', expected: true },
      { value: '..', expected: false },
      { value: '../etc/passwd', expected: false },
      { value: 'foo/../bar', expected: false },
      { value: 'foo/bar', expected: false },
      { value: '/etc/passwd', expected: false },
      { value: 'foo\\bar', expected: false },
      { value: '%2e%2e', expected: false },
      { value: '%2E%2E', expected: false },
      { value: 'foo%2fbar', expected: false },
      { value: 'foo%5cbar', expected: false }
    ])('isValidPathSegment("$value") should return $expected', ({ value, expected }) => {
      expect(isValidPathSegment(value)).toBe(expected);
    });
  });

  // ===== safePathSegmentSchema =====
  describe('safePathSegmentSchema', () => {
    it('should reject empty string', () => {
      expect(() => safePathSegmentSchema.parse('')).toThrow(/cannot be empty/);
    });

    it('should reject whitespace-only string', () => {
      expect(() => safePathSegmentSchema.parse('   ')).toThrow(/cannot be empty or whitespace/);
    });

    it.each([
      '../../../etc/passwd',
      '../../admin',
      'obj/123',
      '/etc/passwd',
      'obj\\123',
      '%2e%2e%2fadmin',
      'obj%2f123',
      'obj%5c123'
    ])('should reject path traversal: "%s"', (value) => {
      expect(() => safePathSegmentSchema.parse(value)).toThrow(/path traversal/);
    });

    it.each(['valid-object-123', 'obj_test', 'uuid-1234-5678-90ab-cdef', 'alpha_user', 'a'])(
      'should accept valid value: "%s"',
      (value) => {
        expect(safePathSegmentSchema.parse(value)).toBe(value);
      }
    );
  });
});
