/**
 * AM (Access Management) specific helpers for journey and script operations.
 *
 * Includes:
 * - API version headers for AM endpoints
 * - URL builders for AM realm-based endpoints
 * - Batch operations for fetching node schemas and configs
 * - Base64 decoding utilities for script content
 */

import { randomUUID } from 'crypto';
import { makeAuthenticatedRequest } from './apiHelpers.js';

const aicBaseUrl = process.env.AIC_BASE_URL;

/**
 * Standard headers for AM API requests (protocol 2.1, resource 1.0).
 * Used for journey and node operations.
 */
export const AM_API_HEADERS = {
  'accept-api-version': 'protocol=2.1,resource=1.0',
  'Content-Type': 'application/json'
} as const;

/**
 * Headers for AM script API requests (protocol 1.0, resource 1.0).
 * Used by getAMScript for reading scripts.
 */
export const AM_SCRIPT_HEADERS = {
  'accept-api-version': 'protocol=1.0,resource=1.0',
  'Content-Type': 'application/json'
} as const;

/**
 * Headers for AM script API requests v2 (protocol 2.0, resource 1.0).
 * Used for creating, updating, and deleting scripts, and for contexts endpoint.
 */
export const AM_SCRIPT_HEADERS_V2 = {
  'accept-api-version': 'protocol=2.0,resource=1.0',
  'Content-Type': 'application/json'
} as const;

/**
 * Fixed node IDs for journey terminal nodes.
 * These are constants defined by AM and must not be changed.
 */
export const STATIC_NODE_IDS = {
  SUCCESS: '70e691a5-1e33-4ac3-a356-e7b6d60d92e0',
  FAILURE: 'e301438c-0bd0-429c-ab0c-66126501069a'
} as const;

/**
 * Human-readable aliases that LLMs can use in connections.
 * These are transformed to real UUIDs before sending to AM.
 */
export const CONNECTION_ALIASES: Record<string, string> = {
  success: STATIC_NODE_IDS.SUCCESS,
  failure: STATIC_NODE_IDS.FAILURE
};

/**
 * Regex pattern for validating UUIDs
 */
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Input format for journey nodes (LLM-friendly)
 */
export interface JourneyNodeInput {
  nodeType: string;
  displayName: string;
  connections: Record<string, string>; // outcomeId → targetNodeId or alias
  config: Record<string, any>;
}

/**
 * Input format for saveJourney tool
 */
export interface JourneyInput {
  entryNodeId: string;
  nodes: Record<string, JourneyNodeInput>;
}

/**
 * Transformed journey ready for AM API
 */
export interface TransformedJourney {
  _id: string;
  entryNodeId: string;
  nodes: Record<string, AMNode>;
  staticNodes: Record<string, object>;
}

/**
 * Node format expected by AM API
 */
export interface AMNode {
  nodeType: string;
  displayName: string;
  connections: Record<string, string>;
  config: Record<string, any> & { _id: string };
}

/**
 * Result from fetching node type details
 */
export interface NodeTypeDetailsResult {
  nodeType: string;
  schema: any | null;
  template: any | null;
  outcomes: Array<{ id: string; displayName: string }> | null;
  error: string | null;
}

/**
 * Child node definition for PageNode outcomes calculation
 */
