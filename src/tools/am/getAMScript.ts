import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { REALMS, safePathSegmentSchema } from '../../utils/validationHelpers.js';
import { buildAMRealmUrl, AM_SCRIPT_HEADERS, decodeBase64Field } from '../../utils/amHelpers.js';

// Define scopes as a constant so they can be referenced in both the tool definition and function
const SCOPES = ['fr:am:*'];

export const getAMScriptTool = {
  name: 'getAMScript',
  title: 'Get AM Script',
  description: 'Retrieve an AM script by its ID. Returns the complete script including name, description, language, and source code.',
  scopes: SCOPES,
  annotations: {
    readOnlyHint: true,
    openWorldHint: true
  },
  inputSchema: {
    realm: z.enum(REALMS).describe('The realm containing the script'),
    scriptId: safePathSegmentSchema.describe('The unique identifier of the script (UUID format, e.g., \'01e1a3c0-038b-4c16-956a-6c9d89328cff\')'),
  },
  async toolFunction({ realm, scriptId }: { realm: string; scriptId: string }) {
    try {
      // URL-encode the script ID to handle any special characters
      const encodedScriptId = encodeURIComponent(scriptId);

      const url = buildAMRealmUrl(realm, `scripts/${encodedScriptId}`);

      const { data, response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'GET',
        headers: AM_SCRIPT_HEADERS,
      });

      // Decode base64 script content if present and base64 encoded
      decodeBase64Field(data, 'script');

      return createToolResponse(formatSuccess(data, response));
    } catch (error: any) {
      return createToolResponse(`Failed to get script "${scriptId}" in realm "${realm}": ${error.message}`);
    }
  },
};
