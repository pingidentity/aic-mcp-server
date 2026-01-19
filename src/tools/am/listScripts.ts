import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { REALMS } from '../../utils/validationHelpers.js';
import { buildAMRealmUrl, AM_SCRIPT_HEADERS_V2 } from '../../utils/amHelpers.js';

const SCOPES = ['fr:am:*'];

export const listScriptsTool = {
  name: 'listScripts',
  title: 'List AM Scripts',
  description: 'List Scripted Decision Node scripts (evaluatorVersion 2.0) in a realm. Returns script metadata including ID, name, description, language, and context. Use getAMScript to retrieve the full script content.',
  scopes: SCOPES,
  annotations: {
    readOnlyHint: true,
    openWorldHint: true
  },
  inputSchema: {
    realm: z.enum(REALMS).describe('The realm to query'),
  },
  async toolFunction({ realm }: { realm: string }) {
    try {
      const url = new URL(buildAMRealmUrl(realm, 'scripts'));
      // Filter to Scripted Decision Node scripts with evaluatorVersion 2.0
      url.searchParams.append('_queryFilter', 'context eq "AUTHENTICATION_TREE_DECISION_NODE" and evaluatorVersion eq "2.0"');
      url.searchParams.append('_pageSize', '-1');
      url.searchParams.append('_fields', '_id,name,description,language,context,evaluatorVersion,creationDate,lastModifiedDate');

      const { data, response } = await makeAuthenticatedRequest(url.toString(), SCOPES, {
        method: 'GET',
        headers: AM_SCRIPT_HEADERS_V2,
      });

      return createToolResponse(formatSuccess(data, response));
    } catch (error: any) {
      return createToolResponse(`Failed to list scripts in realm "${realm}": ${error.message}`);
    }
  },
};
