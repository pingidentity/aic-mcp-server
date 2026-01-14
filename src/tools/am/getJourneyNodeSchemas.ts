import { z } from 'zod';
import { createToolResponse } from '../../utils/apiHelpers.js';
import { REALMS, safePathSegmentSchema } from '../../utils/validationHelpers.js';
import { fetchNodeSchemas } from '../../utils/amHelpers.js';

// Define scopes as a constant so they can be referenced in both the tool definition and function
const SCOPES = ['fr:am:*'];

export const getJourneyNodeSchemasTool = {
  name: 'getJourneyNodeSchemas',
  title: 'Get Journey Node Schemas (Batch)',
  description: 'Retrieve schemas for multiple journey node types in a single operation. Returns the schema definition for each requested node type, useful for understanding available node configurations.',
  scopes: SCOPES,
  annotations: {
    readOnlyHint: true,
    openWorldHint: true
  },
  inputSchema: {
    realm: z.enum(REALMS).describe('The realm containing the journey nodes'),
    nodeTypes: z.array(safePathSegmentSchema).min(1).describe(
      'Array of node type names to retrieve schemas for (e.g., [\'IncrementLoginCountNode\', \'UsernameCollectorNode\', \'PasswordCollectorNode\'])'
    ),
  },
  async toolFunction({ realm, nodeTypes }: { realm: string; nodeTypes: string[] }) {
    try {
      const results = await fetchNodeSchemas(realm, nodeTypes, SCOPES);

      // Format the results
      const response = {
        realm,
        totalRequested: nodeTypes.length,
        results,
        successCount: results.filter(r => r.error === null).length,
        errorCount: results.filter(r => r.error !== null).length,
      };

      return createToolResponse(JSON.stringify(response, null, 2));
    } catch (error: any) {
      return createToolResponse(`Failed to get node schemas in realm "${realm}": ${error.message}`);
    }
  },
};
