import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { REALMS, safePathSegmentSchema } from '../../utils/validationHelpers.js';
import { buildAMRealmUrl, AM_SCRIPT_HEADERS_V2, encodeBase64 } from '../../utils/amHelpers.js';

const SCOPES = ['fr:am:*'];

export const updateScriptTool = {
  name: 'updateScript',
  title: 'Update AM Script',
  description: 'Update an existing Scripted Decision Node script. You can update any combination of name, description, or script content.',
  scopes: SCOPES,
  annotations: {
    openWorldHint: true
  },
  inputSchema: {
    realm: z.enum(REALMS).describe('The realm containing the script'),
    scriptId: safePathSegmentSchema.describe('The unique identifier of the script (UUID format)'),
    name: z.string().min(1).optional().describe('New name for the script'),
    description: z.string().optional().describe('New description for the script'),
    script: z.string().min(1).optional().describe('New JavaScript source code for the script'),
  },
  async toolFunction({ realm, scriptId, name, description, script }: {
    realm: string;
    scriptId: string;
    name?: string;
    description?: string;
    script?: string;
  }) {
    try {
      // At least one update field must be provided
      if (!name && description === undefined && !script) {
        return createToolResponse('No updates provided. Specify at least one of: name, description, script');
      }

      const url = buildAMRealmUrl(realm, `scripts/${encodeURIComponent(scriptId)}`);

      // Fetch current script
      const { data: fetchedScript } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'GET',
        headers: AM_SCRIPT_HEADERS_V2,
      });
      const currentScript = fetchedScript as Record<string, unknown>;

      // Build updated script object
      const updatedScript: Record<string, unknown> = {
        ...currentScript,
        name: name ?? currentScript.name,
        description: description ?? currentScript.description,
      };

      // If script content is being updated, encode it
      if (script) {
        updatedScript.script = encodeBase64(script);
      }
      // If not updating script, keep the existing base64 content as-is

      // PUT the updated script
      const { data, response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'PUT',
        headers: AM_SCRIPT_HEADERS_V2,
        body: JSON.stringify(updatedScript),
      });

      const scriptData = data as { _id: string; name: string };
      const transactionId = response.headers.get('x-forgerock-transactionid') || 'unknown';

      return createToolResponse(
        `Script "${scriptData.name}" updated successfully.\n` +
        `Script ID: ${scriptData._id}\n` +
        `Transaction ID: ${transactionId}`
      );
    } catch (error: any) {
      return createToolResponse(`Failed to update script "${scriptId}" in realm "${realm}": ${error.message}`);
    }
  },
};
