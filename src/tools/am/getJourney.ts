import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { REALMS, safePathSegmentSchema } from '../../utils/validationHelpers.js';
import {
  buildAMRealmUrl,
  AM_API_HEADERS,
  fetchNodeSchemas,
  fetchNodeConfigs,
  categorizeError
} from '../../utils/amHelpers.js';

// Define scopes as a constant so they can be referenced in both the tool definition and function
const SCOPES = ['fr:am:*'];

/** Throws on first error found in schema results */
function throwOnSchemaError(results: Array<{ nodeType: string; error: string | null }>) {
  const failed = results.find((r) => r.error !== null);
  if (failed) {
    throw new Error(`schema for node type "${failed.nodeType}": ${failed.error}`);
  }
}

/** Throws on first error found in config results */
function throwOnConfigError(results: Array<{ nodeId: string; nodeType: string; error: string | null }>) {
  const failed = results.find((r) => r.error !== null);
  if (failed) {
    throw new Error(`config for node "${failed.nodeId}" (${failed.nodeType}): ${failed.error}`);
  }
}

export const getJourneyTool = {
  name: 'getJourney',
  title: 'Get AM Journey (with Node Details)',
  description:
    'Retrieve a specific authentication journey (tree) by name from a realm in PingOne AIC. Automatically fetches and includes complete node schemas and configurations for all nodes in the journey. Returns comprehensive journey data with embedded node details.',
  scopes: SCOPES,
  annotations: {
    readOnlyHint: true,
    openWorldHint: true
  },
  inputSchema: {
    realm: z.enum(REALMS).describe('The realm containing the journey'),
    journeyName: safePathSegmentSchema.describe("The name of the journey to retrieve (e.g., 'Login', 'Registration')")
  },
  async toolFunction({ realm, journeyName }: { realm: string; journeyName: string }) {
    try {
      // Step 1: Fetch the journey
      const encodedJourneyName = encodeURIComponent(journeyName);
      const journeyUrl = `${buildAMRealmUrl(realm, 'realm-config/authentication/authenticationtrees/trees')}/${encodedJourneyName}`;

      const { data: journeyData, response } = await makeAuthenticatedRequest(journeyUrl, SCOPES, {
        method: 'GET',
        headers: AM_API_HEADERS
      });

      // Step 2: Parse nodes from the journey
      const journey = journeyData as any;
      const nodes = journey?.nodes || {};

      // Extract top-level node information: nodes is an object where keys are node IDs and values contain nodeType
      const topLevelNodeEntries = Object.entries(nodes).map(([nodeId, nodeData]: [string, any]) => ({
        nodeId,
        nodeType: nodeData?.nodeType
      }));

      // If there are no nodes, return the journey as-is
      if (topLevelNodeEntries.length === 0) {
        return createToolResponse(formatSuccess(journeyData, response));
      }

      // Step 3: Extract unique node types and fetch schemas and configs for top-level nodes (in parallel)
      const uniqueNodeTypes = [...new Set(topLevelNodeEntries.map((n) => n.nodeType).filter(Boolean))];
      const topLevelNodesWithType = topLevelNodeEntries.filter((n) => n.nodeType) as Array<{
        nodeId: string;
        nodeType: string;
      }>;

      let [schemaResults, configResults] = await Promise.all([
        fetchNodeSchemas(realm, uniqueNodeTypes, SCOPES),
        fetchNodeConfigs(realm, topLevelNodesWithType, SCOPES)
      ]);

      // Fail fast on any errors
      throwOnSchemaError(schemaResults);
      throwOnConfigError(configResults);

      // Step 4: Fetch nested nodes from PageNode configs
      const pageNodeConfigs = configResults.filter((r) => r.nodeType === 'PageNode' && r.config);
      const nestedNodeEntries: Array<{ nodeId: string; nodeType: string }> = [];

      // Extract nested nodes from PageNode configs
      for (const pageNodeConfig of pageNodeConfigs) {
        const config = pageNodeConfig.config as any;
        if (Array.isArray(config.nodes)) {
          for (const node of config.nodes) {
            if (node._id && node.nodeType) {
              nestedNodeEntries.push({ nodeId: node._id, nodeType: node.nodeType });
            }
          }
        }
      }

      // If there are nested nodes, fetch their configs and schemas
      if (nestedNodeEntries.length > 0) {
        // Get unique node types that we don't already have schemas for
        const nestedNodeTypes = [...new Set(nestedNodeEntries.map((n) => n.nodeType))];
        const newNodeTypes = nestedNodeTypes.filter((nt) => !schemaResults.some((sr) => sr.nodeType === nt));

        // Fetch schemas and configs for nested nodes in parallel
        const [nestedSchemaResults, nestedConfigResults] = await Promise.all([
          fetchNodeSchemas(realm, newNodeTypes, SCOPES),
          fetchNodeConfigs(realm, nestedNodeEntries, SCOPES)
        ]);

        // Fail fast on any errors
        throwOnSchemaError(nestedSchemaResults);
        throwOnConfigError(nestedConfigResults);

        // Merge results
        schemaResults = [...schemaResults, ...nestedSchemaResults];
        configResults = [...configResults, ...nestedConfigResults];
      }

      // Step 5: Build enriched response
      const enrichedJourney = {
        ...journey,
        nodeData: {
          schemas: schemaResults.reduce(
            (acc, { nodeType, schema }) => {
              acc[nodeType] = schema;
              return acc;
            },
            {} as Record<string, any>
          ),
          configs: configResults.reduce(
            (acc, { nodeId, config }) => {
              acc[nodeId] = config;
              return acc;
            },
            {} as Record<string, any>
          )
        }
      };

      return createToolResponse(formatSuccess(enrichedJourney, response));
    } catch (error: any) {
      const category = categorizeError(error.message);
      return createToolResponse(
        `Failed to get journey "${journeyName}" in realm "${realm}" [${category}]: ${error.message}`
      );
    }
  }
};
