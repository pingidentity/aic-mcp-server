import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { REALMS, safePathSegmentSchema } from '../../utils/validationHelpers.js';
import { buildAMJourneyNodesUrl, AM_API_HEADERS, categorizeError } from '../../utils/amHelpers.js';

const SCOPES = ['fr:am:*'];

export const updateJourneyNodeTool = {
  name: 'updateJourneyNode',
  title: 'Update Journey Node',
  description: 'Update a single node\'s configuration without modifying the journey structure. This is a FULL REPLACEMENT of the node configuration - to preserve existing fields, first fetch the current configuration using getJourney, merge your changes, then call this tool with the complete configuration.',
  scopes: SCOPES,
  annotations: {
    openWorldHint: true
  },
  inputSchema: {
    realm: z.enum(REALMS).describe('The realm containing the node'),
    nodeType: safePathSegmentSchema.describe('The node type (e.g., "ScriptedDecisionNode")'),
    nodeId: safePathSegmentSchema.describe('The node instance UUID (from a previous read or create operation)'),
    config: z.record(z.any()).describe(
      'The complete node configuration to set. This is a full replacement - fetch current config first if you need to preserve existing fields.'
    )
  },
  async toolFunction({ realm, nodeType, nodeId, config }: {
    realm: string;
    nodeType: string;
    nodeId: string;
    config: Record<string, any>;
  }) {
    try {
      const url = buildAMJourneyNodesUrl(realm, nodeType, nodeId);

      // Auto-inject _id into config to match nodeId
      const payload = {
        _id: nodeId,
        ...config,
      };

      const { response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'PUT',
        headers: AM_API_HEADERS,
        body: JSON.stringify(payload),
      });

      const result = {
        success: true,
        nodeType,
        nodeId,
      };

      return createToolResponse(formatSuccess(result, response));
    } catch (error: any) {
      const category = categorizeError(error.message);
      return createToolResponse(`Failed to update node "${nodeId}" [${category}]: ${error.message}`);
    }
  },
};
