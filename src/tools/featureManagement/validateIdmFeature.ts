// src/tools/featureManagement/validateIdmFeature.ts
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

export const validateIdmFeatureTool = {
  name: 'validateIdmFeature',
  title: 'Validate IDM Feature',
  description:
    'Check whether an IDM feature can be installed without making any changes. Returns a result with `success` (true/false) and a `message` explaining any blockers. Run this before `installIdmFeature`.',
  scopes: SCOPES,
  annotations: {
    readOnlyHint: true,
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
      const url = `https://${aicBaseUrl}/openidm/feature/${encodedPath}?_action=validate`;

      const { data, response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'POST',
        body: JSON.stringify({})
      });

      // The validate endpoint returns `{ status: 200, success: true|false, message }`
      // as a 200 HTTP response even when `success: false`. Return the body verbatim
      // via formatSuccess — do NOT treat `success: false` as an error, since the
      // caller needs the message detail to decide whether install can proceed.
      return createToolResponse(formatSuccess(data, response));
    } catch (error: any) {
      return createToolResponse(`Failed to validate IDM feature '${featureName}': ${error.message}`);
    }
  }
};
