/**
 * AM (Access Management) specific helpers for journey and script operations.
 *
 * Includes:
 * - API version headers for AM endpoints
 * - URL builders for AM realm-based endpoints
 * - Batch operations for fetching node schemas and configs
 * - Base64 decoding utilities for script content
 */

import { makeAuthenticatedRequest } from './apiHelpers.js';

const aicBaseUrl = process.env.AIC_BASE_URL;

/**
 * Standard headers for AM API requests (protocol 2.1, resource 1.0).
 * Used for journey and node operations.
 */
export const AM_API_HEADERS = {
  'accept-api-version': 'protocol=2.1,resource=1.0',
  'Content-Type': 'application/json',
} as const;

/**
 * Headers for AM script API requests (protocol 1.0, resource 1.0).
 * Scripts use a different API version than other AM resources.
 */
export const AM_SCRIPT_HEADERS = {
  'accept-api-version': 'protocol=1.0,resource=1.0',
  'Content-Type': 'application/json',
} as const;

/** Result of fetching a node schema */
export interface SchemaResult {
  nodeType: string;
  schema: any;
  error: string | null;
}

/** Result of fetching a node configuration */
export interface ConfigResult {
  nodeId: string;
  nodeType: string;
  config: any;
  error: string | null;
}

/**
 * Builds a URL for AM realm-based endpoints.
 *
 * @param realm - The realm name (e.g., 'alpha', 'bravo')
 * @param path - The path after the realm (e.g., 'scripts/abc-123')
 * @returns Full URL for the AM endpoint
 *
 * @example
 * buildAMRealmUrl('alpha', 'scripts/abc-123')
 * // Returns: 'https://tenant.forgeblocks.com/am/json/alpha/scripts/abc-123'
 */
export function buildAMRealmUrl(realm: string, path: string): string {
  return `https://${aicBaseUrl}/am/json/${realm}/${path}`;
}

/**
 * Builds a URL for journey node endpoints.
 *
 * @param realm - The realm name
 * @param nodeType - The type of node (e.g., 'UsernameCollectorNode')
 * @param nodeId - Optional specific node instance ID
 * @returns Full URL for the node endpoint
 *
 * @example
 * buildAMJourneyNodesUrl('alpha', 'UsernameCollectorNode')
 * // Returns URL for listing/creating nodes of this type
 *
 * buildAMJourneyNodesUrl('alpha', 'UsernameCollectorNode', 'node-uuid')
 * // Returns URL for a specific node instance
 */
export function buildAMJourneyNodesUrl(realm: string, nodeType: string, nodeId?: string): string {
  const base = buildAMRealmUrl(realm, `realm-config/authentication/authenticationtrees/nodes/${encodeURIComponent(nodeType)}`);
  return nodeId ? `${base}/${encodeURIComponent(nodeId)}` : base;
}

/**
 * Fetches schemas for multiple node types in parallel.
 *
 * @param realm - The realm containing the nodes
 * @param nodeTypes - Array of node type names to fetch schemas for
 * @param scopes - OAuth scopes required for the request
 * @returns Array of schema results, each containing the schema or an error
 *
 * @example
 * const results = await fetchNodeSchemas('alpha', ['UsernameCollectorNode', 'PasswordCollectorNode'], ['fr:am:*']);
 * // Each result has { nodeType, schema, error }
 */
export async function fetchNodeSchemas(
  realm: string,
  nodeTypes: string[],
  scopes: string[]
): Promise<SchemaResult[]> {
  const schemaPromises = nodeTypes.map(async (nodeType) => {
    const url = `${buildAMJourneyNodesUrl(realm, nodeType)}?_action=schema`;

    try {
      const { data } = await makeAuthenticatedRequest(url, scopes, {
        method: 'POST',
        headers: AM_API_HEADERS,
        body: JSON.stringify({}),
      });
      return { nodeType, schema: data, error: null };
    } catch (error: any) {
      return { nodeType, schema: null, error: error.message };
    }
  });

  return Promise.all(schemaPromises);
}

/**
 * Fetches configurations for multiple node instances in parallel.
 *
 * @param realm - The realm containing the nodes
 * @param nodes - Array of objects with nodeId and nodeType
 * @param scopes - OAuth scopes required for the request
 * @returns Array of config results, each containing the config or an error
 *
 * @example
 * const results = await fetchNodeConfigs('alpha', [
 *   { nodeId: 'uuid-1', nodeType: 'UsernameCollectorNode' },
 *   { nodeId: 'uuid-2', nodeType: 'PasswordCollectorNode' }
 * ], ['fr:am:*']);
 */
export async function fetchNodeConfigs(
  realm: string,
  nodes: Array<{ nodeId: string; nodeType: string }>,
  scopes: string[]
): Promise<ConfigResult[]> {
  const configPromises = nodes.map(async ({ nodeId, nodeType }) => {
    if (!nodeType) {
      return { nodeId, nodeType, config: null, error: 'Missing nodeType' };
    }

    const url = buildAMJourneyNodesUrl(realm, nodeType, nodeId);

    try {
      const { data } = await makeAuthenticatedRequest(url, scopes, {
        method: 'GET',
        headers: AM_API_HEADERS,
      });
      return { nodeId, nodeType, config: data, error: null };
    } catch (error: any) {
      return { nodeId, nodeType, config: null, error: error.message };
    }
  });

  return Promise.all(configPromises);
}

/**
 * Categorizes an error message into an actionable category.
 * Helps agents determine whether retry is worthwhile.
 *
 * @param message - The error message to categorize
 * @returns Category string: 'not_found', 'unauthorized', 'invalid_request', or 'transient'
 */
export function categorizeError(message: string): string {
  if (message.includes('401') || message.includes('403')) return 'unauthorized';
  if (message.includes('404')) return 'not_found';
  if (message.includes('400') || message.includes('422')) return 'invalid_request';
  return 'transient';
}

/** Regex pattern to detect base64-encoded strings (minimum 4 characters) */
const BASE64_REGEX = /^[A-Za-z0-9+/]{4,}={0,2}$/;

/**
 * Decodes a base64-encoded field on an object in place.
 * Only decodes if the field exists, is a string, and matches base64 pattern.
 *
 * @param obj - The object containing the field
 * @param fieldName - The name of the field to decode
 *
 * @example
 * const script = { name: 'MyScript', script: 'Y29uc29sZS5sb2coImhlbGxvIik=' };
 * decodeBase64Field(script, 'script');
 * // script.script is now 'console.log("hello")'
 */
export function decodeBase64Field(obj: any, fieldName: string): void {
  if (obj && typeof obj === 'object' && fieldName in obj && typeof obj[fieldName] === 'string') {
    const content = obj[fieldName];
    if (BASE64_REGEX.test(content)) {
      try {
        obj[fieldName] = Buffer.from(content, 'base64').toString('utf-8');
      } catch (error) {
        console.error(`Failed to decode base64 field "${fieldName}":`, error);
      }
    }
  }
}
