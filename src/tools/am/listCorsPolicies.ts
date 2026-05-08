import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { buildAMGlobalConfigUrl, AM_CORS_HEADERS } from '../../utils/amHelpers.js';

const SCOPES = ['fr:am:*'];

export const listCorsPoliciesTool = {
  name: 'listCorsPolicies',
  title: 'List CORS Policies',
  description:
    'List all CORS policies configured on the global AM CorsService. Returns policy metadata including IDs and configured origins, methods, and headers.',
  scopes: SCOPES,
  annotations: {
    readOnlyHint: true,
    openWorldHint: true
  },
  inputSchema: {},
  async toolFunction() {
    try {
      const url = `${buildAMGlobalConfigUrl('CorsService')}?_queryFilter=true`;

      const { data, response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'GET',
        headers: AM_CORS_HEADERS
      });

      return createToolResponse(formatSuccess(data, response));
    } catch (error: any) {
      return createToolResponse(`Failed to list CORS policies: ${error.message}`);
    }
  }
};
