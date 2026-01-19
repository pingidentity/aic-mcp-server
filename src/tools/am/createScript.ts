import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { REALMS } from '../../utils/validationHelpers.js';
import { buildAMRealmUrl, AM_SCRIPT_HEADERS_V2, encodeBase64 } from '../../utils/amHelpers.js';

const SCOPES = ['fr:am:*'];

export const createScriptTool = {
  name: 'createScript',
  title: 'Create AM Script',
  description: 'Create a new Scripted Decision Node script for use in authentication journeys. Use getScriptedDecisionNodeBindings to see available variables and allowed imports before writing the script.',
  scopes: SCOPES,
  annotations: {
    openWorldHint: true
  },
  inputSchema: {
    realm: z.enum(REALMS).describe('The realm to create the script in'),
    name: z.string().min(1).describe('The name of the script'),
    description: z.string().optional().describe('Optional description of the script'),
    script: z.string().min(1).describe('The JavaScript source code for the script'),
  },
  async toolFunction({ realm, name, description, script }: {
    realm: string;
    name: string;
    description?: string;
    script: string;
  }) {
    try {
      const url = `${buildAMRealmUrl(realm, 'scripts')}?_action=create`;

      const payload = {
        context: 'AUTHENTICATION_TREE_DECISION_NODE',
        name,
        description: description || '',
        language: 'JAVASCRIPT',
        script: encodeBase64(script),
        evaluatorVersion: '2.0',
      };

      const { data, response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'POST',
        headers: AM_SCRIPT_HEADERS_V2,
        body: JSON.stringify(payload),
      });

      const scriptData = data as { _id: string; name: string };
      const transactionId = response.headers.get('x-forgerock-transactionid') || 'unknown';

      return createToolResponse(
        `Script "${scriptData.name}" created successfully.\n` +
        `Script ID: ${scriptData._id}\n` +
        `Transaction ID: ${transactionId}`
      );
    } catch (error: any) {
      return createToolResponse(`Failed to create script "${name}" in realm "${realm}": ${error.message}`);
    }
  },
};
