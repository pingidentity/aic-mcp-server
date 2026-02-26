import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { REALMS } from '../../utils/validationHelpers.js';
import { buildAMRealmUrl, AM_SCRIPT_HEADERS_V2 } from '../../utils/amHelpers.js';

const SCOPES = ['fr:am:*'];

export const getScriptedDecisionNodeBindingsTool = {
  name: 'getScriptedDecisionNodeBindings',
  title: 'Get Scripted Decision Node Bindings',
  description:
    'Retrieve the available bindings (variables, functions) and allowed import libraries for Scripted Decision Node scripts. This is essential reference information when writing journey scripts - it shows what APIs and classes are available in the scripting environment.',
  scopes: SCOPES,
  annotations: {
    readOnlyHint: true,
    openWorldHint: true
  },
  inputSchema: {
    realm: z.enum(REALMS).describe('The realm to query')
  },
  async toolFunction({ realm }: { realm: string }) {
    try {
      const url = buildAMRealmUrl(realm, 'contexts/SCRIPTED_DECISION_NODE');

      const { data, response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'GET',
        headers: AM_SCRIPT_HEADERS_V2
      });

      return createToolResponse(formatSuccess(data, response));
    } catch (error: any) {
      return createToolResponse(`Failed to get scripted decision node bindings in realm "${realm}": ${error.message}`);
    }
  }
};
