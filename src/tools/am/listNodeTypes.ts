import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { REALMS } from '../../utils/validationHelpers.js';
import { buildAMRealmUrl, AM_API_HEADERS } from '../../utils/amHelpers.js';

const SCOPES = ['fr:am:*'];

export const listNodeTypesTool = {
  name: 'listNodeTypes',
  title: 'List AM Node Types',
  description:
    'Discover all available authentication node types in a realm. Returns node type metadata including ID, name, and tags. Use this to understand what node types can be used when building journeys.',
  scopes: SCOPES,
  annotations: {
    readOnlyHint: true,
    openWorldHint: true
  },
  inputSchema: {
    realm: z.enum(REALMS).describe('The realm to query')
  },
  async toolFunction({ realm }: { realm: string }) {
    try {
      const url = `${buildAMRealmUrl(realm, 'realm-config/authentication/authenticationtrees/nodes')}?_action=getAllTypes`;

      const { data, response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'POST',
        headers: AM_API_HEADERS,
        body: JSON.stringify({})
      });

      // Extract the result array and format response
      const nodeTypes = (data as any)?.result || [];
      const formattedResponse = {
        realm,
        nodeTypes,
        count: nodeTypes.length
      };

      return createToolResponse(formatSuccess(formattedResponse, response));
    } catch (error: any) {
      return createToolResponse(`Failed to list node types in realm "${realm}": ${error.message}`);
    }
  }
};
