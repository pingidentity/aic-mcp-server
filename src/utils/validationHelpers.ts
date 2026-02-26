/**
 * Shared validation utilities for input validation across all tools.
 *
 * Includes:
 * - Path segment validation to prevent directory traversal attacks
 * - Shared constants like REALMS
 */

import { z } from 'zod';

// Realms supported in the environment
export const REALMS = ['alpha', 'bravo'] as const;

/**
 * Validates that a value is safe to use in a URL path segment.
 * Prevents directory traversal attacks by rejecting values with:
 * - Path separators (/ or \)
 * - Parent directory references (..)
 * - URL-encoded equivalents (%2e, %2f, %5c)
 *
 * @param value - The string to validate
 * @returns true if safe, false if potentially dangerous
 */
export function isValidPathSegment(value: string): boolean {
  const dangerousPatterns = [
    /\.\./, // Parent directory (..)
    /[\/\\]/, // Path separators (/ or \)
    /%2e/i, // URL-encoded dot
    /%2f/i, // URL-encoded forward slash
    /%5c/i // URL-encoded backslash
  ];

  return !dangerousPatterns.some((pattern) => pattern.test(value));
}

/**
 * Zod schema for validating values that will be used in URL path segments.
 * Includes validation for:
 * - Non-empty string
 * - No whitespace-only values
 * - No path traversal characters
 *
 * Use this for any user input that will be interpolated into URL paths.
 */
export const safePathSegmentSchema = z
  .string()
  .min(1, 'Value cannot be empty')
  .refine((val) => val.trim().length > 0, {
    message: 'Value cannot be empty or whitespace'
  })
  .refine(isValidPathSegment, {
    message: 'Value must not contain path traversal characters (/, \\, ..) or URL-encoded equivalents'
  });
