// src/tools/featureManagement/installIdmFeature.ts
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { featureNameSchema } from '../../utils/validationHelpers.js';

const aicBaseUrl = process.env.AIC_BASE_URL;

const SCOPES = ['fr:idm:*'];

/**
 * Encodes an IDM feature name for use in a URL path.
 *
 * Feature names may contain `/` as a segment separator (e.g. `password/timestamps`,
 * `indexed/strings/6thru20`). The IDM router treats the remainder of the path
 * after `/openidm/feature/` as the feature id, so we must preserve `/` as a
 * literal separator while still percent-encoding any other characters that may
 * appear within a segment. Split on `/`, `encodeURIComponent` each segment,
 * rejoin with `/`.
 */
function encodeFeatureNamePath(featureName: string): string {
  return featureName.split('/').map(encodeURIComponent).join('/');
}

export const installIdmFeatureTool = {
  name: 'installIdmFeature',
  title: 'Install IDM Feature',
  description:
    'Install an IDM feature in PingOne AIC. IMPORTANT: this action is one-way and cannot be undone. Run `validateIdmFeature` first to check the feature can be installed. For AI Agents, use `enableAiAgent` instead. Use `listFeatures` to see what is available.',
  scopes: SCOPES,
  annotations: {
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true
  },
  inputSchema: {
    featureName: featureNameSchema.describe(
      'IDM feature name. May be a single segment (e.g. `groups`, `aiagent`) or slash-separated segments (e.g. `password/timestamps`, `indexed/strings/6thru20`). Alphanumeric/underscore/hyphen segments only; no leading/trailing slash, no `..`.'
    )
  },
  async toolFunction({ featureName }: { featureName: string }) {
    try {
      const encodedPath = encodeFeatureNamePath(featureName);
      const url = `https://${aicBaseUrl}/openidm/feature/${encodedPath}?_action=install`;

      const { data, response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'POST',
        body: JSON.stringify({})
      });

      // Install is one-way — make that visible in the success response text so the
      // calling agent cannot miss it. `apiResponse` preserves the upstream
      // `{ status: 200, message: "Install complete." }` payload verbatim.
      const successPayload = {
        _id: featureName,
        status: 'installed',
        message: 'Install complete. This action cannot be undone.',
        apiResponse: data
      };

      return createToolResponse(formatSuccess(successPayload, response));
    } catch (error: any) {
      return createToolResponse(`Failed to install IDM feature '${featureName}': ${error.message}`);
    }
  }
};
