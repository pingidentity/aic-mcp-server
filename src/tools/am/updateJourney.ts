import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { REALMS, safePathSegmentSchema } from '../../utils/validationHelpers.js';
import {
  buildAMJourneyUrl,
  AM_API_HEADERS,
  categorizeError,
  generateNodeIdMapping,
  validateConnectionTargets,
  transformJourneyIds,
  JourneyInput,
  JourneyNodeInput
} from '../../utils/amHelpers.js';

const SCOPES = ['fr:am:*'];

export const updateJourneyTool = {
  name: 'updateJourney',
  title: 'Update Journey',
  description:
    'Update an existing authentication journey. Fetches the current journey, merges any caller-provided metadata fields (description, identityResource, mustRun, innerTreeOnly, uiConfig, enabled, maximumSessionTime, maximumIdleTime), and PUTs the result back. If nodes and/or entryNodeId are provided, the graph is replaced atomically using the same UUID transformation pipeline as createJourney; otherwise the existing graph is preserved unchanged. Fields not supplied by the caller are preserved from the fetched journey.',
  scopes: SCOPES,
  annotations: {
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  },
  inputSchema: {
    realm: z.enum(REALMS).describe('The realm containing the journey'),
    journeyName: safePathSegmentSchema.describe('The name of the journey to update'),
    description: z.string().optional().describe('Admin-facing description of the journey'),
    identityResource: z
      .string()
      .optional()
      .describe(
        'The identity resource that the journey authenticates against. Expected format: "managed/<realm>_<objectType>" (e.g., "managed/alpha_user", "managed/bravo_role").'
      ),
    mustRun: z.boolean().optional().describe('Whether the journey must run to completion'),
    innerTreeOnly: z.boolean().optional().describe('Whether the journey can only be used as an inner tree'),
    uiConfig: z
      .record(z.any())
      .optional()
      .describe(
        'Unbounded JSON object of UI configuration key/value pairs. The set of meaningful keys is defined by AM and is not enumerated here. To discover the shape for a given journey, read it first with getJourney.'
      ),
    enabled: z.boolean().optional().describe('Whether the journey is enabled'),
    maximumSessionTime: z.number().optional().describe('Maximum session time in minutes'),
    maximumIdleTime: z.number().optional().describe('Maximum idle time in minutes'),
    entryNodeId: z
      .string()
      .optional()
      .describe(
        'ID of the first node (connected from Start). Required when replacing the graph. Can be human-readable; will be transformed to UUID.'
      ),
    nodes: z
      .record(
        z.object({
          nodeType: z.string().describe('The AM node type (e.g., "PageNode", "IdentityStoreDecisionNode")'),
          displayName: z.string().describe('Admin-facing display name for this node'),
          connections: z
            .record(z.string())
            .describe('Map of outcome IDs to target node IDs. Use "success" or "failure" for terminal nodes.'),
          config: z
            .record(z.any())
            .describe(
              'Node-specific configuration. For PageNodes, include the "nodes" array with child node definitions.'
            )
        })
      )
      .optional()
      .describe(
        'Map of node IDs to node definitions. When provided, replaces the existing graph entirely and must be provided together with entryNodeId. Keys can be human-readable (e.g., "login-page"); they will be transformed to UUIDs.'
      )
  },
  async toolFunction({
    realm,
    journeyName,
    description,
    identityResource,
    mustRun,
    innerTreeOnly,
    uiConfig,
    enabled,
    maximumSessionTime,
    maximumIdleTime,
    entryNodeId,
    nodes
  }: {
    realm: string;
    journeyName: string;
    description?: string;
    identityResource?: string;
    mustRun?: boolean;
    innerTreeOnly?: boolean;
    uiConfig?: Record<string, any>;
    enabled?: boolean;
    maximumSessionTime?: number;
    maximumIdleTime?: number;
    entryNodeId?: string;
    nodes?: Record<string, JourneyNodeInput>;
  }) {
    try {
      // Require at least one update field so a no-op PUT doesn't silently round-trip the fetched journey.
      const hasMetadata =
        description !== undefined ||
        identityResource !== undefined ||
        mustRun !== undefined ||
        innerTreeOnly !== undefined ||
        uiConfig !== undefined ||
        enabled !== undefined ||
        maximumSessionTime !== undefined ||
        maximumIdleTime !== undefined;
      const hasGraph = nodes !== undefined || entryNodeId !== undefined;

      if (!hasMetadata && !hasGraph) {
        return createToolResponse(
          'No updates provided. Specify at least one of: description, identityResource, mustRun, innerTreeOnly, uiConfig, enabled, maximumSessionTime, maximumIdleTime, entryNodeId, nodes'
        );
      }

      // Build metadata overrides (only include keys explicitly provided by the caller)
      const metadataOverrides: Record<string, unknown> = {
        ...(description !== undefined && { description }),
        ...(identityResource !== undefined && { identityResource }),
        ...(mustRun !== undefined && { mustRun }),
        ...(innerTreeOnly !== undefined && { innerTreeOnly }),
        ...(uiConfig !== undefined && { uiConfig }),
        ...(enabled !== undefined && { enabled }),
        ...(maximumSessionTime !== undefined && { maximumSessionTime }),
        ...(maximumIdleTime !== undefined && { maximumIdleTime })
      };

      // Step 1: Fetch current journey
      const url = buildAMJourneyUrl(realm, journeyName);

      const { data: fetchedData } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'GET',
        headers: AM_API_HEADERS
      });

      // Strip _rev: it's a server-managed revision token that AM rejects on PUT
      // with "Invalid attribute specified". Everything else is safe to forward.
      const fetchedJourney = { ...(fetchedData as Record<string, unknown>) };
      delete fetchedJourney._rev;

      // Step 2: Build payload based on whether graph replacement was requested
      let payload: Record<string, unknown>;
      let idMapping: Record<string, string> | null = null;

      if (nodes !== undefined) {
        // Graph-replacement path: entryNodeId is required alongside nodes
        if (entryNodeId === undefined) {
          return createToolResponse(
            'When providing "nodes" for graph replacement, "entryNodeId" must also be provided.'
          );
        }

        const journeyData: JourneyInput = { entryNodeId, nodes };

        // Validate connection targets
        const validation = validateConnectionTargets(journeyData);
        if (!validation.isValid) {
          return createToolResponse(`Invalid journey structure: ${validation.errors.join('; ')}`);
        }

        // Run UUID transformation pipeline
        idMapping = generateNodeIdMapping(journeyData);
        const transformedJourney = transformJourneyIds(journeyName, journeyData, idMapping);

        // Wide-spread: fetched journey base, transformed graph replaces _id/entryNodeId/nodes/staticNodes,
        // then caller-supplied metadata overrides on top.
        payload = {
          ...fetchedJourney,
          ...transformedJourney,
          ...metadataOverrides
        };
      } else {
        // Metadata-only path: preserve graph from fetched journey
        if (entryNodeId !== undefined) {
          // entryNodeId without nodes is not supported — it would leave dangling references
          return createToolResponse(
            '"entryNodeId" can only be updated together with a full "nodes" graph replacement.'
          );
        }

        payload = {
          ...fetchedJourney,
          ...metadataOverrides
        };
      }

      // Step 3: PUT merged payload back
      const { response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'PUT',
        headers: AM_API_HEADERS,
        body: JSON.stringify(payload)
      });

      // Step 4: Return result
      const result: Record<string, unknown> = {
        success: true,
        journeyName
      };

      if (idMapping) {
        // Include idMapping when graph was replaced so callers can correlate human-readable IDs to UUIDs
        result.nodeIdMapping = idMapping;
      }

      return createToolResponse(formatSuccess(result, response));
    } catch (error: any) {
      const category = categorizeError(error.message);
      return createToolResponse(`Failed to update journey "${journeyName}" [${category}]: ${error.message}`);
    }
  }
};
