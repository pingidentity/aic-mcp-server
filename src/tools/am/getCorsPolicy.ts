import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { safePathSegmentSchema } from '../../utils/validationHelpers.js';
import { buildAMGlobalConfigUrl, AM_CORS_HEADERS } from '../../utils/amHelpers.js';

const SCOPES = ['fr:am:*'];

export const getCorsPolicyTool = {
  name: 'getCorsPolicy',
  title: 'Get CORS Policy',
  description:
    'Retrieve a single CORS policy by its ID from the global AM CorsService. Returns the full policy including origins, methods, headers, maxAge, allowCredentials, and enabled status.',
  scopes: SCOPES,
  annotations: {
    readOnlyHint: true,
    openWorldHint: true
  },
  inputSchema: {
    policyId: safePathSegmentSchema.describe('The unique identifier of the CORS policy')
  },
  async toolFunction({ policyId }: { policyId: string }) {
    try {
      const url = buildAMGlobalConfigUrl('CorsService', encodeURIComponent(policyId));

      const { data, response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'GET',
        headers: AM_CORS_HEADERS
      });

      return createToolResponse(formatSuccess(data, response));
    } catch (error: any) {
      return createToolResponse(`Failed to get CORS policy "${policyId}": ${error.message}`);
    }
  }
};
