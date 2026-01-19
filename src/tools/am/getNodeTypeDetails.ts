import { z } from 'zod';
import { createToolResponse } from '../../utils/apiHelpers.js';
import { REALMS, safePathSegmentSchema } from '../../utils/validationHelpers.js';
import { fetchNodeTypeDetails } from '../../utils/amHelpers.js';

const SCOPES = ['fr:am:*'];

export const getNodeTypeDetailsTool = {
  name: 'getNodeTypeDetails',
  title: 'Get Node Type Details',
  description: 'Get complete details (schema, default template, and outcomes) for one or more node types. Use this before building journeys to understand what configuration each node type requires and what outcomes it produces.',
  scopes: SCOPES,
  annotations: {
    readOnlyHint: true,
    openWorldHint: true
  },
  inputSchema: {
    realm: z.enum(REALMS).describe('The realm to query'),
    nodeTypes: z.array(safePathSegmentSchema).min(1).describe(
      'Array of node type names to get details for (e.g., ["UsernameCollectorNode", "PasswordCollectorNode"])'
    )
  },
  async toolFunction({ realm, nodeTypes }: { realm: string; nodeTypes: string[] }) {
    try {
      const results = await fetchNodeTypeDetails(realm, nodeTypes, SCOPES);

      // Count successes and errors
      const resultValues = Object.values(results);
      const successCount = resultValues.filter(r => r.error === null).length;
      const errorCount = resultValues.filter(r => r.error !== null).length;

      const response = {
        realm,
        results,
        successCount,
        errorCount,
      };

      return createToolResponse(JSON.stringify(response, null, 2));
    } catch (error: any) {
      return createToolResponse(`Failed to get node type details in realm "${realm}": ${error.message}`);
    }
  },
};
