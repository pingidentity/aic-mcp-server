import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { REALMS, safePathSegmentSchema } from '../../utils/validationHelpers.js';
import { buildAMRealmUrl, AM_SCRIPT_HEADERS_V2 } from '../../utils/amHelpers.js';

const SCOPES = ['fr:am:*'];

export const deleteScriptTool = {
  name: 'deleteScript',
  title: 'Delete AM Script',
  description:
    'Delete an AM script by its ID. Warning: This is a permanent deletion and cannot be undone. Ensure the script is not referenced by any journey nodes before deleting.',
  scopes: SCOPES,
  annotations: {
    destructiveHint: true,
    openWorldHint: true
  },
  inputSchema: {
    realm: z.enum(REALMS).describe('The realm containing the script'),
    scriptId: safePathSegmentSchema.describe('The unique identifier of the script to delete (UUID format)')
  },
  async toolFunction({ realm, scriptId }: { realm: string; scriptId: string }) {
    try {
      const url = buildAMRealmUrl(realm, `scripts/${encodeURIComponent(scriptId)}`);

      const { response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'DELETE',
        headers: AM_SCRIPT_HEADERS_V2
      });

      const transactionId = response.headers.get('x-forgerock-transactionid') || 'unknown';

      return createToolResponse(`Script "${scriptId}" deleted successfully.\n` + `Transaction ID: ${transactionId}`);
    } catch (error: any) {
      return createToolResponse(`Failed to delete script "${scriptId}" in realm "${realm}": ${error.message}`);
    }
  }
};
