import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { REALMS } from '../../utils/validationHelpers.js';

const aicBaseUrl = process.env.AIC_BASE_URL;
const SCOPES = ['fr:idm:*'];

export const listOidcAppsTool = {
  name: 'listOidcApps',
  title: 'List OIDC Apps',
  description:
    'Lists OIDC applications in a realm with summary fields only. ' +
    'Use getOidcApp for full details of a specific app.',
  scopes: SCOPES,
  annotations: {
    readOnlyHint: true,
    openWorldHint: true
  },
  inputSchema: {
    realm: z.enum(REALMS).describe('The realm'),
    queryFilter: z
      .string()
      .optional()
      .describe('Optional CREST query filter. Default: true (all apps). ' + 'Example: name sw "my"')
  },
  async toolFunction({ realm, queryFilter }: { realm: (typeof REALMS)[number]; queryFilter?: string }) {
    try {
      const filter = queryFilter || 'true';
      const fields = 'name,ssoEntities,templateName,authoritative,_id';
      const url =
        `https://${aicBaseUrl}/openidm/managed/${realm}_application` +
        `?_queryFilter=${encodeURIComponent(filter)}&_fields=${fields}`;

      const { data, response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'GET'
      });

      return createToolResponse(formatSuccess(data, response));
    } catch (error: any) {
      return createToolResponse(`Failed to list OIDC apps: ${error.message}`);
    }
  }
};
