import { describe, it, expect } from 'vitest';
import {
  isValidPathSegment,
  safePathSegmentSchema,
  featureNameSchema,
  REALMS
} from '../../src/utils/validationHelpers.js';

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

  // ===== featureNameSchema =====
  describe('featureNameSchema', () => {
    it.each(['groups', 'aiagent', 'password/timestamps', 'indexed/strings/6thru20', 'am/2fa/profiles'])(
      'should accept valid feature name: "%s"',
      (value) => {
        expect(featureNameSchema.parse(value)).toBe(value);
      }
    );

    it.each([
      '..',
      '/groups',
      'groups/',
      'foo//bar',
      'foo/../bar',
      '%2e%2e',
      '%2E%2E',
      'foo%2fbar',
      'foo.bar',
      'foo bar',
      'foo\\bar'
    ])('should reject invalid feature name: "%s"', (value) => {
      expect(() => featureNameSchema.parse(value)).toThrow();
    });

    it('should reject empty string', () => {
      expect(() => featureNameSchema.parse('')).toThrow();
    });

    it('should reject whitespace-only string', () => {
      expect(() => featureNameSchema.parse('   ')).toThrow();
    });

    it('should reject feature name longer than 128 characters', () => {
      const tooLong = 'a'.repeat(129);
      expect(() => featureNameSchema.parse(tooLong)).toThrow();
    });

    it('should accept feature name exactly 128 characters', () => {
      const maxLen = 'a'.repeat(128);
      expect(featureNameSchema.parse(maxLen)).toBe(maxLen);
    });

    it('should accept mixed-case names', () => {
      expect(featureNameSchema.parse('Groups')).toBe('Groups');
      expect(featureNameSchema.parse('AIAGENT')).toBe('AIAGENT');
      expect(featureNameSchema.parse('Password/Timestamps')).toBe('Password/Timestamps');
    });

    it('should reject Unicode / non-ASCII names', () => {
      expect(() => featureNameSchema.parse('café')).toThrow();
      expect(() => featureNameSchema.parse('группы')).toThrow();
      expect(() => featureNameSchema.parse('功能')).toThrow();
    });

    it.each(['foo+bar', 'foo:bar', 'foo@bar'])('should reject disallowed special character: "%s"', (value) => {
      expect(() => featureNameSchema.parse(value)).toThrow();
    });
  });
});
