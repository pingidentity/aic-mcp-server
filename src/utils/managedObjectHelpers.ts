/**
 * Managed object specific helpers.
 *
 * Includes:
 * - Example managed object types for documentation and tool descriptions
 *
 * IMPORTANT: The example types are NOT exhaustive. The MCP server supports ANY
 * managed object type defined in your PingOne AIC environment, including custom types.
 * Use the listManagedObjects tool to discover all available types in your tenant.
 */

/**
 * Example managed object types for use in tool descriptions.
 * These are common types but not exhaustive - any managed object type works.
 */
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

/**
 * Formatted string of example types for use in tool descriptions.
 */
export const EXAMPLE_TYPES_STRING = EXAMPLE_MANAGED_OBJECT_TYPES.join(', ');
