import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';

const aicBaseUrl = process.env.AIC_BASE_URL;

const SCOPES = ['fr:idc:esv:update'];

export const deleteVariableTool = {
  name: 'deleteVariable',
  title: 'Delete Environment Variable (ESV)',
  description: 'Delete an environment variable (ESV) from PingOne AIC.',
  scopes: SCOPES,
  inputSchema: {
    variableId: z.string().describe(
      "The unique identifier of the variable to delete (e.g., 'esv-my-variable')"
    ),
  },
  async toolFunction({ variableId }: { variableId: string }) {
    try {
      const url = `https://${aicBaseUrl}/environment/variables/${variableId}`;

      const { data, response } = await makeAuthenticatedRequest(
        url,
        SCOPES,
        {
          method: 'DELETE',
          headers: {
            'accept-api-version': 'protocol=1.0,resource=1.0'
          }
        }
      );

      const successMessage = `Variable '${variableId}' deleted successfully. Pod restart required for changes to take effect.`;

      return createToolResponse(formatSuccess({
        _id: variableId,
        message: successMessage
      }, response));
    } catch (error: any) {
      return createToolResponse(`Error deleting environment variable '${variableId}': ${error.message}`);
    }
  }
};