export interface PageNodeChild {
  nodeType: string;
  _properties: Record<string, any>;
}

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
  const base = buildAMRealmUrl(
    realm,
    `realm-config/authentication/authenticationtrees/nodes/${encodeURIComponent(nodeType)}`
  );
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
export async function fetchNodeSchemas(realm: string, nodeTypes: string[], scopes: string[]): Promise<SchemaResult[]> {
  const schemaPromises = nodeTypes.map(async (nodeType) => {
    const url = `${buildAMJourneyNodesUrl(realm, nodeType)}?_action=schema`;

    try {
      const { data } = await makeAuthenticatedRequest(url, scopes, {
        method: 'POST',
        headers: AM_API_HEADERS,
        body: JSON.stringify({})
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
        headers: AM_API_HEADERS
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
 * Encodes a string to base64.
 * Used for encoding script content before sending to AM API.
 *
 * @param content - The string content to encode
 * @returns Base64-encoded string
 */
export function encodeBase64(content: string): string {
  return Buffer.from(content, 'utf-8').toString('base64');
}

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

/**
 * Fetches schema, template, and outcomes for multiple node types in parallel.
 *
 * @param realm - The realm to query
 * @param nodeTypes - Array of node type names
 * @param scopes - OAuth scopes for the request
 * @returns Object keyed by nodeType with schema, template, outcomes, and any errors
 */
export async function fetchNodeTypeDetails(
  realm: string,
  nodeTypes: string[],
  scopes: string[]
): Promise<Record<string, NodeTypeDetailsResult>> {
  const results: Record<string, NodeTypeDetailsResult> = {};

  await Promise.all(
    nodeTypes.map(async (nodeType) => {
      const baseUrl = buildAMJourneyNodesUrl(realm, nodeType);

      try {
        // Fetch all three endpoints in parallel for this node type
        const [schemaRes, templateRes, outcomesRes] = await Promise.all([
          makeAuthenticatedRequest(`${baseUrl}?_action=schema`, scopes, {
            method: 'POST',
            headers: AM_API_HEADERS,
            body: JSON.stringify({})
          }),
          makeAuthenticatedRequest(`${baseUrl}?_action=template`, scopes, {
            method: 'POST',
            headers: AM_API_HEADERS,
            body: JSON.stringify({})
          }),
          makeAuthenticatedRequest(`${baseUrl}?_action=listOutcomes`, scopes, {
            method: 'POST',
            headers: AM_API_HEADERS,
            body: JSON.stringify({})
          })
        ]);

        results[nodeType] = {
          nodeType,
          schema: schemaRes.data,
          template: templateRes.data,
          outcomes: outcomesRes.data as Array<{ id: string; displayName: string }>,
          error: null
        };
      } catch (error: any) {
        results[nodeType] = {
          nodeType,
          schema: null,
          template: null,
          outcomes: null,
          error: error.message
        };
      }
    })
  );

  return results;
}

/**
 * Builds the staticNodes object required by AM.
 * Includes startNode and the fixed success/failure nodes.
 *
 * @returns Static nodes object for journey payload
 */
export function buildStaticNodes(): Record<string, object> {
  return {
    startNode: { x: 50, y: 250 },
    [STATIC_NODE_IDS.SUCCESS]: { x: 550, y: 150 },
    [STATIC_NODE_IDS.FAILURE]: { x: 550, y: 350 }
  };
}

/**
 * Generates a mapping from human-readable node IDs to UUIDs.
 * If an ID is already a valid UUID, it's preserved as-is.
 * Also extracts and maps PageNode child node IDs.
 *
 * @param journeyData - The journey input data
 * @returns Mapping of original ID → UUID (includes both top-level and PageNode child IDs)
 */
export function generateNodeIdMapping(journeyData: JourneyInput): Record<string, string> {
  const idMapping: Record<string, string> = {};

  // Process top-level nodes
  for (const nodeId of Object.keys(journeyData.nodes)) {
    idMapping[nodeId] = UUID_REGEX.test(nodeId) ? nodeId : randomUUID();
  }

  // Process PageNode child nodes
  for (const node of Object.values(journeyData.nodes)) {
    if (node.nodeType === 'PageNode' && Array.isArray(node.config?.nodes)) {
      for (const childNode of node.config.nodes) {
        if (childNode._id && !idMapping[childNode._id]) {
          idMapping[childNode._id] = UUID_REGEX.test(childNode._id) ? childNode._id : randomUUID();
        }
      }
    }
  }

  return idMapping;
}

/**
 * Validates that all connection targets reference valid nodes or aliases.
 * Also checks that no node connects to itself (self-reference).
 *
 * @param journeyData - The journey input data
 * @returns Object with isValid boolean and array of error messages
 */
export function validateConnectionTargets(journeyData: JourneyInput): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const validTargets = new Set([...Object.keys(journeyData.nodes), ...Object.keys(CONNECTION_ALIASES)]);

  // Check entryNodeId
  if (!journeyData.nodes[journeyData.entryNodeId]) {
    errors.push(`entryNodeId "${journeyData.entryNodeId}" does not reference a valid node`);
  }

  // Check all connections
  for (const [nodeId, node] of Object.entries(journeyData.nodes)) {
    for (const [outcome, targetId] of Object.entries(node.connections)) {
      // Check for self-reference
      if (targetId === nodeId) {
        errors.push(`Node "${nodeId}" outcome "${outcome}" cannot connect to itself`);
        continue;
      }

      const lowerTarget = targetId.toLowerCase();
      if (!validTargets.has(targetId) && !CONNECTION_ALIASES[lowerTarget]) {
        errors.push(`Node "${nodeId}" outcome "${outcome}" references unknown target "${targetId}"`);
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Transforms a journey definition to use UUIDs for all node references.
 *
 * - Replaces node keys with UUIDs
 * - Updates entryNodeId
 * - Updates all connection target references
 * - Resolves "success"/"failure" aliases to static node IDs
 * - Sets config._id to match the node's UUID
 * - Transforms PageNode child node IDs
 *
 * @param journeyName - The name of the journey
 * @param journeyData - Original journey data with human-readable IDs
 * @param idMapping - Mapping from original IDs to UUIDs
 * @returns Transformed journey data ready for AM API
 */
export function transformJourneyIds(
  journeyName: string,
  journeyData: JourneyInput,
  idMapping: Record<string, string>
): TransformedJourney {
  const resolveId = (id: string): string => {
    // Check if it's an alias first (case-insensitive)
    const lowerCaseId = id.toLowerCase();
    if (CONNECTION_ALIASES[lowerCaseId]) {
      return CONNECTION_ALIASES[lowerCaseId];
    }
    // Then check the mapping
    if (idMapping[id]) {
      return idMapping[id];
    }
    // If not found, return as-is (might be a real UUID already)
    return id;
  };

  const transformedNodes: Record<string, AMNode> = {};

  for (const [originalId, node] of Object.entries(journeyData.nodes)) {
    const newId = idMapping[originalId];

    // Transform connections
    const transformedConnections: Record<string, string> = {};
    for (const [outcome, targetId] of Object.entries(node.connections)) {
      transformedConnections[outcome] = resolveId(targetId);
    }

    // Transform PageNode child node IDs if present
    // Child nodes are internal to PageNode and not referenced elsewhere in the graph,
    // so we auto-generate UUIDs for any that don't have explicit _id values
    const transformedConfig = { ...node.config };
    if (node.nodeType === 'PageNode' && Array.isArray(node.config?.nodes)) {
      transformedConfig.nodes = node.config.nodes.map((childNode: any) => ({
        ...childNode,
        _id: childNode._id || randomUUID()
      }));
    }

    // Build transformed node
    transformedNodes[newId] = {
      nodeType: node.nodeType,
      displayName: node.displayName,
      connections: transformedConnections,
      config: {
        ...transformedConfig,
        _id: newId // Inject the UUID into config
      }
    };
  }

  return {
    _id: journeyName,
    entryNodeId: resolveId(journeyData.entryNodeId),
    nodes: transformedNodes,
    staticNodes: buildStaticNodes()
  };
}
