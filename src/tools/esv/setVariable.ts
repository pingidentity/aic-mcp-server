import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { safePathSegmentSchema } from '../../utils/validationHelpers.js';

const aicBaseUrl = process.env.AIC_BASE_URL;

const SCOPES = ['fr:idc:esv:update'];

// Validation regex for variable IDs - must start with esv-
const VARIABLE_ID_REGEX = /^esv-[a-z0-9_-]{1,120}$/;

export const setVariableTool = {
  name: 'setVariable',
  title: 'Set Environment Variable (ESV)',
  description: 'Create or update an environment variable (ESV) in PingOne AIC',
  scopes: SCOPES,
  annotations: {
    idempotentHint: true,
    openWorldHint: true
  },
  inputSchema: {
    variableId: safePathSegmentSchema.describe('Variable ID (format: esv-*)'),
    value: z
      .any()
      .describe(
        "Variable value as native type (NOT JSON string). Examples: string: 'hello', array: ['a','b'], object: {\"key\":\"val\"}, bool: true, int: 42, number: 3.14, list: 'a,b,c'. The tool handles JSON serialization internally for array/object types."
      ),
    type: z
      .enum(['string', 'array', 'object', 'bool', 'int', 'number', 'list'])
      .describe(
        "The variable type. Determines how the value is interpreted. Note: Type cannot be changed after creation. Ping recommends using 'array' instead of 'list'."
      ),
    description: z.string().optional().describe("Optional description of the variable's purpose")
  },
  async toolFunction({
    variableId,
    value,
    type,
    description
  }: {
    variableId: string;
    value: any;
    type: 'string' | 'array' | 'object' | 'bool' | 'int' | 'number' | 'list';
    description?: string;
  }) {
    try {
      // Validate variable ID format
      if (!VARIABLE_ID_REGEX.test(variableId)) {
        return createToolResponse(
          `Invalid variable ID '${variableId}'. Must start with 'esv-' followed by lowercase a-z, 0-9, underscores and hyphens, max 124 characters total.`
        );
      }

      // Convert value to string for base64 encoding
      // For string and list types, use the value directly
      // For other types, serialize as JSON
      let valueString: string;
      if (type === 'string' || type === 'list') {
        valueString = String(value);
      } else {
        valueString = JSON.stringify(value);
      }

      // Base64 encode the value
      const valueBase64 = Buffer.from(valueString).toString('base64');

      // Build request body
      const requestBody = {
        _id: variableId,
        description: description || '',
        valueBase64: valueBase64,
        expressionType: type
      };

      const url = `https://${aicBaseUrl}/environment/variables/${variableId}`;

      const { response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'PUT',
        headers: {
          'accept-api-version': 'resource=2.0'
        },
        body: JSON.stringify(requestBody)
      });

      const successMessage = `Set variable '${variableId}'. Pod restart required for changes to take effect.`;

      return createToolResponse(
        formatSuccess(
          {
            _id: variableId,
            message: successMessage
          },
          response
        )
      );
    } catch (error: any) {
      return createToolResponse(`Failed to set variable '${variableId}': ${error.message}`);
    }
  }
};
