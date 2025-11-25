/**
 * Shared utilities for managed object operations.
 *
 * Includes:
 * - Example managed object types for documentation and tool descriptions
 * - Object ID validation with path traversal protection
 * - Zod schemas for input validation
 *
 * IMPORTANT: The example types are NOT exhaustive. The MCP server supports ANY
 * managed object type defined in your PingOne AIC environment, including custom types.
 * Use the listManagedObjects tool to discover all available types in your tenant.
 */

import { z } from 'zod';

// Realms supported in the environment
export const REALMS = ['alpha', 'bravo'] as const;

export const EXAMPLE_MANAGED_OBJECT_TYPES = [
  'alpha_user',
  'bravo_user',
  'alpha_role',
  'bravo_role',
  'alpha_group',
  'bravo_group',
  'alpha_organization',
  'bravo_organization',
];

// Formatted string for use in tool descriptions
export const EXAMPLE_TYPES_STRING = EXAMPLE_MANAGED_OBJECT_TYPES.join(', ');

/**
 * Validates that an object ID is safe and doesn't contain path traversal attempts
 * Prevents directory traversal attacks by rejecting IDs with:
 * - Path separators (/ or \)
 * - Parent directory references (..)
 * - URL-encoded equivalents (%2e, %2f, %5c)
 */
function isValidObjectId(id: string): boolean {
  const dangerousPatterns = [
    /\.\./,           // Parent directory (..)
    /[\/\\]/,         // Path separators (/ or \)
    /%2e/i,           // URL-encoded dot
    /%2f/i,           // URL-encoded forward slash
    /%5c/i,           // URL-encoded backslash
  ];

  return !dangerousPatterns.some(pattern => pattern.test(id));
}

/**
 * Zod schema for validating object IDs with path traversal protection
 */
export const objectIdSchema = z.string()
  .min(1, "Object ID cannot be empty")
  .refine(id => id.trim().length > 0, {
    message: "Object ID cannot be empty or whitespace"
  })
  .refine(isValidObjectId, {
    message: "Invalid object ID: must not contain path traversal characters (/, \\, ..) or URL-encoded equivalents"
  });
