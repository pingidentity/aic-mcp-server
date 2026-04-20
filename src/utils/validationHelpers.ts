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

/**
 * Regex for validating IDM feature names.
 * Accepts one or more alphanumeric/underscore/hyphen segments separated by single '/'.
 * Rejects leading/trailing slashes, doubled slashes, '..', and URL-encoded characters
 * (because '.' and '%' are not in the allowed character class).
 */
const FEATURE_NAME_REGEX = /^[a-zA-Z0-9_-]+(\/[a-zA-Z0-9_-]+)*$/;

/**
 * Zod schema for validating IDM feature names (e.g. `groups`, `aiagent`,
 * `password/timestamps`). Permits `/` as a segment separator because the IDM
 * feature router treats the remainder of the path after `/openidm/feature/` as
 * the feature id. Unlike `safePathSegmentSchema`, this schema intentionally
 * allows single `/` between alphanumeric/underscore/hyphen segments while still
 * rejecting path traversal sequences.
 *
 * Accepts: `groups`, `aiagent`, `password/timestamps`, `indexed/strings/6thru20`,
 *          `am/2fa/profiles`.
 * Rejects: `..`, `/groups`, `groups/`, `foo//bar`, `foo/../bar`, `%2e%2e`,
 *          empty strings, whitespace-only strings, and values longer than 128
 *          characters.
 */
export const featureNameSchema = z
  .string()
  .min(1)
  .max(128)
  .refine((v) => FEATURE_NAME_REGEX.test(v), {
    message: 'Feature name must be alphanumeric segments separated by single "/" (no leading/trailing slash, no "..")'
  });
