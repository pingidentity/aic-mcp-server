import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { REALMS, safePathSegmentSchema } from '../../utils/validationHelpers.js';
import { buildAMJourneyNodesUrl, AM_API_HEADERS } from '../../utils/amHelpers.js';

const SCOPES = ['fr:am:*'];

export const deleteJourneyNodesTool = {
  name: 'deleteJourneyNodes',
  title: 'Delete Journey Nodes (Batch)',
  description: 'Batch delete orphaned node instances. Use this to clean up nodes that were removed from a journey during an update (via saveJourney) but still exist in AM. Note: Deleting an entire journey automatically cleans up its nodes, so this tool is only needed after journey updates that remove nodes. Deletes are executed in parallel and individual failures do not stop other deletions.',
  scopes: SCOPES,
  annotations: {
    destructiveHint: true,
    openWorldHint: true
  },
  inputSchema: {
    realm: z.enum(REALMS).describe('The realm containing the nodes'),
    nodes: z.array(z.object({
      nodeType: safePathSegmentSchema.describe('The node type'),
      nodeId: safePathSegmentSchema.describe('The node instance UUID')
    })).min(1).describe('Array of nodes to delete')
  },
  async toolFunction({ realm, nodes }: {
    realm: string;
    nodes: Array<{ nodeType: string; nodeId: string }>;
  }) {
    // Execute all deletes in parallel, capturing results
    const deletePromises = nodes.map(async ({ nodeType, nodeId }) => {
      const url = buildAMJourneyNodesUrl(realm, nodeType, nodeId);

      try {
        await makeAuthenticatedRequest(url, SCOPES, {
          method: 'DELETE',
          headers: AM_API_HEADERS,
        });
        return { nodeType, nodeId, deleted: true, error: null };
      } catch (error: any) {
        return { nodeType, nodeId, deleted: false, error: error.message };
      }
    });

    const results = await Promise.all(deletePromises);

    const successCount = results.filter(r => r.deleted).length;
    const errorCount = results.filter(r => !r.deleted).length;

    const response = {
      realm,
      results,
      successCount,
      errorCount,
    };

    return createToolResponse(JSON.stringify(response, null, 2));
  },
};
