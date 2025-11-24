// src/config/managedObjectTypes.ts
import { z } from 'zod';

/**
 * Base managed object types supported by this server
 */
export const BASE_OBJECT_TYPES = ['user', 'role', 'group', 'organization'] as const;

/**
 * Realms supported in the PingOne AIC environment
 */
export const REALMS = ['alpha', 'bravo'] as const;

/**
 * All supported managed object types (combination of realms and base types)
 * This is used for Zod enum validation across all tools
 */
export const SUPPORTED_OBJECT_TYPES = BASE_OBJECT_TYPES.flatMap(baseType =>
  REALMS.map(realm => `${realm}_${baseType}`)
) as [string, ...string[]]; // Zod enum requires tuple with at least one value

/**
 * Validates that an object ID is safe and doesn't contain path traversal attempts
 * Prevents directory traversal attacks by rejecting IDs with:
 * - Path separators (/ or \)
 * - Parent directory references (..)
 * - URL-encoded equivalents (%2e, %2f, %5c)
 *
 * @param id - The object ID to validate
 * @returns true if safe, false otherwise
 */
export function isValidObjectId(id: string): boolean {
  // Reject path traversal patterns
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
 * Use this in tool input schemas instead of plain z.string()
 */
export const objectIdSchema = z.string()
  .min(1, "Object ID cannot be empty")
  .refine(id => id.trim().length > 0, {
    message: "Object ID cannot be empty or whitespace"
  })
  .refine(isValidObjectId, {
    message: "Invalid object ID: must not contain path traversal characters (/, \\, ..) or URL-encoded equivalents"
  });

/**
 * Extracts the base object type from a full objectType string
 * @param objectType - Full object type (e.g., 'alpha_user', 'bravo_role')
 * @returns Base type (e.g., 'user', 'role') or empty string if invalid
 */
export function getBaseType(objectType: string): string {
  const match = objectType.match(/^(?:alpha|bravo)_(.+)$/);
  return match ? match[1] : '';
}

/**
 * Extracts the realm from a full objectType string
 * @param objectType - Full object type (e.g., 'alpha_user', 'bravo_role')
 * @returns Realm ('alpha' or 'bravo') or empty string if invalid
 */
export function getRealm(objectType: string): string {
  const match = objectType.match(/^(alpha|bravo)_.+$/);
  return match ? match[1] : '';
}
