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
  JourneyInput
} from '../../utils/amHelpers.js';

const SCOPES = ['fr:am:*'];

export const createJourneyTool = {
  name: 'createJourney',
  title: 'Create Journey',
  description:
    'Create or replace an authentication journey (upsert operation — if a journey with the same name already exists, it is overwritten). Node IDs can be human-readable (e.g., "login-page") and will be automatically transformed to UUIDs. Use "success" or "failure" as connection targets for terminal nodes. Returns the mapping of original IDs to generated UUIDs.',
  scopes: SCOPES,
  annotations: {
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  },
  inputSchema: {
    realm: z.enum(REALMS).describe('The realm to create the journey in'),
    journeyName: safePathSegmentSchema.describe('The name of the journey'),
    description: z.string().optional().describe('Admin-facing description of the journey'),
    identityResource: z
      .string()
      .optional()
      .describe(
        'The identity resource that the journey authenticates against. Expected format: "managed/<realm>_<objectType>" (e.g., "managed/alpha_user", "managed/bravo_role").'
      ),
    journeyData: z
      .object({
        entryNodeId: z
          .string()
          .describe('ID of the first node (connected from Start). Can be human-readable; will be transformed to UUID.'),
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
          .describe(
            'Map of node IDs to node definitions. Keys can be human-readable (e.g., "login-page"); they will be transformed to UUIDs.'
          )
      })
      .describe('The journey structure')
  },
  async toolFunction({
    realm,
    journeyName,
    description,
    identityResource,
    journeyData
  }: {
    realm: string;
    journeyName: string;
    description?: string;
    identityResource?: string;
    journeyData: JourneyInput;
  }) {
    try {
      // Step 1: Validate connection targets
      const validation = validateConnectionTargets(journeyData);
      if (!validation.isValid) {
        return createToolResponse(`Invalid journey structure: ${validation.errors.join('; ')}`);
      }

      // Step 2: Generate ID mapping (includes PageNode child IDs)
      const idMapping = generateNodeIdMapping(journeyData);

      // Step 3: Transform journey data
      const transformedJourney = transformJourneyIds(journeyName, journeyData, idMapping);

      // Step 4: Build API payload
      const payload = {
        ...transformedJourney,
        ...(description && { description }),
        ...(identityResource && { identityResource })
      };

      // Step 5: Make API call
      const url = buildAMJourneyUrl(realm, journeyName);

      const { response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'PUT',
        headers: AM_API_HEADERS,
        body: JSON.stringify(payload)
      });

      // Step 6: Return result with ID mapping
      const result = {
        success: true,
        journeyName,
        nodeIdMapping: idMapping
      };

      return createToolResponse(formatSuccess(result, response));
    } catch (error: any) {
      const category = categorizeError(error.message);
      return createToolResponse(`Failed to create journey "${journeyName}" [${category}]: ${error.message}`);
    }
  }
};
