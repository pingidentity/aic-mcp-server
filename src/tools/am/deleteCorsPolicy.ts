import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { safePathSegmentSchema } from '../../utils/validationHelpers.js';
import { buildAMGlobalConfigUrl, AM_CORS_HEADERS } from '../../utils/amHelpers.js';

const SCOPES = ['fr:am:*'];

export const deleteCorsPolicyTool = {
  name: 'deleteCorsPolicy',
  title: 'Delete CORS Policy',
  description:
    'Delete a CORS policy by its ID from the global AM CorsService. Warning: this is a permanent deletion and cannot be undone.',
  scopes: SCOPES,
  annotations: {
    destructiveHint: true,
    openWorldHint: true
  },
  inputSchema: {
    policyId: safePathSegmentSchema.describe('The unique identifier of the CORS policy to delete')
  },
  async toolFunction({ policyId }: { policyId: string }) {
    try {
      const url = buildAMGlobalConfigUrl('CorsService', encodeURIComponent(policyId));

      const { response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'DELETE',
        headers: AM_CORS_HEADERS
      });

      const transactionId = response.headers.get('x-forgerock-transactionid') || 'unknown';

      return createToolResponse(
        `CORS policy "${policyId}" deleted successfully.\n` + `Transaction ID: ${transactionId}`
      );
    } catch (error: any) {
      return createToolResponse(`Failed to delete CORS policy "${policyId}": ${error.message}`);
    }
  }
};
