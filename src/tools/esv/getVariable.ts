import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';

const aicBaseUrl = process.env.AIC_BASE_URL;

const SCOPES = ['fr:idc:esv:read'];

export const getVariableTool = {
  name: 'getVariable',
  title: 'Get Environment Variable (ESV)',
  description: 'Retrieve a specific environment variable (ESV) by ID with decoded value',
  scopes: SCOPES,
  inputSchema: {
    variableId: z.string().describe('Variable ID (format: esv-*)'),
  },
  async toolFunction({ variableId }: { variableId: string }) {
    try {
      const url = `https://${aicBaseUrl}/environment/variables/${variableId}`;

      const { data, response } = await makeAuthenticatedRequest(
        url,
        SCOPES,
        {
          headers: {
            'accept-api-version': 'resource=2.0'
          }
        }
      );

      // Decode the base64 value and replace the field
      const variableData = data as any;
      if (variableData.valueBase64) {
        const decodedValue = Buffer.from(variableData.valueBase64, 'base64').toString('utf-8');
        delete variableData.valueBase64;
        variableData.value = decodedValue;
      }

      return createToolResponse(formatSuccess(variableData, response));
    } catch (error: any) {
      return createToolResponse(`Failed to get variable '${variableId}': ${error.message}`);
    }
  }
};
