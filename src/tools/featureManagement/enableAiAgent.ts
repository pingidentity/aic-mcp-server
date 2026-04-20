// src/tools/featureManagement/enableAiAgent.ts
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';

const aicBaseUrl = process.env.AIC_BASE_URL;

// Both IDM and AM scopes are required — the bespoke endpoint orchestrates the
// IDM feature install AND the AM OAuth2 realm-config step in alpha/bravo, so
// downstream calls need both surfaces.
const SCOPES = ['fr:am:*', 'fr:idm:*'];

export const enableAiAgentTool = {
  name: 'enableAiAgent',
  title: 'Enable AI Agents (End-to-End)',
  description:
    'Enable the AI Agents feature in PingOne AIC. IMPORTANT: this action is one-way and cannot be undone. Re-running this tool is safe. Use `listFeatures` to check current status.',
  scopes: SCOPES,
  annotations: {
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true
  },
  inputSchema: {},
  async toolFunction() {
    const url = `https://${aicBaseUrl}/environment/aiagent?_action=enable`;

    try {
      const { data, response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'POST',
        // Empty JSON body ensures makeAuthenticatedRequest sets Content-Type: application/json.
        // The 200 response body shape is undocumented; `data` may come back as null
        // (204 / content-length 0), `{}`, or a structured object — all are tolerated
        // and passed through verbatim via `apiResponse`.
        body: JSON.stringify({})
      });

      const successPayload = {
        status: 'enabled',
        message:
          'AI Agents enabled end-to-end (IDM feature + AM OAuth2 realm-config alpha/bravo). The IDM feature install this triggers is one-way and cannot be undone from this tool.',
        apiResponse: data
      };

      return createToolResponse(formatSuccess(successPayload, response));
    } catch (error: any) {
      return createToolResponse(`Failed to enable AI Agents: ${error.message}`);
    }
  }
};
